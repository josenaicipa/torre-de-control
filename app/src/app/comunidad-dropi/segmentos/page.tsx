import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/actor";
import {
  RADAR_SEGMENT_COLORS,
  RADAR_SEGMENT_LABELS,
  type RadarSegmentBucket,
} from "@/lib/comunidad-dropi-radar";
import { formatMonthRef, loadRadar } from "../_lib/radar-data";
import { COLORS } from "../_lib/tokens";
import { SubNav } from "../_components/SubNav";

export const dynamic = "force-dynamic";

const SEGMENT_DESCRIPTIONS: Record<string, string> = {
  STAR:
    "Alto volumen entregado, baja devolución y crecimiento sostenido. Casos de éxito que conviene replicar.",
  GROWING:
    "Entregadas crecen más de 10% vs. el mes anterior. Acompañar para que sostengan el ritmo.",
  DROPPING:
    "Entregadas caen más de 10% vs. el mes anterior. Diagnóstico operativo prioritario.",
  STABLE:
    "Movimiento dentro de ±10%. Mantener seguimiento ligero y buscar oportunidades de upsell.",
  HIGH_RETURN:
    "Tasa de devolución igual o mayor a 25%. Revisar productos, mensajería o logística antes de subir volumen.",
  RECOVERED:
    "Pasaron de cero entregas el mes anterior a actividad real este mes. Validar que se sostenga.",
  INACTIVE:
    "Tenían actividad previa y este mes no movieron ni una sola orden. Activación o despedida.",
  NEW: "Primera ventana con actividad. Onboarding y seguimiento cercano.",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function flatten(sp: RawSearchParams): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

function parsePeriod(value: string | undefined): {
  year?: number;
  month?: number;
} {
  if (!value) return {};
  const [y, m] = value.split("-");
  const year = Number.parseInt(y ?? "", 10);
  const month = Number.parseInt(m ?? "", 10);
  if (Number.isFinite(year) && Number.isFinite(month)) return { year, month };
  return {};
}

export default async function SegmentosPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const sp = flatten(await searchParams);
  const period = sp.period ?? null;
  const { year, month } = parsePeriod(period ?? undefined);
  const { radar } = await loadRadar({ year, month });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", color: COLORS.text }}>
      <Header />
      <SubNav />
      {!radar ? (
        <EmptyState />
      ) : (
        <Body
          buckets={radar.segmentBuckets}
          totalMembers={radar.kpis.totalMembers}
          monthLabel={formatMonthRef(radar.current)}
          period={period}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <header style={{ marginBottom: 18 }}>
      <p style={eyebrowStyle()}>Comunidad Dropi · Segmentos</p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
        }}
      >
        Segmentación automática
      </h1>
      <p
        style={{
          margin: "6px 0 0",
          color: COLORS.textSoft,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        Cada Miembro Dropi cae en un segmento del cierre mensual según
        entregadas, crecimiento y devoluciones. Útil para priorizar acciones.
      </p>
    </header>
  );
}

function Body({
  buckets,
  totalMembers,
  monthLabel,
  period,
}: {
  buckets: RadarSegmentBucket[];
  totalMembers: number;
  monthLabel: string;
  period: string | null;
}) {
  if (buckets.length === 0) {
    return <EmptyText text="Aún no se calculan segmentos para este mes." />;
  }
  return (
    <>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 12,
          color: COLORS.textSoft,
        }}
      >
        Mes: <strong>{monthLabel}</strong> · {totalMembers} miembros en total.
      </p>

      <div
        style={{
          display: "flex",
          height: 14,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: COLORS.background,
          marginBottom: 18,
          border: `1px solid ${COLORS.border}`,
        }}
        aria-label="Distribución de la comunidad por segmento"
      >
        {buckets.map((b) => (
          <span
            key={b.segment}
            title={`${RADAR_SEGMENT_LABELS[b.segment]} · ${b.memberCount} miembros · ${b.share}%`}
            style={{
              width: `${b.share}%`,
              backgroundColor: RADAR_SEGMENT_COLORS[b.segment].text,
            }}
          />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
        }}
      >
        {buckets.map((b) => (
          <SegmentCard key={b.segment} bucket={b} period={period} />
        ))}
      </div>
    </>
  );
}

function SegmentCard({
  bucket,
  period,
}: {
  bucket: RadarSegmentBucket;
  period: string | null;
}) {
  const rankingsHref = period
    ? `/comunidad-dropi/rankings?segment=${bucket.segment}&period=${period}`
    : `/comunidad-dropi/rankings?segment=${bucket.segment}`;
  const colors = RADAR_SEGMENT_COLORS[bucket.segment];
  const description =
    SEGMENT_DESCRIPTIONS[bucket.segment] ?? "Sin descripción.";
  return (
    <section
      id={bucket.segment}
      style={{
        backgroundColor: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `4px solid ${colors.text}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            padding: "4px 10px",
            borderRadius: 999,
            backgroundColor: colors.bg,
            color: colors.text,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {RADAR_SEGMENT_LABELS[bucket.segment]}
        </span>
        <span
          style={{
            fontSize: 13,
            color: COLORS.textSoft,
            fontWeight: 600,
          }}
        >
          {bucket.memberCount} {bucket.memberCount === 1 ? "miembro" : "miembros"} · {bucket.share}%
        </span>
      </div>

      <p
        style={{
          margin: 0,
          color: COLORS.textSoft,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      {bucket.topMembers.length === 0 ? (
        <EmptyText text="Sin miembros en este segmento." />
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          {bucket.topMembers.map((m) => (
            <li
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 0",
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Link
                  href={`/comunidad-dropi/miembros/${m.id}`}
                  style={{
                    color: COLORS.brand,
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  {m.fullName ?? m.email ?? "Sin nombre"}
                </Link>
                <span
                  style={{
                    color: COLORS.textSoft,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {m.current.ordersDelivered.toLocaleString("es-CO")}{" "}
                  entregadas · {m.current.ordersEntered.toLocaleString("es-CO")} ingresadas
                  {m.country ? ` · ${m.country}` : ""}
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: COLORS.textSoft,
                  whiteSpace: "nowrap",
                }}
              >
                ★ {m.starScore.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={rankingsHref}
        style={{
          alignSelf: "flex-start",
          color: COLORS.brand,
          fontSize: 12,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Ver todos en rankings →
      </Link>
    </section>
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
        Aún no hay segmentos calculados
      </h2>
      <p
        style={{
          margin: "8px auto 0",
          color: COLORS.textSoft,
          fontSize: 14,
          maxWidth: 480,
        }}
      >
        Importa un cierre mensual y la segmentación automática aparecerá aquí.
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
