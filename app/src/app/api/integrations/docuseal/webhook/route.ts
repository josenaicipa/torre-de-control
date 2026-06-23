import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  buildSignedContractDriveFilename,
  deriveDocusealCompletion,
  mapDocusealCompletionToFlow,
  parseDocusealWebhookPayload,
  type SignatureFlowStatus,
} from "@/lib/operaciones-signature-flow";
import { downloadSubmissionPdf, isDocusealConfigured } from "@/lib/docuseal-client";
import { uploadSignedContractPdfToDrive } from "@/lib/drive-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DocuSeal informa el avance de la firma electrónica aquí. Autenticado solo por
// secreto compartido DOCUSEAL_WEBHOOK_SECRET; nunca se confía en el payload sin
// validar el secreto. El secreto se compara con timingSafeEqual y jamás se
// loguea. DocuSeal es la fuente de verdad: este webhook mueve el
// signatureFlowStatus y, al completarse, descarga el PDF firmado y lo sube a la
// carpeta Drive del estudiante.

function configuredSecret(): string | null {
  const value = process.env.DOCUSEAL_WEBHOOK_SECRET;
  return value && value.length >= 16 ? value : null;
}

function presentedSecret(req: NextRequest): string | null {
  const header =
    req.headers.get("x-docuseal-webhook-secret") ??
    req.headers.get("x-webhook-secret") ??
    req.headers.get("authorization");
  if (!header) return null;
  return header.replace(/^Bearer\s+/i, "").trim() || null;
}

