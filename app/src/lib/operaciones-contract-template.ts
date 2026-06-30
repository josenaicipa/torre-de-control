// Plantilla del contrato real de Unlocked Academy ("CONTRATO DE PRESTACIÓN DE
// SERVICIOS DE CONSULTORÍA"). El cuerpo de las cláusulas reproduce el PDF
// oficial firmado por Kaupi LLC; solo los datos del encabezado (partes),
// honorarios y fechas se interpolan con la información que vive en Torre.
//
// Datos legales pendientes: el modelo de datos NO guarda hoy el documento de
// identidad ni el domicilio del estudiante, así que el encabezado usa frases
// seguras ("identificado con documento registrado en Torre", "con domicilio
// registrado en Torre") en lugar de inventar valores. Cuando se agregue una
// fase de datos legales (campos documentId/address en Student) basta con
// pasar esos valores en `ContractInput` y reemplazar las frases por defecto.

export const CONTRACT_TITLE =
  "CONTRATO DE PRESTACIÓN DE SERVICIOS DE CONSULTORÍA";
export const CONTRACT_SUBTITLE = "Unlocked Academy";

// Plantilla legal de la inscripción. TRADITIONAL es el contrato por defecto
// «Unlocked Academy»; BUSINESS es el contrato «Unlocked Academy Empresarial»
// (programa de transformación empresarial). Refleja el enum Prisma
// ContractTemplateKind.
export type ContractTemplateKind = "TRADITIONAL" | "BUSINESS";

export const CONTRACT_SUBTITLE_BUSINESS = "Unlocked Academy Empresarial";

// Normaliza un valor arbitrario (típicamente de la BD o del body de la API) a
// un ContractTemplateKind. Cualquier valor que no sea exactamente "BUSINESS"
// cae a "TRADITIONAL", de modo que contratos antiguos/null usan el tradicional.
export function normalizeContractTemplateKind(
  value: unknown,
): ContractTemplateKind {
  return value === "BUSINESS" ? "BUSINESS" : "TRADITIONAL";
}

// Marcador con el que se prefijan los párrafos que deben renderizarse como
// viñetas (tanto en la vista web como en el PDF). Se mantiene como convención
// de texto para no cambiar la forma `string[]` de los párrafos.
export const CONTRACT_BULLET_PREFIX = "• ";

export function isContractBullet(text: string): boolean {
  return text.startsWith(CONTRACT_BULLET_PREFIX);
}

export function contractBulletText(text: string): string {
  return isContractBullet(text) ? text.slice(CONTRACT_BULLET_PREFIX.length) : text;
}

// Marcadores inline para resaltar en negrita fragmentos DENTRO de un párrafo
// (p. ej. los montos y fechas variables del calendario de pagos). Igual que el
// prefijo de viñetas, es una convención de texto para no cambiar la forma
// `string[]` de los párrafos: los renderizadores (web y PDF) parsean estos
// marcadores con `parseContractSegments`. Se usan caracteres improbables en el
// texto legal (corchetes blancos matemáticos) para evitar colisiones.
export const CONTRACT_BOLD_OPEN = "⟦"; // ⟦
export const CONTRACT_BOLD_CLOSE = "⟧"; // ⟧

// Envuelve un fragmento para que se renderice en negrita dentro de un párrafo.
function boldFragment(text: string): string {
  return `${CONTRACT_BOLD_OPEN}${text}${CONTRACT_BOLD_CLOSE}`;
}

// Convierte un párrafo con marcadores de negrita inline en segmentos
// {text, bold}. Texto sin marcadores devuelve un único segmento no-negrita.
export function parseContractSegments(text: string): ContractTextSegment[] {
  const segments: ContractTextSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf(CONTRACT_BOLD_OPEN, cursor);
    if (open === -1) {
      segments.push({ text: text.slice(cursor), bold: false });
      break;
    }
    if (open > cursor) {
      segments.push({ text: text.slice(cursor, open), bold: false });
    }
    const close = text.indexOf(CONTRACT_BOLD_CLOSE, open + 1);
    if (close === -1) {
      // Marcador sin cierre: renderiza el resto como texto normal (sin marca).
      segments.push({ text: text.slice(open + 1), bold: false });
      break;
    }
    segments.push({ text: text.slice(open + 1, close), bold: true });
    cursor = close + 1;
  }
  return segments.filter((s) => s.text.length > 0);
}

// Frase que reemplaza los datos legales cuando faltan. El flujo de emisión de
// contrato BLOQUEA antes de llegar aquí (findMissingContractFields); este
// marcador solo aparece si alguien arma la vista a mano con datos incompletos.
export const INCOMPLETE_LEGAL_DATA = "DATOS LEGALES INCOMPLETOS";

// Versión de la plantilla aceptada por el estudiante. Se congela en la
// inscripción al firmar para tener evidencia de QUÉ texto se aceptó. Súbela
// cuando cambie el contenido legal del contrato.
export const CONTRACT_TEMPLATE_VERSION = "2026-06-unlocked-v4";

// Texto exacto de la declaración de aceptación que firma el estudiante. Se
// guarda junto a la firma como evidencia de consentimiento informado.
export const CONTRACT_ACCEPTANCE_TEXT =
  "Declaro que he leído, entiendo y acepto en su totalidad las cláusulas del " +
  "presente Contrato de Prestación de Servicios de Consultoría «Unlocked " +
  "Academy», incluyendo el valor total, el valor pagado y el calendario de " +
  "pagos descritos. Esta firma electrónica confirma mi voluntad de obligarme " +
  "conforme a sus términos.";

// Datos de LA EMPRESA tal como aparecen en el contrato oficial.
export const COMPANY = {
  legalName: "Kaupi LLC",
  ein: "35-2736767",
  address: "5255 NW 112th Ave, Doral, FL 33178",
  ceoName: "Jose David Naicipa Jiménez",
  supportEmail: "unlockedacademy@naicipa.com",
} as const;

export interface ContractInstallment {
  number: number;
  amountUsd: number;
  currency: string;
  dueDate: string; // YYYY-MM-DD
}

// Cláusula adicional configurable por Operaciones (no vive en el código de la
// plantilla, sino en la configuración global). Se añade al final del cuerpo
// legal en TODAS las vistas (web, PDF) y entra al hash de la firma. Al cambiar
// estas cláusulas debe subirse CONTRACT_TEMPLATE_VERSION, igual que cuando se
// edita el texto de la plantilla en código.
export interface ManualClause {
  heading: string;
  paragraphs: string[];
}

// Liquidación de un upgrade de nivel. Cuando una inscripción nace como upgrade
// de otra, el contrato debe explicitar de dónde sale el valor neto: el precio
// bruto de catálogo del nivel destino, el crédito reconocido por lo ya pagado
// en niveles anteriores y el neto resultante. Los montos vienen ya calculados
// por el backend de upgrades (operaciones-upgrade / operaciones-enrollments).
export interface ContractUpgradeInfo {
  // Precio bruto de catálogo del nivel destino (USD).
  grossProgramPriceUsd: number;
  // Crédito aplicado por pagos reconocidos en niveles anteriores (USD).
  upgradeCreditUsd: number;
  // Valor neto a pagar = bruto − crédito, con piso en 0 (USD).
  netAmountUsd: number;
  // Nivel destino del programa, si está disponible.
  programLevelSnapshot?: number | null;
}

export interface ContractInput {
  // Plantilla legal a emitir. Decide título, subtítulo y cuerpo del contrato.
  // Ausente/undefined => "TRADITIONAL" (contrato por defecto «Unlocked Academy»).
  templateKind?: ContractTemplateKind;
  // Nombre legal del estudiante (legalName si existe; si no, fullName).
  clientName: string;
  clientEmail: string;
  // Datos legales aún no modelados en Torre. Se dejan opcionales: si llegan,
  // se usan; si no, se cae a una frase segura sin inventar el dato.
  clientDocument?: string | null;
  clientAddress?: string | null;
  productName: string;
  totalAmountUsd: number;
  initialPaymentUsd: number;
  balanceUsd: number;
  installments: ContractInstallment[];
  agreementDate: string; // YYYY-MM-DD (contractSignedAt o fecha actual)
  endDate: string | null; // YYYY-MM-DD (endsAt o student.endDate si está disponible)
  // Duración real de la mentoría en meses. Viene de las fechas de la inscripción
  // (startedAt/endsAt) o, como respaldo, de las fechas del estudiante.
  durationMonths: number;
  // Cláusulas manuales configurables que se anexan al final del contrato.
  manualClauses?: ManualClause[];
  // Liquidación de un upgrade de nivel. Cuando está presente, el contrato
  // incluye un bloque que detalla valor bruto, crédito aplicado y valor neto,
  // y entra al hash de la firma vía el input canónico (igual que web y PDF).
  // Ausente/null => contrato normal, con salida idéntica a la anterior.
  upgrade?: ContractUpgradeInfo | null;
  // Snapshot del contrato COMPLETO personalizado para esta inscripción. Cuando
  // está presente y tiene al menos una sección, REEMPLAZA la plantilla oficial
  // y las cláusulas manuales como `sections` en TODAS las vistas (web, PDF y el
  // hash de firma). null/undefined/[] => se usa la plantilla oficial.
  sectionsSnapshot?: ContractSection[] | null;
  // Integrantes ADICIONALES cuando EL CLIENTE es un equipo. El titular sigue
  // siendo clientName/clientEmail; estos son los demás miembros. Ausente/[] =>
  // contrato individual, con salida idéntica a la anterior (parties y hash sin
  // cambios). No se modelan datos legales (documento/domicilio) de los miembros.
  teamMembers?: ContractTeamMember[];
}

// Integrante adicional de un contrato de equipo. Solo el nombre es obligatorio;
// isContractSigner marca a quién, además del titular, se le exige firmar. El
// documento (tipo + número) es opcional: cuando existe se imprime junto al
// nombre en la cláusula REUNIDOS («Nombre identificado con CC N° 123»).
export interface ContractTeamMember {
  fullName: string;
  email?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  isContractSigner?: boolean;
}

export interface ContractSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

