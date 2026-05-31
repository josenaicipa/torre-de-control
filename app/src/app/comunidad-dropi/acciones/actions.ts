"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActor, requireActor, requireOperatorOrAdmin } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  CONTACT_CHANNELS,
  FOLLOW_UP_OUTCOMES,
  type ContactChannel,
  type FollowUpOutcome,
} from "../_lib/follow-up-schema";

type FollowUpStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "DISMISSED";

const VALID_STATUSES: FollowUpStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "DISMISSED",
];

function parseStatus(value: FormDataEntryValue | null): FollowUpStatus | null {
  const v = String(value ?? "");
  return (VALID_STATUSES as string[]).includes(v) ? (v as FollowUpStatus) : null;
}

function parseOutcome(value: FormDataEntryValue | null): FollowUpOutcome | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return (FOLLOW_UP_OUTCOMES as readonly string[]).includes(v)
    ? (v as FollowUpOutcome)
    : null;
}

function parseChannel(value: FormDataEntryValue | null): ContactChannel | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return (CONTACT_CHANNELS as readonly string[]).includes(v)
    ? (v as ContactChannel)
    : null;
}

async function authorize() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  requireActor(actor);
  requireOperatorOrAdmin(actor);
  return actor;
}

export async function updateFollowUpStatusAction(formData: FormData) {
  const actor = await authorize();
  const id = String(formData.get("id") ?? "");
  const status = parseStatus(formData.get("status"));
  if (!id || !status) return;

  const existing = await prisma.dropiFollowUp.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return;

  await prisma.dropiFollowUp.update({
    where: { id },
    data: { status },
  });

  await writeAudit({
    actorId: actor.userId,
    action: "comunidad_dropi.follow_up.update",
    target: id,
    metadata: { fields: ["status"], status },
  });

  revalidatePath("/comunidad-dropi/acciones");
  revalidatePath("/comunidad-dropi/radar");
}

export async function logFollowUpContactAction(formData: FormData) {
  const actor = await authorize();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const existing = await prisma.dropiFollowUp.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return;

  const outcome = parseOutcome(formData.get("outcome"));
  const channel = parseChannel(formData.get("contactChannel"));
  const advance = formData.get("advance") === "1";
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const notes = notesRaw.length > 0 ? notesRaw.slice(0, 2000) : null;

  await prisma.dropiFollowUp.update({
    where: { id },
    data: {
      contactedAt: new Date(),
      outcome,
      contactChannel: channel,
      ...(notes != null ? { result: notes } : {}),
      ...(advance ? { status: "IN_PROGRESS" } : {}),
    },
  });

  await writeAudit({
    actorId: actor.userId,
    action: "comunidad_dropi.follow_up.update",
    target: id,
    metadata: {
      fields: [
        "contactedAt",
        ...(outcome ? ["outcome"] : []),
        ...(channel ? ["contactChannel"] : []),
        ...(notes ? ["result"] : []),
        ...(advance ? ["status"] : []),
      ],
    },
  });

  revalidatePath("/comunidad-dropi/acciones");
  revalidatePath("/comunidad-dropi/radar");
}
