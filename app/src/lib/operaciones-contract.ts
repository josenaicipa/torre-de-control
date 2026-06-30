import { createHash } from "node:crypto";
import {
  CONTRACT_ACCEPTANCE_TEXT,
  CONTRACT_TEMPLATE_VERSION,
  buildContractView,
  normalizeContractTemplateKind,
  type ContractInput,
  type ContractSection,
  type ContractUpgradeInfo,
  type ManualClause,
} from "./operaciones-contract-template";
import { paymentUsdValue } from "./student-payments-finance";

// Capa compartida entre la página pública de firma, las APIs (crear link,
// firmar, aprobar) y el generador de PDF. Centraliza tres cosas para que
// todos los flujos coincidan:
//   1) qué datos legales son obligatorios antes de emitir un contrato,
//   2) cómo se arma el ContractInput a partir de los datos en Torre,
//   3) cómo se calcula y verifica el hash de la firma electrónica.

export interface ContractScheduleShape {
  installmentNumber: number;
  amountDue: number | string | { toString(): string };
  currency: string;
  dueDate: Date | string;
}

// Forma mínima de un pago para reconciliar el saldo/pago inicial del contrato.
// Coincide con PaymentLike de student-payments-finance para reutilizar el
// cálculo de USD canónico.
export interface ContractPaymentShape {
  amount: number | string | { toString(): string };
  currency: string;
  officialAmountUsd?: number | string | { toString(): string } | null;
  isInitialPayment?: boolean | null;
}

// Forma mínima de los datos que necesita el flujo de contrato. Se mantiene
// laxa (number | string | Decimal) para aceptar tanto filas de Prisma como
// objetos planos de los tests sin acoplarse al cliente generado.
export interface ContractDataShape {
  student: {
    fullName: string;
    legalName: string | null;
    email: string;
    phone: string | null;
    documentType: string | null;
    documentNumber: string | null;
    legalAddress: string | null;
    legalCity: string | null;
    legalState: string | null;
    legalCountry: string | null;
    durationMonths: number | string | { toString(): string } | null;
    startDate: Date | string | null;
    endDate: Date | string | null;
    // Integrantes adicionales del equipo (el titular es el propio student).
    // Opcional: las inscripciones individuales no traen miembros.
    members?: {
      fullName: string;
      email: string | null;
      documentType: string | null;
      documentNumber: string | null;
      isContractSigner: boolean;
      contractSignerName: string | null;
      contractSignedAt: Date | string | null;
      contractSignatureHash: string | null;
      contractSignatureImage: string | null;
      contractSignedIp: string | null;
    }[];
    // Cuotas y pagos legacy/manuales registrados a nivel estudiante SIN ligar a
    // ninguna inscripción (enrollmentId null). Sirven de fallback cuando la
    // inscripción no tiene cronograma/pagos propios (cartera importada antes de
    // crear el producto vendido). Opcionales: los flujos nuevos no los traen.
    paymentSchedules?: ContractScheduleShape[];
    payments?: ContractPaymentShape[];
  };
  product: { name: string } | null;
  totalAmountUsd: number | string | { toString(): string } | null;
  initialPaymentUsd: number | string | { toString(): string } | null;
  balanceUsd: number | string | { toString(): string } | null;
  startedAt: Date | string | null;
  endsAt: Date | string | null;
  contractTemplateKind?: string | null;
  paymentSchedules: ContractScheduleShape[];
  // Pagos ligados directamente a esta inscripción (enrollmentId = id). Cuando
  // existen, esta inscripción tiene finanzas propias y NO se usa el fallback
  // legacy. Opcional para no romper objetos de tests que no los traen.
  payments?: ContractPaymentShape[];
  // Datos del upgrade de nivel (cuando la inscripción nació como upgrade de
  // otra). Si upgradeFromEnrollmentId está presente, el contrato muestra la
  // liquidación bruto/crédito/neto. Ausentes en inscripciones normales.
  upgradeFromEnrollmentId?: string | null;
  grossProgramPriceUsd?: number | string | { toString(): string } | null;
  upgradeCreditUsd?: number | string | { toString(): string } | null;
  netAmountUsd?: number | string | { toString(): string } | null;
  programLevelSnapshot?: number | string | { toString(): string } | null;
}

