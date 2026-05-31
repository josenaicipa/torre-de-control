# Comunidad Dropi · Inteligencia de datos — plan implementado

Fecha: 2026-05-31

## Alcance entregado

Se incorpora una capa de "Inteligencia de Datos" sobre los modelos reales del
schema (`DropiCommunityMember`, `DropiWeeklyMetric`, `DropiMonthlyMetric`) sin
crear nuevas tablas. Reutiliza la segmentación existente y deja la presentación
en español, mobile-first y consistente con el resto del módulo
`/comunidad-dropi`.

## Componentes

### Helpers puros (`app/src/lib/comunidad-dropi-analytics.ts`)

- `safePercent` / `safeDelta` para aritmética segura sobre tasas y deltas.
- `sumTotals`, `weightedRates`, `ratesFromTotals` para agregaciones ponderadas.
- `buildOverview` — KPIs globales con comparativa vs. período anterior.
- `buildWeeklyTrend` / `buildMonthlyTrend` — buckets ordenados con delta de
  pedidos ingresados período a período.
- `buildByCountry` / `buildBySegment` — distribución de miembros y
  participación porcentual.
- `scoreOpportunity` + `rankOpportunities` — ranking automático de los
  miembros con mayor impacto potencial (mejor vendedor, caída fuerte,
  devoluciones altas, etc.) con `reason` legible en español.
- `buildMemberDiagnostic` — diagnóstico textual de un miembro con resumen,
  highlights, warnings y sugerencias.

Todos los helpers son Prisma-free; el caller normaliza Decimals a `Number`
antes de llamarlos.

### Endpoints

Todos requieren actor operador/admin y devuelven `{ ok, data }`:

- `GET /api/comunidad-dropi/analytics/overview` — KPIs y deltas (vs. semana
  anterior).
- `GET /api/comunidad-dropi/analytics/trend?granularity=weekly|monthly&limit=N` —
  serie temporal.
- `GET /api/comunidad-dropi/analytics/by-country` — distribución por país.
- `GET /api/comunidad-dropi/analytics/by-segment` — distribución por segmento.
- `GET /api/comunidad-dropi/analytics/opportunities?limit=N` — top de
  miembros a contactar.
- `GET /api/comunidad-dropi/members/[id]/diagnostic` — diagnóstico
  inteligente por miembro.

### UI

- `/comunidad-dropi/inteligencia` (server component) carga datos vía Prisma y
  los procesa con los helpers anteriores. Renderiza:
  - 8 KPIs (pedidos por etapa, tasas y miembros activos) con flecha de delta y
    coloreado (rojo para devoluciones que suben, verde para entregas que
    suben).
  - Tendencia semanal (8) y mensual (6) como tablas con `role="grid"` y
    columnas alineadas.
  - Distribución por país y por segmento.
  - Tabla de "Oportunidades prioritarias" con link a la ficha del miembro,
    badge de segmento/prioridad y motivo en español.
  - Estado vacío con CTA a Importaciones cuando no hay miembros.
- `/comunidad-dropi/miembros/[id]` ahora incluye una sección
  "Diagnóstico inteligente" con resumen, métricas, highlights, alertas y
  sugerencias generadas por `buildMemberDiagnostic`.
- Subnav actualizada para exponer la nueva entrada **Inteligencia**.

## Tests

- `app/src/lib/comunidad-dropi-analytics.test.ts` cubre:
  - `safePercent` (cap, no finitos, negativos).
  - `safeDelta` (null/0/0, positivos, negativos).
  - `sumTotals` + `weightedRates` + `ratesFromTotals`.
  - `buildOverview` (conteos, deltas, sin previo).
  - `buildWeeklyTrend` y `buildMonthlyTrend`.
  - `buildByCountry` y `buildBySegment` con etiquetas en español.
  - `scoreOpportunity` y `rankOpportunities` (orden y penalización inactivo).
  - `buildMemberDiagnostic` (sin datos, caída fuerte, devoluciones altas, top
    performer creciendo).

## Notas

- Sin nueva autenticación: se reutiliza `requireOperatorOrAdmin`.
- Sin migraciones de schema.
- Los decimales (`movementRate`, `deltaOrdersPercent`, etc.) se convierten a
  `Number` antes de pasar a los helpers.
- Mobile-first: grids con `auto-fit` y `minmax`, tablas con `overflowX: auto`.
- Copy en español. Códigos internos (`P1..P4`, `DROPPING`, ...) se mantienen
  en inglés porque ya viven en el motor de segmentación y se mapean en la
  capa de tokens.
