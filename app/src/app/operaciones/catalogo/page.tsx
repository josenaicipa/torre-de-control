import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { CatalogoClient } from "./catalogo-client";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Catálogo</h1>
      <CatalogoClient role={actor.role} />
    </div>
  );
}
