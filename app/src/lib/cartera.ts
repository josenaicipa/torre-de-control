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

// Nivel de riesgo de un estudiante, derivado de sus cuotas pendientes.
//   en_mora          => tiene al menos una cuota vencida
//   proximo          => sin vencidas, pero con cuota dentro de los próximos 7 días
//   pendiente_futuro => solo cuotas futuras más allá de 7 días
export type CarteraRiskLevel = "en_mora" | "proximo" | "pendiente_futuro";

// Mapea la cubeta de la cuota más urgente del estudiante a su nivel de riesgo.
const RISK_BY_BUCKET: Record<CarteraBucket, CarteraRiskLevel> = {
  vencida: "en_mora",
  proxima: "proximo",
  pendiente: "pendiente_futuro",
};

export interface StudentCarteraSummary {
  studentId: string;
  totalPendingUsd: number;
  totalOverdueUsd: number;
  overdueCount: number;
  upcomingCount: number;
  futureCount: number;
  outstandingCount: number;
  nextDueDate: Date | null;
  nextDueAmount: number;
  maxDaysOverdue: number;
  riskLevel: CarteraRiskLevel;
}

// Agrupa cuotas pendientes por estudiante y resume su situación de cobro.
// Ignora cuotas saldadas/condonadas. Solo aparecen estudiantes con saldo > 0.
export function summarizeStudents(
  items: CarteraInstallment[],
  today: Date,
): StudentCarteraSummary[] {
  const byStudent = new Map<string, CarteraInstallment[]>();
  for (const item of items) {
    if (!isOutstanding(item)) continue;
    const list = byStudent.get(item.studentId);
    if (list) list.push(item);
    else byStudent.set(item.studentId, [item]);
  }

  const summaries: StudentCarteraSummary[] = [];
  for (const [studentId, list] of byStudent) {
    let totalPendingUsd = 0;
    let totalOverdueUsd = 0;
    let overdueCount = 0;
    let upcomingCount = 0;
    let futureCount = 0;
    let maxDaysOverdue = 0;
    let nextDueDate: Date | null = null;
    let nextDueAmount = 0;

    for (const item of list) {
      const pending = installmentPending(item);
      totalPendingUsd += pending;
      const days = daysUntilDue(item.dueDate, today);
      if (days < 0) {
        totalOverdueUsd += pending;
        overdueCount += 1;
        if (-days > maxDaysOverdue) maxDaysOverdue = -days;
      } else if (days <= DUE_SOON_DAYS) {
        upcomingCount += 1;
      } else {
        futureCount += 1;
      }
      // Próxima cuota = la cuota pendiente con vencimiento más cercano que aún no
      // ha pasado (hoy o futuro). Para estudiantes 100% en mora queda null.
      if (days >= 0) {
        if (nextDueDate === null || startOfUtcDay(item.dueDate) < startOfUtcDay(nextDueDate)) {
          nextDueDate = item.dueDate;
          nextDueAmount = pending;
        }
      }
    }

    const riskLevel: CarteraRiskLevel =
      overdueCount > 0
        ? "en_mora"
        : upcomingCount > 0
          ? "proximo"
          : "pendiente_futuro";

    summaries.push({
      studentId,
      totalPendingUsd: round2(totalPendingUsd),
      totalOverdueUsd: round2(totalOverdueUsd),
      overdueCount,
      upcomingCount,
      futureCount,
      outstandingCount: list.length,
      nextDueDate,
      nextDueAmount: round2(nextDueAmount),
      maxDaysOverdue,
      riskLevel,
    });
  }

  return summaries;
}

// Orden para listar estudiantes: en mora primero (mayor monto vencido, luego
// mayor atraso), después próximos y por último pendientes futuros; dentro de
// cada grupo, por la fecha de la próxima cuota.
const RISK_ORDER: Record<CarteraRiskLevel, number> = {
  en_mora: 0,
  proximo: 1,
  pendiente_futuro: 2,
};

export function compareStudentSummary(
  a: StudentCarteraSummary,
  b: StudentCarteraSummary,
): number {
  const orderA = RISK_ORDER[a.riskLevel];
  const orderB = RISK_ORDER[b.riskLevel];
  if (orderA !== orderB) return orderA - orderB;

  if (a.riskLevel === "en_mora") {
    if (a.totalOverdueUsd !== b.totalOverdueUsd) {
      return b.totalOverdueUsd - a.totalOverdueUsd;
    }
    if (a.maxDaysOverdue !== b.maxDaysOverdue) {
      return b.maxDaysOverdue - a.maxDaysOverdue;
    }
  }

  const dateA = a.nextDueDate ? startOfUtcDay(a.nextDueDate) : Number.POSITIVE_INFINITY;
  const dateB = b.nextDueDate ? startOfUtcDay(b.nextDueDate) : Number.POSITIVE_INFINITY;
  return dateA - dateB;
}

export interface StudentRiskCounts {
  total: number;
  en_mora: number;
  proximo: number;
  pendiente_futuro: number;
}

// Conteo de estudiantes por nivel de riesgo (para KPIs y filtros).
export function countStudentsByRisk(
  summaries: StudentCarteraSummary[],
): StudentRiskCounts {
  const counts: StudentRiskCounts = {
    total: summaries.length,
    en_mora: 0,
    proximo: 0,
    pendiente_futuro: 0,
  };
  for (const s of summaries) counts[s.riskLevel] += 1;
  return counts;
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
