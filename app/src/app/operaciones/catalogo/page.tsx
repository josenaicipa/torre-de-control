import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { prisma } from "@/lib/prisma";
import { CatalogoClient } from "./catalogo-client";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  // Owners are picked from active users (typically ADMIN / OPERATOR). The list
  // doesn't change often, so we hydrate it server-side and skip the client
  // round-trip; payment providers, by contrast, are CRUD-managed in this same
  // page so the client refetches them on each mutation.
  const ownerUsers = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Catálogo</h1>
      <CatalogoClient role={actor.role} ownerUsers={ownerUsers} />
    </div>
  );
}