function secretMatches(expected: string, presented: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    const expected = configuredSecret();
    if (!expected) {
      return jsonError(
        503,
        "Integración DocuSeal no configurada en el servidor (falta DOCUSEAL_WEBHOOK_SECRET)",
      );
    }
    const presented = presentedSecret(req);
    if (!presented || !secretMatches(expected, presented)) {
      return jsonError(401, "Secreto de webhook inválido");
    }

    const raw = await req.json().catch(() => null);
    const parsed = parseDocusealWebhookPayload(raw);
    if (!parsed.submissionId && !parsed.externalId) {
      return jsonError(400, "Payload de DocuSeal sin submission id ni external_id");
    }

    // Resuelve la inscripción por external_id (que Torre envió = enrollmentId) y,
    // como respaldo, por el submission id guardado.
    const enrollment = await findEnrollment(parsed.externalId, parsed.submissionId);
    if (!enrollment) {
      // Webhook de una submission que Torre no reconoce: respondemos 202 para que
      // DocuSeal no reintente en bucle, dejando rastro en auditoría.
      await writeAudit({
        actorId: null,
        action: "integrations.docuseal.webhook.unmatched",
        target: parsed.submissionId ?? parsed.externalId ?? "unknown",
        metadata: { submissionId: parsed.submissionId, externalId: parsed.externalId },
      });
      return NextResponse.json({ matched: false }, { status: 202 });
    }

    const studentEmail = enrollment.student.email ?? "";
    const completion = deriveDocusealCompletion(parsed.submitters, studentEmail);
    const signingStatus = mapDocusealCompletionToFlow(completion);

    const now = new Date();
    const data: Prisma.StudentProductEnrollmentUpdateInput = {
      docusealStatus: parsed.status ?? signingStatus.toLowerCase(),
    };
    if (completion.studentCompleted && !enrollment.studentSignedAt) {
      data.studentSignedAt = now;
    }
    if (completion.companyCompleted && !enrollment.companySignedAt) {
      data.companySignedAt = now;
    }
    if (parsed.submissionId && !enrollment.docusealSubmissionId) {
      data.docusealSubmissionId = parsed.submissionId;
    }

    let finalStatus: SignatureFlowStatus = signingStatus;

    if (signingStatus !== "COMPLETED") {
      // Firma en curso: no regresar por debajo del estado de firma. Solo avanza.
      data.signatureFlowStatus = signingStatus;
      await prisma.studentProductEnrollment.update({
        where: { id: enrollment.id },
        data,
      });
      await writeAudit({
        actorId: null,
        action: "integrations.docuseal.webhook.progress",
        target: enrollment.id,
        metadata: { signatureFlowStatus: signingStatus, studentEmail: Boolean(studentEmail) },
      });
      return NextResponse.json({ matched: true, signatureFlowStatus: signingStatus });
    }

    // COMPLETED: descargar el PDF firmado y guardarlo en Torre, luego intentar
    // subirlo a Drive si el estudiante ya tiene carpeta. Ambas firmas deben
    // existir; las marcamos si aún no estaban registradas.
    data.docusealCompletedAt = enrollment.docusealCompletedAt ?? now;
    if (!enrollment.studentSignedAt) data.studentSignedAt = now;
    if (!enrollment.companySignedAt) data.companySignedAt = now;

    const submissionId = parsed.submissionId ?? enrollment.docusealSubmissionId;
    if (!submissionId || !isDocusealConfigured()) {
      // Sin submission id o sin DocuSeal configurado no podemos descargar el PDF.
      data.signatureFlowStatus = "COMPLETED";
      await prisma.studentProductEnrollment.update({ where: { id: enrollment.id }, data });
      return NextResponse.json({ matched: true, signatureFlowStatus: "COMPLETED" });
    }

    let signedPdfBase64: string;
    try {
      signedPdfBase64 = await downloadSubmissionPdf(submissionId);
    } catch (err) {
      data.signatureFlowStatus = "COMPLETED";
      await prisma.studentProductEnrollment.update({ where: { id: enrollment.id }, data });
      await writeAudit({
        actorId: null,
        action: "integrations.docuseal.webhook.pdf_download_error",
        target: enrollment.id,
        metadata: { message: err instanceof Error ? err.message : "error" },
      });
      return NextResponse.json(
        { matched: true, signatureFlowStatus: "COMPLETED", pdfStored: false },
        { status: 200 },
      );
    }

    data.signedPdfContent = signedPdfBase64;
    data.signedPdfStoredAt = now;
    finalStatus = "PDF_STORED";
    data.signatureFlowStatus = "PDF_STORED";

    // Subida a Drive (best-effort): si el estudiante ya tiene carpeta, intentamos
    // subir con el nombre exacto del blueprint. Cualquier fallo deja DRIVE_ERROR
    // con el error guardado para reintentar; nunca bloquea el guardado del PDF.
    const driveFolderId = enrollment.student.driveFolderId;
    if (driveFolderId) {
      const programLevel =
        enrollment.programLevelSnapshot ?? enrollment.product?.programLevel ?? 0;
      const studentName =
        enrollment.student.legalName?.trim() || enrollment.student.fullName || "Estudiante";
      const filename = buildSignedContractDriveFilename(studentName, programLevel);
      try {
        const uploaded = await uploadSignedContractPdfToDrive(
          driveFolderId,
          filename,
          signedPdfBase64,
        );
        data.signedPdfDriveFileId = uploaded.fileId || null;
        data.signedPdfDriveUrl = uploaded.webViewLink;
        data.signedPdfDriveUploadedAt = now;
        data.signedPdfDriveUploadStatus = "uploaded";
        data.signedPdfDriveUploadError = null;
        finalStatus = "DRIVE_UPLOADED";
        data.signatureFlowStatus = "DRIVE_UPLOADED";
      } catch (err) {
        data.signedPdfDriveUploadStatus = "error";
        data.signedPdfDriveUploadError =
          err instanceof Error ? err.message.slice(0, 500) : "Error subiendo a Drive";
        finalStatus = "DRIVE_ERROR";
        data.signatureFlowStatus = "DRIVE_ERROR";
      }
    }

    await prisma.studentProductEnrollment.update({ where: { id: enrollment.id }, data });
    await writeAudit({
      actorId: null,
      action: "integrations.docuseal.webhook.completed",
      target: enrollment.id,
      metadata: {
        signatureFlowStatus: finalStatus,
        driveUploaded: finalStatus === "DRIVE_UPLOADED",
      },
    });

    return NextResponse.json({ matched: true, signatureFlowStatus: finalStatus });
  } catch (err) {
    return handleApiError(err);
  }
}

async function findEnrollment(externalId: string | null, submissionId: string | null) {
  const select = {
    id: true,
    docusealSubmissionId: true,
    studentSignedAt: true,
    companySignedAt: true,
    docusealCompletedAt: true,
    programLevelSnapshot: true,
    product: { select: { programLevel: true } },
    student: {
      select: {
        email: true,
        fullName: true,
        legalName: true,
        driveFolderId: true,
      },
    },
  } as const;

  if (externalId) {
    const byExternal = await prisma.studentProductEnrollment.findUnique({
      where: { id: externalId },
      select,
    });
    if (byExternal) return byExternal;
  }
  if (submissionId) {
    return prisma.studentProductEnrollment.findFirst({
      where: { docusealSubmissionId: submissionId },
      select,
    });
  }
  return null;
}
