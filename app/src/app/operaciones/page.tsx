import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

export default async function OperacionesIndex() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role === "MENTOR") redirect("/operaciones/mis-estudiantes");
  redirect("/operaciones/estudiantes");
}
