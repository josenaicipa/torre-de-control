import Link from "next/link";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();

  return (
    <main className="container">
      <div className="topbar">
        <span className="brand">Torre de Control</span>
        <span className="muted">v2 foundation</span>
      </div>

      <h1 className="page-title">Torre de Control v2</h1>
      <p className="muted">
        Plataforma robusta en construcción. El dashboard estático actual sigue
        activo; esta es la nueva base con backend, usuarios y auditoría.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
        {session ? (
          <Link className="btn secondary" href="/dashboard">
            Ir al dashboard
          </Link>
        ) : (
          <Link className="btn secondary" href="/login">
            Iniciar sesión
          </Link>
        )}
        <a className="btn secondary" href="/api/health">
          Estado del sistema
        </a>
      </div>
    </main>
  );
}
