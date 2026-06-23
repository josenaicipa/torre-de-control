import { describe, expect, it } from "vitest";
import {
  buildSignedContractDriveFilename,
  deriveDocusealCompletion,
  evaluateApprovalGate,
  mapDocusealCompletionToFlow,
  normalizeEmail,
  normalizePhone,
  parseDocusealWebhookPayload,
  pickStudentMatch,
  signatureFlowLabel,
  type DocusealSubmitter,
} from "./operaciones-signature-flow";

describe("mapDocusealCompletionToFlow", () => {
  it("maps no signatures to PENDING_SIGNATURES", () => {
    expect(
      mapDocusealCompletionToFlow({ studentCompleted: false, companyCompleted: false }),
    ).toBe("PENDING_SIGNATURES");
  });

  it("maps only student signed to STUDENT_SIGNED", () => {
    expect(
      mapDocusealCompletionToFlow({ studentCompleted: true, companyCompleted: false }),
    ).toBe("STUDENT_SIGNED");
  });

  it("maps both signed to COMPLETED", () => {
    expect(
      mapDocusealCompletionToFlow({ studentCompleted: true, companyCompleted: true }),
    ).toBe("COMPLETED");
  });

  it("does not advance to COMPLETED on company-only (unexpected order)", () => {
    expect(
      mapDocusealCompletionToFlow({ studentCompleted: false, companyCompleted: true }),
    ).toBe("PENDING_SIGNATURES");
  });
});

describe("deriveDocusealCompletion", () => {
  const student = "juan@email.com";

  it("identifies the student by email and the rest as company", () => {
    const submitters: DocusealSubmitter[] = [
      { email: "JUAN@email.com", status: "completed" },
      { email: "jose@unlocked.co", status: "pending" },
    ];
    expect(deriveDocusealCompletion(submitters, student)).toEqual({
      studentCompleted: true,
      companyCompleted: false,
    });
  });

  it("treats completed_at as signed regardless of status", () => {
    const submitters: DocusealSubmitter[] = [
      { email: "juan@email.com", completed_at: "2026-06-23T10:00:00Z" },
      { email: "jose@unlocked.co", completed_at: "2026-06-23T11:00:00Z" },
    ];
    expect(deriveDocusealCompletion(submitters, student)).toEqual({
      studentCompleted: true,
      companyCompleted: true,
    });
  });

  it("reports studentCompleted false when no submitter matches the student", () => {
    const submitters: DocusealSubmitter[] = [
      { email: "otro@email.com", status: "completed" },
    ];
    const result = deriveDocusealCompletion(submitters, student);
    expect(result.studentCompleted).toBe(false);
    expect(result.companyCompleted).toBe(true);
  });
});