// Fragmento de texto con marca de negrita. Se usa para resaltar los datos
// variables (empresa, EIN, dirección, nombre del cliente, documento y
// domicilio) tanto en la vista web (<strong>) como en el PDF (fuente bold),
// sin alterar el string `parties` que entra al hash de la firma.
export interface ContractTextSegment {
  text: string;
  bold: boolean;
}

// Une los segmentos en el string plano equivalente. La concatenación de los
// segmentos de `buildPartiesSegments` debe coincidir exactamente con
// `view.parties` (verificado en tests) para no romper el contenido firmado.
export function segmentsToText(segments: ContractTextSegment[]): string {
  return segments.map((s) => s.text).join("");
}

// Construye los segmentos de la cláusula "Reunidos" resaltando en negrita los
// datos variables del contrato. Es la fuente de verdad de la que se deriva el
// string `parties` en buildContractView, garantizando que web, PDF y hash
// usen el mismo texto.
export function buildPartiesSegments(input: ContractInput): ContractTextSegment[] {
  const hasDocument = Boolean(input.clientDocument?.trim());
  const documentValue = hasDocument
    ? input.clientDocument!.trim()
    : INCOMPLETE_LEGAL_DATA;
  const hasAddress = Boolean(input.clientAddress?.trim());
  const addressValue = hasAddress
    ? input.clientAddress!.trim()
    : INCOMPLETE_LEGAL_DATA;

  const segments: ContractTextSegment[] = [
    { text: "De una parte, ", bold: false },
    { text: COMPANY.legalName, bold: true },
    { text: " con EIN ", bold: false },
    { text: COMPANY.ein, bold: true },
    { text: ", con domicilio a efectos de notificaciones en ", bold: false },
    { text: COMPANY.address, bold: true },
    { text: ". Y, de otra parte, ", bold: false },
    { text: input.clientName, bold: true },
    { text: " identificado con ", bold: false },
    { text: documentValue, bold: true },
    {
      text: hasAddress
        ? ", con domicilio a efectos de notificaciones en "
        : ", con domicilio a efectos de notificaciones ",
      bold: false,
    },
    { text: addressValue, bold: true },
    { text: ".", bold: false },
  ];

  // Equipo: si hay integrantes adicionales, se añade una frase con el conteo
  // total (titular + miembros) y la lista de integrantes con su documento. El
  // titular se conserva como representante principal y reutiliza clientDocument;
  // cada integrante muestra «Nombre identificado con <documento>» cuando tiene
  // documento, o solo el nombre si no se capturó.
  const members = validTeamMembers(input);
  if (members.length > 0) {
    const entries: { name: string; document: string | null }[] = [
      { name: input.clientName.trim(), document: hasDocument ? documentValue : null },
      ...members.map((m) => ({
        name: m.fullName.trim(),
        document: composeMemberDocument(m),
      })),
    ];
    segments.push({
      text: ` EL CLIENTE está conformado por ${entries.length} integrantes: `,
      bold: false,
    });
    entries.forEach((entry, index) => {
      segments.push({ text: entry.name, bold: true });
      if (entry.document) {
        segments.push({ text: " identificado con ", bold: false });
        segments.push({ text: entry.document, bold: true });
      }
      segments.push({
        text: index < entries.length - 1 ? ", " : ".",
        bold: false,
      });
    });
  }

  return segments;
}

// Compone el documento legible de un integrante adicional a partir de su tipo y
// número. Devuelve «Tipo N° Número» cuando ambos existen, o el dato disponible;
// null cuando no se capturó documento.
function composeMemberDocument(member: ContractTeamMember): string | null {
  const type = member.documentType?.trim();
  const number = member.documentNumber?.trim();
  if (!type && !number) return null;
  if (type && number) return `${type} N° ${number}`;
  return type ?? number ?? null;
}

// Filtra los integrantes adicionales con nombre utilizable. Comparte la regla
// entre la frase de partes y los firmantes para que conteo, lista y firmas no
// se desincronicen.
function validTeamMembers(input: ContractInput): ContractTeamMember[] {
  return (input.teamMembers ?? []).filter(
    (m) => typeof m.fullName === "string" && m.fullName.trim().length > 0,
  );
}

export interface ContractView {
  title: string;
  subtitle: string;
  parties: string;
  exponen: string;
  sections: ContractSection[];
  signature: {
    agreementDateLabel: string;
    endDateLabel: string;
    clientName: string;
    ceoName: string;
    // Firmantes requeridos del contrato interno: el titular y los integrantes
    // adicionales marcados con isContractSigner. Sin equipo => [titular].
    signerNames: string[];
  };
}

