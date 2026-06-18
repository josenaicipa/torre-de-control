import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { JoseSignatureConfig } from "./jose-signature-config";
import { ContractClausesConfig } from "./contract-clauses-config";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role !== "ADMIN" && actor.role !== "OPERATOR") {
    redirect("/operaciones/estudiantes");
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Configuración</h1>
      <JoseSignatureConfig />
      <ContractClausesConfig />
    </div>
  );
}
