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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              marginBottom: "0.875rem",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Unlocked"
              width={36}
              height={36}
              style={{ objectFit: "contain", flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--color-accent)",
              }}
            >
              Unlocked Ecom
            </span>
          </div>
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