describe("evaluateApprovalGate", () => {
  it("does not gate legacy/manual enrollments", () => {
    const result = evaluateApprovalGate({
      inDocusealFlow: false,
      signatureFlowStatus: "NOT_SENT",
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("allows approval only when DRIVE_UPLOADED", () => {
    expect(
      evaluateApprovalGate({ inDocusealFlow: true, signatureFlowStatus: "DRIVE_UPLOADED" }).allowed,
    ).toBe(true);
  });

  it("blocks every pre-DRIVE_UPLOADED state with a reason", () => {
    const blocked = [
      "NOT_SENT",
      "PENDING_SIGNATURES",
      "STUDENT_SIGNED",
      "COMPLETED",
      "PDF_STORED",
      "DOCUSEAL_ERROR",
      "DRIVE_ERROR",
    ] as const;
    for (const status of blocked) {
      const result = evaluateApprovalGate({ inDocusealFlow: true, signatureFlowStatus: status });
      expect(result.allowed, status).toBe(false);
      expect(result.reason, status).toBeTruthy();
    }
  });
});

describe("buildSignedContractDriveFilename", () => {
  it("uses the exact blueprint format", () => {
    expect(buildSignedContractDriveFilename("Juan Perez", 4)).toBe(
      "Contrato firmado - Juan Perez - Nivel 4.pdf",
    );
  });

  it("keeps accents and ñ untouched", () => {
    expect(buildSignedContractDriveFilename("José Muñoz", 5)).toBe(
      "Contrato firmado - José Muñoz - Nivel 5.pdf",
    );
  });

  it("sanitizes path separators and collapses whitespace", () => {
    expect(buildSignedContractDriveFilename("  Ana/Maria\\Lopez  ", 3)).toBe(
      "Contrato firmado - Ana Maria Lopez - Nivel 3.pdf",
    );
  });

  it("falls back to a placeholder name when empty", () => {
    expect(buildSignedContractDriveFilename("   ", 3)).toBe(
      "Contrato firmado - Estudiante - Nivel 3.pdf",
    );
  });
});

describe("normalizeEmail / normalizePhone", () => {
  it("lowercases and trims email, null for empty", () => {
    expect(normalizeEmail("  Juan@Email.com ")).toBe("juan@email.com");
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("keeps last 10 digits so +57 prefix matches the bare number", () => {
    expect(normalizePhone("+57 300 123 4567")).toBe("3001234567");
    expect(normalizePhone("3001234567")).toBe("3001234567");
  });

  it("returns null for too-short or empty phones", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("pickStudentMatch", () => {
  const candidates = [
    { id: "s1", ghlContactId: "ghl-1", email: "uno@email.com", phone: "+57 3001112222" },
    { id: "s2", ghlContactId: "ghl-2", email: "dos@email.com", phone: "3003334444" },
  ];

  it("matches by ghlContactId first", () => {
    expect(
      pickStudentMatch({ ghlContactId: "ghl-2", studentEmail: "uno@email.com" }, candidates),
    ).toBe("s2");
  });

  it("falls back to normalized email when no ghl match", () => {
    expect(
      pickStudentMatch({ ghlContactId: "ghl-x", studentEmail: "UNO@email.com" }, candidates),
    ).toBe("s1");
  });

  it("falls back to normalized phone last", () => {
    expect(
      pickStudentMatch({ studentPhone: "+1 300 333 4444" }, candidates),
    ).toBe("s2");
  });

  it("returns null when nothing matches", () => {
    expect(
      pickStudentMatch({ studentEmail: "nadie@email.com", studentPhone: "9998887777" }, candidates),
    ).toBeNull();
  });
});

describe("parseDocusealWebhookPayload", () => {
  it("parses a submission.completed event (data is the submission)", () => {
    const parsed = parseDocusealWebhookPayload({
      event_type: "submission.completed",
      data: {
        id: 4321,
        external_id: "enr-1",
        status: "completed",
        submitters: [
          { email: "juan@email.com", status: "completed", completed_at: "2026-06-23T10:00:00Z" },
          { email: "jose@unlocked.co", status: "completed", completed_at: "2026-06-23T11:00:00Z" },
        ],
      },
    });
    expect(parsed.submissionId).toBe("4321");
    expect(parsed.externalId).toBe("enr-1");
    expect(parsed.status).toBe("completed");
    expect(parsed.submitters).toHaveLength(2);
    expect(parsed.submitters[0].email).toBe("juan@email.com");
  });

  it("parses a form.completed event (data is a single submitter)", () => {
    const parsed = parseDocusealWebhookPayload({
      event_type: "form.completed",
      data: {
        id: 999,
        submission_id: 4321,
        external_id: "enr-2",
        email: "juan@email.com",
        role: "student",
        status: "completed",
        completed_at: "2026-06-23T10:00:00Z",
      },
    });
    // data.id (999) is the submitter id, must NOT be taken as submission id.
    expect(parsed.submissionId).toBe("4321");
    expect(parsed.externalId).toBe("enr-2");
    expect(parsed.submitters).toHaveLength(1);
    expect(parsed.submitters[0].email).toBe("juan@email.com");
  });

  it("reads submitters and ids from a nested submission object", () => {
    const parsed = parseDocusealWebhookPayload({
      event_type: "form.viewed",
      data: {
        id: 5,
        submission: {
          id: 77,
          external_id: "enr-3",
          status: "pending",
          submitters: [{ email: "juan@email.com", status: "pending" }],
        },
      },
    });
    expect(parsed.submissionId).toBe("77");
    expect(parsed.externalId).toBe("enr-3");
    expect(parsed.submitters).toHaveLength(1);
  });

  it("returns nulls/[] for malformed payloads without throwing", () => {
    expect(parseDocusealWebhookPayload(null)).toEqual({
      submissionId: null,
      externalId: null,
      status: null,
      submitters: [],
    });
    expect(parseDocusealWebhookPayload("nope").submitters).toEqual([]);
  });
});

describe("signatureFlowLabel", () => {
  it("returns Spanish labels", () => {
    expect(signatureFlowLabel("DRIVE_UPLOADED")).toBe("PDF firmado guardado en Drive");
    expect(signatureFlowLabel("STUDENT_SIGNED")).toBe(
      "Firmado por estudiante, pendiente firma Jose",
    );
  });
});
