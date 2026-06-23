/**
 * Pure domain helpers for the DocuSeal-driven signature flow, the Drive upload
 * of the signed contract and the n8n drive-folder reconciliation.
 *
 * DocuSeal is the source of truth of the electronic signature: Torre never
 * marks a contract signed from an internal button or a photo. These helpers
 * translate DocuSeal completion state into Torre's visible flow status, decide
 * whether an enrollment can be approved (LearnWorlds released), build the exact
 * Drive filename and resolve which student a drive-folder webhook belongs to.
 *
 * Everything here is deterministic and side-effect free.
 */

export type SignatureFlowStatus =
  | "NOT_SENT"
  | "PENDING_SIGNATURES"
  | "STUDENT_SIGNED"
  | "COMPLETED"
  | "PDF_STORED"
  | "DRIVE_UPLOADED"
  | "DOCUSEAL_ERROR"
  | "DRIVE_ERROR";

/** Spanish labels shown in the Operaciones UI for each flow status. */
export const SIGNATURE_FLOW_LABELS: Record<SignatureFlowStatus, string> = {
  NOT_SENT: "Pendiente de envío",
  PENDING_SIGNATURES: "Pendiente de firmas",
  STUDENT_SIGNED: "Firmado por estudiante, pendiente firma Jose",
  COMPLETED: "Firma completa",
  PDF_STORED: "PDF firmado guardado en Torre",
  DRIVE_UPLOADED: "PDF firmado guardado en Drive",
  DOCUSEAL_ERROR: "Error con DocuSeal",
  DRIVE_ERROR: "Error subiendo a Drive",
};

export function signatureFlowLabel(status: SignatureFlowStatus): string {
  return SIGNATURE_FLOW_LABELS[status] ?? status;
}

// ─── DocuSeal completion mapping ─────────────────────────────────────────────

export interface DocusealCompletion {
  studentCompleted: boolean;
  companyCompleted: boolean;
}

/**
 * Maps a DocuSeal submission's completion state to Torre's visible flow status.
 * Only covers the "signing" portion of the flow — once both parties signed the
 * route advances to PDF_STORED/DRIVE_UPLOADED on its own as it downloads and
 * uploads the PDF. Never regresses below the signing states it owns.
 */
export function mapDocusealCompletionToFlow(
  completion: DocusealCompletion,
): Extract<SignatureFlowStatus, "PENDING_SIGNATURES" | "STUDENT_SIGNED" | "COMPLETED"> {
  if (completion.studentCompleted && completion.companyCompleted) return "COMPLETED";
  if (completion.studentCompleted) return "STUDENT_SIGNED";
  return "PENDING_SIGNATURES";
}

export interface DocusealSubmitter {
  email?: string | null;
  role?: string | null;
  status?: string | null;
  completed_at?: string | null;
}

function submitterCompleted(submitter: DocusealSubmitter): boolean {
  if (submitter.completed_at) return true;
  const status = (submitter.status ?? "").toLowerCase();
  return status === "completed" || status === "signed";
}

/**
 * Derives who has completed from a DocuSeal submission's submitters list. The
 * student is identified by email (case-insensitive); every other submitter is
 * treated as the company/Jose side. A submission with no student-matching
 * submitter reports `studentCompleted=false`.
 */
export function deriveDocusealCompletion(
  submitters: DocusealSubmitter[],
  studentEmail: string,
): DocusealCompletion {
  const normalizedStudent = studentEmail.trim().toLowerCase();
  const isStudentSubmitter = (s: DocusealSubmitter): boolean => {
    const email = (s.email ?? "").trim().toLowerCase();
    return email !== "" && email === normalizedStudent;
  };
  const studentSubmitters = submitters.filter(isStudentSubmitter);
  const companySubmitters = submitters.filter((s) => !isStudentSubmitter(s));
  const studentCompleted =
    studentSubmitters.length > 0 && studentSubmitters.every(submitterCompleted);
  const companyCompleted =
    companySubmitters.length > 0 && companySubmitters.every(submitterCompleted);
  return { studentCompleted, companyCompleted };
}

// ─── DocuSeal webhook parsing ────────────────────────────────────────────────

export interface DocusealWebhookParsed {
  /** Submission id DocuSeal assigns; matches enrollment.docusealSubmissionId. */
  submissionId: string | null;
  /** external_id Torre passed on create (the enrollmentId). */
  externalId: string | null;
  /** Last known DocuSeal status string for the submission, if present. */
  status: string | null;
  submitters: DocusealSubmitter[];
}

function isSubmissionEvent(eventType: unknown): boolean {
  return typeof eventType === "string" && eventType.toLowerCase().startsWith("submission");
}

