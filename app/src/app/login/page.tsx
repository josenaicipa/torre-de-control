import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
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
