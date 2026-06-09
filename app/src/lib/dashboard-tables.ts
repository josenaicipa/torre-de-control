// Strict whitelist of the dashboard tables the browser may touch through the
// authenticated API, the columns each one accepts on write, and how each table
// is scoped. Anything not listed here is rejected. This is the single source of
// truth for "what the dashboard is allowed to do".

export type TableScope = "aggregate" | "member";

export interface TableConfig {
  /** Writable columns. Payloads are stripped to exactly these keys. */
  readonly columns: readonly string[];
  /** Conflict target for upsert (PostgREST on_conflict), if any. */
  readonly conflict?: readonly string[];
  /**
   * "aggregate" tables hold company-wide rows with no per-member column, so they
   * are only readable/writable with global (admin / DataScope ALL) access.
   * "member" tables carry a `member` column that can be safely row-filtered.
   */
  readonly scope: TableScope;
}

export const DASHBOARD_TABLES = {
  kpi_data: {
    scope: "aggregate",
    conflict: ["year", "month"],
    columns: [
      "year",
      "month",
      "revenue",
      "ad_spend",
      "leads",
      "agendas",
      "shows",
      "cierres",
      "meta_revenue",
      "day",
      "pct_leads_agendadas",
      "pct_agendadas_asistidas",
      "close_rate_meta",
      "inversion_planeada",
      "roas_objetivo",
    ],
  },
  daily_entries: {
    scope: "member",
    conflict: ["date", "member"],
    columns: [
      "date",
      "member",
      "ig_followers",
      "posts",
      "mensajes",
      "follow_ups",
      "bk_offers",
      "setter_new_conversations",
      "setter_new_inbound",
      "setter_new_outbound",
      "setter_outbound_replies",
      "setter_calls_proposed",
      "setter_links_sent",
      "gasto_meta",
      "gasto_google",
      "gasto_tiktok",
      "gasto_otros",
      "new_bk_organic",
      "qual_bk_organic",
      "today_bk_organic",
      "show_organic",
      "sales_organic",
      "revenue_organic",
      "cash_organic",
      "recurring_organic",
      "pitches_organic",
      "pitches_paid",
      "reservas_organic",
      "showup_notes",
      "hot_leads_evidence",
      "blockers",
      "setter_findings",
    ],
  },
  ads_entries: {
    scope: "aggregate",
    columns: ["year", "month", "fecha", "canal", "gasto", "impresiones", "clicks", "revenue"],
  },
  daily_closer: {
    scope: "aggregate",
    conflict: ["date"],
    columns: [
      "date",
      "q_ventas_ht",
      "valor_venta_ht",
      "upfront_cash_ht",
      "ventas_cash",
      "recurring_cash",
      "q_ventas_lt",
      "valor_venta_lt",
      "total_clientes_activos",
      "q_reservas",
      "cash_reservas",
      "q_reembolsos",
      "valor_reembolsos",
      "agendas_organicas",
      "agendas_meta",
      "agendas_google",
      "agendas_tiktok",
      "agendas_otros",
      "cal_organicas",
      "cal_meta",
      "cal_google",
      "cal_tiktok",
      "cal_otros",
      "hoy_organicas",
      "hoy_meta",
      "hoy_google",
      "hoy_tiktok",
      "hoy_otros",
      "show_organicas",
      "show_meta",
      "show_google",
      "show_tiktok",
      "show_otros",
      "agendas_calificadas",
      "agendas_final",
      "citas_asistidas",
    ],
  },
} as const satisfies Record<string, TableConfig>;

export type DashboardTable = keyof typeof DASHBOARD_TABLES;

const MANUAL_ONLY_DASHBOARD_TABLES = new Set<DashboardTable>([
  "daily_closer",
  "daily_entries",
]);

export function isDashboardTable(value: unknown): value is DashboardTable {
  return typeof value === "string" && value in DASHBOARD_TABLES;
}

export function tableConfig(table: DashboardTable): TableConfig {
  return DASHBOARD_TABLES[table];
}

export function isManualOnlyDashboardTable(table: DashboardTable): boolean {
  return MANUAL_ONLY_DASHBOARD_TABLES.has(table);
}

export function isExternalImportAllowedTable(table: DashboardTable): boolean {
  return !isManualOnlyDashboardTable(table);
}

/**
 * Strip a payload to exactly the table's writable columns. Unknown keys are
 * dropped (never trusted), and `undefined` values are omitted so partial
 * upserts only touch the fields the client actually sent.
 */
export function sanitizeValues(
  table: DashboardTable,
  input: unknown,
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const allowed = new Set<string>(DASHBOARD_TABLES[table].columns);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (allowed.has(key) && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

export function conflictTarget(table: DashboardTable): string | undefined {
  // Read through tableConfig so the optional `conflict` is visible on the union
  // (some tables, e.g. ads_entries, have no conflict target).
  const conflict = tableConfig(table).conflict;
  return conflict && conflict.length > 0 ? conflict.join(",") : undefined;
}