export function formatContractUsd(value: number): string {
  const num = Number.isFinite(value) ? value : 0;
  return `USD $${num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// Formatea una fecha ISO (YYYY-MM-DD) como "11 de agosto de 2026" sin pasar
// por Date() para evitar corrimientos de zona horaria.
export function formatContractDate(iso: string | null): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  const monthName = MESES_ES[Number(month) - 1] ?? month;
  return `${Number(day)} de ${monthName} de ${year}`;
}

const NUMEROS_ES: Record<number, string> = {
  1: "un",
  2: "dos",
  3: "tres",
  4: "cuatro",
  5: "cinco",
  6: "seis",
  7: "siete",
  8: "ocho",
  9: "nueve",
  10: "diez",
  11: "once",
  12: "doce",
  13: "trece",
  14: "catorce",
  15: "quince",
  16: "dieciséis",
  17: "diecisiete",
  18: "dieciocho",
  19: "diecinueve",
  20: "veinte",
  21: "veintiún",
  22: "veintidós",
  23: "veintitrés",
  24: "veinticuatro",
  25: "veinticinco",
  26: "veintiséis",
  27: "veintisiete",
  28: "veintiocho",
  29: "veintinueve",
  30: "treinta",
  31: "treinta y un",
  32: "treinta y dos",
  33: "treinta y tres",
  34: "treinta y cuatro",
  35: "treinta y cinco",
  36: "treinta y seis",
  37: "treinta y siete",
  38: "treinta y ocho",
  39: "treinta y nueve",
  40: "cuarenta",
  41: "cuarenta y un",
  42: "cuarenta y dos",
  43: "cuarenta y tres",
  44: "cuarenta y cuatro",
  45: "cuarenta y cinco",
  46: "cuarenta y seis",
  47: "cuarenta y siete",
  48: "cuarenta y ocho",
  49: "cuarenta y nueve",
  50: "cincuenta",
  51: "cincuenta y un",
  52: "cincuenta y dos",
  53: "cincuenta y tres",
  54: "cincuenta y cuatro",
  55: "cincuenta y cinco",
  56: "cincuenta y seis",
  57: "cincuenta y siete",
  58: "cincuenta y ocho",
  59: "cincuenta y nueve",
  60: "sesenta",
};

function safeDurationMonths(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 12;
}

function durationMonthsLabel(value: number): string {
  const months = safeDurationMonths(value);
  return `${months} ${months === 1 ? "mes" : "meses"}`;
}

function legalDurationMonthsLabel(value: number): string {
  const months = safeDurationMonths(value);
  const words = NUMEROS_ES[months] ?? String(months);
  return `${words} (${months}) ${months === 1 ? "mes" : "meses"}`;
}

function buildPaymentParagraphs(input: ContractInput): string[] {
  const legalDuration = legalDurationMonthsLabel(input.durationMonths);
  const paragraphs: string[] = [
    `EL CLIENTE conviene cancelar la suma de ${formatContractUsd(
      input.totalAmountUsd,
    )} por la adquisición del programa «${input.productName}». El pago debe ` +
      "realizarse en la fecha de entrada en vigor del presente acuerdo.",
  ];

  if (input.balanceUsd > 0) {
    let abono =
      `Se deja constancia de que EL CLIENTE ha realizado abonos por un valor ` +
      `pagado de ${boldFragment(formatContractUsd(input.initialPaymentUsd))} al ` +
      `momento de la firma del presente contrato. El saldo restante por valor de ` +
      `${boldFragment(formatContractUsd(input.balanceUsd))} será cancelado`;
    if (input.installments.length > 0) {
      const fechas = input.installments
        .map(
          (cuota) =>
            `${boldFragment(formatContractUsd(cuota.amountUsd))} el ` +
            `${boldFragment(formatContractDate(cuota.dueDate))}`,
        )
        .join("; ");
      abono += ` conforme al siguiente calendario de pagos: ${fechas}.`;
    } else {
      abono += " según las fechas y la forma de pago acordadas entre las partes.";
    }
    paragraphs.push(abono);
  } else {
    paragraphs.push(
      "EL CLIENTE realiza el pago de contado de la totalidad del valor del " +
        "programa, sin cuotas ni saldo pendiente.",
    );
  }

  paragraphs.push(
    "4.2. La forma de pago será la acordada entre las partes con cualquiera de " +
      "las vías que LA EMPRESA facilite para el abono de las cuotas o pago de contado.",
    "4.3. EL CLIENTE podrá solicitar la emisión de factura y la recibirá vía " +
      "correo electrónico, el cual será suministrado a LA EMPRESA.",
    "4.4. En caso de que EL CLIENTE no cumpla con el pago de la mensualidad " +
      "acordada para el servicio, se procederá a suspender el servicio de manera " +
      "total. EL CLIENTE tendrá un plazo de treinta (30) días calendario para " +
      "regularizar el pago. Si no se realiza el pago dentro de este plazo, el " +
      "servicio se cancelará automáticamente, lo que implica la terminación del contrato.",
    "4.5. Al aceptar los términos de este acuerdo, EL CLIENTE entiende que está " +
      "renunciando al derecho de reclamar cualquier reembolso de los honorarios " +
      "pagados por el acceso y el uso del Programa «Unlocked Academy» ofrecido por " +
      "LA EMPRESA por CUALQUIER RAZÓN, o reclamar una disputa/solicitar una " +
      "devolución de fondos.",
    "4.6. No serán aceptadas por LA EMPRESA solicitudes de reembolso por parte de " +
      "EL CLIENTE al inicio del programa, basadas en las siguientes razones:",
    `${CONTRACT_BULLET_PREFIX}No asistió a las clases grupales dadas por los mentores.`,
    `${CONTRACT_BULLET_PREFIX}No respondió a los comunicados enviados por diferentes ` +
      "medios como correo o WhatsApp.",
    `${CONTRACT_BULLET_PREFIX}Emergencias personales o familiares.`,
    `${CONTRACT_BULLET_PREFIX}Dificultades financieras, entre otras.`,
    "En su lugar, usted acepta que su inversión se mantendrá como un depósito no " +
      "reembolsable dentro de nuestra organización, en el que usted puede reanudar " +
      "el entrenamiento con nosotros en cualquier momento, si decide pausar su " +
      "membresía por un período de tiempo acordado, por lo que las futuras cuotas " +
      "se reanudarían en la fecha acordada anterior sin más cambios en las fechas de pago.",
    `4.7. La consultoría «Unlocked Academy» tendrá una duración inicial de ${legalDuration} ` +
      "a partir de la fecha de inicio establecida en este contrato. " +
      "Durante este período, EL CLIENTE recibirá las sesiones y el acompañamiento " +
      "correspondiente. En caso de requerir acompañamiento adicional una vez " +
      "finalizado este período, EL CLIENTE podrá solicitar información sobre los " +
      "planes de renovación disponibles.",
  );

  return paragraphs;
}

// Párrafos de la cláusula "Quinta. Honorarios" del contrato EMPRESARIAL. Igual
// que el tradicional interpola monto total, abono inicial, saldo y calendario
// de pagos, pero con el copy y la numeración (5.2–5.8) del contrato empresarial,
// incluyendo el derecho de desistimiento (5.8).
function buildBusinessPaymentParagraphs(input: ContractInput): string[] {
  const legalDuration = legalDurationMonthsLabel(input.durationMonths);
  const paragraphs: string[] = [
    `EL CLIENTE conviene cancelar de inmediato, la suma de ${formatContractUsd(
      input.totalAmountUsd,
    )} por la adquisición del programa «Unlocked Academy Empresarial». El pago ` +
      "debe realizarse en la fecha de entrada en vigor del presente acuerdo.",
  ];

  if (input.balanceUsd > 0) {
    let abono =
      `Se deja constancia de que EL CLIENTE ha realizado abonos por un valor ` +
      `pagado de ${boldFragment(formatContractUsd(input.initialPaymentUsd))} al ` +
      `momento de la firma del presente contrato. El saldo restante por valor de ` +
      `${boldFragment(formatContractUsd(input.balanceUsd))} será cancelado`;
    if (input.installments.length > 0) {
      const fechas = input.installments
        .map(
          (cuota) =>
            `${boldFragment(formatContractUsd(cuota.amountUsd))} el ` +
            `${boldFragment(formatContractDate(cuota.dueDate))}`,
        )
        .join("; ");
      abono += ` conforme al siguiente calendario de pagos: ${fechas}.`;
    } else {
      abono += " según las fechas y la forma de pago acordadas entre las partes.";
    }
    paragraphs.push(abono);
  } else {
    paragraphs.push(
      "EL CLIENTE realiza el pago de contado de la totalidad del valor del " +
        "programa, sin cuotas ni saldo pendiente.",
    );
  }

  paragraphs.push(
    "5.2. La forma de pago será la acordada entre las partes con cualquiera de " +
      "las vías que LA EMPRESA facilite para el abono de las cuotas o pago de contado.",
    "5.3. EL CLIENTE podrá solicitar la emisión de factura y la recibirá vía " +
      "correo electrónico, el cual será suministrado a LA EMPRESA.",
    "5.4. En caso de que EL CLIENTE no cumpla con el pago de la mensualidad " +
      "acordada para el servicio, se procederá a suspender el servicio de manera " +
      "total. EL CLIENTE tendrá un plazo de treinta (30) días calendario para " +
      "regularizar el pago. Si no se realiza el pago dentro de este plazo, el " +
      "servicio se cancelará automáticamente, lo que implica la terminación del contrato.",
    "5.5. Al aceptar los términos de este acuerdo, EL CLIENTE entiende que está " +
      "renunciando al derecho de reclamar cualquier reembolso de los honorarios " +
      "pagados por el acceso y el uso del Programa «Unlocked Academy» ofrecido por " +
      "LA EMPRESA por CUALQUIER RAZÓN, o reclamar una disputa/solicitar una " +
      "devolución de fondos.",
    "5.6. No serán aceptadas por LA EMPRESA solicitudes de reembolso por parte de " +
      "EL CLIENTE, a excepción de lo previsto en la cláusula 5.8, basadas en las " +
      "siguientes razones: No asistió a las clases grupales dadas por los mentores, " +
      "no respondió a los comunicados enviados por diferentes medios como correo o " +
      "WhatsApp, emergencias personales/familiares, dificultades financieras, entre " +
      "otros. En su lugar, usted acepta que su inversión se mantendrá como un " +
      "depósito no reembolsable dentro de nuestra organización, en el que usted " +
      "puede reanudar el entrenamiento con nosotros en cualquier momento, si decide " +
      "pausar su membresía por un período de tiempo acordado, por lo que las futuras " +
      "cuotas se reanudarían en la fecha acordada anterior sin más cambios en las " +
      "fechas de pago.",
    `5.7. La consultoría «Unlocked Academy» tendrá una duración inicial de ${legalDuration} ` +
      "a partir de la fecha de inicio establecida en este contrato. Durante este " +
      "período, EL CLIENTE recibirá las sesiones y el acompañamiento correspondiente. " +
      "No obstante, el compromiso de LA EMPRESA no se limitará estrictamente a este " +
      `período. En el caso de que EL CLIENTE no haya alcanzado los resultados previstos ` +
      `al término de los ${legalDuration}, LA EMPRESA continuará brindando ` +
      "acompañamiento sin costo adicional durante el tiempo de extensión que se " +
      "acuerde en ese momento, siempre y cuando EL CLIENTE demuestre un compromiso " +
      "activo y cumpla con las tareas y pautas establecidas en el programa de mentoría.",
    "5.8. Derecho de desistimiento: No obstante lo establecido en las cláusulas " +
      "anteriores, EL CLIENTE tendrá derecho a retirarse del presente contrato dentro " +
      "de los quince (15) días calendario siguientes a la fecha de su firma. En este " +
      "caso, LA EMPRESA se compromete a reembolsar el noventa y cinco por ciento (95%) " +
      "del valor pagado por EL CLIENTE. El cinco por ciento (5%) restante será retenido " +
      "para cubrir costos financieros y administrativos. El reembolso se efectuará en " +
      "un plazo no mayor a quince (15) días hábiles contados a partir de la solicitud " +
      "formal de desistimiento.",
  );

  return paragraphs;
}

// Cuerpo legal del contrato EMPRESARIAL «Unlocked Academy Empresarial».
// Reproduce el texto del PDF oficial empresarial e interpola las variables ya
// existentes (duración, montos, calendario de pagos). El resto del flujo (web,
// PDF, hash, editor) es idéntico al tradicional: solo cambia este cuerpo.
function buildBusinessSections(
  input: ContractInput,
  duration: string,
): ContractSection[] {
  return [
    {
      id: "objeto",
      heading: "Primera. Objeto del contrato",
      paragraphs: [
        "1.1. El objeto del presente contrato consta en la prestación de servicios " +
          "del Programa de Consultoría «Unlocked Academy» por parte de LA EMPRESA, " +
          "con el objetivo de ayudarle a EL CLIENTE a crear y crecer su negocio, con " +
          "todos los servicios necesarios para el correcto desempeño del mismo, a " +
          "cambio de la contraprestación por servicios descrita en este mismo acuerdo " +
          "y que ambas partes asumen en estas cláusulas.",
      ],
    },
    {
      id: "servicios",
      heading: "Segunda. Servicios que presta LA EMPRESA",
      paragraphs: [
        "2.1. El programa de consultoría «Unlocked Academy» ofrece los diferentes " +
          "módulos del programa, con todo el material necesario, tales como vídeos " +
          "explicativos, PDFs, documentación anexa, entre otros materiales de consulta " +
          "y referencia.",
        "2.2. Clases grupales.",
        `2.3. Acompañamiento durante ${duration} con posibilidad de extensión de tiempo.`,
        "2.4. Mínimo dos (02) sesiones 1 a 1 con uno de los mentores, pudiendo ser más " +
          "dependiendo de la agenda de los mentores.",
        "2.5. Acceso a un grupo exclusivo con los mentores.",
        "2.6. Acceso a un grupo de la comunidad ELITE.",
        "2.7. LA EMPRESA guiará y atenderá las necesidades del cliente durante todo el " +
          "proceso, gestionando y coordinando todos los elementos necesarios para una " +
          "correcta realización del servicio ofrecido. Prestando soporte y atención al " +
          `cliente para que puedan contactar con LA EMPRESA a través de ${COMPANY.supportEmail} ` +
          "o cualquier otro medio que se facilite a EL CLIENTE por parte de LA EMPRESA.",
        "2.8. Cooperación del cliente. LA EMPRESA hará todo lo posible para completar " +
          "el trabajo de la manera más rápida y eficiente posible, de acuerdo con los " +
          "plazos establecidos en el Plan detallado inicial. EL CLIENTE reconoce que la " +
          "capacidad de LA EMPRESA para completar el trabajo de acuerdo con los plazos " +
          "establecidos en el Programa, depende de la cooperación que él preste, " +
          "suministro de datos y contenido según sea necesario, retroalimentación y " +
          "ejecución de elementos de acción, sobre los que LA EMPRESA no tiene control. " +
          "LA EMPRESA no es responsable de los retrasos en la entrega de cualquier " +
          "trabajo de conformidad con este acuerdo causado por la falta de cooperación " +
          "o retraso del Cliente.",
        "2.9. LA EMPRESA puede, a su sola discreción, limitar, suspender o terminar su " +
          "participación en cualquiera de sus programas, en vivo, grabados, basados en " +
          "medios sociales o digitales sin reembolso o devolución de los pagos restantes " +
          "si EL CLIENTE se vuelve disruptivo o difícil de trabajar; no sigue las " +
          "directrices del programa; o, perjudica la participación de nuestros mentores " +
          "o participantes en nuestro(s) programa(s).",
      ],
    },
    {
      id: "programa-empresarial",
      heading: "Tercera. DESCRIPCIÓN DEL PROGRAMA DE TRANSFORMACIÓN EMPRESARIAL",
      paragraphs: [
        "3.1. OBJETIVO DEL PROGRAMA",
        "Desarrollar un modelo integral de eCommerce, abarcando desde los fundamentos " +
          "—como la construcción de la tienda— hasta la implementación de un sistema " +
          "escalable, rentable y sostenible en el tiempo.",
        "Esto incluye la definición y ejecución de estrategias de marketing, procesos " +
          "de escalamiento, estructuración de ticket promedio, gestión logística y " +
          "financiera, así como la integración de herramientas tecnológicas y " +
          "aplicaciones de inteligencia artificial.",
        "Adicionalmente, identificar oportunidades de crecimiento mediante la creación " +
          "de alianzas estratégicas que permitan la expansión del negocio a nivel " +
          "nacional e internacional, incluyendo procesos de exportación e importación.",
        "3.2. EQUIPO CONSULTOR",
        "EL CLIENTE contará con acceso directo al equipo de mentores de Unlocked " +
          "Academy, liderado por José David Naicipa y Juan Sebastián Naicipa, quienes " +
          "aportan experiencia especializada en el desarrollo, estructuración y " +
          "escalamiento de negocios digitales.",
        `${CONTRACT_BULLET_PREFIX}José David Naicipa: Especialista en estructura ` +
          "organizacional, planificación financiera y optimización de sistemas " +
          "operativos enfocados en crecimiento empresarial sostenible.",
        `${CONTRACT_BULLET_PREFIX}Juan Sebastián Naicipa: Experto en desarrollo de marca, ` +
          "posicionamiento estratégico y marketing avanzado aplicado a e-commerce y " +
          "negocios digitales escalables.",
        `3.3. ALCANCE Y DURACIÓN`,
        `El programa tiene una duración de ${duration} e incluye:`,
        `${CONTRACT_BULLET_PREFIX}Sesiones estratégicas semanales personalizadas uno a uno.`,
        `${CONTRACT_BULLET_PREFIX}Acceso a Telegram personal para consultas urgentes.`,
        `${CONTRACT_BULLET_PREFIX}Revisión mensual de KPIs y ajuste de estrategia.`,
        `${CONTRACT_BULLET_PREFIX}Desarrollo de plan maestro de marca.`,
        "BENEFICIOS PRINCIPALES. LA EMPRESA se compromete a proporcionar:",
        `${CONTRACT_BULLET_PREFIX}Mentoría 3:1 personalizada con tres expertos.`,
        `${CONTRACT_BULLET_PREFIX}Estrategia de marca propia y diferenciación en el mercado.`,
        `${CONTRACT_BULLET_PREFIX}Sistemas y procesos para escalar operaciones.`,
        `${CONTRACT_BULLET_PREFIX}Estructura organizacional y plan de contratación.`,
        `${CONTRACT_BULLET_PREFIX}Optimización fiscal y estructura legal empresarial.`,
        `${CONTRACT_BULLET_PREFIX}Acceso a red de contactos profesionales.`,
        "3.4. ELEMENTOS ADICIONALES INCLUIDOS. Como parte integral del programa, EL " +
          "CLIENTE recibirá:",
        `${CONTRACT_BULLET_PREFIX}Auditoría completa de operaciones actuales.`,
        `${CONTRACT_BULLET_PREFIX}Templates de procesos y SOPs.`,
        `${CONTRACT_BULLET_PREFIX}Framework de contratación y estructura organizacional.`,
        `${CONTRACT_BULLET_PREFIX}Plan de expansión internacional a nivel latinoamérica, ` +
          "USA, UE y China.",
        `${CONTRACT_BULLET_PREFIX}Acceso a red de proveedores premium.`,
        "3.5. METODOLOGÍA DE TRABAJO. El programa se desarrollará siguiendo las " +
          "siguientes fases:",
        `${CONTRACT_BULLET_PREFIX}Diagnóstico inicial profundo.`,
        `${CONTRACT_BULLET_PREFIX}Desarrollo de plan estratégico.`,
        `${CONTRACT_BULLET_PREFIX}Implementación de sistemas y procesos.`,
        `${CONTRACT_BULLET_PREFIX}Desarrollo de marca y diferenciación.`,
        `${CONTRACT_BULLET_PREFIX}Escalamiento y optimización.`,
      ],
    },
    {
      id: "vigencia",
      heading: "Cuarta. Sesiones y vigencia del contrato",
      paragraphs: [
        "4.1. LA EMPRESA prestará sus servicios mientras EL CLIENTE mantenga al día el " +
          "pago de las cuotas correspondientes y permanezca activo en la mentoría. En " +
          "caso de no cumplir con estos requisitos, la prestación del servicio se " +
          "suspenderá, salvo acuerdo mutuo entre las partes.",
        "4.2. El comienzo de los servicios vendrá estipulado de mutuo acuerdo en el " +
          "momento de la fecha en la que se firme este contrato, excepto que se " +
          "estipule fehacientemente otra fecha de inicio.",
        "4.3. De manera excepcional se podrá dar por finalizado el servicio de mutuo " +
          "acuerdo entre LA EMPRESA y EL CLIENTE, sin que represente algún importe o " +
          "concepto alguno para cada una de las partes.",
      ],
    },
    {
      id: "honorarios",
      heading: "Quinta. Honorarios",
      paragraphs: [
        "5.1. Se establece la siguiente forma de pago:",
        ...buildBusinessPaymentParagraphs(input),
      ],
    },
    {
      id: "obligaciones",
      heading: "Sexta. Obligaciones de las partes",
      paragraphs: [
        "6.1. LA EMPRESA: Se compromete a prestar los servicios del Programa de " +
          "Consultoría «Unlocked Academy» con el objetivo de ayudar a crecer el negocio " +
          "de EL CLIENTE y a ejercer las comunicaciones e indicaciones necesarias para " +
          "que EL CLIENTE quede satisfecho con el servicio recibido. Le proporcionará " +
          "respuestas a través del grupo privado de Telegram y responderá de manera " +
          "oportuna. Ejecutará y supervisará las acciones establecidas en el programa de " +
          "la mano con EL CLIENTE, ayudándole a desbloquear grandes ideas y a dar " +
          "órdenes de marcha claras para ejecutarlas. Brindará soporte y respuesta " +
          "oportuna a las preguntas y dudas de EL CLIENTE, a través de la comunidad " +
          "privada y la participación en el grupo de comunidad del programa. Dará acceso " +
          "a la comunidad «Unlocked Academy», a la comunidad VIP y al grupo privado con " +
          "los mentores del Unlocked Academy.",
        "6.2. EL CLIENTE: Se compromete a trabajar en la manera pactada y a seguir " +
          "todas las indicaciones acordadas y comunicadas por parte de LA EMPRESA. Se " +
          "compromete a abonar el pago de los servicios estipulados en la cláusula " +
          "cuarta (Honorarios), en la forma y lugar que se determinen a LA EMPRESA. " +
          "Comprende que, si no cumple con las cuotas de pago correspondientes, perderá " +
          "el acceso al coaching, así como a la comunidad. Será rápido y eficiente para " +
          "tomar las acciones acordadas y ejecutar el plan trazado, rápido para pedir " +
          "ayuda cuando esté atascado, compartirá sus conocimientos y victorias con el " +
          "grupo. Entiende que lo que se dice y se enseña en los diferentes grupos de " +
          "coaches, infoproductores y agencias se queda en los grupos. Esto significa " +
          "no compartir sus credenciales de acceso con personas que no sean miembros y " +
          "mantener la confidencialidad de toda la información sensible que se discuta. " +
          "Proporcionará un testimonio honesto en cuanto al resultado del Programa. " +
          "Entiende que, en caso de dudas, las llevará a discusión en los encuentros de " +
          "mentoría, para garantizar que el mentor pueda brindar una respuesta con el " +
          "más alto nivel de atención y servicio. Se compromete a asistir a las sesiones " +
          "programadas, a la hora acordada. Entiende que las reprogramaciones retrasan y " +
          "ponen en riesgo la meta de alcanzar los resultados de la promesa.",
        "6.3. Ambas partes se comprometen a las obligaciones contraídas en este " +
          "contrato y a resarcir, en caso de incumplimiento de cualquier cláusula, los " +
          "gastos ocasionados, las penalizaciones y recargos que hayan podido nacer " +
          "fruto de la infracción de alguna de las cláusulas del acuerdo.",
      ],
    },
    {
      id: "confidencialidad",
      heading: "Séptima. Confidencialidad",
      paragraphs: [
        "7.1. Tendrá la consideración de «información confidencial», sin limitación de " +
          "tiempo, cualquier información o dato, que como consecuencia de la prestación " +
          "de los servicios objeto de este contrato, circule o se revele durante el " +
          "transcurso del mismo, ya sea relativo a EL CLIENTE o a su entorno, a LA " +
          "EMPRESA, al desempeño del servicio, o a asuntos personales revelados de forma " +
          "escrita u oral, o de cualquier otro modo, entre las partes.",
        "7.2. Ambas partes se comprometen a que el desarrollo del contrato se rija bajo " +
          "una absoluta confidencialidad, respetando el secreto profesional. En caso de " +
          "que EL CLIENTE utilice información confidencial para adjudicar hechos y " +
          "conductas que ponen en duda el proceder de la compañía o sus representantes, " +
          "su diligencia profesional y la veracidad de la información transmitida a " +
          "clientes y terceros (difamación), sin importar el canal o medio de la " +
          "divulgación del contenido (redes sociales, páginas web, medios impresos, " +
          "entre otros), LA EMPRESA accionará las medidas necesarias por los medios " +
          "legales que correspondan y exigirá una indemnización por la suma de cincuenta " +
          "mil dólares americanos (50.000,00 USD), por daños y perjuicios que pudieran " +
          "generarse.",
        "7.3. No se entenderá información confidencial aquella que sea divulgada por " +
          "acuerdo entre ambas partes, aquella que se convierta en pública por igual " +
          "motivo o aquella que haya de ser revelada de acuerdo con las leyes o con una " +
          "resolución judicial de autoridad competente y aquella que sea obtenida por un " +
          "tercero que no se encuentre bajo la obligación de confidencialidad alguna.",
        "7.4. EL CLIENTE se obliga a mantener la confidencialidad de los secretos " +
          "comerciales y la información privada relacionada a los servicios adquiridos. " +
          "Se le concede un derecho limitado, no exclusivo, intransferible y no " +
          "sublicenciable, para entrar, acceder y utilizar el servicio exclusivamente " +
          "para uso individual. Todos los derechos que no se le conceden expresamente en " +
          "este contrato de servicio, están reservados por LA EMPRESA, según corresponda. " +
          "EL CLIENTE acepta que este permiso es para uso personal, no comercial y no " +
          "podrá ceder en forma total o parcial el uso del servicio.",
      ],
    },
    {
      id: "propiedad-intelectual",
      heading: "Octava. Propiedad intelectual",
      paragraphs: [
        "8.1. EL CLIENTE manifiesta su conformidad de que cualquier material aportado " +
          "por LA EMPRESA, en cualquiera de las formas de entrega (webinar, plataforma, " +
          "eventos presenciales, redes sociales, entre otros) no podrá copiarlo, " +
          "reproducirlo, distribuirlo, publicarlo, modelarlo ni venderlo, en todo o en " +
          "parte o utilizado al margen de la relación de Programa de Consultoría, sin el " +
          "consentimiento explícito de LA EMPRESA, quién a su vez también observará " +
          "idéntico comportamiento respecto a cualquier material aportado por EL CLIENTE.",
        "8.2. Todos los contenidos que EL CLIENTE obtiene con base a la prestación del " +
          "servicio de Programa de Consultoría que LA EMPRESA le brinda únicamente al " +
          "propio cliente, son propiedad de la misma, por la cual se otorga una licencia " +
          "de uso revocable e intransferible para su uso personal y no comercial que se " +
          "limita a su uso personal y profesional personalísimo. Cualquier acción no " +
          "autorizada por LA EMPRESA al margen del uso personal del contenido " +
          "proporcionado se considerará una violación de los derechos de LA EMPRESA y " +
          "podrán ser objeto de sanciones en virtud de las Leyes sobre Propiedad " +
          "Intelectual.",
        "8.3. LA EMPRESA, finalizado el periodo de formación, retirará los accesos que " +
          "le hayan sido concedidos a EL CLIENTE a las plataformas y herramientas " +
          "digitales para el desarrollo de sus funciones (Grupo Personal, y todo lo que " +
          "tenga que ver con acompañamiento 1 a 1). Solo quedará habilitada la " +
          "plataforma de Unlocked Academy y el acceso al grupo de la comunidad.",
      ],
    },
    {
      id: "proteccion-datos",
      heading: "Novena. Protección de datos personales",
      paragraphs: [
        "9.1. Los datos recabados en el proceso de contratación del servicio del " +
          "Programa de Consultoría «Unlocked Academy» y aquellos que sean necesarios " +
          "para el uso de los medios y contenidos, serán tratados por LA EMPRESA con el " +
          "fin de gestionar de la mejor forma el servicio contratado.",
        "9.2. LA EMPRESA podrá enviar al cliente a través del correo electrónico " +
          "facilitado por el mismo, información comercial propia o de terceros " +
          "relacionados con los servicios de LA EMPRESA pudiendo EL CLIENTE negarse al " +
          "mismo en cualquier momento solicitando su desistimiento a través de un correo " +
          "electrónico o a través del procedimiento de baja en las comunicaciones " +
          "comerciales que se insertan en cada correo electrónico que envía LA EMPRESA. " +
          "Además, el cliente podrá contactarse a través de WhatsApp o mensaje de texto.",
        "9.3. La base legal para el tratamiento de los datos del cliente es tanto la " +
          "ejecución de las presentes Condiciones contractuales, así como la " +
          "satisfacción del interés legítimo del responsable en fidelizar al cliente. " +
          "Sus datos serán conservados mientras permanezca vigente la relación " +
          "contractual y durante los plazos de prescripción de responsabilidades legales.",
        "9.4. En caso de que el cliente se incorpore a los grupos de Facebook (o " +
          "cualquier otra red social o similar que se utilice en el servicio del " +
          "Programa de Consultoría «Unlocked Academy») autoriza a que sus datos " +
          "personales sean utilizados en estas plataformas para la gestión de las " +
          "páginas o perfiles del Programa de Consultoría «Unlocked Academy» y de las " +
          "comunicaciones que se mantengan de forma bidireccional con los miembros de " +
          "los grupos a través del chat, mensajes u otros medios de comunicación que " +
          "permita cada plataforma. No obstante, ese tratamiento estará sujeto a las " +
          "políticas de privacidad de estas plataformas. EL CLIENTE al hacerse miembro " +
          "del grupo será visible para LA EMPRESA, la cual tendrá acceso al listado de " +
          "miembros o seguidores que se han unido al grupo. En todo caso, es " +
          "responsabilidad del cliente el uso que haga de las plataformas.",
        "9.5. LA EMPRESA no utilizará los datos personales de EL CLIENTE para " +
          "finalidades diferentes a las señaladas en las cláusulas anteriores.",
        "9.6. EL CLIENTE garantiza que los datos personales facilitados a LA EMPRESA " +
          "son veraces y están actualizados, y se hace responsable de comunicar " +
          "cualquier modificación de los mismos, siendo EL CLIENTE el único responsable " +
          "de la inexactitud o falsedad de los datos facilitados y de los perjuicios que " +
          "pueda causar por ello a LA EMPRESA o a terceros con motivo de la utilización " +
          "de los servicios ofrecidos por LA EMPRESA. Asimismo, LA EMPRESA manifiesta " +
          "que los datos recabados son adecuados, pertinentes y no excesivos en relación " +
          "con el ámbito, las finalidades y los servicios determinados.",
        "9.7. EL CLIENTE acepta que sus datos podrán ser cedidos al método de pago que " +
          "use para la contratación del servicio del Programa de Consultoría «Unlocked " +
          "Academy», sea Stripe, PayPal, entre otros wallets de plataformas.",
        "9.8. La cuenta asignada a EL CLIENTE es de uso personal y confidencial. EL " +
          "CLIENTE declara que no permitirá que otras personas utilicen la información " +
          "de Registro y/o la Cuenta y acepta que es el único responsable de mantener la " +
          "confidencialidad y seguridad de los mismos. EL CLIENTE conviene notificar " +
          "inmediatamente a la Compañía cualquier uso no autorizado de su contraseña y/o " +
          "Cuenta.",
      ],
    },
    {
      id: "cesion-imagen",
      heading: "Décima. Cesión de imagen",
      paragraphs: [
        "10.1. EL CLIENTE autoriza a LA EMPRESA a utilizar sus imágenes, fotografías, " +
          "videos, material gráfico o cualquier otro material audiovisual, con la única " +
          "finalidad de presentar su testimonio como caso de éxito del programa, con un " +
          "uso exclusivo de carácter profesional para los fines empresariales, " +
          "formativos y de comercialización desarrollados por LA EMPRESA. LA EMPRESA " +
          "tiene el derecho de utilizar las imágenes para el uso concedido, siempre con " +
          "la obligación de respetar el derecho al honor de EL CLIENTE.",
        "10.2. EL CLIENTE tiene derecho a que su utilización se limite a aquellas " +
          "aplicaciones que no atenten contra el derecho al honor en los términos " +
          "previstos en la Ley Orgánica 1/85, de 5 de mayo, de Protección Civil al " +
          "Derecho al Honor, la Intimidad Personal y familiar y a la Propia Imagen y " +
          "demás legislación vigente a nivel internacional. EL CLIENTE no recibirá " +
          "ningún pago por la cesión de los derechos de imagen, y ésta queda otorgada a " +
          "título gratuito.",
      ],
    },
    {
      id: "personalidad",
      heading: "Décima Primera. Personalidad del contrato",
      paragraphs: [
        "11.1. El presente contrato tiene carácter personal y no será transferido a " +
          "una tercera parte de modo parcial o en su conjunto, por ninguna de las " +
          "partes, sin el consentimiento expreso por escrito de la otra parte.",
      ],
    },
    {
      id: "jurisdiccion",
      heading: "Décima Segunda. Legislación aplicable y jurisdicción",
      paragraphs: [
        "12.1. El presente contrato se considera realizado en los Estados Unidos de " +
          "América y se rige en su totalidad por la legislación americana, en concreto " +
          "al Estado de Florida y a su legislación.",
        "12.2. Las partes se someterán en cuanto al cumplimiento y litigios derivados " +
          "del contrato a los juzgados y tribunales correspondientes al Estado de " +
          "Florida, EE. UU.",
      ],
    },
    {
      id: "varios",
      heading: "Décima Tercera. Varios",
      paragraphs: [
        "13.1. Modificación. LA EMPRESA se reserva el derecho, a su entera discreción, " +
          "de modificar el contenido del Programa, o de generar una publicación de una " +
          "versión actualizada del mismo.",
        "13.2. No solicitud. Durante la vigencia del presente Contrato y durante un " +
          "período de doce (12) meses después de la fecha de terminación del mismo, EL " +
          "CLIENTE no podrá sin autorización de LA EMPRESA, de ninguna manera, directa " +
          "o indirectamente (i) inducir o intentar inducir a ningún empleado, " +
          "contratista independiente, agente, consultor o cliente a culminar o " +
          "interrumpir su relación con LA EMPRESA; (ii) interferir o perturbar de " +
          "cualquier otra manera la relación de LA EMPRESA con sus empleados, " +
          "contratistas independientes, agentes, consultores y/o clientes; (iii) " +
          "solicitar, atraer o contratar a cualquier empleado, contratista " +
          "independiente, agente, consultor, cliente o cliente de LA EMPRESA; o (iv) " +
          "contratar a cualquier empleado, contratista independiente, agente, consultor, " +
          "o cliente de LA EMPRESA o a cualquier antiguo empleado, contratista " +
          "independiente, agente, consultor o cliente, cuyo trabajo o acuerdo con LA " +
          "EMPRESA haya cesado menos de un (1) año antes de la fecha de dicha " +
          "contratación o compromiso. EL CLIENTE reconoce que cualquier intento de su " +
          "parte de inducir a otros a abandonar LA EMPRESA, o cualquier esfuerzo de " +
          "interferir en la relación de LA EMPRESA con sus empleados, contratistas " +
          "independientes, agentes, consultores o clientes sería perjudicial y dañino " +
          "para LA EMPRESA. (v) EL CLIENTE no podrá contactar por ningún medio a " +
          "empleados, contratistas independientes, agentes, consultores o clientes de LA " +
          "EMPRESA, para promover ofrecimientos o ventas de productos o servicios propios.",
      ],
    },
    {
      id: "anexos",
      heading: "Décima Cuarta. Anexos",
      paragraphs: [
        "14.1. Anexo I: Metodología de la Consultoría. La metodología de la consultoría " +
          "«Unlocked Academy» se detalla en un documento anexo que se entrega junto con " +
          "este contrato. EL CLIENTE declara haber recibido, leído y comprendido el " +
          "documento anexo de la metodología de la consultoría, y se compromete a seguir " +
          "los lineamientos y estrategias allí descritos.",
        "Para que así conste a los efectos oportunos, se firma por duplicado por ambas " +
          "partes en la fecha fijada, de tal forma que se confiere validez al contrato y " +
          "a todas sus cláusulas previamente expuestas.",
      ],
    },
  ];
}

// Construye el bloque de liquidación del upgrade de nivel. Devuelve null para
// un contrato normal (sin input.upgrade). Los montos van resaltados en negrita
// con los mismos marcadores que el resto del contrato; el cronograma reutiliza
// las cuotas del input (montos y vencimientos) para que web, PDF y hash muestren
// exactamente la misma información.
function buildUpgradeSection(input: ContractInput): ContractSection | null {
  const up = input.upgrade;
  if (!up) return null;

  const level =
    typeof up.programLevelSnapshot === "number" &&
    Number.isFinite(up.programLevelSnapshot)
      ? up.programLevelSnapshot
      : null;

  const intro =
    level != null
      ? `Esta inscripción corresponde a un upgrade al nivel ${level} del ` +
        "programa «Unlocked Academy». A continuación se detalla la liquidación " +
        "del upgrade:"
      : "Esta inscripción corresponde a un upgrade de nivel del programa " +
        "«Unlocked Academy». A continuación se detalla la liquidación del upgrade:";

  const paragraphs: string[] = [
    intro,
    `${CONTRACT_BULLET_PREFIX}Valor bruto del nuevo nivel: ${boldFragment(
      formatContractUsd(up.grossProgramPriceUsd),
    )}.`,
    `${CONTRACT_BULLET_PREFIX}Crédito aplicado por pagos anteriores: ${boldFragment(
      formatContractUsd(up.upgradeCreditUsd),
    )}.`,
    `${CONTRACT_BULLET_PREFIX}Valor neto a pagar: ${boldFragment(
      formatContractUsd(up.netAmountUsd),
    )}.`,
  ];

  if (input.installments.length > 0) {
    const count = input.installments.length;
    const fechas = input.installments
      .map(
        (cuota) =>
          `${boldFragment(formatContractUsd(cuota.amountUsd))} el ` +
          `${boldFragment(formatContractDate(cuota.dueDate))}`,
      )
      .join("; ");
    paragraphs.push(
      `El valor neto se cancelará en ${count} ${
        count === 1 ? "cuota" : "cuotas"
      } conforme al siguiente cronograma: ${fechas}.`,
    );
  } else if (input.balanceUsd > 0) {
    paragraphs.push(
      "El valor neto se cancelará según las fechas y la forma de pago " +
        "acordadas entre las partes.",
    );
  } else {
    paragraphs.push(
      "El valor neto quedó cubierto en su totalidad; no hay cuotas pendientes.",
    );
  }

  return {
    id: "upgrade",
    heading: "Detalle del upgrade de nivel",
    paragraphs,
  };
}

export function buildContractView(input: ContractInput): ContractView {
  const templateKind = normalizeContractTemplateKind(input.templateKind);
  const isBusiness = templateKind === "BUSINESS";
  const parties = segmentsToText(buildPartiesSegments(input));
  const duration = durationMonthsLabel(input.durationMonths);

  const exponen =
    `${input.clientName} (en adelante EL CLIENTE) está interesado en la ` +
    `contratación de los servicios del Programa de Consultoría «Unlocked Academy» ` +
    `ofrecido por ${COMPANY.legalName} (en adelante LA EMPRESA). Así mismo, ` +
    "declara que ha leído con antelación y detenimiento este acuerdo, lo entiende, " +
    "lo acepta y se compromete a cumplir sus términos. Ambas partes se reconocen " +
    "capacidad suficiente para formalizar el presente acuerdo con base en las " +
    "siguientes cláusulas.";

  const defaultSections: ContractSection[] = [
    {
      id: "objeto",
      heading: "Primera. Objeto del contrato",
      paragraphs: [
        "1.1. El objeto del presente contrato consta en la prestación de servicios " +
          "del Programa de Consultoría «Unlocked Academy» por parte de LA EMPRESA, " +
          "con el objetivo de ayudarle a EL CLIENTE a crear y crecer su negocio de " +
          "Ecommerce ya sea en la modalidad de dropshipping o marca propia, con " +
          "todos los servicios necesarios para el correcto desempeño del mismo, a " +
          "cambio de la contraprestación por servicios descrita en este mismo " +
          "acuerdo y que ambas partes asumen en estas cláusulas.",
      ],
    },
    {
      id: "servicios",
      heading: "Segunda. Servicios que presta LA EMPRESA",
      paragraphs: [
        "2.1. El programa de consultoría «Unlocked Academy» ofrece los diferentes " +
          "módulos del programa, con todo el material necesario, tales como vídeos " +
          "explicativos, PDFs, documentación anexa, entre otros materiales de " +
          "consulta y referencia.",
        "2.2. Ingreso a la plataforma Unlocked Academy (Programa pregrabado).",
        "2.3. Clases grupales.",
        `2.4. Acompañamiento durante ${duration}.`,
        "2.5. Mínimo dos (02) sesiones 1 a 1 en la semana con uno de los mentores, " +
          "pudiendo ser más dependiendo de la agenda de los mentores.",
        "2.6. Acceso a un grupo exclusivo con los mentores.",
        "2.7. Acceso a un grupo de la comunidad ELITE.",
        "2.8. LA EMPRESA guiará y atenderá las necesidades del cliente durante todo " +
          "el proceso, gestionando y coordinando todos los elementos necesarios " +
          "para una correcta realización del servicio ofrecido. Prestando soporte y " +
          `atención al cliente para que puedan contactar con LA EMPRESA a través de ` +
          `${COMPANY.supportEmail} o cualquier otro medio que se facilite a EL ` +
          "CLIENTE por parte de LA EMPRESA.",
        "2.9. Cooperación del cliente. LA EMPRESA hará todo lo posible para " +
          "completar el trabajo de la manera más rápida y eficiente posible, de " +
          "acuerdo con los plazos establecidos en el Plan detallado inicial. EL " +
          "CLIENTE reconoce que la capacidad de LA EMPRESA para completar el trabajo " +
          "de acuerdo con los plazos establecidos en el Programa, depende de la " +
          "cooperación que él preste, suministro de datos y contenido según sea " +
          "necesario, retroalimentación y ejecución de elementos de acción, sobre " +
          "los que LA EMPRESA no tiene control. LA EMPRESA no es responsable de los " +
          "retrasos en la entrega de cualquier trabajo de conformidad con este " +
          "acuerdo causado por la falta de cooperación o retraso del Cliente.",
        "2.10. LA EMPRESA puede, a su sola discreción, limitar, suspender o terminar " +
          "la participación de EL CLIENTE en cualquiera de sus programas, en vivo, " +
          "grabados, basados en medios sociales o digitales, sin reembolso o " +
          "devolución de los pagos realizados o pendientes, si EL CLIENTE se vuelve " +
          "disruptivo o difícil de trabajar; no sigue las directrices del programa; " +
          "perjudica la participación de nuestros mentores o participantes en " +
          "nuestro(s) programa(s); incumple cualquiera de las obligaciones " +
          "establecidas en el presente contrato; o realiza conductas que vayan en " +
          "contra de los intereses de LA EMPRESA.",
        "Asimismo, EL CLIENTE reconoce y acepta que la permanencia en la comunidad " +
          "oficial de Unlocked Academy dentro de la plataforma Dropi constituye un " +
          "requisito para disfrutar de los beneficios complementarios del programa. " +
          "En caso de que EL CLIENTE decida abandonar dicha comunidad, vincularse " +
          "activamente a otra comunidad de mentoría, acompañamiento o formación " +
          "dentro de la plataforma Dropi que resulte incompatible con los " +
          "lineamientos de Unlocked Academy, o solicite su traslado a otra " +
          "comunidad, LA EMPRESA podrá suspender o revocar inmediatamente el acceso " +
          "a los grupos privados, sesiones de acompañamiento, mentorías, soporte " +
          "personalizado, eventos exclusivos y demás beneficios adicionales " +
          "asociados al programa, sin que ello genere derecho a reembolso, " +
          "compensación o indemnización alguna.",
        "2.11. Implementación inicial del negocio: LA EMPRESA podrá, como parte del " +
          "proceso de acompañamiento, realizar la estructuración inicial del negocio " +
          "digital del CLIENTE, la cual podrá incluir exclusivamente:",
        `${CONTRACT_BULLET_PREFIX}Creación y configuración de una tienda online con ` +
          "página principal (homepage).",
        `${CONTRACT_BULLET_PREFIX}Implementación y configuración de un (1) producto inicial.`,
        `${CONTRACT_BULLET_PREFIX}Desarrollo de hasta tres (3) piezas creativas publicitarias.`,
        `${CONTRACT_BULLET_PREFIX}Creación de una (1) página de aterrizaje (landing page).`,
        `${CONTRACT_BULLET_PREFIX}Configuración de las aplicaciones necesarias para la ` +
          "operación inicial de la tienda, incluyendo plataformas como Dropify, " +
          "Judge.me y Releasit, o sus equivalentes.",
        "LA EMPRESA no realizará la creación, configuración, vinculación, " +
          "administración ni solución de incidencias relacionadas con cuentas " +
          "publicitarias, píxeles, catálogos, perfiles comerciales o campañas en " +
          "plataformas de terceros, incluyendo, pero sin limitarse a, Meta " +
          "(Facebook e Instagram) y TikTok. Dichas actividades serán responsabilidad " +
          "exclusiva del CLIENTE. Este servicio se entrega con fines de validación " +
          "inicial del modelo de negocio y no garantiza resultados económicos específicos.",
      ],
    },
    {
      id: "vigencia",
      heading: "Tercera. Sesiones y vigencia del contrato",
      paragraphs: [
        "3.1. LA EMPRESA prestará sus servicios mientras EL CLIENTE mantenga al día " +
          "el pago de las cuotas correspondientes y permanezca activo en la " +
          "mentoría. En caso de no cumplir con estos requisitos, la prestación del " +
          "servicio se suspenderá, salvo acuerdo mutuo entre las partes.",
        "3.2. El comienzo de los servicios vendrá estipulado de mutuo acuerdo en el " +
          "momento de la fecha en la que se firme este contrato, excepto que se " +
          "estipule fehacientemente otra fecha de inicio.",
        "3.3. De manera excepcional se podrá dar por finalizado el servicio de mutuo " +
          "acuerdo entre LA EMPRESA y EL CLIENTE, sin que represente algún importe o " +
          "concepto alguno para cada una de las partes.",
      ],
    },
    {
      id: "honorarios",
      heading: "Cuarta. Honorarios",
      paragraphs: ["4.1. Se establece la siguiente forma de pago:", ...buildPaymentParagraphs(input)],
    },
    {
      id: "obligaciones",
      heading: "Quinta. Obligaciones de las partes",
      paragraphs: [
        "5.1. LA EMPRESA: Se compromete a prestar los servicios del Programa de " +
          "Consultoría «Unlocked Academy» con el objetivo de ayudar a crecer el " +
          "negocio de EL CLIENTE y a ejercer las comunicaciones e indicaciones " +
          "necesarias para que EL CLIENTE quede satisfecho con el servicio recibido. " +
          "Le proporcionará respuestas a través del grupo privado de WhatsApp y " +
          "responderá de manera oportuna. Ejecutará y supervisará las acciones " +
          "establecidas en el programa de la mano con EL CLIENTE, ayudándole a " +
          "desbloquear grandes ideas y a dar órdenes de marcha claras para " +
          "ejecutarlas. Brindará soporte y respuesta oportuna a las preguntas y " +
          "dudas de EL CLIENTE, a través de la comunidad privada y la participación " +
          "en el grupo de comunidad del programa. Dará acceso a la comunidad " +
          "«Unlocked Academy», a la comunidad VIP y al grupo privado con los mentores " +
          "del Unlocked Academy.",
        "5.2. EL CLIENTE: Se compromete a trabajar en la manera pactada y a seguir " +
          "todas las indicaciones acordadas y comunicadas por parte de LA EMPRESA. " +
          "Se compromete a abonar el pago de los servicios estipulados en la " +
          "cláusula cuarta (Honorarios), en la forma y lugar que se determinen a LA " +
          "EMPRESA. Comprende que, si no cumple con las cuotas de pago " +
          "correspondientes, perderá el acceso al coaching, así como a la comunidad. " +
          "Será rápido y eficiente para tomar las acciones acordadas y ejecutar el " +
          "plan trazado, rápido para pedir ayuda cuando esté atascado, compartirá " +
          "sus conocimientos y victorias con el grupo. Entiende que lo que se dice y " +
          "se enseña en los diferentes grupos de coaches, infoproductores y agencias " +
          "se queda en los grupos. Esto significa no compartir sus credenciales de " +
          "acceso con personas que no sean miembros y mantener la confidencialidad " +
          "de toda la información sensible que se discuta. Proporcionará un " +
          "testimonio honesto en cuanto al resultado del Programa. Entiende que, en " +
          "caso de dudas, las llevará a discusión en los encuentros de mentoría, " +
          "para garantizar que el mentor pueda brindar una respuesta con el más alto " +
          "nivel de atención y servicio. Se compromete a asistir a las sesiones " +
          "programadas, a la hora acordada. Entiende que las reprogramaciones " +
          "retrasan y ponen en riesgo la meta de alcanzar los resultados de la promesa.",
        "5.3. Ambas partes se comprometen a las obligaciones contraídas en este " +
          "contrato y a resarcir, en caso de incumplimiento de cualquier cláusula, " +
          "los gastos ocasionados, las penalizaciones y recargos que hayan podido " +
          "nacer fruto de la infracción de alguna de las cláusulas del acuerdo.",
      ],
    },
    {
      id: "confidencialidad",
      heading: "Sexta. Confidencialidad",
      paragraphs: [
        "6.1. Tendrá la consideración de «información confidencial», sin limitación " +
          "de tiempo, cualquier información o dato, que como consecuencia de la " +
          "prestación de los servicios objeto de este contrato, circule o se revele " +
          "durante el transcurso del mismo, ya sea relativo a EL CLIENTE o a su " +
          "entorno, a LA EMPRESA, al desempeño del servicio, o a asuntos personales " +
          "revelados de forma escrita u oral, o de cualquier otro modo, entre las partes.",
        "6.2. Ambas partes se comprometen a que el desarrollo del contrato se rija " +
          "bajo una absoluta confidencialidad, respetando el secreto profesional. En " +
          "caso de que EL CLIENTE utilice información confidencial para adjudicar " +
          "hechos y conductas que ponen en duda el proceder de la compañía o sus " +
          "representantes, su diligencia profesional y la veracidad de la " +
          "información transmitida a clientes y terceros (difamación), sin importar " +
          "el canal o medio de la divulgación del contenido (redes sociales, páginas " +
          "web, medios impresos, entre otros), LA EMPRESA accionará las medidas " +
          "necesarias por los medios legales que correspondan y exigirá una " +
          "indemnización por la suma de cincuenta mil dólares americanos " +
          "(50.000,00 USD), por daños y perjuicios que pudieran generarse.",
        "6.3. No se entenderá información confidencial aquella que sea divulgada por " +
          "acuerdo entre ambas partes, aquella que se convierta en pública por igual " +
          "motivo o aquella que haya de ser revelada de acuerdo con las leyes o con " +
          "una resolución judicial de autoridad competente y aquella que sea " +
          "obtenida por un tercero que no se encuentre bajo la obligación de " +
          "confidencialidad alguna.",
        "6.4. EL CLIENTE se obliga a mantener la confidencialidad de los secretos " +
          "comerciales y la información privada relacionada a los servicios " +
          "adquiridos. Se le concede un derecho limitado, no exclusivo, " +
          "intransferible y no sublicenciable, para entrar, acceder y utilizar el " +
          "servicio exclusivamente para uso individual. Todos los derechos que no se " +
          "le conceden expresamente en este contrato de servicio, están reservados " +
          "por LA EMPRESA, según corresponda. EL CLIENTE acepta que este permiso es " +
          "para uso personal, no comercial y no podrá ceder en forma total o parcial " +
          "el uso del servicio.",
      ],
    },
    {
      id: "propiedad-intelectual",
      heading: "Séptima. Propiedad intelectual",
      paragraphs: [
        "7.1. EL CLIENTE manifiesta su conformidad de que cualquier material " +
          "aportado por LA EMPRESA, en cualquiera de las formas de entrega (webinar, " +
          "plataforma, eventos presenciales, redes sociales, entre otros) no podrá " +
          "copiarlo, reproducirlo, distribuirlo, publicarlo, modelarlo ni venderlo, " +
          "en todo o en parte o utilizado al margen de la relación de Programa de " +
          "Consultoría, sin el consentimiento explícito de LA EMPRESA, quién a su " +
          "vez también observará idéntico comportamiento respecto a cualquier " +
          "material aportado por EL CLIENTE.",
        "7.2. Todos los contenidos que EL CLIENTE obtiene con base a la prestación " +
          "del servicio de Programa de Consultoría que LA EMPRESA le brinda " +
          "únicamente al propio cliente, son propiedad de la misma, por la cual se " +
          "otorga una licencia de uso revocable e intransferible para su uso " +
          "personal y no comercial que se limita a su uso personal y profesional " +
          "personalísimo. Cualquier acción no autorizada por LA EMPRESA al margen " +
          "del uso personal del contenido proporcionado se considerará una violación " +
          "de los derechos de LA EMPRESA y podrán ser objeto de sanciones en virtud " +
          "de las Leyes sobre Propiedad Intelectual.",
        "7.3. LA EMPRESA, finalizado el periodo de formación, retirará los accesos " +
          "que le hayan sido concedidos a EL CLIENTE a las plataformas y " +
          "herramientas digitales para el desarrollo de sus funciones (Grupo " +
          "Personal, y todo lo que tenga que ver con acompañamiento 1 a 1). Solo " +
          "quedará habilitada la plataforma de Unlocked Academy y el acceso al grupo " +
          "de la comunidad.",
      ],
    },
    {
      id: "proteccion-datos",
      heading: "Octava. Protección de datos personales",
      paragraphs: [
        "8.1. Los datos recabados en el proceso de contratación del servicio del " +
          "Programa de Consultoría «Unlocked Academy» y aquellos que sean necesarios " +
          "para el uso de los medios y contenidos, serán tratados por LA EMPRESA con " +
          "el fin de gestionar de la mejor forma el servicio contratado.",
        "8.2. LA EMPRESA podrá enviar al cliente a través del correo electrónico " +
          "facilitado por el mismo, información comercial propia o de terceros " +
          "relacionados con los servicios de LA EMPRESA pudiendo EL CLIENTE negarse " +
          "al mismo en cualquier momento solicitando su desistimiento a través de un " +
          "correo electrónico o a través del procedimiento de baja en las " +
          "comunicaciones comerciales que se insertan en cada correo electrónico que " +
          "envía LA EMPRESA. Además, el cliente podrá contactarse a través de " +
          "WhatsApp o mensaje de texto.",
        "8.3. La base legal para el tratamiento de los datos del cliente es tanto la " +
          "ejecución de las presentes Condiciones contractuales, así como la " +
          "satisfacción del interés legítimo del responsable en fidelizar al " +
          "cliente. Sus datos serán conservados mientras permanezca vigente la " +
          "relación contractual y durante los plazos de prescripción de " +
          "responsabilidades legales.",
        "8.4. En caso de que el cliente se incorpore a los grupos de Facebook (o " +
          "cualquier otra red social o similar que se utilice en el servicio del " +
          "Programa de Consultoría «Unlocked Academy») autoriza a que sus datos " +
          "personales sean utilizados en estas plataformas para la gestión de las " +
          "páginas o perfiles del Programa de Consultoría «Unlocked Academy» y de " +
          "las comunicaciones que se mantengan de forma bidireccional con los " +
          "miembros de los grupos a través del chat, mensajes u otros medios de " +
          "comunicación que permita cada plataforma. No obstante, ese tratamiento " +
          "estará sujeto a las políticas de privacidad de estas plataformas. EL " +
          "CLIENTE al hacerse miembro del grupo será visible para LA EMPRESA, la " +
          "cual tendrá acceso al listado de miembros o seguidores que se han unido " +
          "al grupo. En todo caso, es responsabilidad del cliente el uso que haga de " +
          "las plataformas.",
        "8.5. LA EMPRESA no utilizará los datos personales de EL CLIENTE para " +
          "finalidades diferentes a las señaladas en las cláusulas anteriores.",
        "8.6. EL CLIENTE garantiza que los datos personales facilitados a LA EMPRESA " +
          "son veraces y están actualizados, y se hace responsable de comunicar " +
          "cualquier modificación de los mismos, siendo EL CLIENTE el único " +
          "responsable de la inexactitud o falsedad de los datos facilitados y de " +
          "los perjuicios que pueda causar por ello a LA EMPRESA o a terceros con " +
          "motivo de la utilización de los servicios ofrecidos por LA EMPRESA. " +
          "Asimismo, LA EMPRESA manifiesta que los datos recabados son adecuados, " +
          "pertinentes y no excesivos en relación con el ámbito, las finalidades y " +
          "los servicios determinados.",
        "8.7. EL CLIENTE acepta que sus datos podrán ser cedidos al método de pago " +
          "que use para la contratación del servicio del Programa de Consultoría " +
          "«Unlocked Academy», sea Stripe, PayPal, entre otros wallets de plataformas.",
        "8.8. La cuenta asignada a EL CLIENTE es de uso personal y confidencial. EL " +
          "CLIENTE declara que no permitirá que otras personas utilicen la " +
          "información de Registro y/o la Cuenta y acepta que es el único " +
          "responsable de mantener la confidencialidad y seguridad de los mismos. EL " +
          "CLIENTE conviene notificar inmediatamente a la Compañía cualquier uso no " +
          "autorizado de su contraseña y/o Cuenta.",
      ],
    },
    {
      id: "cesion-imagen",
      heading: "Novena. Cesión de imagen",
      paragraphs: [
        "9.1. EL CLIENTE autoriza a LA EMPRESA a utilizar sus imágenes, fotografías, " +
          "videos, material gráfico o cualquier otro material audiovisual, con la " +
          "única finalidad de presentar su testimonio como caso de éxito del " +
          "programa, con un uso exclusivo de carácter profesional para los fines " +
          "empresariales, formativos y de comercialización desarrollados por LA " +
          "EMPRESA. LA EMPRESA tiene el derecho de utilizar las imágenes para el uso " +
          "concedido, siempre con la obligación de respetar el derecho al honor de " +
          "EL CLIENTE.",
        "9.2. EL CLIENTE tiene derecho a que su utilización se limite a aquellas " +
          "aplicaciones que no atenten contra el derecho al honor en los términos " +
          "previstos en la Ley Orgánica 1/85, de 5 de mayo, de Protección Civil al " +
          "Derecho al Honor, la Intimidad Personal y familiar y a la Propia Imagen y " +
          "demás legislación vigente a nivel internacional. EL CLIENTE no recibirá " +
          "ningún pago por la cesión de los derechos de imagen, y ésta queda " +
          "otorgada a título gratuito.",
      ],
    },
    {
      id: "personalidad",
      heading: "Décima. Personalidad del contrato",
      paragraphs: [
        "10.1. El presente contrato tiene carácter personal y no será transferido a " +
          "una tercera parte de modo parcial o en su conjunto, por ninguna de las " +
          "partes, sin el consentimiento expreso por escrito de la otra parte.",
      ],
    },
    {
      id: "jurisdiccion",
      heading: "Décima Primera. Jurisdicción y legislación aplicable",
      paragraphs: [
        "11.1. El presente contrato se considera realizado en los Estados Unidos de " +
          "América y se rige en su totalidad por la legislación americana, en " +
          "concreto al Estado de Florida y a su legislación.",
        "11.2. Las partes se someterán en cuanto al cumplimiento y litigios " +
          "derivados del contrato a los juzgados y tribunales correspondientes al " +
          "Estado de Florida, EE. UU.",
      ],
    },
    {
      id: "varios",
      heading: "Décima Segunda. Varios",
      paragraphs: [
        "12.1. Modificación. LA EMPRESA se reserva el derecho, a su entera " +
          "discreción, de modificar el contenido del Programa, o de generar una " +
          "publicación de una versión actualizada del mismo.",
        "12.2. No solicitud. Durante la vigencia del presente Contrato y durante un " +
          "período de doce (12) meses después de la fecha de terminación del mismo, " +
          "EL CLIENTE no podrá sin autorización de LA EMPRESA, de ninguna manera, " +
          "directa o indirectamente (i) inducir o intentar inducir a ningún " +
          "empleado, contratista independiente, agente, consultor o cliente a " +
          "culminar o interrumpir su relación con LA EMPRESA; (ii) interferir o " +
          "perturbar de cualquier otra manera la relación de LA EMPRESA con sus " +
          "empleados, contratistas independientes, agentes, consultores y/o " +
          "clientes; (iii) solicitar, atraer o contratar a cualquier empleado, " +
          "contratista independiente, agente, consultor, cliente o cliente de LA " +
          "EMPRESA; o (iv) contratar a cualquier empleado, contratista " +
          "independiente, agente, consultor, o cliente de LA EMPRESA o a cualquier " +
          "antiguo empleado, contratista independiente, agente, consultor o cliente, " +
          "cuyo trabajo o acuerdo con LA EMPRESA haya cesado menos de un (1) año " +
          "antes de la fecha de dicha contratación o compromiso. EL CLIENTE reconoce " +
          "que cualquier intento de su parte de inducir a otros a abandonar LA " +
          "EMPRESA, o cualquier esfuerzo de interferir en la relación de LA EMPRESA " +
          "con sus empleados, contratistas independientes, agentes, consultores o " +
          "clientes sería perjudicial y dañino para LA EMPRESA. (v) EL CLIENTE no " +
          "podrá contactar por ningún medio a empleados, contratistas " +
          "independientes, agentes, consultores o clientes de LA EMPRESA, para " +
          "promover ofrecimientos o ventas de productos o servicios propios.",
      ],
    },
    {
      id: "anexos",
      heading: "Décima Tercera. Anexos",
      paragraphs: [
        "13.1. Anexo I: Metodología de la Consultoría. La metodología de la " +
          "consultoría «Unlocked Academy» se detalla en un documento anexo que se " +
          "entrega junto con este contrato. EL CLIENTE declara haber recibido, leído " +
          "y comprendido el documento anexo de la metodología de la consultoría, y " +
          "se compromete a seguir los lineamientos y estrategias allí descritos.",
        "Para que así conste a los efectos oportunos, se firma por duplicado por " +
          "ambas partes en la fecha fijada, de tal forma que se confiere validez al " +
          "contrato y a todas sus cláusulas previamente expuestas.",
      ],
    },
  ];

  // Cuerpo base según la plantilla: empresarial o tradicional (por defecto).
  const baseSections = isBusiness
    ? buildBusinessSections(input, duration)
    : defaultSections;

  // Upgrade de nivel: se antepone un bloque que explica de dónde sale el valor
  // neto (bruto − crédito) antes de las cláusulas oficiales. Solo aparece en la
  // plantilla oficial; un snapshot personalizado reemplaza todo el cuerpo más
  // abajo, pero la liquidación sigue dentro del hash vía input.upgrade.
  const upgradeSection = buildUpgradeSection(input);
  if (upgradeSection) {
    baseSections.unshift(upgradeSection);
  }

  // Cláusulas manuales configurables: se anexan al final del cuerpo legal con
  // un id estable (manual-N) para que web, PDF y hash compartan el mismo orden.
  for (const [index, clause] of (input.manualClauses ?? []).entries()) {
    baseSections.push({
      id: `manual-${index + 1}`,
      heading: clause.heading,
      paragraphs: clause.paragraphs,
    });
  }

  // Si la inscripción tiene un snapshot de contrato personalizado (con al menos
  // una sección), reemplaza por completo la plantilla + cláusulas manuales. Un
  // snapshot ausente o vacío cae a la plantilla oficial para no producir un
  // contrato en blanco.
  const snapshot = input.sectionsSnapshot;
  const sections =
    Array.isArray(snapshot) && snapshot.length > 0 ? snapshot : baseSections;

  const signerNames = [
    input.clientName,
    ...validTeamMembers(input)
      .filter((m) => m.isContractSigner)
      .map((m) => m.fullName.trim()),
  ];

  return {
    title: CONTRACT_TITLE,
    subtitle: isBusiness ? CONTRACT_SUBTITLE_BUSINESS : CONTRACT_SUBTITLE,
    parties,
    exponen,
    sections,
    signature: {
      agreementDateLabel: formatContractDate(input.agreementDate),
      endDateLabel: formatContractDate(input.endDate),
      clientName: input.clientName,
      ceoName: COMPANY.ceoName,
      signerNames,
    },
  };
}
