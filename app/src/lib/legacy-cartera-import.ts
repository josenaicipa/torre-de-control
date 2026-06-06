/**
 * Escritura transaccional del Cuadro de Pagos histórico.
 *
 * Comparte el parseo del CSV con la ruta de preview para que la vista previa y
 * la confirmación nunca diverjan. La función `importCarteraRows` es idempotente
 * por email del estudiante principal: re-correr el mismo CSV no duplica
 * estudiantes (los ya existentes se omiten sin tocar sus datos vivos).
 */
import { parse } from "csv-parse/sync";
import type { Prisma, ScheduleStatus, StudentStatus } from "@prisma/client";
import { calculateEndDate } from "../domain/students";
import { parseRowFromArray, type ParsedRow } from "./legacy-cartera-parser";

type Tx = Prisma.TransactionClient;

export interface CloserCandidate {
  id: string;
  name: string | null;
  email: string;
}

export interface CarteraParseResult {
  parsedRows: ParsedRow[];
  errors: Array<{ row: number; error: string }>;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface CarteraRevertResult {
  batchId: string;
  filename: string;
  studentsDeleted: number;
  membersDeleted: number;
  schedulesDeleted: number;
  paymentsDeleted: number;
  attributionsDeleted: number;
}

export class ImportBatchNotFoundError extends Error {
  constructor(batchId: string) {
    super(`Lote de importación no encontrado: ${batchId}`);
    this.name = "ImportBatchNotFoundError";
  }
}

export class ImportBatchSourceError extends Error {
  constructor(source: string) {
    super(`El lote no es de cartera_legacy (source=${source}); no se puede revertir`);
    this.name = "ImportBatchSourceError";
  }
}

export interface CarteraImportResult {
  studentsCreated: number;
  studentsSkippedExisting: number;
  membersCreated: number;
  schedulesCreated: number;
  paymentsCreated: number;
  attributionsCreated: number;
  unmatchedCloserRows: number;
  skipped: SkippedRow[];
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

/**
 * Heurística de match closer→usuario, idéntica a la usada en el preview.
 * Compara contra el primer nombre y el prefijo del email del usuario.
 */
export function closerMatchesUser(rawCloser: string, user: CloserCandidate): boolean {
  const closer = normalizeName(rawCloser);
  if (!closer) return false;
  const firstName = normalizeName(user.name?.split(/\s+/)[0] ?? "");
  const emailPrefix = normalizeName(user.email.split("@")[0] ?? "");
  return (
    closer === firstName ||
    closer === emailPrefix ||
    (closer.length >= 3 &&
      firstName.length >= 3 &&
      (closer.startsWith(firstName) || firstName.startsWith(closer)))
  );
}

export function resolveCloserUserId(
  rawCloser: string | null | undefined,
  users: CloserCandidate[],
): string | null {
  if (!rawCloser) return null;
  const match = users.find((user) => closerMatchesUser(rawCloser, user));
  return match?.id ?? null;
}

/**
 * Parseo del CSV legacy "Cuadro de Pagos NUEVOS INGRESOS". Devuelve filas
 * parseadas y errores por fila. El header repite columnas, por eso se parsea
 * como arrays y se usan índices fijos en el parser.
 */
export function parseCarteraCsv(csvText: string): CarteraParseResult {
  const rows = parse(csvText, {
    bom: true,
    from_line: 5,
    relax_column_count: true,
    skip_empty_lines: true,
  }) as string[][];

  const parsedRows: ParsedRow[] = [];
  const errors: Array<{ row: number; error: string }> = [];
  rows.forEach((row, index) => {
    if (!row[0]?.trim()) return;
    const legacyRowId = index + 5;
    try {
      parsedRows.push(parseRowFromArray(row, legacyRowId));
    } catch (err) {
      errors.push({
        row: legacyRowId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return { parsedRows, errors };
}

/**
 * Estado de una cuota a partir de su monto/recibido. Puro para testear.
 */
export function scheduleStatusFor(
  installment: ParsedRow["installments"][number],
  dueDate: Date,
  today: Date,
): ScheduleStatus {
  if (installment.amountPaid > 0 && installment.amountPaid >= installment.amountDue) {
    return "PAID";
  }
  if (installment.amountPaid > 0) return "PARTIAL";
  if (installment.amountDue > 0 && dueDate < today) return "OVERDUE";
  return "PENDING";
}

/**
 * Construye la lista de miembros (StudentMember) deduplicando por email dentro
 * de la fila. El estudiante principal queda como contacto primario.
 */
function buildMembers(row: ParsedRow): Array<{
  fullName: string;
  email: string | null;
  phone: string | null;
  isPrimaryContact: boolean;
}> {
  const seenEmails = new Set<string>();
  const members: Array<{
    fullName: string;
    email: string | null;
    phone: string | null;
    isPrimaryContact: boolean;
  }> = [];

  const all = [
    { ...row.head, isPrimaryContact: true },
    ...row.members.map((member) => ({ ...member, isPrimaryContact: false })),
  ];
  for (const person of all) {
    const key = person.email?.toLowerCase();
    if (key) {
      if (seenEmails.has(key)) continue;
      seenEmails.add(key);
    }
    members.push({
      fullName: person.fullName,
      email: person.email,
      phone: person.phone,
      isPrimaryContact: person.isPrimaryContact,
    });
  }
  return members;
}

/**
 * Persiste las filas previewadas dentro de la transacción `tx`. Idempotente por
 * email del estudiante principal. No sobre-escribe estudiantes existentes.
 */
export async function importCarteraRows(
  tx: Tx,
  opts: {
    parsedRows: ParsedRow[];
    importBatchId: string;
    actorUserId: string;
    today?: Date;
  },
): Promise<CarteraImportResult> {
  const today = opts.today ?? new Date();

  const closerUsers = await tx.user.findMany({
    where: { active: true, OR: [{ position: "CLOSER" }, { position: "ADMIN" }] },
    select: { id: true, name: true, email: true },
  });

  const result: CarteraImportResult = {
    studentsCreated: 0,
    studentsSkippedExisting: 0,
    membersCreated: 0,
    schedulesCreated: 0,
    paymentsCreated: 0,
    attributionsCreated: 0,
    unmatchedCloserRows: 0,
    skipped: [],
  };

  for (const row of opts.parsedRows) {
    const email = row.head.email;
    if (!email) {
      result.skipped.push({
        row: row.legacyRowId,
        reason: "Sin correo del estudiante principal",
      });
      continue;
    }

    const startDate = row.startDate ?? row.closedAt;
    if (!startDate) {
      result.skipped.push({
        row: row.legacyRowId,
        reason: "Sin fecha de inicio ni de primer pago",
      });
      continue;
    }

    const existing = await tx.student.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      result.studentsSkippedExisting += 1;
      continue;
    }

    const durationMonths = row.durationMonths ?? 12;
    const endDate = row.endDate ?? calculateEndDate(startDate, durationMonths);
    const closerUserId = resolveCloserUserId(row.closerNameRaw, closerUsers);
    if (row.closerNameRaw && !closerUserId) result.unmatchedCloserRows += 1;

    const members = buildMembers(row);

    const student = await tx.student.create({
      data: {
        fullName: row.head.fullName,
        email,
        phone: row.head.phone,
        startDate,
        durationMonths,
        endDate,
        status: row.status as StudentStatus,
        durationAssumed: row.durationAssumed,
        closedAt: row.closedAt,
        legacyRowId: row.legacyRowId,
        closerUserId,
        notes: row.notes,
        importBatchId: opts.importBatchId,
        members: {
          create: members.map((member) => ({
            fullName: member.fullName,
            email: member.email,
            phone: member.phone,
            isPrimaryContact: member.isPrimaryContact,
          })),
        },
      },
      select: { id: true },
    });
    result.studentsCreated += 1;
    result.membersCreated += members.length;

    for (const installment of row.installments) {
      const dueDate = installment.dueDate ?? endDate ?? startDate;
      const status = scheduleStatusFor(installment, dueDate, today);
      const schedule = await tx.paymentSchedule.create({
        data: {
          studentId: student.id,
          installmentNumber: installment.installmentNumber,
          amountDue: installment.amountDue,
          dueDate,
          status,
          amountPaid: installment.amountPaid,
          paidAt: installment.paidAt,
        },
        select: { id: true },
      });
      result.schedulesCreated += 1;

      if (installment.amountPaid > 0) {
        await tx.payment.create({
          data: {
            studentId: student.id,
            scheduleId: schedule.id,
            amount: installment.amountPaid,
            paidAt: installment.paidAt ?? dueDate,
            method: installment.method,
            recordedById: opts.actorUserId,
          },
        });
        result.paymentsCreated += 1;
      }
    }

    if (row.closerNameRaw) {
      await tx.saleAttribution.create({
        data: {
          studentId: student.id,
          collaboratorName: row.closerNameRaw,
          role: "CLOSER",
        },
      });
      result.attributionsCreated += 1;
    }
  }

  return result;
}

/**
 * Revierte de forma segura un lote de importación `cartera_legacy`: borra SOLO
 * los estudiantes creados por ese lote (Student.importBatchId === batchId) y su
 * data asociada, sin tocar estudiantes preexistentes que la importación omitió
 * por idempotencia.
 *
 * Aunque el schema define cascadas a nivel de FK (StudentMember, SaleAttribution,
 * PaymentSchedule, Payment, ReminderLog, etc. se borran solos al borrar Student),
 * acá borramos los hijos explícitamente en orden FK-seguro para poder devolver
 * conteos exactos y dejar el borrado determinístico. Debe ejecutarse dentro de
 * una transacción. Lanza ImportBatchNotFoundError / ImportBatchSourceError si el
 * lote no existe o no es cartera_legacy.
 */
export async function revertCarteraBatch(
  tx: Tx,
  batchId: string,
): Promise<CarteraRevertResult> {
  const batch = await tx.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, source: true, filename: true },
  });
  if (!batch) {
    throw new ImportBatchNotFoundError(batchId);
  }
  if (batch.source !== "cartera_legacy") {
    throw new ImportBatchSourceError(batch.source);
  }

  const students = await tx.student.findMany({
    where: { importBatchId: batchId },
    select: { id: true },
  });
  const studentIds = students.map((student) => student.id);

  let membersDeleted = 0;
  let schedulesDeleted = 0;
  let paymentsDeleted = 0;
  let attributionsDeleted = 0;

  if (studentIds.length > 0) {
    const studentFilter = { studentId: { in: studentIds } };
    // Order matters: payments reference schedules (SetNull) so remove them first;
    // ReminderLog hangs off PaymentSchedule via DB cascade.
    paymentsDeleted = (await tx.payment.deleteMany({ where: studentFilter })).count;
    schedulesDeleted = (await tx.paymentSchedule.deleteMany({ where: studentFilter })).count;
    attributionsDeleted = (await tx.saleAttribution.deleteMany({ where: studentFilter })).count;
    membersDeleted = (await tx.studentMember.deleteMany({ where: studentFilter })).count;
  }

  const studentsDeleted = (
    await tx.student.deleteMany({ where: { importBatchId: batchId } })
  ).count;

  // Borramos el lote recién después de borrar la data. La trazabilidad de la
  // reversión queda en el AuditEvent que escribe la ruta API.
  await tx.importBatch.delete({ where: { id: batchId } });

  return {
    batchId,
    filename: batch.filename,
    studentsDeleted,
    membersDeleted,
    schedulesDeleted,
    paymentsDeleted,
    attributionsDeleted,
  };
}