function pickIdString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      const str = String(value).trim();
      if (str.length > 0) return str;
    }
  }
  return null;
}

function normalizeWebhookSubmitters(value: unknown): DocusealSubmitter[] {
  if (!Array.isArray(value)) return [];
  const result: DocusealSubmitter[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    result.push({
      email: typeof obj.email === "string" ? obj.email : null,
      role: typeof obj.role === "string" ? obj.role : null,
      status: typeof obj.status === "string" ? obj.status : null,
      completed_at: typeof obj.completed_at === "string" ? obj.completed_at : null,
    });
  }
  return result;
}

/**
 * Normalizes a DocuSeal webhook body into the fields Torre needs to advance the
 * flow, tolerating the two shapes DocuSeal emits:
 *   - `submission.*` events where `data` is the submission (data.id = submission)
 *   - `form.*` events where `data` is a single submitter carrying `submission_id`
 *     and possibly a nested `submission` object.
 * Pure and side-effect free so the webhook route stays a thin shell. Never
 * throws on malformed input — returns nulls/[] so the caller decides.
 */
export function parseDocusealWebhookPayload(raw: unknown): DocusealWebhookParsed {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const data = (root.data && typeof root.data === "object" ? root.data : root) as Record<
    string,
    unknown
  >;
  const submission =
    data.submission && typeof data.submission === "object"
      ? (data.submission as Record<string, unknown>)
      : null;
  const metadata =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : null;

  const submissionId = pickIdString(
    data.submission_id,
    submission?.id,
    submission?.submission_id,
    isSubmissionEvent(root.event_type) ? data.id : undefined,
  );

  const externalId = pickIdString(
    data.external_id,
    submission?.external_id,
    metadata?.external_id,
  );

  const status =
    typeof data.status === "string"
      ? data.status
      : submission && typeof submission.status === "string"
        ? submission.status
        : null;

  let submitters = normalizeWebhookSubmitters(data.submitters);
  if (submitters.length === 0 && submission) {
    submitters = normalizeWebhookSubmitters(submission.submitters);
  }
  if (submitters.length === 0 && typeof data.email === "string") {
    // `form.*` event whose `data` IS the submitter.
    submitters = normalizeWebhookSubmitters([data]);
  }

  return { submissionId, externalId, status, submitters };
}

// ─── Approval gate ───────────────────────────────────────────────────────────

export interface ApprovalGateInput {
  /** True once the enrollment has entered the DocuSeal flow (submission id set
   *  or any non-NOT_SENT status). Legacy/manual enrollments are not gated. */
  inDocusealFlow: boolean;
  signatureFlowStatus: SignatureFlowStatus;
}

export interface ApprovalGateResult {
  allowed: boolean;
  reason: string | null;
}

/**
 * Decides whether an enrollment in the DocuSeal flow can be approved (and thus
 * LearnWorlds released). The blueprint's non-negotiable rule: no release unless
 * DocuSeal is COMPLETED, the PDF is stored in Torre AND uploaded to Drive — i.e.
 * the flow reached DRIVE_UPLOADED. Enrollments that never entered the DocuSeal
 * flow (`inDocusealFlow=false`) are not gated here, preserving the legacy
 * manual-approval path for existing students.
 */
export function evaluateApprovalGate(input: ApprovalGateInput): ApprovalGateResult {
  if (!input.inDocusealFlow) {
    return { allowed: true, reason: null };
  }
  if (input.signatureFlowStatus === "DRIVE_UPLOADED") {
    return { allowed: true, reason: null };
  }
  const reasons: Record<SignatureFlowStatus, string> = {
    NOT_SENT: "Falta enviar el contrato a DocuSeal",
    PENDING_SIGNATURES: "El contrato aún no está firmado por ambas partes en DocuSeal",
    STUDENT_SIGNED: "Falta la firma de Jose en DocuSeal",
    COMPLETED: "Falta guardar el PDF firmado en Torre y subirlo a Drive",
    PDF_STORED: "Falta subir el PDF firmado a la carpeta Drive del estudiante",
    DRIVE_UPLOADED: "",
    DOCUSEAL_ERROR: "Hay un error con DocuSeal que debe resolverse antes de aprobar",
    DRIVE_ERROR: "Falta reintentar la subida del PDF firmado a Drive",
  };
  return {
    allowed: false,
    reason:
      reasons[input.signatureFlowStatus] ??
      "El flujo de firma no está completo; no se puede liberar LearnWorlds",
  };
}

// ─── Drive filename ──────────────────────────────────────────────────────────

/**
 * Removes characters that are unsafe in a Drive filename (path separators and
 * control chars) and collapses whitespace. Keeps accents/ñ untouched.
 */
function sanitizeFilenamePart(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[ -/\\]/g, " ")
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
