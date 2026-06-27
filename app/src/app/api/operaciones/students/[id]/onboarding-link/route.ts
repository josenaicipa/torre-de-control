import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ForbiddenError,
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { canAccessStudent } from "@/lib/access";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

// Construye la URL absoluta del link de onboarding usando los headers de la
// petición; si no hay host disponible cae al path relativo.
function buildOnboardingUrl(req: Request, token: string): string {
  const path = `/onboarding/${token}`;
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return host ? `${proto}://${host}${path}` : path;
}

// Genera (o reutiliza) el link público de onboarding para que el estudiante
// complete sus datos legales/comerciales tras la venta. Solo se permite cuando
// existe al menos una inscripción ACTIVE (producto vendido). El token se
// reutiliza mientras siga vigente para no invalidar links ya enviados.
export async function POST(req: Request, { params }: Params) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      select: {
        id: true,
        mentorUserId: true,
        onboardingToken: true,
        onboardingCompletedAt: true,
        enrollments: { select: { status: true } },
      },
    });
    if (!student) return jsonError(404, "Estudiante no encontrado");
    if (!canAccessStudent(actor, student.mentorUserId)) {
      throw new ForbiddenError("Sin acceso a este estudiante");
    }

    const hasSoldProduct = student.enrollments.some(
      (e) => e.status === "ACTIVE",
    );
    if (!hasSoldProduct) {
      return jsonError(
        400,
        "El estudiante no tiene un producto vendido activo; no se puede generar el link de onboarding",
      );
    }

    let token = student.onboardingToken;
    if (!token) {
      token = randomBytes(32).toString("hex");
      await prisma.student.update({
        where: { id },
        data: { onboardingToken: token, onboardingTokenCreatedAt: new Date() },
      });
      await writeAudit({
        actorId: actor.userId,
        action: "operaciones.student.create_onboarding_link",
        target: id,
      });
    }

    return NextResponse.json({
      url: buildOnboardingUrl(req, token),
      completed: Boolean(student.onboardingCompletedAt),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
