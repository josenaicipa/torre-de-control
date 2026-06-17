import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { CONTRACT_ACCEPTANCE_TEXT, CONTRACT_TEMPLATE_VERSION } from "@/lib/operaciones-contract-template";
import {
  buildContractInputFromData,
  computeStudentSignatureHash,
  contractEnrollmentSelect,
  findMissingContractFields,
  namesReasonablyMatch,
  validateSignatureImage,
} from "@/lib/operaciones-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

// Firma pública por token. No requiere login: el token ES la autorización.
// Antes de firmar revalida que el contrato siga completo, exige que el nombre
// firmado coincida razonablemente con el nombre legal/registrado y guarda
// evidencia de firma electrónica (IP, user-agent, versión, texto aceptado y
// hash SHA-256 del contrato). Solo marca el contrato como SIGNED; NO libera
// acceso a LearnWorlds (eso ocurre al aprobar desde Torre).
export async function POST(req: Request, { params }: Params) {
  try {
    const { token } = await params;
    if (!token) return jsonError(404, "Enlace de firma inválido");

    const enrollment = await prisma.studentProductEnrollment.findUnique({
      where: { contractSignatureToken: token },
      select: { ...contractEnrollmentSelect, studentId: true },
    });
    if (!enrollment) {
      return jsonError(404, "Enlace de firma inválido o vencido");
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const record = (body ?? {}) as Record<string, unknown>;
    const signerName = String(record.signerName ?? "").trim();
    const accepted = record.accepted === true;

    if (signerName.length < 3) {
      return jsonError(400, "Ingresa tu nombre completo para firmar");
    }
    if (!accepted) {
      return jsonError(400, "Debes aceptar el contrato para firmar");
    }

    // La foto de la firma es obligatoria: debe ser PNG o JPEG de máximo 1 MB.
    const signatureImage = validateSignatureImage(record.signatureImage);
    if (!signatureImage.ok) {
      return jsonError(400, signatureImage.error);
    }

    if (enrollment.contractStatus === "SIGNED") {
      return jsonError(400, "Este contrato ya fue firmado");
    }
    if (enrollment.contractStatus === "APPROVED") {
      return jsonError(400, "Este contrato ya fue aprobado");
    }
    if (enrollment.contractStatus !== "PENDING_SIGNATURE") {
      return jsonError(400, "Este contrato no está disponible para firma");
    }

    // Revalidar completitud: nunca firmar un contrato con datos incompletos
    // (los datos pudieron cambiar desde que se generó el link).
    const missingFields = findMissingContractFields(enrollment);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error:
            "El contrato tiene datos incompletos. Contacta al equipo de Unlocked Academy.",
          missingFields,
        },
        { status: 400 },
      );
    }

    const expectedName =
      enrollment.student.legalName?.trim() || enrollment.student.fullName;
    if (!namesReasonablyMatch(signerName, expectedName)) {
      return jsonError(
        400,
        "El nombre firmado no coincide con el nombre registrado en el contrato. Usa tu nombre legal completo.",
      );
    }

    const signedAt = new Date();
    const contractInput = buildContractInputFromData(enrollment, signedAt);
    const signatureHash = computeStudentSignatureHash(
      contractInput,
      signerName,
      signatureImage.dataUrl,
    );

    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        contractStatus: "SIGNED",
        contractSignedAt: signedAt,
        contractSignerName: signerName,
        contractSignedIp: clientIp(req),
        contractSignedUserAgent: req.headers.get("user-agent"),
        contractTemplateVersion: CONTRACT_TEMPLATE_VERSION,
        contractAcceptanceText: CONTRACT_ACCEPTANCE_TEXT,
        contractStudentSignatureHash: signatureHash,
        contractStudentSignatureImage: signatureImage.dataUrl,
      },
    });

    await writeAudit({
      actorId: null,
      action: "operaciones.student_product_enrollment.sign_contract",
      target: enrollment.id,
      metadata: {
        studentId: enrollment.studentId,
        signerName,
        contractStatus: "SIGNED",
        templateVersion: CONTRACT_TEMPLATE_VERSION,
        signatureHash,
      },
    });

    return NextResponse.json({ contractStatus: "SIGNED" });
  } catch (err) {
    return handleApiError(err);
  }
}
