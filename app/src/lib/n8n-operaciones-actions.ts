// Helpers para llamadas SALIENTES de Torre hacia n8n: disparan webhooks que
// ejecutan acciones del lado de n8n (subir contrato firmado a Drive, otorgar
// acceso a LearnWorlds). Son el espejo de los webhooks ENTRANTES de n8n; aquí
// Torre es el cliente. Cada webhook se autentica con el secreto compartido
// N8N_TORRE_WEBHOOK_SECRET (header x-n8n-webhook-secret), que NUNCA se loguea.
//
// Contrato de error: estas funciones jamás lanzan. Ante config faltante, fallo
// de red, timeout o HTTP no-2xx devuelven { ok: false, error } para que el
// caller decida (reintentar, auditar, avisar) sin envolver todo en try/catch.

const REQUEST_TIMEOUT_MS = 20_000;

export interface N8nActionSuccess {
  ok: true;
  status: number;
  data: unknown;
}

export interface N8nActionFailure {
  ok: false;
  error: string;
  status?: number;
}

export type N8nActionResult = N8nActionSuccess | N8nActionFailure;

// Payload del contrato firmado que n8n sube a Drive. Campos requeridos mínimos;
// se permite extender con claves extra sin romper el tipado.
export interface SignedContractPayload {
  studentEmail: string;
  studentName?: string;
  contractId?: string;
  fileName?: string;
  // PDF en base64 (sin prefijo data:) o URL accesible; el flujo n8n decide.
  fileBase64?: string;
  fileUrl?: string;
  driveFolderId?: string;
  [key: string]: unknown;
}

// Payload para otorgar acceso a un curso/programa de LearnWorlds vía n8n.
export interface LearnWorldsAccessPayload {
  studentEmail: string;
  studentName?: string;
  courseId?: string;
  courseSlug?: string;
  productId?: string;
  justification?: string;
  [key: string]: unknown;
}

function configuredSecret(): string | null {
  const value = process.env.N8N_TORRE_WEBHOOK_SECRET;
  return value && value.trim().length > 0 ? value.trim() : null;
}

function configuredUrl(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

// Llamada genérica a un webhook de n8n. Centraliza auth, timeout y el contrato
// de error para que las funciones públicas sean triviales.
async function postToN8nWebhook(
  url: string,
  secret: string,
  payload: Record<string, unknown>,
): Promise<N8nActionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-n8n-webhook-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const status = response.status;
    const rawBody = await response.text();
    const data = parseBody(rawBody);

    if (!response.ok) {
      return {
        ok: false,
        status,
        error: `n8n respondió ${status}: ${summarizeBody(rawBody)}`,
      };
    }

    return { ok: true, status, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: `Timeout: n8n no respondió en ${REQUEST_TIMEOUT_MS / 1000}s`,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Fallo de red al llamar a n8n: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

function parseBody(rawBody: string): unknown {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

// Resumen legible y acotado del cuerpo de error (evita volcar HTML/JSON enorme).
function summarizeBody(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) return "(sin cuerpo)";
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

export async function sendSignedContractToN8n(
  payload: SignedContractPayload,
): Promise<N8nActionResult> {
  const secret = configuredSecret();
  if (!secret) {
    return { ok: false, error: "Falta N8N_TORRE_WEBHOOK_SECRET" };
  }
  const url = configuredUrl("N8N_TORRE_CONTRACT_DRIVE_WEBHOOK_URL");
  if (!url) {
    return {
      ok: false,
      error: "Falta N8N_TORRE_CONTRACT_DRIVE_WEBHOOK_URL",
    };
  }
  return postToN8nWebhook(url, secret, payload);
}

export async function grantLearnWorldsAccessViaN8n(
  payload: LearnWorldsAccessPayload,
): Promise<N8nActionResult> {
  const secret = configuredSecret();
  if (!secret) {
    return { ok: false, error: "Falta N8N_TORRE_WEBHOOK_SECRET" };
  }
  const url = configuredUrl("N8N_TORRE_LW_ACCESS_WEBHOOK_URL");
  if (!url) {
    return { ok: false, error: "Falta N8N_TORRE_LW_ACCESS_WEBHOOK_URL" };
  }
  return postToN8nWebhook(url, secret, payload);
}
