/**
 * Pure domain helpers for the signed-contract Drive upload and the n8n
 * drive-folder reconciliation.
 *
 * Everything here is deterministic and side-effect free.
 */

// ─── Drive filename ──────────────────────────────────────────────────────────

/**
 * Removes characters that are unsafe in a Drive filename (path separators and
 * control chars) and collapses whitespace. Keeps accents/ñ untouched.
 */
function sanitizeFilenamePart(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[ -/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exact Drive filename for the signed contract, per the blueprint's
 * non-negotiable format:
 *
 *   `Contrato firmado - {Nombre Estudiante} - Nivel {N}.pdf`
 */
export function buildSignedContractDriveFilename(
  studentName: string,
  programLevel: number,
): string {
  const name = sanitizeFilenamePart(studentName) || "Estudiante";
  const level = Number.isFinite(programLevel) ? programLevel : "";
  return `Contrato firmado - ${name} - Nivel ${level}.pdf`;
}

// ─── n8n drive-folder reconciliation ─────────────────────────────────────────

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes a phone to its significant digits. Drops every non-digit and, when
 * longer than 10 digits, keeps the last 10 so a Colombian +57 prefix and a bare
 * national number compare equal. Returns null when fewer than 7 digits remain.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export interface DriveFolderMatchPayload {
  ghlContactId?: string | null;
  studentEmail?: string | null;
  studentPhone?: string | null;
}

export interface StudentMatchCandidate {
  id: string;
  ghlContactId?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Picks the student a drive-folder webhook belongs to, trying in strict order:
 *   1. ghlContactId (exact)
 *   2. normalized email
 *   3. normalized phone
 * Returns the matched candidate id or null when nothing matches.
 */
export function pickStudentMatch(
  payload: DriveFolderMatchPayload,
  candidates: StudentMatchCandidate[],
): string | null {
  const ghl = payload.ghlContactId?.trim();
  if (ghl) {
    const byGhl = candidates.find((c) => c.ghlContactId?.trim() === ghl);
    if (byGhl) return byGhl.id;
  }
  const email = normalizeEmail(payload.studentEmail);
  if (email) {
    const byEmail = candidates.find((c) => normalizeEmail(c.email) === email);
    if (byEmail) return byEmail.id;
  }
  const phone = normalizePhone(payload.studentPhone);
  if (phone) {
    const byPhone = candidates.find((c) => normalizePhone(c.phone) === phone);
    if (byPhone) return byPhone.id;
  }
  return null;
}
