import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDailyMetrics } from "@/lib/daily-data";
import { KpiCard } from "@/components/kpi-card";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const daily = await getDailyMetrics();

  const totals = daily.rows.reduce(
    (acc, r) => {
      acc.spend += r.spend;
      acc.booked += r.booked;
      acc.showed += r.showed;
      acc.closed += r.closed;
      acc.revenue += r.revenue;
      return acc;
    },
    { spend: 0, booked: 0, showed: 0, closed: 0, revenue: 0 },
  );

  return (
    <main className="container">
      <div className="topbar">
        <span className="brand">Torre de Control</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="muted">{session.email}</span>
          <LogoutButton />
        </div>
      </div>

      <h1 className="page-title">Dashboard</h1>
      <p className="muted">
        Rol: {session.role} ·{" "}
        <span className={`badge ${daily.freshness}`}>
          {daily.mode === "data"
            ? `datos · ${daily.freshness}`
            : "sin datos"}
        </span>
      </p>

      {daily.mode === "no-data" ? (
        <div className="empty-state">
          <h2>Sin datos todavía</h2>
          <p className="muted">
            No hay métricas diarias cargadas
            {daily.reason ? ` (${daily.reason})` : ""}. Cuando un sync escriba en
            la base de datos de Torre, los KPIs aparecerán aquí. No se muestran
            números inventados.
          </p>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Inversión" value={currency.format(totals.spend)} />
            <KpiCard label="Agendados" value={totals.booked} />
            <KpiCard
              label="Show ups"
              value={totals.showed}
              sub={
                totals.booked > 0
                  ? `${Math.round((totals.showed / totals.booked) * 100)}% del agendado`
                  : undefined
              }
            />
            <KpiCard label="Cierres" value={totals.closed} />
            <KpiCard label="Ingresos" value={currency.format(totals.revenue)} />
          </div>
          <p className="muted" style={{ marginTop: "1.5rem" }}>
            {daily.rowCount} fila(s) · última actualización:{" "}
            {daily.lastSyncAt ?? "desconocida"}
          </p>
        </>
      )}
    </main>
  );
}
