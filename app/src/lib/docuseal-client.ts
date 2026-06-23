/**
 * Minimal DocuSeal API client for the contract-signature flow.
 *
 * DocuSeal is the source of truth of the electronic signature: Torre uploads the
 * generated contract PDF, creates a submission with two signers (student and
 * Jose/company) and later receives webhooks that move the enrollment's
 * signatureFlowStatus. This module only talks to the DocuSeal REST API; it never
 * decides flow status (that lives in operaciones-signature-flow.ts).
 *
 * Configuration is read from the environment and validated up front so callers
 * get a clear, non-secret error instead of an opaque 401 when the integration is
 * not configured yet:
 *   - DOCUSEAL_API_URL   base URL of the DocuSeal instance (no trailing slash)
 *   - DOCUSEAL_API_KEY   API token sent as the `X-Auth-Token` header
 *   - DOCUSEAL_TEMPLATE_ID (optional) default template id for submissions
 *
 * The API key is only read here and sent as a request header — never logged,
 * returned or embedded in error messages.
 */

export class DocusealConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocusealConfigError";
  }
}

export class DocusealApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DocusealApiError";
    this.status = status;
  }
}

export interface DocusealConfig {
  apiUrl: string;
  apiKey: string;
  defaultTemplateId: string | null;
}

/**
 * Reads and validates DocuSeal configuration from the environment. Throws a
 * DocusealConfigError (safe to surface to operators) when a required variable is
 * missing. Never includes the key value in the message.
 */
export function getDocusealConfig(): DocusealConfig {
  const apiUrl = process.env.DOCUSEAL_API_URL?.trim();
  const apiKey = process.env.DOCUSEAL_API_KEY?.trim();
  const missing: string[] = [];
  if (!apiUrl) missing.push("DOCUSEAL_API_URL");
  if (!apiKey) missing.push("DOCUSEAL_API_KEY");
  if (missing.length > 0) {
    throw new DocusealConfigError(
      `Falta configurar DocuSeal en el servidor (${missing.join(", ")}). No se puede enviar el contrato a firma.`,
    );
  }
  return {
    apiUrl: apiUrl!.replace(/\/+$/, ""),
    apiKey: apiKey!,
    defaultTemplateId: process.env.DOCUSEAL_TEMPLATE_ID?.trim() || null,
  };
}

/** True when DocuSeal is configured. Lets the UI/route avoid calling the API. */
export function isDocusealConfigured(): boolean {
  try {
    getDocusealConfig();
    return true;
  } catch {
    return false;
  }
}

export interface DocusealSignerInput {
  name: string;
  email: string;
  /** Signing order role; "student" signs first, "company" (Jose) second. */
  role: "student" | "company";
}

export interface CreateSubmissionInput {
  /** Template id to instantiate. Falls back to DOCUSEAL_TEMPLATE_ID. */
  templateId?: string | null;
  signers: DocusealSignerInput[];
  /** Optional base64 PDF to attach when not using a stored template. */
  documentBase64?: string | null;
  documentFilename?: string | null;
  /** Forwarded back on webhooks so Torre can match the enrollment. */
  externalId?: string | null;
  sendEmail?: boolean;
}

export interface DocusealSubmissionResult {
  submissionId: string;
  status: string | null;
  /** Per-signer signing URLs when DocuSeal returns them. */
  signerUrls: { email: string; role: string; url: string | null }[];
  raw: unknown;
}

