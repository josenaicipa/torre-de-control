import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  studentId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

// Links a Dropi community member to a 1-1 Student. Writes an audit row so the
// link can be traced later. Idempotent: if the link already exists with the
// same studentId we return ok without re-writing.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);
    const { id } = await ctx.params;
    const body = bodySchema.parse(await req.json());

    const [member, student] = await Promise.all([
      prisma.dropiCommunityMember.findUnique({
        where: { id },
        select: { id: true, linkedStudentId: true },
      }),
      prisma.student.findUnique({
        where: { id: body.studentId },
        select: { id: true, fullName: true },
      }),
    ]);

    if (!member) return jsonError(404, "Miembro no encontrado");
    if (!student) return jsonError(404, "Estudiante no encontrado");
    if (member.linkedStudentId && member.linkedStudentId !== body.studentId) {
      return jsonError(
        409,
        "El miembro ya está vinculado a otro estudiante. Desvincula primero.",
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.dropiCommunityMember.update({
        where: { id },
        data: { linkedStudentId: body.studentId },
        include: {
          linkedStudent: { select: { id: true, fullName: true, email: true } },
        },
      });
      await tx.dropiStudentLinkAudit.create({
        data: {
          memberId: id,
          studentId: body.studentId,
          action: "LINKED",
          reason: body.reason ?? null,
          createdById: actor.userId,
        },
      });
      return updated;
    });

    await writeAudit({
      actorId: actor.userId,
      action: "comunidad_dropi.member.link_student",
      target: id,
      metadata: { studentId: body.studentId },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
