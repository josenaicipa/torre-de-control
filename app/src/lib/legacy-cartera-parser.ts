/**
 * Parser puro del CSV "Cuadro de Pagos NUEVOS INGRESOS" legacy.
 * Produce datos intermedios para preview/importacion, sin acceder a DB.
 */

export interface ParsedStudentMember {
  fullName: string;
  email: string | null;
  phone: string | null;
}

export interface ParsedInstallment {
  installmentNumber: number;
  dueDate: Date | null;
  amountDue: number;
  amountPaid: number;
  paidAt: Date | null;
  method: string | null;
  received: boolean;
}

export interface ParsedRow {
  legacyRowId: number;
  head: ParsedStudentMember;
  members: ParsedStudentMember[];
  closedAt: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  durationMonths: number | null;
  durationAssumed: boolean;
  closerNameRaw: string | null;
  installments: ParsedInstallment[];
  pendingAmount: number;
  notes: string | null;
  status:
    | "ACTIVE"
    | "PAUSED"
    | "COMPLETED"
    | "DROPPED"
    | "EXTENDED"
    | "ACCESS_REVOKED"
    | "SEPARATED"
    | "INACTIVE";
  warnings: string[];
}

function validUtcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseDateFlexible(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;

    let day = first;
    let month = second;
    if (second > 12 && first <= 12) {
      day = second;
      month = first;
    }
    return validUtcDate(year, month, day);
  }

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return validUtcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  return null;
}

export function parseMoney(value: string | null | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s"]/g, "").replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function parseBool(value: string | null | undefined): boolean {
  return String(value ?? "").trim().toUpperCase() === "TRUE";
}

export function parseMonths(value: string | null | undefined): number | null {
  const match = value?.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function splitMulti(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\n|\s+y\s+|\s+-\s+/i)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseStudentNames(
  name: string,
  email: string,
  phone: string,
): { head: ParsedStudentMember; members: ParsedStudentMember[]; warnings: string[] } {
  const warnings: string[] = [];
  const names = splitMulti(name);
  const emails = splitMulti(email);
  const phones = splitMulti(phone);

  if (names.length === 0) {
    warnings.push("Sin nombre");
    return {
      head: {
        fullName: "(sin nombre)",
        email: emails[0]?.toLowerCase() ?? null,
        phone: phones[0] ?? null,
      },
      members: [],
      warnings,
    };
  }

  if (!emails[0]) warnings.push("Estudiante principal sin correo");
  if (emails.length > names.length) warnings.push("Hay correos adicionales sin nombre asociado");

  return {
    head: {
      fullName: names[0],
      email: emails[0]?.toLowerCase() ?? null,
      phone: phones[0] ?? null,
    },
    members: names.slice(1).map((fullName, index) => ({
      fullName,
      email: emails[index + 1]?.toLowerCase() ?? null,
      phone: phones[index + 1] ?? null,
    })),
    warnings,
  };
}

export function parseCloserName(value: string | null | undefined): string | null {
  const first = value?.split(/[\/,]/)[0]?.trim();
  return first || null;
}

function normalizedText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

export function parseStatus(
  notes: string | null,
  observation: string | null,
  pendingAmount: number,
  endDate: Date | null,
  today: Date = new Date(),
): ParsedRow["status"] {
  const combined = normalizedText(`${notes ?? ""} ${observation ?? ""}`);
  if (combined.includes("MENTORIA FRIZZADA") || combined.includes("MENTORIA FRIZADA") || combined.includes("PAUSADA")) {
    return "PAUSED";
  }
  if (
    combined.includes("SIN ACCESOS") ||
    combined.includes("SE LE QUITO ACCESO") ||
    combined.includes("RETIRADO")
  ) {
    return pendingAmount > 0 ? "ACCESS_REVOKED" : "DROPPED";
  }
  if (pendingAmount === 0 && endDate && endDate <= today) return "COMPLETED";
  return "ACTIVE";
}

function warnInvalidDate(warnings: string[], label: string, raw: string | undefined, parsed: Date | null) {
  if (raw?.trim() && !parsed) warnings.push(`Fecha inválida en ${label}: ${raw.trim()}`);
}

/**
 * Columna W ("student_status") del CSV histórico corregido. Solo acepta los tres
 * estados que mapean 1:1 a los colores del Google Sheet original:
 *   blanco/sin color -> ACTIVE, amarillo (#FFF2CC) -> SEPARATED, rojo (#EA9999) -> INACTIVE.
 * Devuelve null si la celda no trae un valor reconocido (incluido vacío), para
 * que quien la consuma decida el fallback.
 */
export function parseStudentStatusColumn(
  value: string | null | undefined,
): "ACTIVE" | "SEPARATED" | "INACTIVE" | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "ACTIVE") return "ACTIVE";
  if (normalized === "SEPARATED") return "SEPARATED";
  if (normalized === "INACTIVE") return "INACTIVE";
  return null;
}

