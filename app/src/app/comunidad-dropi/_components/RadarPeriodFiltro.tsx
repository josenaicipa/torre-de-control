// Filtro único del Radar: "Ver por" (Semana / Mes) + selector de período +
// Aplicar. Vive arriba y controla toda la sección Radar (KPIs, cohortes y la
// comparación de la sección de Rendimiento). Antes este mismo control vivía
// duplicado dentro de "Rendimiento de la comunidad"; ahora es el único.
//
// La comparación sigue siendo automática contra el período anterior: no hay
// selector de comparación. Si se pide Semana pero no hay semanas cargadas, el
// loader cae a mensual y la sección lo avisa honestamente.
//
// El markup real vive en PeriodGranularityFiltro (compartido con Inteligencia);
// aquí solo adaptamos un `Comparativo` a la lista `{ key, label }` que espera.

import type { Comparativo, PeriodRef } from "../_lib/crecimiento-data";
import { formatWeekRange } from "../_lib/radar-cache";
import { PeriodGranularityFiltro } from "./PeriodGranularityFiltro";

function periodoTitulo(p: PeriodRef): string {
  return p.granularity === "weekly"
    ? formatWeekRange(p.start, p.end)
    : p.label;
}

export function RadarPeriodFiltro({
  comparativo,
  formAction,
}: {
  comparativo: Comparativo;
  formAction: string;
}) {
  return (
    <PeriodGranularityFiltro
      granularity={comparativo.granularity}
      weeklyAvailable={comparativo.weeklyAvailable}
      options={comparativo.available.map((p) => ({
        key: p.key,
        label: periodoTitulo(p),
      }))}
      currentKey={comparativo.current.key}
      formAction={formAction}
    />
  );
}
