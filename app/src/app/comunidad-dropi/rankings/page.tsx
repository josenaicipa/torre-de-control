import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import {
  RADAR_RANKING_CRITERIA,
  RADAR_SEGMENT_LABELS,
  type RadarRankingCriterion,
  type RadarSegment,
} from "@/lib/comunidad-dropi-radar";
import { loadRadar } from "../_lib/radar-data";
import { COLORS } from "../_lib/tokens";
import { parsePeriod, periodKey } from "../_lib/period";
import { SubNav } from "../_components/SubNav";
import { RankingsBody } from "./RankingsBody";

export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function flatten(sp: RawSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

function parseCriterion(value: string | undefined): RadarRankingCriterion {
  if (
    value &&
    (RADAR_RANKING_CRITERIA as readonly string[]).includes(value)
  ) {
    return value as RadarRankingCriterion;
  }
  return "STAR_SCORE";
}

function isSegment(value: string): value is RadarSegment {
  return Object.keys(RADAR_SEGMENT_LABELS).includes(value);
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flatten(await searchParams);
  const sort = parseCriterion(sp.sort);
  const segmentFilter =
    sp.segment && isSegment(sp.segment) ? (sp.segment as RadarSegment) : null;
  const countryFilter = sp.country?.trim() || null;
  const { year, month } = parsePeriod(sp.period);

  const { radar, available } = await loadRadar({ year, month });
  // El periodo efectivo viene del loader: si lo pedido no existe, cae al más
  // reciente. Eso evita que los links/forms preserven un periodo inválido.
  const period = radar ? periodKey(radar.current) : null;

  return (
    <div
      style={{
        maxWidth: "min(1440px, calc(100vw - 48px))",
        margin: "0 auto",
        color: COLORS.text,
      }}
    >
      <Header />
      <SubNav />
      {!radar ? (
        <EmptyState />
      ) : (
        <RankingsBody
          members={radar.members}
          available={available}
          current={radar.current}
          period={period}
          initialSort={sort}
          initialSegment={segmentFilter}
          initialCountry={countryFilter}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <header style={{ marginBottom: 18 }}>
      <p style={eyebrowStyle()}>Comunidad Dropi · Rankings</p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Rankings de Miembros Dropi
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Reordena la comunidad por score estrella, entregadas, crecimiento,
        devoluciones y más. Entregadas siempre va primero, ingresadas como
        secundaria.
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
        Aún no hay datos para rankear
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 480,
        }}
      >
        Importa un cierre mensual de Dropi y los rankings aparecerán aquí.
      </p>
      <Link
        href="/comunidad-dropi/importaciones"
        style={{
          display: "inline-block",
          marginTop: 14,
          padding: "8px 14px",
          borderRadius: 8,
          backgroundColor: COLORS.brand,
          color: COLORS.surface,
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        Ir a Importaciones
      </Link>
    </section>
  );
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
