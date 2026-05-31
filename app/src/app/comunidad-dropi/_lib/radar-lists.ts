// Comparadores y selectores puros que el Radar usa para ordenar las listas
// "Dar amor", "Ayudar", "Estrellas" y "Riesgo por devoluciones". Viven fuera
// de `radar/page.tsx` para que los tests puedan ejercitarlos sin React ni
// Prisma.
//
// Regla de oro: la pérdida absoluta de entregadas manda sobre el porcentaje.
// El porcentaje es desempate. Esto evita que un −90% sobre 5 entregadas
// pisotee una caída real de 200 entregadas.

import type { RadarMember, RadarSegment } from "@/lib/comunidad-dropi-radar";

// "Dar amor" muestra GROWING + RECOVERED + NEW: gente que merece
// reconocimiento explícito esta ventana.
export const LOVE_SEGMENTS: ReadonlySet<RadarSegment> = new Set<RadarSegment>([
  "GROWING",
  "RECOVERED",
  "NEW",
]);

// "Ayudar" muestra DROPPING + INACTIVE: gente que se está apagando y necesita
// intervención. INACTIVE entra para no ocultar a quien dejó de mover este
// mes.
export const HELP_SEGMENTS: ReadonlySet<RadarSegment> = new Set<RadarSegment>([
  "DROPPING",
  "INACTIVE",
]);

// Para "Dar amor" usamos el delta absoluto de entregadas: +200 importa más
// que +90%. Cuando no hay mes previo (RECOVERED, NEW), tratamos el delta
// como "entregadas actuales" porque toda la actividad es ganancia nueva.
export function compareForLove(a: RadarMember, b: RadarMember): number {
  const aDelta = a.deliveredDelta ?? a.current.ordersDelivered;
  const bDelta = b.deliveredDelta ?? b.current.ordersDelivered;
  if (bDelta !== aDelta) return bDelta - aDelta;
  const aPct = a.deliveredDeltaPct ?? Number.NEGATIVE_INFINITY;
  const bPct = b.deliveredDeltaPct ?? Number.NEGATIVE_INFINITY;
  return bPct - aPct;
}

// Para "Ayudar" priorizamos la pérdida absoluta de entregadas (delta
// negativo más grande primero). INACTIVE entra con delta = -previous para
// que la pérdida quede expresada igual que en DROPPING (un INACTIVE que
// venía de 150 entregadas pesa más que un DROPPING de -50). Si no hay mes
// previo, caemos a -current para no romper el orden. Porcentaje desempata.
export function compareForHelp(a: RadarMember, b: RadarMember): number {
  const aDelta =
    a.deliveredDelta ?? -(a.previous?.ordersDelivered ?? a.current.ordersDelivered);
  const bDelta =
    b.deliveredDelta ?? -(b.previous?.ordersDelivered ?? b.current.ordersDelivered);
  if (aDelta !== bDelta) return aDelta - bDelta;
  const aPct = a.deliveredDeltaPct ?? Number.POSITIVE_INFINITY;
  const bPct = b.deliveredDeltaPct ?? Number.POSITIVE_INFINITY;
  return aPct - bPct;
}

export function pickLove(
  members: readonly RadarMember[],
  limit: number,
): RadarMember[] {
  return [...members]
    .filter((m) => LOVE_SEGMENTS.has(m.segment))
    .sort(compareForLove)
    .slice(0, limit);
}

export function pickHelp(
  members: readonly RadarMember[],
  limit: number,
): RadarMember[] {
  return [...members]
    .filter((m) => HELP_SEGMENTS.has(m.segment))
    .sort(compareForHelp)
    .slice(0, limit);
}
