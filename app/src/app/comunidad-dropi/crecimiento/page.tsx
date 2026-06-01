// /comunidad-dropi/crecimiento — drill-down del "Seguimiento de crecimiento"
// que ya vive en el Radar como lectura principal.
//
// Esta pestaña reusa los mismos bloques (`ComparativoSection` y
// `CohortesSection`) y agrega un selector independiente de mes para las
// cohortes, útil cuando el operador quiere mirar otro mes sin perder el
// período comparativo elegido.
//
// Reglas duras respetadas:
//   - No tocar pipeline de importación: la cohorte en caída expone un CTA
//     server-action que crea el seguimiento DROP, no se cambia el confirm.
//   - Motor weekly (`comunidad-dropi-segments.ts`) sigue intacto.
//   - Cohortes 10/20/30 viven en el motor mensual / radar.
//   - UI en español.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import {
  loadComparativo,
  loadMonthlyRadar,
  listMonthlyPeriodsForUi,
  type Granularity,
} from "../_lib/crecimiento-data";
import { COLORS } from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";
import { ComparativoSection } from "../_components/Comparativo";
import { CohortesSection } from "../_components/Cohortes";

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function flatten(sp: RawSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

function parseGranularity(value: string | undefined): Granularity {
  return value === "monthly" ? "monthly" : "weekly";
}

export default async function CrecimientoPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flatten(await searchParams);
  const granularity = parseGranularity(sp.granularity);
  const currentKey = sp.current ?? null;
  const comparisonKey = sp.comparison ?? null;
  const monthKey = sp.cohortMonth ?? null;

  const [comparativo, monthlyPeriods] = await Promise.all([
    loadComparativo({ granularity, currentKey, comparisonKey }),
    listMonthlyPeriodsForUi(),
  ]);
  const cohortLoad = await loadMonthlyRadar(monthKey, monthlyPeriods);

  // Hidden inputs que cada form arrastra para no perder el otro lado del
  // estado: comparativo y selector de mes de cohortes viven en la misma
  // URL pero con params disjuntos.
  const comparativoHiddenInputs = monthKey
    ? [{ name: "cohortMonth", value: monthKey }]
    : undefined;
  const cohortHiddenInputs = [
    { name: "granularity", value: granularity },
    ...(comparativo?.current.key
      ? [{ name: "current", value: comparativo.current.key }]
      : []),
    ...(comparativo?.comparison?.key
      ? [{ name: "comparison", value: comparativo.comparison.key }]
      : []),
  ];

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />
      {comparativo == null && cohortLoad.radar == null ? (
        <EmptyState />
      ) : (
        <>
          {comparativo ? (
            <ComparativoSection
              comparativo={comparativo}
              formAction="/comunidad-dropi/crecimiento"
              extraHiddenInputs={comparativoHiddenInputs}
              eyebrow="Crecimiento vs. comparación"
              title="Seguimiento de crecimiento"
            />
          ) : (
            <SectionEmpty
              title="Modelo comparativo"
              text="Aún no hay períodos cargados para comparar. Importá al menos un cierre semanal o mensual."
            />
          )}
          {cohortLoad.radar && cohortLoad.current ? (
            <CohortesSection
              members={cohortLoad.radar.members}
              monthLabel={cohortLoad.current.label}
              monthSelector={
                cohortLoad.available.length > 1
                  ? {
                      availableMonths: cohortLoad.available,
                      currentKey: cohortLoad.current.key,
                      formAction: "/comunidad-dropi/crecimiento",
                      paramName: "cohortMonth",
                      extraHiddenInputs: cohortHiddenInputs,
                    }
                  : undefined
              }
              eyebrow="Cohortes mensuales"
              title="Cohortes sobre entregas"
            />
          ) : (
            <SectionEmpty
              title="Cohortes mensuales"
              text="No hay cierre mensual confirmado todavía. Importá un reporte mensual para activar las cohortes."
            />
          )}
        </>
      )}
    </div>
  );
}

function Header() {
  return (
    <header style={{ marginBottom: 18 }}>
      <p style={eyebrowStyle()}>Comunidad Dropi · Crecimiento</p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Seguimiento de crecimiento
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Drill-down del bloque que ya vive en el Radar. Comparativo con su
        propio par de selectores y cohortes con su propio selector de mes
        para investigar sin perder el contexto del Radar.
      </p>
    </header>
  );
}

function EmptyState() {
  return (
    <section
      style={{
        backgroundColor: COLORS.surface,
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
        Aún no hay datos cargados
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 520,
        }}
      >
        Importá al menos un cierre semanal o mensual de Dropi para activar el
        comparativo y las cohortes de crecimiento.
      </p>
      <Link
        href="/comunidad-dropi/importaciones"
        style={primaryLinkStyle()}
      >
        Ir a Importaciones
      </Link>
    </section>
  );
}

function SectionEmpty({ title, text }: { title: string; text: string }) {
  return (
    <section
      style={{
        backgroundColor: COLORS.surface,
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 12,
        padding: 18,
        marginBottom: 18,
      }}
    >
      <p style={eyebrowStyle()}>{title}</p>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 13,
        }}
      >
        {text}
      </p>
    </section>
  );
}

function primaryLinkStyle(): React.CSSProperties {
  return {
    display: "inline-block",
    marginTop: 14,
    padding: "8px 14px",
    borderRadius: 8,
    backgroundColor: COLORS.brand,
    color: COLORS.surface,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 13,
  };
}

function eyebrowStyle(): React.CSSProperties {
  return {
    margin: 0,
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  };
}
