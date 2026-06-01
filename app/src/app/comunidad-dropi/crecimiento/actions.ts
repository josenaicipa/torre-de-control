"use server";

// Server actions del módulo Crecimiento. Permiten al operador abrir un
// `DropiFollowUp` con razón DROP directo desde la cohorte en caída,
// usando el mismo patrón (audit log + revalidate) que el POST de
// `/api/comunidad-dropi/follow-ups`. NO toca el pipeline de importación.

import { revalidatePath } from "next/cache";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

// El form de la cohorte usa esta action directamente, así que su firma debe
// satisfacer el contrato de React (`(formData) => void | Promise<void>`).
// Mantenemos audit + revalidate + dedupe; sólo revalidamos las páginas
// afectadas para que el CTA refleje el nuevo estado al recargar.
export async function openDeliveredDropFollowUp(
  formData: FormData,
): Promise<void> {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!memberId) return;

  const actor = await getActor();
  requireActor(actor);
  requireOperatorOrAdmin(actor);

  const member = await prisma.dropiCommunityMember.findUnique({
    where: { id: memberId },
    select: { id: true },
  });
  if (!member) return;

  // Evita duplicar trabajo si ya hay un DROP abierto para el miembro: el
  // operador puede revisar el existente en vez de abrir otro paralelo.
  const existing = await prisma.dropiFollowUp.findFirst({
    where: {
      memberId,
      reason: "DROP",
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    select: { id: true },
  });
  if (existing) {
    revalidatePath("/comunidad-dropi/crecimiento");
    return;
  }

  const created = await prisma.dropiFollowUp.create({
    data: {
      memberId,
      reason: "DROP",
      priority: "P1",
      suggestedAction:
        "Caída de entregas vs. mes anterior: contactar para diagnóstico y reactivación.",
      notes: note,
      createdById: actor.userId,
    },
  });

  await writeAudit({
    actorId: actor.userId,
    action: "comunidad_dropi.follow_up.create",
    target: created.id,
    metadata: { memberId, reason: "DROP", source: "crecimiento_decline_cohort" },
  });

  revalidatePath("/comunidad-dropi/crecimiento");
  revalidatePath("/comunidad-dropi/seguimientos");
  revalidatePath("/comunidad-dropi/radar");
}
