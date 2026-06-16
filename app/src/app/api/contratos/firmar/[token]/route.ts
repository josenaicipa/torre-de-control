import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

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
// Solo marca el contrato como SIGNED; NO libera acceso a LearnWorlds (eso
// ocurre al aprobar desde Torre).
export async function POST(req: Request, { params }: Params) {
  try {
    const { token } = await params;
    if (!token) return jsonError(404, "Enlace de firma inválido");

    const enrollment = await prisma.studentProductEnrollment.findUnique({
      where: { contractSignatureToken: token },
      select: { id: true, studentId: true, contractStatus: true },
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

    if (enrollment.contractStatus === "SIGNED") {
      return jsonError(400, "Este contrato ya fue firmado");
    }
    if (enrollment.contractStatus === "APPROVED") {
      return jsonError(400, "Este contrato ya fue aprobado");
    }
    if (enrollment.contractStatus !== "PENDING_SIGNATURE") {
      return jsonError(400, "Este contrato no está disponible para firma");
    }

    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        contractStatus: "SIGNED",
        contractSignedAt: new Date(),
        contractSignerName: signerName,
        contractSignedIp: clientIp(req),
      },
    });

    await writeAudit({
      actorId: null,
      action: "operaciones.student_product_enrollment.sign_test_contract",
      target: enrollment.id,
      metadata: {
        studentId: enrollment.studentId,
        signerName,
        contractStatus: "SIGNED",
      },
    });

    return NextResponse.json({ contractStatus: "SIGNED" });
  } catch (err) {
    return handleApiError(err);
  }
}
