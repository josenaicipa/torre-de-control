import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actorResult = await getDashboardActor();
  const access = actorResult ? resolveDashboardAccess(actorResult.actor) : null;

  if (access?.canRead) {
    redirect("/");
  }

  const actor = await getActor();
  if (actor) {
    redirect("/operaciones");
  }

  redirect("/login?next=/dashboard");
}
