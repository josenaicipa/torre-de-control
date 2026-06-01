"use client";

// El cuerpo interactivo de /rankings vive en cliente para que cambiar criterio
// de orden o filtros (segmento/país) no requiera roundtrip al servidor: la
// página carga el dataset una sola vez y aquí se filtra/ordena en memoria.
// La URL se sincroniza con `history.replaceState` para preservar deeplinks
// sin disparar navegación de Next.js.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { COLORS } from "../_lib/tokens";
import { buildSearchString } from "../_lib/period";
import { PeriodSelector } from "../_components/PeriodSelector";
import { formatMonthRef } from "../_lib/radar-cache";
import type { AvailableMonth } from "../_lib/radar-data";

// Etiquetas cortas para los chips de criterio: en ancho reducido la lista
// original ("Mejor tasa de entrega", "Mayor crecimiento"…) se desbordaba.
const CRITERION_PILL_LABELS: Record<RadarRankingCriterion, string> = {
  STAR_SCORE: "Score ★",
  DELIVERED: "Entregadas",
  ENTERED: "Ingresadas",
  DELIVERY_RATE: "Tasa entrega",
  RETURNS: "Devoluciones",
  GROWTH: "Crecimiento",
  DECLINE: "Caída",
};

export function RankingsBody({
  members,
  available,
  current,
  period,
  initialSort,
  initialSegment,
  initialCountry,
}: {
  members: RadarMember[];
  available: AvailableMonth[];
  current: { year: number; month: number };
  period: string | null;
  initialSort: RadarRankingCriterion;
  initialSegment: RadarSegment | null;
  initialCountry: string | null;
}) {
  const [sort, setSort] = useState<RadarRankingCriterion>(initialSort);
  const [segmentFilter, setSegmentFilter] = useState<RadarSegment | null>(
    initialSegment,
  );
  const [countryFilter, setCountryFilter] = useState<string | null>(
    initialCountry,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = buildSearchString({
      sort: sort === "STAR_SCORE" ? null : sort,
      segment: segmentFilter,
      country: countryFilter,
      period,
    });
    const next = window.location.pathname + search + window.location.hash;
    const current =
      window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  }, [sort, segmentFilter, countryFilter, period]);

  const ranked = useMemo(() => {
    let pool = members;
    if (segmentFilter) pool = pool.filter((m) => m.segment === segmentFilter);
    if (countryFilter) {
      const target = countryFilter.toLowerCase();
      pool = pool.filter((m) => (m.country ?? "").toLowerCase() === target);
    }
    return rankRadarMembers(pool, sort);
  }, [members, segmentFilter, countryFilter, sort]);

  const countries = useMemo(
    () =>
      Array.from(
        new Set(
          members
            .map((m) => m.country?.trim())
            .filter((c): c is string => Boolean(c && c.length)),
        ),
      ).sort(),
    [members],
  );

  const segments = useMemo(
    () => Array.from(new Set(members.map((m) => m.segment))).sort(),
    [members],
  );

  const periodHidden = {
    sort: sort === "STAR_SCORE" ? null : sort,
    segment: segmentFilter,
    country: countryFilter,
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          margin: "0 0 12px",
          fontSize: 12,
          color: COLORS.textSoft,
        }}
      >
        <span>
          Mes: <strong>{formatMonthRef(current)}</strong> · {ranked.length}{" "}
          miembros mostrados de {members.length}.
        </span>
        <PeriodSelector
          basePath="/comunidad-dropi/rankings"
          active={current}
          available={available}
          hiddenParams={periodHidden}
        />
      </div>

      <div
        role="tablist"
        aria-label="Ordenar por"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {RADAR_RANKING_CRITERIA.map((c) => {
          const active = c === sort;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSort(c)}
              title={RADAR_RANKING_LABELS[c]}
              style={pillStyle(active)}
            >
              {CRITERION_PILL_LABELS[c]}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <select
          value={segmentFilter ?? ""}
          onChange={(e) =>
            setSegmentFilter(
              e.target.value ? (e.target.value as RadarSegment) : null,
            )
          }
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
          value={countryFilter ?? ""}
          onChange={(e) => setCountryFilter(e.target.value || null)}
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
        {(segmentFilter || countryFilter) && (
          <button
            type="button"
            onClick={() => {
              setSegmentFilter(null);
              setCountryFilter(null);
            }}
            style={ghostButtonStyle()}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {ranked.length === 0 ? (
        <p style={{ margin: 0, color: COLORS.textMuted, fontSize: 13 }}>
          Ningún miembro coincide con los filtros aplicados.
        </p>
      ) : (
        <RankingsTable rows={ranked} sort={sort} onSort={setSort} />
      )}
    </>
  );
}

function RankingsTable({
  rows,
  sort,
  onSort,
}: {
  rows: RadarMember[];
  sort: RadarRankingCriterion;
  onSort: (c: RadarRankingCriterion) => void;
}) {
  // `min-width` se queda corto del total fijo de columnas para que en pantallas
  // angostas el contenedor habilite scroll horizontal de forma evidente. En
  // pantallas >= 1180px la tabla cabe sin scroll.
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
        style={{
          width: "100%",
          minWidth: 960,
          borderCollapse: "separate",
          borderSpacing: 0,
          tableLayout: "fixed",
          fontSize: 12.5,
        }}
      >
        <colgroup>
          <col style={{ width: 44 }} />
          <col />
          <col style={{ width: 128 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 88 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 92 }} />
          <col style={{ width: 100 }} />
        </colgroup>
        <thead>
          <tr>
            <Th>#</Th>
            <Th>Miembro</Th>
            <Th>Segmento</Th>
            <SortableTh
              align="right"
              active={sort === "DELIVERED"}
              criterion="DELIVERED"
              onSort={onSort}
            >
              Entregadas
            </SortableTh>
            <SortableTh
              align="right"
              active={sort === "ENTERED"}
              criterion="ENTERED"
              onSort={onSort}
            >
              Ingresadas
            </SortableTh>
            <SortableTh
              align="right"
              active={sort === "DELIVERY_RATE"}
              criterion="DELIVERY_RATE"
              onSort={onSort}
              title="Conversión entregadas / ingresadas"
            >
              Conv. e/i
            </SortableTh>
            <SortableTh
              align="right"
              active={sort === "RETURNS"}
              criterion="RETURNS"
              onSort={onSort}
              title="Tasa de devolución"
            >
              Devol.
            </SortableTh>
            <SortableTh
              align="right"
              active={sort === "GROWTH" || sort === "DECLINE"}
              criterion="GROWTH"
              onSort={onSort}
              title="Variación de entregadas vs. mes previo"
            >
              Δ entreg.
            </SortableTh>
            <SortableTh
              align="right"
              active={sort === "STAR_SCORE"}
              criterion="STAR_SCORE"
              onSort={onSort}
            >
              Score ★
            </SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((m, idx) => (
            <tr
              key={m.id}
              style={{
                backgroundColor:
                  idx % 2 === 0 ? COLORS.surface : COLORS.background,
              }}
            >
              <Td>
                <span
                  style={{
                    color: COLORS.textMuted,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
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
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={m.fullName ?? m.email ?? "Sin nombre"}
                >
                  {m.fullName ?? m.email ?? "Sin nombre"}
                </Link>
                {m.country ? (
                  <span
                    style={{
                      color: COLORS.textMuted,
                      fontSize: 11,
                      display: "block",
                      marginTop: 1,
                    }}
                  >
                    {m.country}
                  </span>
                ) : null}
              </Td>
              <Td>
                <SegmentChip segment={m.segment} />
              </Td>
              <NumTd highlight={sort === "DELIVERED"}>
                <strong>
                  {m.current.ordersDelivered.toLocaleString("es-CO")}
                </strong>
              </NumTd>
              <NumTd highlight={sort === "ENTERED"}>
                {m.current.ordersEntered.toLocaleString("es-CO")}
              </NumTd>
              <NumTd highlight={sort === "DELIVERY_RATE"}>
                {m.deliveryRate}%
              </NumTd>
              <NumTd highlight={sort === "RETURNS"}>
                <span
                  style={{
                    color:
                      m.returnRate >= 25 ? COLORS.danger : COLORS.textSoft,
                    fontWeight: m.returnRate >= 25 ? 700 : 500,
                  }}
                >
                  {m.returnRate}%
                </span>
              </NumTd>
              <NumTd highlight={sort === "GROWTH" || sort === "DECLINE"}>
                <DeltaPill value={m.deliveredDeltaPct} />
              </NumTd>
              <NumTd highlight={sort === "STAR_SCORE"}>
                <strong style={{ color: COLORS.text }}>
                  {m.starScore.toFixed(0)}
                </strong>
                {sort === "STAR_SCORE" ? (
                  <span
                    style={{
                      marginLeft: 3,
                      color: COLORS.textMuted,
                      fontSize: 11,
                    }}
                  >
                    /100
                  </span>
                ) : null}
              </NumTd>
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
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        backgroundColor: c.bg,
        color: c.text,
        fontSize: 11,
        fontWeight: 700,
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
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
    <span
      style={{
        color,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
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
        padding: "8px 10px",
        textAlign: align ?? "left",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: COLORS.textSoft,
        backgroundColor: COLORS.background,
        borderBottom: `1px solid ${COLORS.border}`,
        position: "sticky",
        top: 0,
        whiteSpace: "nowrap",
        zIndex: 1,
      }}
    >
      {children}
    </th>
  );
}

function SortableTh({
  children,
  align,
  active,
  criterion,
  onSort,
  title,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  active: boolean;
  criterion: RadarRankingCriterion;
  onSort: (c: RadarRankingCriterion) => void;
  title?: string;
}) {
  const isRight = align === "right";
  return (
    <th
      aria-sort={active ? "descending" : "none"}
      style={{
        padding: 0,
        textAlign: align ?? "left",
        backgroundColor: COLORS.background,
        borderBottom: `1px solid ${COLORS.border}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
      }}
    >
      <button
        type="button"
        onClick={() => onSort(criterion)}
        title={title ?? RADAR_RANKING_LABELS[criterion]}
        style={{
          width: "100%",
          padding: "8px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: isRight ? "flex-end" : "flex-start",
          gap: 4,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: active ? COLORS.text : COLORS.textSoft,
          whiteSpace: "nowrap",
        }}
      >
        <span>{children}</span>
        <span
          aria-hidden
          style={{
            fontSize: 9,
            color: active ? COLORS.brand : "transparent",
            lineHeight: 1,
          }}
        >
          ▼
        </span>
      </button>
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
        padding: "7px 10px",
        verticalAlign: "middle",
        textAlign: align ?? "left",
        borderTop: `1px solid ${COLORS.border}`,
        overflow: "hidden",
      }}
    >
      {children}
    </td>
  );
}

function NumTd({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <td
      style={{
        padding: "7px 10px",
        verticalAlign: "middle",
        textAlign: "right",
        borderTop: `1px solid ${COLORS.border}`,
        fontVariantNumeric: "tabular-nums",
        color: highlight ? COLORS.text : undefined,
        fontWeight: highlight ? 700 : undefined,
      }}
    >
      {children}
    </td>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: active ? 700 : 600,
    color: active ? COLORS.surface : COLORS.textSoft,
    backgroundColor: active ? COLORS.brand : COLORS.surface,
    border: `1px solid ${active ? COLORS.brand : COLORS.border}`,
    cursor: "pointer",
    fontFamily: "inherit",
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

function ghostButtonStyle(): React.CSSProperties {
  return {
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: COLORS.textSoft,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
