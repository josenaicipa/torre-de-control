-- Dashboard data tables migrated from Supabase to RDS.
--
-- App Runner egress is VPC-bound for RDS and cannot reach public Supabase, so the
-- server-side dashboard (/api/dashboard/{select,mutate,import}) now reads/writes
-- these tables on RDS instead. Names and snake_case columns match the browser's
-- existing payloads exactly. Primary keys double as the upsert conflict targets
-- the dashboard relies on:
--   kpi_data       -> (year, month)
--   daily_entries  -> (date, member)
--   daily_closer   -> (date)
--   ads_entries    -> surrogate id, indexed by (year, month) and (fecha)

-- CreateTable
CREATE TABLE "kpi_data" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2),
    "ad_spend" DECIMAL(18,2),
    "leads" INTEGER,
    "agendas" INTEGER,
    "shows" INTEGER,
    "cierres" INTEGER,
    "meta_revenue" DECIMAL(18,2),
    "day" INTEGER,
    "pct_leads_agendadas" DECIMAL(8,2),
    "pct_agendadas_asistidas" DECIMAL(8,2),
    "close_rate_meta" DECIMAL(8,2),
    "inversion_planeada" DECIMAL(18,2),
    "roas_objetivo" DECIMAL(8,2),

    CONSTRAINT "kpi_data_pkey" PRIMARY KEY ("year","month")
);

-- CreateTable
CREATE TABLE "daily_entries" (
    "date" DATE NOT NULL,
    "member" TEXT NOT NULL,
    "ig_followers" INTEGER,
    "posts" INTEGER,
    "mensajes" INTEGER,
    "follow_ups" INTEGER,
    "bk_offers" INTEGER,
    "gasto_meta" DECIMAL(18,2),
    "gasto_google" DECIMAL(18,2),
    "gasto_tiktok" DECIMAL(18,2),
    "gasto_otros" DECIMAL(18,2),
    "new_bk_organic" INTEGER,
    "qual_bk_organic" INTEGER,
    "today_bk_organic" INTEGER,
    "show_organic" INTEGER,
    "sales_organic" INTEGER,
    "revenue_organic" DECIMAL(18,2),
    "cash_organic" DECIMAL(18,2),
    "recurring_organic" DECIMAL(18,2),
    "pitches_organic" INTEGER,
    "pitches_paid" INTEGER,
    "reservas_organic" INTEGER,

    CONSTRAINT "daily_entries_pkey" PRIMARY KEY ("date","member")
);

-- CreateTable
CREATE TABLE "ads_entries" (
    "id" SERIAL NOT NULL,
    "year" INTEGER,
    "month" INTEGER,
    "fecha" DATE,
    "canal" TEXT,
    "gasto" DECIMAL(18,2),
    "impresiones" INTEGER,
    "clicks" INTEGER,
    "revenue" DECIMAL(18,2),

    CONSTRAINT "ads_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_closer" (
    "date" DATE NOT NULL,
    "q_ventas_ht" INTEGER,
    "valor_venta_ht" DECIMAL(18,2),
    "upfront_cash_ht" DECIMAL(18,2),
    "ventas_cash" DECIMAL(18,2),
    "recurring_cash" DECIMAL(18,2),
    "q_ventas_lt" INTEGER,
    "valor_venta_lt" DECIMAL(18,2),
    "total_clientes_activos" INTEGER,
    "q_reservas" INTEGER,
    "cash_reservas" DECIMAL(18,2),
    "q_reembolsos" INTEGER,
    "valor_reembolsos" DECIMAL(18,2),
    "agendas_organicas" INTEGER,
    "agendas_meta" INTEGER,
    "agendas_google" INTEGER,
    "agendas_tiktok" INTEGER,
    "agendas_otros" INTEGER,
    "cal_organicas" INTEGER,
    "cal_meta" INTEGER,
    "cal_google" INTEGER,
    "cal_tiktok" INTEGER,
    "cal_otros" INTEGER,
    "hoy_organicas" INTEGER,
    "hoy_meta" INTEGER,
    "hoy_google" INTEGER,
    "hoy_tiktok" INTEGER,
    "hoy_otros" INTEGER,
    "show_organicas" INTEGER,
    "show_meta" INTEGER,
    "show_google" INTEGER,
    "show_tiktok" INTEGER,
    "show_otros" INTEGER,
    "agendas_calificadas" INTEGER,
    "agendas_final" INTEGER,
    "citas_asistidas" INTEGER,

    CONSTRAINT "daily_closer_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "ads_entries_year_month_idx" ON "ads_entries"("year", "month");

-- CreateIndex
CREATE INDEX "ads_entries_fecha_idx" ON "ads_entries"("fecha");
