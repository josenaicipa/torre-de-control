/**
 * Minimal Google Drive client for uploading the signed contract PDF into the
 * student's Drive folder (the folder is created by n8n; Torre only uploads).
 *
 * It authenticates as a Google service account using a JWT signed locally with
 * node:crypto (RS256) — no extra dependency — exchanges it for an access token
 * and performs a multipart upload to the Drive REST API. Configuration is read
 * from the environment and validated up front so callers get a clear, non-secret
 * error instead of an opaque 401 when the integration is not configured yet:
 *
 *   - GOOGLE_APPLICATION_CREDENTIALS  path to a service-account JSON, OR
 *   - GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY  inline credentials
 *   - GOOGLE_DRIVE_SCOPE (optional) OAuth scope; defaults to full drive so the
 *     SA can write into a folder shared with it.
 *
 * The private key and access token are only used here to sign/authenticate and
 * are never logged, returned or embedded in error messages.
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";

export class DriveConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveConfigError";
  }
}

export class DriveApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveApiError";
    this.status = status;
  }
}

interface DriveServiceAccount {
  clientEmail: string;
  privateKey: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true";

function driveScope(): string {
  return process.env.GOOGLE_DRIVE_SCOPE?.trim() || "https://www.googleapis.com/auth/drive";
}

/**
 * Reads and validates the service-account credentials. Throws a DriveConfigError
 * (safe to surface to operators) when nothing is configured or the JSON is
 * unreadable. Never includes the key value in the message.
 */
function readServiceAccount(): DriveServiceAccount {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credentialsPath) {
    let parsed: { client_email?: unknown; private_key?: unknown };
    try {
      parsed = JSON.parse(readFileSync(credentialsPath, "utf8"));
    } catch {
      throw new DriveConfigError(
        "No se pudo leer el archivo de credenciales de Google (GOOGLE_APPLICATION_CREDENTIALS).",
      );
    }
    const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
    const privateKey = typeof parsed.private_key === "string" ? parsed.private_key : "";
    if (!clientEmail || !privateKey) {
      throw new DriveConfigError(
        "El archivo de credenciales de Google no tiene client_email o private_key.",
      );
    }
    return { clientEmail, privateKey };
  }

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) {
    throw new DriveConfigError(
      "Falta configurar Google Drive en el servidor (GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY). No se puede subir el PDF firmado a Drive.",
    );
  }
  // Env vars store the PEM with literal "\n"; restore real newlines for crypto.
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;
  return { clientEmail, privateKey };
}

/** True when Drive credentials are present. Lets the route/UI avoid the upload. */
export function isDriveConfigured(): boolean {
  try {
    readServiceAccount();
    return true;
  } catch {
    return false;
  }
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

function base64url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(sa: DriveServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64url(
    Buffer.from(
      JSON.stringify({
        iss: sa.clientEmail,
        scope: driveScope(),
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const signingInput = `${header}.${claim}`;
  let signature: Buffer;
  try {
    signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(sa.privateKey);
  } catch {
    throw new DriveConfigError(
      "La clave privada de Google Drive no es válida; revisa GOOGLE_DRIVE_PRIVATE_KEY.",
    );
  }
  const assertion = `${signingInput}.${base64url(signature)}`;

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: timeoutSignal(20_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error de red";
    throw new DriveApiError(0, `No se pudo contactar a Google para autenticar: ${message}`);
  }
  if (!response.ok) {
    throw new DriveApiError(
      response.status,
      `Google rechazó la autenticación del servicio (HTTP ${response.status})`,
    );
  }
  const data = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
  const token = data && typeof data.access_token === "string" ? data.access_token : null;
  if (!token) {
    throw new DriveApiError(500, "Google no devolvió un access_token");
  }
  return token;
}

export interface DriveUploadResult {
  fileId: string;
  webViewLink: string | null;
}

/**
 * Uploads a base64 PDF as a new file named `filename` inside the Drive folder
 * `folderId`. Throws DriveConfigError when unconfigured (or no folder) and
 * DriveApiError (with HTTP status) on API failures, so the route can store a
 * clear, non-secret error and let the operator retry without leaking the key.
 */
export async function uploadSignedContractPdfToDrive(
  folderId: string,
  filename: string,
  base64: string,
): Promise<DriveUploadResult> {
  if (!folderId?.trim()) {
    throw new DriveConfigError(
      "El estudiante no tiene carpeta de Drive (driveFolderId); no se puede subir el PDF firmado.",
    );
  }
  if (!base64?.trim()) {
    throw new DriveConfigError("No hay PDF firmado para subir a Drive.");
  }
  const sa = readServiceAccount();
  const token = await getAccessToken(sa);

  const boundary = `torre-${crypto.randomBytes(12).toString("hex")}`;
  const metadata = {
    name: filename,
    parents: [folderId.trim()],
    mimeType: "application/pdf",
  };
  const pdfBuffer = Buffer.from(base64, "base64");
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      "Content-Type: application/pdf\r\n\r\n",
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([preamble, pdfBuffer, epilogue]);

  let response: Response;
  try {
    response = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
      signal: timeoutSignal(30_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error de red";
    throw new DriveApiError(0, `No se pudo subir el PDF a Google Drive: ${message}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new DriveApiError(
      response.status,
      `Google Drive respondió ${response.status}${detail ? ` — ${detail.slice(0, 300)}` : ""}`,
    );
  }
  const data = (await response.json().catch(() => null)) as
    | { id?: unknown; webViewLink?: unknown }
    | null;
  return {
    fileId: data && data.id != null ? String(data.id) : "",
    webViewLink: data && typeof data.webViewLink === "string" ? data.webViewLink : null,
  };
}
