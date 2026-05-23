import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { OperationsShell } from "./operations-shell";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/operaciones/estudiantes", label: "Estudiantes", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/cartera", label: "Cartera", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/mentores", label: "Mentores", roles: ["ADMIN", "OPERATOR", "VIEWER"] },
  { href: "/operaciones/importar", label: "Importar Excel", roles: ["ADMIN", "OPERATOR"] },
  { href: "/operaciones/mis-estudiantes", label: "Mis Estudiantes", roles: ["MENTOR"] },
];

export default async function OperacionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(actor.role));

  return (
    <OperationsShell actor={{ email: actor.email, role: actor.role }} navItems={visibleNav}>
      {children}
    </OperationsShell>
  );
}
