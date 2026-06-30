/**
 * Best-effort GoHighLevel mirror for a LearnWorlds access grant.
 *
 * Torre de Control is the source of truth for granting LearnWorlds access; GHL
 * only receives a mirror of the data so its workflow/email can deliver the
 * access credentials to the student. This module upserts the contact, writes
 * the LearnWorlds password into the confirmed custom field and attaches the
 * access tags that trigger/track the GHL access email.
 *
 * It NEVER throws and NEVER blocks the LearnWorlds flow: missing env or API
 * errors resolve to a non-fatal warning so the caller can keep the LW access
 * as successful. Secrets (GHL_API_KEY) are only read from the environment and
 * sent as a header — never logged or returned.
 */

// Confirmed GHL custom field for the LearnWorlds password. The GHL email
// template renders it as {{contact.contrasea_lw}} (fieldKey contact.contrasea_lw,
// name "Contraseña LW").
const GHL_PASSWORD_CUSTOM_FIELD_ID = "ZrIBxaPrJUrj60ZZwyfo";

// Tags the legacy n8n flow attached after confirming LW access; kept so the
// existing GHL workflow/email keeps firing.
const ACCESS_GRANTED_TAGS = ["ua_contrato_firmado", "ua_acceso_total_lw_ok"];

export interface GhlAccessSyncInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  /** The deterministic LearnWorlds password to mirror into GHL. */
  password: string;
}

export interface GhlAccessSyncResult {
  ok: boolean;
  /** Non-fatal reason the mirror did not complete, or null on success. */
  warning: string | null;
}

/**
 * Mirrors the LearnWorlds password + access tags into GHL. Resolves (never
 * rejects) with a non-fatal warning on any failure so LearnWorlds access is
 * never marked as failed because of GHL.
 */
export async function syncGhlLearnWorldsAccess(
  input: GhlAccessSyncInput,
): Promise<GhlAccessSyncResult> {
  const baseUrl = process.env.GHL_BASE_URL;
  const apiKey = process.env.GHL_API_KEY;
  const version = process.env.GHL_API_VERSION;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!baseUrl || !apiKey || !version || !locationId) {
    return {
      ok: false,
      warning:
        "GHL no sincronizado: faltan credenciales en el servidor (GHL_BASE_URL, GHL_API_KEY, GHL_API_VERSION o GHL_LOCATION_ID).",
    };
  }

  const base = baseUrl.replace(/\/$/, "");
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Version: version,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  try {
    const upsertRes = await fetch(`${base}/contacts/upsert`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        locationId,
        email: input.email,
        ...(input.firstName ? { firstName: input.firstName } : {}),
        ...(input.lastName ? { lastName: input.lastName } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        customFields: [{ id: GHL_PASSWORD_CUSTOM_FIELD_ID, value: input.password }],
      }),
    });

    if (!upsertRes.ok) {
      const detail = await upsertRes.text().catch(() => "");
      return {
        ok: false,
        warning: `GHL no sincronizado: upsert de contacto HTTP ${upsertRes.status}${
          detail ? ` — ${detail.slice(0, 200)}` : ""
        }`,
      };
    }

    const upsertJson = (await upsertRes.json().catch(() => ({}))) as {
      contact?: { id?: string };
      id?: string;
    };
    const contactId = upsertJson.contact?.id ?? upsertJson.id;
    if (!contactId) {
      return {
        ok: false,
        warning: "GHL no sincronizado: el upsert no devolvió el id del contacto.",
      };
    }

    const tagsRes = await fetch(`${base}/contacts/${contactId}/tags`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tags: ACCESS_GRANTED_TAGS }),
    });

    if (!tagsRes.ok) {
      const detail = await tagsRes.text().catch(() => "");
      return {
        ok: false,
        warning: `GHL no sincronizado: tags HTTP ${tagsRes.status}${
          detail ? ` — ${detail.slice(0, 200)}` : ""
        }`,
      };
    }

    return { ok: true, warning: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return { ok: false, warning: `GHL no sincronizado: ${message}` };
  }
}