// Select Prisma reutilizable: trae todo lo necesario para validar, renderizar
// y firmar el contrato de una inscripción.
export const contractEnrollmentSelect = {
  id: true,
  totalAmountUsd: true,
  initialPaymentUsd: true,
  balanceUsd: true,
  currency: true,
  startedAt: true,
  endsAt: true,
  contractStatus: true,
  contractTemplateKind: true,
  contractSignedAt: true,
  contractSignerName: true,
  contractSignedIp: true,
  contractSignedUserAgent: true,
  contractTemplateVersion: true,
  contractManualClausesSnapshot: true,
  contractSectionsSnapshot: true,
  contractStudentSignatureHash: true,
  contractStudentSignatureImage: true,
  contractCeoSignerName: true,
  contractCeoSignedAt: true,
  contractCeoSignatureHash: true,
  contractCeoSignatureImage: true,
  contractApprovedAt: true,
  upgradeFromEnrollmentId: true,
  grossProgramPriceUsd: true,
  upgradeCreditUsd: true,
  netAmountUsd: true,
  programLevelSnapshot: true,
  student: {
    select: {
      fullName: true,
      legalName: true,
      email: true,
      phone: true,
      documentType: true,
      documentNumber: true,
      legalAddress: true,
      legalCity: true,
      legalState: true,
      legalCountry: true,
      durationMonths: true,
      startDate: true,
      endDate: true,
      members: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          fullName: true,
          email: true,
          documentType: true,
          documentNumber: true,
          isContractSigner: true,
          contractSignerName: true,
          contractSignedAt: true,
          contractSignatureHash: true,
          contractSignatureImage: true,
          contractSignedIp: true,
        },
      },
      // Cuotas y pagos legacy a nivel estudiante sin inscripción ligada. Sirven
      // de fallback para el contrato cuando el producto vendido se agregó
      // después de importar la cartera y nada quedó ligado al enrollment.
      paymentSchedules: {
        where: { enrollmentId: null },
        orderBy: { installmentNumber: "asc" as const },
        select: {
          installmentNumber: true,
          amountDue: true,
          currency: true,
          dueDate: true,
        },
      },
      payments: {
        where: { enrollmentId: null },
        select: {
          amount: true,
          currency: true,
          officialAmountUsd: true,
          isInitialPayment: true,
        },
      },
    },
  },
  product: { select: { name: true } },
  paymentSchedules: {
    orderBy: { installmentNumber: "asc" as const },
    select: {
      id: true,
      installmentNumber: true,
      amountDue: true,
      currency: true,
      dueDate: true,
    },
  },
  // Pagos ligados a esta inscripción. Cuando hay alguno, la inscripción tiene
  // finanzas propias y el contrato no recurre al fallback legacy del estudiante.
  payments: {
    select: {
      amount: true,
      currency: true,
      officialAmountUsd: true,
      isInitialPayment: true,
    },
  },
} as const;