/**
 * Usa indices fijos porque "Medio de pago" y "Recibido" se repiten en el header.
 */
export function parseRowFromArray(arr: string[], rowIndex: number): ParsedRow {
  const names = parseStudentNames(arr[0] ?? "", arr[2] ?? "", arr[1] ?? "");
  const warnings = [...names.warnings];
  const closedAt = parseDateFlexible(arr[4]);
  const parsedStartDate = parseDateFlexible(arr[18]);
  const startDate = parsedStartDate ?? closedAt;
  const endDate = parseDateFlexible(arr[19]);
  warnInvalidDate(warnings, "Fecha 1er Pago", arr[4], closedAt);
  warnInvalidDate(warnings, "Fecha de Inicio", arr[18], parsedStartDate);
  warnInvalidDate(warnings, "Fecha Finalización", arr[19], endDate);

  const parsedMonths = parseMonths(arr[17]);
  const installments: ParsedInstallment[] = [];
  const blocks = [
    { number: 1, date: 4, amount: 5, method: 6, received: 7 },
    { number: 2, date: 8, amount: 9, method: 10, received: 11 },
    { number: 3, date: 12, amount: 13, method: 14, received: 15 },
  ];
  for (const block of blocks) {
    const dueDate = parseDateFlexible(arr[block.date]);
    const amountDue = parseMoney(arr[block.amount]);
    warnInvalidDate(warnings, `Fecha pago ${block.number}`, arr[block.date], dueDate);
    if (amountDue > 0 || dueDate) {
      const received = parseBool(arr[block.received]);
      installments.push({
        installmentNumber: block.number,
        dueDate,
        amountDue,
        amountPaid: received ? amountDue : 0,
        paidAt: received ? dueDate : null,
        method: arr[block.method]?.trim() || null,
        received,
      });
    }
  }

  const pendingAmount = parseMoney(arr[16]);
  if (pendingAmount > 0) {
    installments.push({
      installmentNumber: installments.length + 1,
      dueDate: endDate,
      amountDue: pendingAmount,
      amountPaid: 0,
      paidAt: null,
      method: null,
      received: false,
    });
  }
  if (installments.length === 0) warnings.push("Sin cuotas o pagos parseables");

  const observation = arr[20]?.trim() || null;
  const notesField = arr[21]?.trim() || null;
  const notes = [observation, notesField].filter(Boolean).join(" | ") || null;

  // Columna W (índice 22): si el CSV histórico corregido la trae, es la única
  // fuente de verdad del estado (deriva de los colores del Google Sheet). En ese
  // caso nunca derivamos PAUSED por fechas/notas: blanco = ACTIVE. Solo cuando la
  // columna no existe (formato legacy sin W) caemos al heurístico parseStatus.
  const statusColumnRaw = arr[22];
  let status: ParsedRow["status"];
  if (statusColumnRaw !== undefined) {
    const explicit = parseStudentStatusColumn(statusColumnRaw);
    if (explicit) {
      status = explicit;
    } else {
      status = "ACTIVE";
      if (statusColumnRaw.trim()) {
        warnings.push(
          `student_status no reconocido ("${statusColumnRaw.trim()}"), se usa ACTIVE`,
        );
      }
    }
  } else {
    status = parseStatus(notesField, observation, pendingAmount, endDate);
  }

  return {
    legacyRowId: rowIndex,
    head: names.head,
    members: names.members,
    closedAt,
    startDate,
    endDate,
    durationMonths: parsedMonths ?? 12,
    durationAssumed: parsedMonths === null,
    closerNameRaw: parseCloserName(arr[3]),
    installments,
    pendingAmount,
    notes,
    status,
    warnings,
  };
}
