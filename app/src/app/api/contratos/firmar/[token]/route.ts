import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { CONTRACT_ACCEPTANCE_TEXT, CONTRACT_TEMPLATE_VERSION } from "@/lib/operaciones-contract-template";
import {
  buildContractInputFromData,
  computeSignaturesSummaryHash,
  computeStudentSignatureHash,
  CONTRACT_HOLDER_SIGNER_ID,
  contractEnrollmentSelect,
  contractSignerMembers,
  findMissingContractFields,
  namesReasonablyMatch,
  parseContractSectionsSnapshot,
  parseManualClausesSnapshot,
  serializeManualClausesSnapshot,
  validateSignatureImage,
} from "@/lib/operaciones-contract";
import { getManualContractClauses } from "@/lib/operaciones-settings";

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

    // Datos compartidos por ambos flujos (firmante único legacy y firma
    // múltiple por integrantes): se congelan cláusulas/secciones y se arma el
    // ContractInput canónico que sustenta el hash de firma.
    const signedAt = new Date();
    let manualClauses = parseManualClausesSnapshot(enrollment.contractManualClausesSnapshot);
    let clausesSnapshot = enrollment.contractManualClausesSnapshot;
    if (manualClauses === null) {
      const global = await getManualContractClauses();
      manualClauses = global?.clauses ?? [];
      clausesSnapshot = serializeManualClausesSnapshot(manualClauses);
    }
    const sectionsSnapshot =
      parseContractSectionsSnapshot(enrollment.contractSectionsSnapshot) ?? undefined;
    const contractInput = buildContractInputFromData(
      enrollment,
      signedAt,
      manualClauses,
      sectionsSnapshot,
    );
    const signatureHash = computeStudentSignatureHash(
      contractInput,
      signerName,
      signatureImage.dataUrl,
    );
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");

    const signerMembers = contractSignerMembers(enrollment.student.members);

    // ── Flujo de firma múltiple: titular Student SIEMPRE + integrantes ───────
    // Firmantes requeridos = titular (id "student") + cada integrante marcado.
    // La evidencia del titular se guarda en la inscripción; la de cada
    // integrante en su StudentMember. El contrato no pasa a SIGNED hasta que el
    // titular y todos los integrantes marcados hayan firmado.
    if (signerMembers.length > 0) {
      const rawSignerId = String(record.signerId ?? CONTRACT_HOLDER_SIGNER_ID).trim();
      const signerId = rawSignerId.length > 0 ? rawSignerId : CONTRACT_HOLDER_SIGNER_ID;
      const titularName =
        enrollment.student.legalName?.trim() || enrollment.student.fullName;

      if (signerId === CONTRACT_HOLDER_SIGNER_ID) {
        if (enrollment.contractSignedAt) {
          return jsonError(400, "El titular ya firmó este contrato");
        }
        if (!namesReasonablyMatch(signerName, titularName)) {
          return jsonError(
            400,
            "El nombre firmado no coincide con el nombre registrado en el contrato. Usa tu nombre legal completo.",
          );
        }

        // Guarda la evidencia del titular en la inscripción SIN marcar SIGNED:
        // la consolidación ocurre más abajo solo si ya firmaron todos.
        await prisma.studentProductEnrollment.update({
          where: { id: enrollment.id },
          data: {
            contractSignedAt: signedAt,
            contractSignerName: signerName,
            contractSignedIp: ip,
            contractSignedUserAgent: userAgent,
            contractTemplateVersion: CONTRACT_TEMPLATE_VERSION,
            contractAcceptanceText: CONTRACT_ACCEPTANCE_TEXT,
            contractStudentSignatureHash: signatureHash,
            contractStudentSignatureImage: signatureImage.dataUrl,
            contractManualClausesSnapshot: clausesSnapshot,
          },
        });

        await writeAudit({
          actorId: null,
          action: "operaciones.student_product_enrollment.sign_contract_holder",
          target: enrollment.id,
          metadata: {
            studentId: enrollment.studentId,
            signerName,
            templateVersion: CONTRACT_TEMPLATE_VERSION,
            signatureHash,
          },
        });
      } else {
        const target = signerMembers.find((m) => m.id === signerId);
        if (!target) {
          return jsonError(400, "Selecciona un firmante válido de la lista");
        }
        if (target.contractSignedAt) {
          return jsonError(400, "Este integrante ya firmó el contrato");
        }
        if (!namesReasonablyMatch(signerName, target.fullName)) {
          return jsonError(
            400,
            "El nombre firmado no coincide con el del firmante seleccionado. Usa su nombre completo.",
          );
        }

        await prisma.studentMember.update({
          where: { id: target.id },
          data: {
            contractSignerName: signerName,
            contractSignedAt: signedAt,
            contractSignatureImage: signatureImage.dataUrl,
            contractSignatureHash: signatureHash,
            contractSignedIp: ip,
            contractSignedUserAgent: userAgent,
          },
        });

        await writeAudit({
          actorId: null,
          action: "operaciones.student_product_enrollment.sign_contract_member",
          target: enrollment.id,
          metadata: {
            studentId: enrollment.studentId,
            memberId: target.id,
            signerName,
            templateVersion: CONTRACT_TEMPLATE_VERSION,
            signatureHash,
          },
        });
      }

      // Evidencia consolidada tras esta firma: titular + cada integrante. Para
      // el firmante actual se usan los valores recién firmados; para el resto la
      // evidencia ya persistida.
      const titularEvidence =
        signerId === CONTRACT_HOLDER_SIGNER_ID
          ? {
              name: signerName,
              hash: signatureHash,
              image: signatureImage.dataUrl as string | null,
              signed: true,
            }
          : {
              name: enrollment.contractSignerName ?? titularName,
              hash: enrollment.contractStudentSignatureHash ?? "",
              image: enrollment.contractStudentSignatureImage,
              signed: Boolean(enrollment.contractSignedAt),
            };
      const memberEvidence = signerMembers.map((m) =>
        m.id === signerId
          ? {
              name: signerName,
              hash: signatureHash,
              image: signatureImage.dataUrl as string | null,
              signed: true,
            }
          : {
              name: m.contractSignerName ?? m.fullName,
              hash: m.contractSignatureHash ?? "",
              image: m.contractSignatureImage,
              signed: Boolean(m.contractSignedAt),
            },
      );

      const allEvidence = [titularEvidence, ...memberEvidence];
      const pending = allEvidence.filter((e) => !e.signed);
      if (pending.length > 0) {
        return NextResponse.json({
          contractStatus: "PENDING_SIGNATURE",
          pendingSignatures: pending.length,
        });
      }

      // Todos firmaron: se consolida la inscripción. contractStudentSignatureHash
      // pasa a ser el resumen de los hashes individuales y contractSignerName une
      // al titular con los integrantes firmantes. approve sigue viendo
      // contractSignedAt y contractStudentSignatureHash.
      const joinedNames = allEvidence.map((e) => e.name).join(", ");
      const summaryHash = computeSignaturesSummaryHash(
        allEvidence.map((e) => e.hash),
      );
      const firstImage =
        allEvidence.find((e) => e.image)?.image ?? signatureImage.dataUrl;

      await prisma.studentProductEnrollment.update({
        where: { id: enrollment.id },
        data: {
          contractStatus: "SIGNED",
          contractSignedAt: signedAt,
          contractSignerName: joinedNames,
          contractSignedIp: ip,
          contractSignedUserAgent: userAgent,
          contractTemplateVersion: CONTRACT_TEMPLATE_VERSION,
          contractAcceptanceText: CONTRACT_ACCEPTANCE_TEXT,
          contractStudentSignatureHash: summaryHash,
          contractStudentSignatureImage: firstImage,
          contractManualClausesSnapshot: clausesSnapshot,
        },
      });

      await prisma.student.updateMany({
        where: { id: enrollment.studentId, status: "PENDING" },
        data: { status: "ACTIVE", durationAssumed: false },
      });

      await writeAudit({
        actorId: null,
        action: "operaciones.student_product_enrollment.sign_contract",
        target: enrollment.id,
        metadata: {
          studentId: enrollment.studentId,
          signerName: joinedNames,
          contractStatus: "SIGNED",
          templateVersion: CONTRACT_TEMPLATE_VERSION,
          signatureHash: summaryHash,
        },
      });

      return NextResponse.json({ contractStatus: "SIGNED" });
    }

    // ── Flujo legacy: firmante único (titular Student) ───────────────────────
    const expectedName =
      enrollment.student.legalName?.trim() || enrollment.student.fullName;
    if (!namesReasonablyMatch(signerName, expectedName)) {
      return jsonError(
        400,
        "El nombre firmado no coincide con el nombre registrado en el contrato. Usa tu nombre legal completo.",
      );
    }

    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        contractStatus: "SIGNED",
        contractSignedAt: signedAt,
        contractSignerName: signerName,
        contractSignedIp: ip,
        contractSignedUserAgent: userAgent,
        contractTemplateVersion: CONTRACT_TEMPLATE_VERSION,
        contractAcceptanceText: CONTRACT_ACCEPTANCE_TEXT,
        contractStudentSignatureHash: signatureHash,
        contractStudentSignatureImage: signatureImage.dataUrl,
        contractManualClausesSnapshot: clausesSnapshot,
      },
    });

    await prisma.student.updateMany({
      where: { id: enrollment.studentId, status: "PENDING" },
      data: { status: "ACTIVE", durationAssumed: false },
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
