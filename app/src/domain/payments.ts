/**
 * Pure domain functions for payment schedules and balances.
 * Decimal amounts as `number` (rounded to cents).
 */

export type Frequency = "monthly" | "biweekly";

export interface ScheduleInput {
  totalAmount: number;
  installments: number;
  firstDueDate: Date;
  frequency: Frequency;
}

export interface ScheduleItem {
  installmentNumber: number;
  amountDue: number;
  dueDate: Date;
}

type ScheduleStatusName =
  | "PENDING"
  | "PAID"
  | "PARTIAL"
  | "OVERDUE"
  | "WAIVED";

interface ScheduleLike {
  amountDue: number;
  amountPaid: number;
  dueDate?: Date;
  status?: ScheduleStatusName;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeSchedule(input: ScheduleInput): ScheduleItem[] {
  const { totalAmount, installments, firstDueDate, frequency } = input;
  if (!Number.isInteger(installments) || installments < 1) {
    throw new Error("installments must be a positive integer");
  }
  if (totalAmount <= 0) {
    throw new Error("totalAmount must be positive");
  }

  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / installments);
  const remainderCents = totalCents - baseCents * installments;

  const items: ScheduleItem[] = [];
  for (let i = 0; i < installments; i++) {
    const dueDate = new Date(firstDueDate.getTime());
    if (frequency === "monthly") {
      dueDate.setUTCMonth(dueDate.getUTCMonth() + i);
    } else {
      dueDate.setUTCDate(dueDate.getUTCDate() + i * 14);
    }
    const cents = i === installments - 1 ? baseCents + remainderCents : baseCents;
    items.push({
      installmentNumber: i + 1,
      amountDue: cents / 100,
      dueDate,
    });
  }
  return items;
}

export function balanceForStudent(schedules: ScheduleLike[]): number {
  let total = 0;
  for (const s of schedules) {
    total += Math.max(0, round2(s.amountDue - s.amountPaid));
  }
  return round2(total);
}

export function isOverdue(
  schedule: ScheduleLike & { dueDate: Date; status: ScheduleStatusName },
  today: Date,
): boolean {
  if (schedule.status === "PAID" || schedule.status === "WAIVED") return false;
  if (today < schedule.dueDate) return false;
  return schedule.amountPaid < schedule.amountDue;
}

export function deriveScheduleStatus(
  schedule: { amountDue: number; amountPaid: number; dueDate: Date },
  today: Date,
): ScheduleStatusName {
  const fullyPaid = schedule.amountPaid >= schedule.amountDue;
  if (fullyPaid) return "PAID";
  const overdue = today >= schedule.dueDate;
  if (schedule.amountPaid > 0) {
    return overdue ? "OVERDUE" : "PARTIAL";
  }
  return overdue ? "OVERDUE" : "PENDING";
}
