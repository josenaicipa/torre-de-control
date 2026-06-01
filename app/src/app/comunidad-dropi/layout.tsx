import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { OperationsShell } from "../operaciones/operations-shell";
import { getVisibleNavItems } from "../operaciones/nav-items";

export const dynamic = "force-dynamic";

export default async function ComunidadDropiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const visibleNav = getVisibleNavItems(actor.role);

  return (
    <OperationsShell actor={{ email: actor.email, role: actor.role }} navItems={visibleNav}>
      {children}
    </OperationsShell>
  );
}