interface DocusealSubmitterResponse {
  email?: string | null;
  role?: string | null;
  embed_src?: string | null;
  slug?: string | null;
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

/**
 * Creates a DocuSeal submission with the two signers in order. Returns the
 * submission id and any signer URLs DocuSeal exposes. Throws DocusealConfigError
 * when unconfigured and DocusealApiError (with HTTP status) on API failures, so
 * the route can map them to clear messages without leaking the key.
 */
export async function createDocusealSubmission(
  input: CreateSubmissionInput,
): Promise<DocusealSubmissionResult> {
  const config = getDocusealConfig();
  const templateId = input.templateId ?? config.defaultTemplateId;
  if (!templateId && !input.documentBase64) {
    throw new DocusealConfigError(
      "No hay plantilla DocuSeal (DOCUSEAL_TEMPLATE_ID) ni PDF adjunto para crear la firma.",
    );
  }

  const body: Record<string, unknown> = {
    send_email: input.sendEmail ?? true,
    order: "preserved",
    submitters: input.signers.map((s) => ({
      name: s.name,
      email: s.email,
      role: s.role,
    })),
  };
  if (templateId) body.template_id = templateId;
  if (input.externalId) body.external_id = input.externalId;
  if (input.documentBase64) {
    body.documents = [
      {
        name: input.documentFilename ?? "contrato.pdf",
        file: input.documentBase64,
      },
    ];
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Token": config.apiKey,
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(20_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error de red";
    throw new DocusealApiError(0, `No se pudo contactar a DocuSeal: ${message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new DocusealApiError(
      response.status,
      `DocuSeal respondió ${response.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
    );
  }

  const data = (await response.json().catch(() => null)) as unknown;
  return parseSubmissionResponse(data);
}

/**
 * Normalizes DocuSeal's create-submission response (which may be an array of
 * submitters or an object with a submission id) into our result shape.
 */
export function parseSubmissionResponse(data: unknown): DocusealSubmissionResult {
  // DocuSeal returns an array of submitters; the submission id is shared.
  if (Array.isArray(data)) {
    const submitters = data as DocusealSubmitterResponse[];
    const submissionId = extractSubmissionId(submitters[0]);
    return {
      submissionId,
      status: null,
      signerUrls: submitters.map((s) => ({
        email: s.email ?? "",
        role: s.role ?? "",
        url: s.embed_src ?? null,
      })),
      raw: data,
    };
  }
  const obj = (data ?? {}) as Record<string, unknown>;
  const submissionId =
    obj.id != null ? String(obj.id) : obj.submission_id != null ? String(obj.submission_id) : "";
  const submitters = Array.isArray(obj.submitters)
    ? (obj.submitters as DocusealSubmitterResponse[])
    : [];
  return {
    submissionId,
    status: typeof obj.status === "string" ? obj.status : null,
    signerUrls: submitters.map((s) => ({
      email: s.email ?? "",
      role: s.role ?? "",
      url: s.embed_src ?? null,
    })),
    raw: data,
  };
}

function extractSubmissionId(submitter: DocusealSubmitterResponse | undefined): string {
  if (!submitter) return "";
  const record = submitter as unknown as Record<string, unknown>;
  const candidate = record.submission_id ?? record.submissionId;
  return candidate != null ? String(candidate) : "";
}

/**
 * Downloads the final signed PDF for a completed submission. Returns the PDF as
 * a base64 string so callers can store it in Torre and upload it to Drive.
 */
export async function downloadSubmissionPdf(submissionId: string): Promise<string> {
  const config = getDocusealConfig();
  let response: Response;
  try {
    response = await fetch(
      `${config.apiUrl}/submissions/${encodeURIComponent(submissionId)}`,
      {
        headers: { "X-Auth-Token": config.apiKey },
        signal: timeoutSignal(20_000),
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "error de red";
    throw new DocusealApiError(0, `No se pudo contactar a DocuSeal: ${message}`);
  }
  if (!response.ok) {
    throw new DocusealApiError(
      response.status,
      `DocuSeal respondió ${response.status} al pedir el PDF firmado`,
    );
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const documents = data && Array.isArray(data.documents) ? data.documents : [];
  const first = documents[0] as Record<string, unknown> | undefined;
  const url = first && typeof first.url === "string" ? first.url : null;
  if (!url) {
    throw new DocusealApiError(404, "DocuSeal no devolvió el PDF firmado de la submission");
  }
  let pdfResponse: Response;
  try {
    pdfResponse = await fetch(url, { signal: timeoutSignal(20_000) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error de red";
    throw new DocusealApiError(0, `No se pudo descargar el PDF firmado: ${message}`);
  }
  if (!pdfResponse.ok) {
    throw new DocusealApiError(
      pdfResponse.status,
      `No se pudo descargar el PDF firmado (HTTP ${pdfResponse.status})`,
    );
  }
  const buffer = Buffer.from(await pdfResponse.arrayBuffer());
  return buffer.toString("base64");
}
