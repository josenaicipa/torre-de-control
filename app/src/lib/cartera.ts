// Helpers puros para el dashboard de Cartera (Operaciones). Operan sobre cuotas
// (PaymentSchedule) ya convertidas a `number` en USD para poder testearlos sin
// Prisma ni DOM. La comparación de fechas es a nivel de día UTC porque dueDate
// se almacena como `@db.Date`.

export type CarteraScheduleStatus =
  | "PENDING"
  | "PAID"
  | "PARTIAL"
  | "OVERDUE"
  | "WAIVED";

// Cubeta de prioridad de una cuota pendiente.
export type CarteraBucket = "vencida" | "proxima" | "pendiente";

export interface CarteraInstallment {
  studentId: string;
  amountDue: number;
  amountPaid: number;
  dueDate: Date;
  status: CarteraScheduleStatus;
}

export interface CarteraKpis {
  totalPendingUsd: number;
  totalOverdueUsd: number;
  overdueCount: number;
  dueSoonCount: number;
  dueSoonUsd: number;
  studentsInArrears: number;
}

// Ventana en días para considerar una cuota "próxima a vencer".
export const DUE_SOON_DAYS = 7;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function startOfUtcDay(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

// Monto pendiente de una cuota: nunca negativo.
export function installmentPending(item: {
  amountDue: number;
  amountPaid: number;
}): number {
  return round2(Math.max(0, item.amountDue - item.amountPaid));
}

// Una cuota cuenta para cartera si no está saldada/condonada y aún debe algo.
export function isOutstanding(item: CarteraInstallment): boolean {
  if (item.status === "PAID" || item.status === "WAIVED") return false;
  return installmentPending(item) > 0;
}

// Días entre hoy y la fecha de vencimiento (a nivel de día UTC).
// Positivo => faltan días; 0 => vence hoy; negativo => días de atraso.
export function daysUntilDue(dueDate: Date, today: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((startOfUtcDay(dueDate) - startOfUtcDay(today)) / MS_PER_DAY);
}

// Vencida = pendiente y su vencimiento ya pasó (dueDate < hoy).
export function isInstallmentOverdue(
  item: CarteraInstallment,
  today: Date,
): boolean {
  if (!isOutstanding(item)) return false;
  return daysUntilDue(item.dueDate, today) < 0;
}

// Clasifica una cuota pendiente en su cubeta de prioridad. Devuelve null si la
// cuota ya está saldada o condonada (no entra en cartera).
export function classifyInstallment(
  item: CarteraInstallment,
  today: Date,
): CarteraBucket | null {
  if (!isOutstanding(item)) return null;
  const days = daysUntilDue(item.dueDate, today);
  if (days < 0) return "vencida";
  if (days <= DUE_SOON_DAYS) return "proxima";
  return "pendiente";
}

// Orden de prioridad para listar: vencidas primero (las más atrasadas arriba),
// luego próximas y por último el resto, siempre por fecha de vencimiento.
const BUCKET_ORDER: Record<CarteraBucket, number> = {
  vencida: 0,
  proxima: 1,
  pendiente: 2,
};

// Compara dos filas por su cubeta ya clasificada (evita reclasificar cuando el
// llamador ya conoce el bucket real). Cubeta null va al final.
export function compareCarteraBucket(
  a: { bucket: CarteraBucket | null; dueDate: Date },
  b: { bucket: CarteraBucket | null; dueDate: Date },
): number {
  const orderA = a.bucket ? BUCKET_ORDER[a.bucket] : 99;
  const orderB = b.bucket ? BUCKET_ORDER[b.bucket] : 99;
  if (orderA !== orderB) return orderA - orderB;
  return startOfUtcDay(a.dueDate) - startOfUtcDay(b.dueDate);
}

export function compareCarteraPriority<T extends CarteraInstallment>(
  a: T,
  b: T,
  today: Date,
): number {
  return compareCarteraBucket(
    { bucket: classifyInstallment(a, today), dueDate: a.dueDate },
    { bucket: classifyInstallment(b, today), dueDate: b.dueDate },
  );
}

export function summarizeCartera(
  items: CarteraInstallment[],
  today: Date,
): CarteraKpis {
  let totalPendingUsd = 0;
  let totalOverdueUsd = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;
  let dueSoonUsd = 0;
  const studentsInArrears = new Set<string>();

  for (const item of items) {
    if (!isOutstanding(item)) continue;
    const pending = installmentPending(item);
    totalPendingUsd += pending;

    const days = daysUntilDue(item.dueDate, today);
    if (days < 0) {
      totalOverdueUsd += pending;
      overdueCount += 1;
      studentsInArrears.add(item.studentId);
    } else if (days <= DUE_SOON_DAYS) {
      dueSoonCount += 1;
      dueSoonUsd += pending;
    }
  }

  return {
    totalPendingUsd: round2(totalPendingUsd),
    totalOverdueUsd: round2(totalOverdueUsd),
    overdueCount,
    dueSoonCount,
    dueSoonUsd: round2(dueSoonUsd),
    studentsInArrears: studentsInArrears.size,
  };
}
