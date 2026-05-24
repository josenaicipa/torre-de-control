import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/actor";
import { redirect } from "next/navigation";
import { NuevoEstudianteForm } from "./nuevo-form";

export const dynamic = "force-dynamic";

export default async function NuevoEstudiantePage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "OPERATOR") {
    redirect("/operaciones/estudiantes");
  }

  const [mentors, closers] = await Promise.all([
    prisma.user.findMany({
      where: { role: "MENTOR", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        OR: [{ position: "CLOSER" }, { position: "ADMIN" }],
      },
      select: { id: true, name: true, email: true, position: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Nuevo estudiante</h1>
      <NuevoEstudianteForm mentors={mentors} closers={closers} />
    </div>
  );
}
