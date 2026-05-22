import { redirect } from "next/navigation";
import { getDashboardActor } from "@/lib/dashboard-actor";
import { resolveDashboardAccess } from "@/lib/dashboard-access";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const actorResult = await getDashboardActor();
  const access = actorResult ? resolveDashboardAccess(actorResult.actor) : null;
  if (access?.canRead) {
    redirect("/");
  }

  return (
    <main className="auth-shell">
      <div className="card auth-card">
        <div style={{ marginBottom: "1.5rem" }}>
          <div className="brand">Torre de Control</div>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Inicia sesión para continuar
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