function toNumberOrNull(
  value: number | string | { toString(): string } | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(num) ? num : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Cuotas que respaldan el contrato: las propias de la inscripción si existen;
// si no, las legacy a nivel estudiante (cartera importada antes de crear el
// producto vendido, que quedaron sin enrollment ligado).
function applicableSchedules(data: ContractDataShape): ContractScheduleShape[] {
  if (data.paymentSchedules.length > 0) return data.paymentSchedules;
  return data.student.paymentSchedules ?? [];
}

// Pagos que respaldan el contrato: los propios de la inscripción si existen; si
// no, los legacy a nivel estudiante sin enrollment ligado.
function applicablePayments(data: ContractDataShape): ContractPaymentShape[] {
  if ((data.payments?.length ?? 0) > 0) return data.payments ?? [];
  return data.student.payments ?? [];
}

// Suma en USD canónico de una lista de pagos del contrato.
function paidUsdFromPayments(payments: ContractPaymentShape[]): number {
  return round2(
    payments.reduce(
      (sum, p) =>
        sum +
        paymentUsdValue({
          amount: toNumberOrNull(p.amount) ?? 0,
          currency: p.currency,
          officialAmountUsd: toNumberOrNull(p.officialAmountUsd),
        }),
      0,
    ),
  );
}

// Pago inicial del contrato. Respeta el valor explícito si está definido; si es
// null pero hay pagos aplicables, lo deriva: suma de los marcados como inicial
// o, si ninguno está marcado, el total pagado. Así los importados legacy (sin
// initialPaymentUsd y con pagos manuales) no quedan bloqueados.
function derivedInitialPaymentUsd(data: ContractDataShape): number | null {
  const explicit = toNumberOrNull(data.initialPaymentUsd);
  if (explicit !== null) return explicit;
  const payments = applicablePayments(data);
  if (payments.length === 0) return null;
  const marked = payments.filter((p) => p.isInitialPayment);
  return paidUsdFromPayments(marked.length > 0 ? marked : payments);
}

// Saldo del contrato. Cuando hay pagos aplicables se concilia contra ellos
// (total - pagado, sin bajar de 0) para no arrastrar el balanceUsd stale del
// enrollment que no refleja pagos manuales. Sin pagos, usa el balanceUsd dado.
function derivedBalanceUsd(data: ContractDataShape): number | null {
  const payments = applicablePayments(data);
  if (payments.length > 0) {
    const total = toNumberOrNull(data.totalAmountUsd) ?? 0;
    return round2(Math.max(0, total - paidUsdFromPayments(payments)));
  }
  return toNumberOrNull(data.balanceUsd);
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
    return match ? value.slice(0, 10) : null;
  }
  return value.toISOString().slice(0, 10);
}

