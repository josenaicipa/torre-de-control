import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import {
  RADAR_RANKING_CRITERIA,
  RADAR_RANKING_LABELS,
  RADAR_SEGMENT_COLORS,
  RADAR_SEGMENT_LABELS,
  rankRadarMembers,
  type RadarMember,
  type RadarRankingCriterion,
  type RadarSegment,
} from "@/lib/comunidad-dropi-radar";
import { formatMonthRef, loadRadar } from "../_lib/radar-data";
import { COLORS } from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";

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

  const { radar } = await loadRadar();

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />
      {!radar ? (
        <EmptyState />
      ) : (
        <Body
          radar={radar}
          sort={sort}
          segmentFilter={segmentFilter}
          countryFilter={countryFilter}
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

function Body({
  radar,
  sort,
  segmentFilter,
  countryFilter,
}: {
  radar: NonNullable<Awaited<ReturnType<typeof loadRadar>>["radar"]>;
  sort: RadarRankingCriterion;
  segmentFilter: RadarSegment | null;
  countryFilter: string | null;
}) {
  let pool: RadarMember[] = radar.members;
  if (segmentFilter) pool = pool.filter((m) => m.segment === segmentFilter);
  if (countryFilter)
    pool = pool.filter(
      (m) =>
        (m.country ?? "").toLowerCase() === countryFilter.toLowerCase(),
    );

  const ranked = rankRadarMembers(pool, sort);

  const countries = Array.from(
    new Set(
      radar.members
        .map((m) => m.country?.trim())
        .filter((c): c is string => Boolean(c && c.length)),
    ),
  ).sort();

  const segments = Array.from(
    new Set(radar.members.map((m) => m.segment)),
  ).sort();

  return (
    <>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 12,
          color: COLORS.textSoft,
        }}
      >
        Mes: <strong>{formatMonthRef(radar.current)}</strong> ·{" "}
        {ranked.length} miembros mostrados de {radar.members.length}.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 12,
        }}
      >
        {RADAR_RANKING_CRITERIA.map((c) => (
          <Link
            key={c}
            href={buildHref({ sort: c, segmentFilter, countryFilter })}
            style={pillStyle(c === sort)}
          >
            {RADAR_RANKING_LABELS[c]}
          </Link>
        ))}
      </div>

      <form
        method="get"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 14,
        }}
      >
        <input type="hidden" name="sort" value={sort} />
        <select
          name="segment"
          defaultValue={segmentFilter ?? ""}
          style={inputStyle()}
          aria-label="Filtrar por segmento"
        >
          <option value="">Todos los segmentos</option>
          {segments.map((s) => (
            <option key={s} value={s}>
              {RADAR_SEGMENT_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          name="country"
          defaultValue={countryFilter ?? ""}
          style={inputStyle()}
          aria-label="Filtrar por país"
        >
          <option value="">Todos los países</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="submit" style={primaryButtonStyle()}>
          Filtrar
        </button>
        {(segmentFilter || countryFilter) && (
          <Link
            href={buildHref({
              sort,
              segmentFilter: null,
              countryFilter: null,
            })}
            style={ghostLinkStyle()}
          >
            Limpiar filtros
          </Link>
        )}
      </form>

      {ranked.length === 0 ? (
        <EmptyText text="Ningún miembro coincide con los filtros aplicados." />
      ) : (
        <RankingsTable rows={ranked} sort={sort} />
      )}
    </>
  );
}

function buildHref(params: {
  sort: RadarRankingCriterion;
  segmentFilter: RadarSegment | null;
  countryFilter: string | null;
}): string {
  const search = new URLSearchParams();
  if (params.sort !== "STAR_SCORE") search.set("sort", params.sort);
  if (params.segmentFilter) search.set("segment", params.segmentFilter);
  if (params.countryFilter) search.set("country", params.countryFilter);
  const qs = search.toString();
  return `/comunidad-dropi/rankings${qs ? `?${qs}` : ""}`;
}

function RankingsTable({
  rows,
  sort,
}: {
  rows: RadarMember[];
  sort: RadarRankingCriterion;
}) {
  return (
    <div
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        overflowX: "auto",
      }}
    >
      <table
        role="grid"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead style={{ backgroundColor: COLORS.background }}>
          <tr>
            <Th>#</Th>
            <Th>Miembro</Th>
            <Th>Segmento</Th>
            <Th align="right">Entregadas</Th>
            <Th align="right">Ingresadas</Th>
            <Th align="right">Tasa entrega</Th>
            <Th align="right">Tasa devol.</Th>
            <Th align="right">Δ entregadas</Th>
            <Th align="right">Score ★</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, idx) => (
            <tr
              key={m.id}
              style={{
                borderTop: `1px solid ${COLORS.border}`,
                backgroundColor:
                  idx % 2 === 0 ? COLORS.surface : COLORS.background,
              }}
            >
              <Td>
                <span style={{ color: COLORS.textMuted, fontWeight: 700 }}>
                  {idx + 1}
                </span>
              </Td>
              <Td>
                <Link
                  href={`/comunidad-dropi/miembros/${m.id}`}
                  style={{
                    color: COLORS.brand,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {m.fullName ?? m.email ?? "Sin nombre"}
                </Link>
                {m.country ? (
                  <span
                    style={{
                      marginLeft: 6,
                      color: COLORS.textMuted,
                      fontSize: 11,
                    }}
                  >
                    {m.country}
                  </span>
                ) : null}
              </Td>
              <Td>
                <SegmentChip segment={m.segment} />
              </Td>
              <Td align="right">
                <strong>{m.current.ordersDelivered.toLocaleString("es-CO")}</strong>
              </Td>
              <Td align="right">
                {m.current.ordersEntered.toLocaleString("es-CO")}
              </Td>
              <Td align="right">{m.deliveryRate}%</Td>
              <Td align="right">
                <span
                  style={{
                    color:
                      m.returnRate >= 25 ? COLORS.danger : COLORS.textSoft,
                    fontWeight: m.returnRate >= 25 ? 700 : 500,
                  }}
                >
                  {m.returnRate}%
                </span>
              </Td>
              <Td align="right">
                <DeltaPill value={m.deliveredDeltaPct} />
              </Td>
              <Td align="right">
                <strong style={{ color: COLORS.text }}>
                  {m.starScore.toFixed(0)}
                </strong>
                {sort === "STAR_SCORE" ? (
                  <span
                    style={{
                      marginLeft: 4,
                      color: COLORS.textMuted,
                      fontSize: 11,
                    }}
                  >
                    /100
                  </span>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentChip({ segment }: { segment: RadarSegment }) {
  const c = RADAR_SEGMENT_COLORS[segment];
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 8px",
        borderRadius: 999,
        backgroundColor: c.bg,
        color: c.text,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {RADAR_SEGMENT_LABELS[segment]}
    </span>
  );
}

function DeltaPill({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span style={{ color: COLORS.textMuted }}>—</span>;
  }
  const positive = value >= 0;
  const color = positive ? COLORS.success : COLORS.danger;
  return (
    <span style={{ color, fontWeight: 700 }}>
      {positive ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        padding: "8px 12px",
        textAlign: align ?? "left",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: COLORS.textSoft,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "8px 12px",
        verticalAlign: "middle",
        textAlign: align ?? "left",
      }}
    >
      {children}
    </td>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>{text}</p>
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

function pillStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: active ? 700 : 600,
    textDecoration: "none",
    color: active ? COLORS.surface : COLORS.textSoft,
    backgroundColor: active ? COLORS.brand : COLORS.surface,
    border: `1px solid ${active ? COLORS.brand : COLORS.border}`,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    padding: "8px 10px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 13,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    fontFamily: "inherit",
  };
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    padding: "8px 14px",
    border: "none",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    backgroundColor: COLORS.brand,
    color: COLORS.surface,
    cursor: "pointer",
  };
}

function ghostLinkStyle(): React.CSSProperties {
  return {
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.textSoft,
    textDecoration: "none",
    alignSelf: "center",
  };
}