function durationMonthsFromDates(
  startValue: Date | string | null | undefined,
  endValue: Date | string | null | undefined,
): number {
  const startIso = isoDate(startValue);
  const endIso = isoDate(endValue);
  if (!startIso || !endIso) return 12;

  const start = Date.parse(`${startIso}T00:00:00.000Z`);
  const end = Date.parse(`${endIso}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 12;

  const days = (end - start) / 86_400_000;
  const months = Math.round(days / 30.436875);
  return Number.isInteger(months) && months > 0 ? months : 12;
}

function resolveDurationMonths(
  durationValue: number | string | { toString(): string } | null | undefined,
  startValue: Date | string | null | undefined,
  endValue: Date | string | null | undefined,
): number {
  const explicitDuration = toNumberOrNull(durationValue);
  if (explicitDuration !== null && Number.isInteger(explicitDuration) && explicitDuration > 0) {
    return explicitDuration;
  }

  return durationMonthsFromDates(startValue, endValue);
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export interface MissingField {
  field: string;
  label: string;
}

// Devuelve la lista de datos legales/comerciales que faltan para poder emitir
// el contrato. Si está vacía, el contrato puede generarse y firmarse.
export function findMissingContractFields(data: ContractDataShape): MissingField[] {
  const missing: MissingField[] = [];
  const add = (field: string, label: string) => missing.push({ field, label });

  if (!nonEmpty(data.student.legalName)) add("legalName", "Nombre legal completo");
  if (!nonEmpty(data.student.email)) add("email", "Correo electrónico");
  if (!nonEmpty(data.student.phone)) add("phone", "Teléfono");
  if (!nonEmpty(data.student.documentType)) add("documentType", "Tipo de documento");
  if (!nonEmpty(data.student.documentNumber))
    add("documentNumber", "Número de documento");
  if (!nonEmpty(data.student.legalAddress))
    add("legalAddress", "Dirección / domicilio");
  if (!nonEmpty(data.student.legalCity)) add("legalCity", "Ciudad");
  if (!nonEmpty(data.student.legalState))
    add("legalState", "Departamento / Estado / Provincia");
  if (!nonEmpty(data.student.legalCountry)) add("legalCountry", "País");

  if (!data.product || !nonEmpty(data.product.name)) add("product", "Producto");

  const total = toNumberOrNull(data.totalAmountUsd);
  if (total === null || total <= 0) add("totalAmountUsd", "Valor total (USD)");

  // No bloquea por initialPaymentUsd null si hay pagos aplicables (propios o
  // legacy del estudiante): se deriva de los pagos.
  if (derivedInitialPaymentUsd(data) === null)
    add("initialPaymentUsd", "Pago inicial definido");

  // El saldo se deriva: total - pagos aplicables cuando hay pagos, o el
  // balanceUsd dado si no hay. Solo bloquea cuando no hay forma de calcularlo.
  const balance = derivedBalanceUsd(data);
  if (balance === null) add("balanceUsd", "Saldo (USD) definido");

  const startDate = isoDate(data.startedAt) ?? isoDate(data.student.startDate);
  if (!startDate) add("startDate", "Fecha de acuerdo / inicio");

  const endDate = isoDate(data.endsAt) ?? isoDate(data.student.endDate);
  if (!endDate) add("endDate", "Fecha de finalización");

  // Si hay saldo pendiente, debe existir al menos una cuota que lo respalde
  // (de la inscripción o legacy del estudiante).
  if (balance !== null && balance > 0 && applicableSchedules(data).length === 0) {
    add(
      "paymentSchedule",
      "Cronograma de cuotas para el saldo pendiente",
    );
  }

  return missing;
}

export function isContractComplete(data: ContractDataShape): boolean {
  return findMissingContractFields(data).length === 0;
}

function composeDocument(data: ContractDataShape): string | null {
  const type = data.student.documentType?.trim();
  const number = data.student.documentNumber?.trim();
  if (!type && !number) return null;
  if (type && number) return `${type} N° ${number}`;
  return type ?? number ?? null;
}

function composeAddress(data: ContractDataShape): string | null {
  const parts = [
    data.student.legalAddress?.trim(),
    data.student.legalCity?.trim(),
    data.student.legalState?.trim(),
    data.student.legalCountry?.trim(),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.length > 0 ? parts.join(", ") : null;
}

// ─── Cláusulas manuales configurables ────────────────────────────────────────

// Topes para acotar el tamaño de las cláusulas manuales y evitar abusos.
export const MANUAL_CLAUSE_LIMITS = {
  maxClauses: 10,
  maxParagraphsPerClause: 30,
  maxHeadingLength: 120,
  maxParagraphLength: 4000,
} as const;

// Normaliza un valor arbitrario (típicamente JSON del settings o del body de la
// API) en una lista de cláusulas manuales válidas. Es tolerante: descarta lo
// que no encaje (entradas no-objeto, encabezados vacíos, párrafos vacíos) en
// lugar de fallar, recorta espacios y aplica los topes. Devuelve [] si no hay
// nada utilizable, de modo que un contrato sin cláusulas manuales sea el caso
// por defecto.
// Parsea el snapshot JSON de cláusulas manuales congeladas en el enrollment.
// Devuelve null cuando el snapshot todavía no se tomó (el contrato no llegó a
// PENDING_SIGNATURE) y [] si el snapshot existe pero quedó vacío. El JSON se
// normaliza con parseManualClauses para descartar entradas corruptas.
export function parseManualClausesSnapshot(
  snapshot: string | null | undefined,
): ManualClause[] | null {
  if (snapshot === null || snapshot === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return [];
  }
  return parseManualClauses(parsed);
}

// Serializa una lista de cláusulas para guardarla como snapshot en el
// enrollment. Normaliza antes de serializar para que la BD nunca contenga
// entradas inválidas.
export function serializeManualClausesSnapshot(
  clauses: ManualClause[],
): string {
  return JSON.stringify(parseManualClauses(clauses));
}

export function parseManualClauses(value: unknown): ManualClause[] {
  if (!Array.isArray(value)) return [];
  const clauses: ManualClause[] = [];
  for (const raw of value) {
    if (clauses.length >= MANUAL_CLAUSE_LIMITS.maxClauses) break;
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as { heading?: unknown; paragraphs?: unknown };
    const heading =
      typeof candidate.heading === "string"
        ? candidate.heading.trim().slice(0, MANUAL_CLAUSE_LIMITS.maxHeadingLength)
        : "";
    if (!heading) continue;
    if (!Array.isArray(candidate.paragraphs)) continue;
    const paragraphs = candidate.paragraphs
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim().slice(0, MANUAL_CLAUSE_LIMITS.maxParagraphLength))
      .filter((p) => p.length > 0)
      .slice(0, MANUAL_CLAUSE_LIMITS.maxParagraphsPerClause);
    if (paragraphs.length === 0) continue;
    clauses.push({ heading, paragraphs });
  }
  return clauses;
}

// ─── Snapshot del contrato COMPLETO por inscripción ───────────────────────────

// Topes para el contrato completo personalizado de una inscripción. Acotan el
// tamaño del JSON congelado y se preservan tildes/ñ/viñetas (solo se recorta
// largo y se descartan entradas inválidas, sin tocar el contenido textual).
export const CONTRACT_SECTIONS_LIMITS = {
  maxSections: 30,
  maxParagraphsPerSection: 20,
  maxHeadingLength: 160,
  maxParagraphLength: 4000,
} as const;

// Normaliza un valor arbitrario en una lista de secciones de contrato válidas.
// Tolerante: descarta entradas no-objeto, encabezados vacíos y párrafos vacíos,
// recorta a los topes y asigna un id estable cuando falta o se repite. Devuelve
// [] si no hay nada utilizable. NO altera tildes, ñ, viñetas «»°— ni marcadores
// de negrita inline: solo recorta longitud y espacios en los extremos.
export function parseContractSections(value: unknown): ContractSection[] {
  if (!Array.isArray(value)) return [];
  const sections: ContractSection[] = [];
  const usedIds = new Set<string>();
  for (const raw of value) {
    if (sections.length >= CONTRACT_SECTIONS_LIMITS.maxSections) break;
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as {
      id?: unknown;
      heading?: unknown;
      paragraphs?: unknown;
    };
    const heading =
      typeof candidate.heading === "string"
        ? candidate.heading.trim().slice(0, CONTRACT_SECTIONS_LIMITS.maxHeadingLength)
        : "";
    if (!heading) continue;
    if (!Array.isArray(candidate.paragraphs)) continue;
    const paragraphs = candidate.paragraphs
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim().slice(0, CONTRACT_SECTIONS_LIMITS.maxParagraphLength))
      .filter((p) => p.length > 0)
      .slice(0, CONTRACT_SECTIONS_LIMITS.maxParagraphsPerSection);
    if (paragraphs.length === 0) continue;

    const rawId =
      typeof candidate.id === "string" ? candidate.id.trim().slice(0, 80) : "";
    let id = rawId;
    if (!id || usedIds.has(id)) {
      id = `section-${sections.length + 1}`;
    }
    usedIds.add(id);
    sections.push({ id, heading, paragraphs });
  }
  return sections;
}

// Parsea el snapshot JSON del contrato completo congelado en la inscripción.
// Devuelve null cuando el snapshot no existe (la inscripción usa la plantilla
// oficial) y [] cuando el JSON está corrupto o no contiene secciones válidas.
export function parseContractSectionsSnapshot(
  snapshot: string | null | undefined,
): ContractSection[] | null {
  if (snapshot === null || snapshot === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return [];
  }
  return parseContractSections(parsed);
}

// Serializa las secciones del contrato completo para guardarlas como snapshot.
// Normaliza antes de serializar para que la BD nunca contenga entradas inválidas.
export function serializeContractSectionsSnapshot(
  sections: ContractSection[],
): string {
  return JSON.stringify(parseContractSections(sections));
}

// Arma el ContractInput canónico a partir de los datos en Torre. `signedAt`
// permite fijar la fecha de acuerdo a la firma real; si falta se usa hoy.
// `manualClauses` anexa cláusulas configurables al final del contrato; se
// normalizan para que el input canónico no contenga entradas inválidas.
export function buildContractInputFromData(
  data: ContractDataShape,
  signedAt?: Date | string | null,
  manualClauses?: ManualClause[],
  sectionsSnapshot?: ContractSection[] | null,
): ContractInput {
  const clientName = data.student.legalName?.trim() || data.student.fullName;
  const agreementDate =
    isoDate(signedAt ?? null) ??
    isoDate(data.startedAt) ??
    isoDate(data.student.startDate) ??
    new Date().toISOString().slice(0, 10);
  const endDate = isoDate(data.endsAt) ?? isoDate(data.student.endDate);
  const durationMonths = resolveDurationMonths(
    data.student.durationMonths,
    data.startedAt ?? data.student.startDate,
    data.endsAt ?? data.student.endDate,
  );

  const installments = applicableSchedules(data).map((s) => ({
    number: s.installmentNumber,
    amountUsd: toNumberOrNull(s.amountDue) ?? 0,
    currency: s.currency,
    dueDate: isoDate(s.dueDate) ?? "",
  }));

  // Liquidación del upgrade. Solo se arma cuando la inscripción nació como
  // upgrade de otra (upgradeFromEnrollmentId presente); en inscripciones
  // normales queda en null y se omite del input para que el hash de firma siga
  // siendo idéntico al de un contrato sin upgrade.
  const upgrade: ContractUpgradeInfo | null = data.upgradeFromEnrollmentId
    ? {
        grossProgramPriceUsd: toNumberOrNull(data.grossProgramPriceUsd) ?? 0,
        upgradeCreditUsd: toNumberOrNull(data.upgradeCreditUsd) ?? 0,
        netAmountUsd: toNumberOrNull(data.netAmountUsd) ?? 0,
        programLevelSnapshot: toNumberOrNull(data.programLevelSnapshot),
      }
    : null;

  // Integrantes adicionales del equipo. Se omiten por completo cuando la
  // inscripción es individual para que el ContractInput (y por tanto el hash
  // de firma) quede idéntico al de antes de esta función.
  const teamMembers = (data.student.members ?? [])
    .filter((m) => typeof m.fullName === "string" && m.fullName.trim().length > 0)
    .map((m) => ({
      fullName: m.fullName,
      email: m.email,
      documentType: m.documentType,
      documentNumber: m.documentNumber,
      isContractSigner: m.isContractSigner,
    }));

  return {
    templateKind: normalizeContractTemplateKind(data.contractTemplateKind),
    clientName,
    clientEmail: data.student.email,
    clientDocument: composeDocument(data),
    clientAddress: composeAddress(data),
    productName: data.product?.name ?? "",
    totalAmountUsd: toNumberOrNull(data.totalAmountUsd) ?? 0,
    initialPaymentUsd: derivedInitialPaymentUsd(data) ?? 0,
    balanceUsd: derivedBalanceUsd(data) ?? 0,
    installments,
    agreementDate,
    endDate,
    durationMonths,
    manualClauses: parseManualClauses(manualClauses ?? []),
    sectionsSnapshot: sectionsSnapshot ?? null,
    ...(upgrade ? { upgrade } : {}),
    ...(teamMembers.length > 0 ? { teamMembers } : {}),
  };
}

// ─── Cambio de tipo de contrato (plantilla) por inscripción ──────────────────

// Únicos estados en los que se permite cambiar la plantilla legal. Cualquier
// otro estado (firmado, aprobado, pendiente de aprobación, activo, cancelado o
// uno desconocido) bloquea el cambio. Además el cambio de plantilla exige que
// NO exista ninguna evidencia de firma (estudiante o CEO).
const CONTRACT_TEMPLATE_CHANGE_ALLOWED_STATUSES = new Set([
  "DRAFT",
  "PENDING_SIGNATURE",
  "REJECTED",
]);

// Mensaje único que ven el operador (UI) y la API cuando el cambio de tipo de
// contrato está bloqueado por una firma ya existente.
export const CONTRACT_TEMPLATE_CHANGE_LOCKED_MESSAGE =
  "No se puede cambiar el tipo porque este contrato ya tiene firma.";

// Forma mínima necesaria para decidir si una inscripción puede cambiar de
// plantilla legal. Se mantiene laxa (Date | string | null) para aceptar filas
// de Prisma y objetos planos de los tests.
export interface ContractTemplateChangeGate {
  contractStatus: string;
  contractSignedAt: Date | string | null;
  contractCeoSignedAt: Date | string | null;
  contractApprovedAt: Date | string | null;
}

// ¿Se puede cambiar el tipo de contrato de esta inscripción? Solo si ninguna de
// las dos partes firmó (ni estudiante ni CEO/Jose) y el contrato no está en un
// estado firmado/aprobado/pendiente de aprobación. Se permite en DRAFT,
// PENDING_SIGNATURE o REJECTED siempre que no haya firmas registradas.
export function canChangeContractTemplateKind(
  enrollment: ContractTemplateChangeGate,
): boolean {
  if (
    !CONTRACT_TEMPLATE_CHANGE_ALLOWED_STATUSES.has(enrollment.contractStatus)
  ) {
    return false;
  }
  if (enrollment.contractSignedAt) return false;
  if (enrollment.contractCeoSignedAt) return false;
  if (enrollment.contractApprovedAt) return false;
  return true;
}

// Datos para dejar la inscripción con un contrato NUEVO/no emitido al cambiar la
// plantilla: fija el nuevo tipo, vuelve a DRAFT y limpia link de firma, snapshots
// y toda evidencia de firma/aprobación/rechazo previa. Invalida cualquier link
// anterior y obliga a generar uno nuevo con la plantilla elegida.
export function buildContractTemplateResetData(
  templateKind: "TRADITIONAL" | "BUSINESS",
) {
  return {
    contractTemplateKind: templateKind,
    contractStatus: "DRAFT" as const,
    contractUrl: null,
    contractSignatureToken: null,
    contractSignatureTokenCreatedAt: null,
    contractManualClausesSnapshot: null,
    contractSectionsSnapshot: null,
    contractSignerName: null,
    contractSignedIp: null,
    contractSignedUserAgent: null,
    contractSignedAt: null,
    contractStudentSignatureHash: null,
    contractStudentSignatureImage: null,
    contractCeoSignerName: null,
    contractCeoSignedAt: null,
    contractCeoSignedById: null,
    contractCeoSignatureHash: null,
    contractCeoSignatureImage: null,
    contractApprovedAt: null,
    contractApprovedById: null,
    contractRejectedAt: null,
    contractRejectionReason: null,
    contractTemplateVersion: null,
    contractAcceptanceText: null,
  };
}

// ─── Imagen de la firma manuscrita ───────────────────────────────────────────

// Límite de tamaño de la imagen de firma decodificada: 1 MB.
export const SIGNATURE_IMAGE_MAX_BYTES = 1_048_576;

export type SignatureImageMime = "image/png" | "image/jpeg";

export type SignatureImageValidation =
  | {
      ok: true;
      mime: SignatureImageMime;
      base64: string;
      bytes: number;
      dataUrl: string;
    }
  | { ok: false; error: string };

// Tamaño en bytes de un base64 sin decodificarlo (válido en navegador y server,
// sin depender de Buffer).
function base64ByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

// Valida que el valor sea una data URL de imagen PNG o JPEG de máximo 1 MB.
// Rechaza otros formatos (webp, gif, svg, etc.), data URLs malformadas y
// tamaños excesivos. Devuelve la data URL normalizada para almacenar.
export function validateSignatureImage(value: unknown): SignatureImageValidation {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: "Sube una foto de tu firma para continuar" };
  }
  const trimmed = value.trim();
  const match =
    /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: "La firma debe ser una imagen PNG o JPEG válida",
    };
  }
  const mime = match[1] as SignatureImageMime;
  const base64 = match[2];
  const bytes = base64ByteLength(base64);
  if (bytes <= 0) {
    return { ok: false, error: "La imagen de la firma está vacía" };
  }
  if (bytes > SIGNATURE_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      error: "La imagen de la firma supera el límite de 1 MB",
    };
  }
  return { ok: true, mime, base64, bytes, dataUrl: `data:${mime};base64,${base64}` };
}

// ─── Firma electrónica: hash + verificación de nombre ────────────────────────

// Representación canónica de lo que el estudiante firma: versión de plantilla,
// datos interpolados y vista renderizada del contrato. No incluye la firma en
// sí para que el hash represente el CONTENIDO aceptado.
export function canonicalContractPayload(input: ContractInput): string {
  const view = buildContractView(input);
  return JSON.stringify({
    templateVersion: CONTRACT_TEMPLATE_VERSION,
    input,
    view,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Hash de la firma del estudiante: contenido del contrato + nombre del
// firmante + texto de aceptación + huella de la imagen de firma (si existe).
// La imagen se incorpora como su propio sha256 para que el hash quede acotado
// y sirva de evidencia de la firma manuscrita aceptada.
export function computeStudentSignatureHash(
  input: ContractInput,
  signerName: string,
  signatureImage?: string | null,
): string {
  const imageDigest = signatureImage?.trim() ? sha256(signatureImage.trim()) : "";
  return sha256(
    `${canonicalContractPayload(input)}::signer=${signerName.trim()}::accept=${CONTRACT_ACCEPTANCE_TEXT}::image=${imageDigest}`,
  );
}

// Devuelve los integrantes marcados como firmantes del contrato, en el orden en
// que vienen del select (createdAt asc). Si está vacío, la inscripción usa el
// flujo de firmante único legacy (el titular Student, que igual debe firmar).
export function contractSignerMembers<T extends { isContractSigner: boolean }>(
  members: T[] | null | undefined,
): T[] {
  return (members ?? []).filter((m) => m.isContractSigner);
}

// Id reservado para el titular Student dentro del flujo de firma. El titular
// SIEMPRE es firmante requerido; los integrantes marcados firman ADEMÁS.
export const CONTRACT_HOLDER_SIGNER_ID = "student";

export interface ContractSigner {
  id: string; // "student" = titular; member.id para integrantes.
  name: string;
  isPrimary: boolean;
  signed: boolean;
}

export interface ContractSignersSummary {
  signers: ContractSigner[];
  // ¿Hay integrantes marcados como firmantes? Si no, es el flujo legacy en el
  // que el único firmante requerido es el titular.
  usesMembers: boolean;
  total: number;
  signedCount: number;
  pending: ContractSigner[];
  allSigned: boolean;
}

// Forma mínima para calcular el resumen de firmantes de un contrato. El titular
// firmó cuando la inscripción tiene contractSignedAt; cada integrante cuando su
// propio contractSignedAt está presente.
export interface ContractSignersInput {
  student: {
    fullName: string;
    legalName: string | null;
    members?: {
      id: string;
      fullName: string;
      isContractSigner: boolean;
      contractSignedAt: Date | string | null;
    }[];
  };
  contractSignedAt?: Date | string | null;
}

// Resumen de los firmantes requeridos de un contrato: el titular Student SIEMPRE
// (id "student") más cada integrante marcado con isContractSigner=true. Calcula
// el progreso de firmas y la lista de pendientes para la página pública, la API
// y los tests. allSigned es true solo cuando el titular y todos los integrantes
// marcados tienen firma registrada.
export function buildContractSignersSummary(
  data: ContractSignersInput,
): ContractSignersSummary {
  const titularName = data.student.legalName?.trim() || data.student.fullName;
  const members = contractSignerMembers(data.student.members ?? []);
  const signers: ContractSigner[] = [
    {
      id: CONTRACT_HOLDER_SIGNER_ID,
      name: titularName,
      isPrimary: true,
      signed: Boolean(data.contractSignedAt),
    },
    ...members.map((m) => ({
      id: m.id,
      name: m.fullName,
      isPrimary: false,
      signed: Boolean(m.contractSignedAt),
    })),
  ];
  const pending = signers.filter((s) => !s.signed);
  return {
    signers,
    usesMembers: members.length > 0,
    total: signers.length,
    signedCount: signers.length - pending.length,
    pending,
    allSigned: pending.length === 0,
  };
}

// Hash resumen de una firma múltiple: combina los hashes individuales de cada
// firmante en un único hash que representa el conjunto de firmas aceptadas.
export function computeSignaturesSummaryHash(hashes: string[]): string {
  return sha256(hashes.filter((h) => h && h.trim().length > 0).join("::"));
}

// Hash de la firma del CEO: encadena el hash del estudiante con la identidad
// del CEO y la fecha de aprobación.
export function computeCeoSignatureHash(
  studentSignatureHash: string,
  ceoName: string,
  ceoSignedAt: Date,
): string {
  return sha256(
    `${studentSignatureHash}::ceo=${ceoName.trim()}::at=${ceoSignedAt.toISOString()}`,
  );
}

// Normaliza un nombre para comparación: minúsculas, sin acentos, sin signos de
// puntuación y con espacios colapsados.
export function normalizeNameForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ¿El nombre firmado coincide razonablemente con el nombre legal/registrado?
// No es biometría: exige igualdad normalizada o que compartan al menos dos
// tokens significativos (nombre + apellido), tolerando orden distinto.
export function namesReasonablyMatch(signed: string, expected: string): boolean {
  const a = normalizeNameForMatch(signed);
  const b = normalizeNameForMatch(expected);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTokens = new Set(a.split(" ").filter((t) => t.length >= 2));
  const bTokens = b.split(" ").filter((t) => t.length >= 2);
  const shared = bTokens.filter((t) => aTokens.has(t));
  return shared.length >= 2;
}
