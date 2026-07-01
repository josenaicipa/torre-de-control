import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  buildContractView,
  buildPartiesSegments,
  formatContractUsd,
  isContractBullet,
  contractBulletText,
  normalizeContractTemplateKind,
  parseContractSegments,
  type ContractInput,
} from "./operaciones-contract-template";
import {
  buildContractInputFromData,
  contractSignerMembers,
  parseContractSectionsSnapshot,
  parseManualClausesSnapshot,
  validateSignatureImage,
  type ContractDataShape,
} from "./operaciones-contract";

// Fuentes Unicode (DejaVu) para que ñ, tildes, viñetas «»°— y demás caracteres
// españoles no se rompan en el PDF. Se empaquetan en public/fonts y, como
// salvaguarda, también se buscan en las rutas del sistema. Si no se encuentran,
// se cae a las fuentes estándar de PDFKit (Helvetica), que cubren Latin-1.
const FONT_CANDIDATES: Record<"regular" | "bold", string[]> = {
  regular: [
    path.join(process.cwd(), "public", "fonts", "DejaVuSans.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ],
  bold: [
    path.join(process.cwd(), "public", "fonts", "DejaVuSans-Bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  ],
};

interface ContractFonts {
  regular: string;
  bold: string;
}

function firstExistingFont(candidates: string[]): string | null {
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      // Ignorar rutas inaccesibles y seguir con el siguiente candidato.
    }
  }
  return null;
}

// Registra las fuentes Unicode en el documento y devuelve los nombres a usar.
// Solo registra si AMBAS variantes (regular y bold) existen, para no mezclar
// DejaVu regular con Helvetica bold; ante cualquier fallo cae a Helvetica.
function registerContractFonts(doc: PDFKit.PDFDocument): ContractFonts {
  const regularPath = firstExistingFont(FONT_CANDIDATES.regular);
  const boldPath = firstExistingFont(FONT_CANDIDATES.bold);
  if (regularPath && boldPath) {
    try {
      doc.registerFont("ContractSans", regularPath);
      doc.registerFont("ContractSans-Bold", boldPath);
      return { regular: "ContractSans", bold: "ContractSans-Bold" };
    } catch {
      // Si PDFKit no puede parsear el TTF, usamos las fuentes estándar.
    }
  }
  return { regular: "Helvetica", bold: "Helvetica-Bold" };
}

// Genera el PDF del contrato firmado a partir del ContractInput canónico y la
// evidencia de firma electrónica (estudiante + CEO). El cuerpo legal se toma de
// buildContractView para que coincida exactamente con lo que firmó el
// estudiante; al final se añade un bloque de evidencia con nombres, fechas, IP
// y hashes (cortos) de ambas firmas y la versión de la plantilla.

// Evidencia de firma de un integrante adicional firmante (SOCIO 2..5). El
// titular Student se representa en los campos student* de ContractPdfEvidence.
export interface ContractMemberSignerEvidence {
  name: string;
  signedAt: Date | string | null;
  signedIp: string | null;
  signatureHash: string | null;
  signatureImage: string | null;
}

export interface ContractPdfEvidence {
  studentSignerName: string | null;
  studentSignedAt: Date | string | null;
  studentSignedIp: string | null;
  studentSignatureHash: string | null;
  studentSignatureImage: string | null;
  // Integrantes adicionales firmantes del equipo, en orden. Se renderizan como
  // SOCIO 2, SOCIO 3, … entre EL CLIENTE y LA EMPRESA. Ausente/[] => contrato
  // individual, con el bloque de firmas idéntico al anterior.
  memberSigners?: ContractMemberSignerEvidence[];
  ceoSignerName: string | null;
  ceoSignedAt: Date | string | null;
  ceoSignatureHash: string | null;
  ceoSignatureImage: string | null;
  templateVersion: string | null;
}

function shortHash(hash: string | null): string {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function generateSignedContractPdf({
  input,
  evidence,
}: {
  input: ContractInput;
  evidence: ContractPdfEvidence;
}): Promise<Buffer> {
  const view = buildContractView(input);
  // BRAND_CONSULTING: EL CLIENTE es la empresa y firma su representante legal;
  // la evidencia titula la firma como tal y muestra al representante (fullName).
  const isBrandConsulting =
    normalizeContractTemplateKind(input.templateKind) === "BRAND_CONSULTING";

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const fonts = registerContractFonts(doc);
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Escribe un par etiqueta/valor con el valor en negrita.
    const labeledValue = (label: string, value: string) => {
      doc.font(fonts.regular).fontSize(10).text(`${label}: `, { continued: true });
      doc.font(fonts.bold).text(value);
    };

    // Escribe un párrafo resaltando en negrita los fragmentos marcados (montos y
    // fechas variables). Acepta un prefijo opcional (p. ej. la viñeta "•  ").
    const renderRichText = (
      text: string,
      options: PDFKit.Mixins.TextOptions,
      prefix?: string,
    ) => {
      const segments = parseContractSegments(text);
      if (prefix) {
        doc.font(fonts.regular).text(prefix, { ...options, continued: true });
      }
      segments.forEach((segment, index) => {
        doc.font(segment.bold ? fonts.bold : fonts.regular).text(segment.text, {
          ...options,
          continued: index < segments.length - 1,
        });
      });
    };

    // Título
    doc.fontSize(16).font(fonts.bold).text(view.title, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).font(fonts.regular).text(view.subtitle, { align: "center" });
    doc.moveDown(1);

    // Partes: datos variables (empresa, EIN, dirección, cliente, documento y
    // domicilio) resaltados en negrita mediante segmentos.
    doc.fontSize(10).font(fonts.bold).text("REUNIDOS");
    doc.moveDown(0.2);
    const partySegments = buildPartiesSegments(input);
    doc.fontSize(10);
    partySegments.forEach((segment, index) => {
      doc.font(segment.bold ? fonts.bold : fonts.regular).text(segment.text, {
        align: "justify",
        continued: index < partySegments.length - 1,
      });
    });
    doc.moveDown(0.6);

    // Exponen
    doc.font(fonts.bold).text("EXPONEN");
    doc.moveDown(0.2);
    doc.font(fonts.regular).text(view.exponen, { align: "justify" });
    doc.moveDown(0.6);

    // Datos de EL CLIENTE con los campos dinámicos en negrita.
    doc.font(fonts.bold).fontSize(10).text("DATOS DE EL CLIENTE");
    doc.moveDown(0.2);
    labeledValue("Nombre", input.clientName);
    labeledValue("Documento", input.clientDocument?.trim() || "—");
    labeledValue("Domicilio", input.clientAddress?.trim() || "—");
    doc.moveDown(0.6);

    // Resumen económico con montos y fechas principales en negrita.
    doc.font(fonts.bold).fontSize(10).text("RESUMEN ECONÓMICO");
    doc.moveDown(0.2);
    labeledValue("Producto", input.productName);
    labeledValue("Valor total", formatContractUsd(input.totalAmountUsd));
    labeledValue("Pago inicial", formatContractUsd(input.initialPaymentUsd));
    labeledValue("Saldo pendiente", formatContractUsd(input.balanceUsd));
    labeledValue("Fecha de acuerdo", view.signature.agreementDateLabel);
    labeledValue("Fecha de finalización", view.signature.endDateLabel);
    doc.moveDown(0.6);

    doc.font(fonts.bold).text("CLÁUSULAS");
    doc.moveDown(0.3);

    // Cláusulas
    for (const section of view.sections) {
      doc.font(fonts.bold).fontSize(10).text(section.heading);
      doc.moveDown(0.15);
      doc.font(fonts.regular).fontSize(10);
      for (const paragraph of section.paragraphs) {
        if (isContractBullet(paragraph)) {
          renderRichText(
            contractBulletText(paragraph),
            { align: "left", indent: 14 },
            "•  ",
          );
        } else {
          renderRichText(paragraph, { align: "justify" });
        }
        doc.moveDown(0.25);
      }
      doc.moveDown(0.3);
    }

    // Fechas de acuerdo
    doc.moveDown(0.4);
    doc.font(fonts.regular).fontSize(10);
    labeledValue("Fecha de acuerdo", view.signature.agreementDateLabel);
    labeledValue("Fecha de finalización", view.signature.endDateLabel);

    // Dibuja la imagen de una firma manuscrita reservando su alto real: PDFKit
    // NO avanza doc.y tras pintar una imagen, así que la posicionamos en una
    // caja fija y movemos doc.y manualmente para que el texto siguiente (el
    // encabezado de la parte) quede DEBAJO y nunca se monte sobre la firma. Si
    // no cabe en la página, abre una nueva. Imágenes inválidas/corruptas se
    // omiten sin interrumpir la generación del PDF.
    const signatureBox = { width: 200, height: 80 };
    const drawSignatureImage = (image: string | null, caption: string) => {
      const validated = validateSignatureImage(image);
      if (!validated.ok) return;
      let buffer: Buffer;
      try {
        buffer = Buffer.from(validated.base64, "base64");
      } catch {
        return;
      }
      const captionHeight = 14;
      const blockHeight = captionHeight + signatureBox.height + 8;
      const bottomLimit = doc.page.height - doc.page.margins.bottom;
      if (doc.y + blockHeight > bottomLimit) {
        doc.addPage();
      }
      doc.font(fonts.regular).fontSize(9).fillColor("#555555").text(caption);
      doc.fillColor("black");
      const imageTop = doc.y;
      try {
        doc.image(buffer, doc.x, imageTop, {
          fit: [signatureBox.width, signatureBox.height],
        });
      } catch {
        // Imagen corrupta: restaurar posición y continuar sin la imagen.
        doc.y = imageTop;
        return;
      }
      // Reservar el alto de la caja para que el siguiente texto no se solape.
      doc.y = imageTop + signatureBox.height + 8;
    };

    // Bloque de evidencia de firma electrónica
    doc.moveDown(1);
    doc
      .font(fonts.bold)
      .fontSize(11)
      .fillColor("black")
      .text("EVIDENCIA DE FIRMA ELECTRÓNICA");
    doc.moveDown(0.4);

    // Firma manuscrita del estudiante, arriba del encabezado EL CLIENTE.
    drawSignatureImage(
      evidence.studentSignatureImage,
      isBrandConsulting
        ? "Firma manuscrita del representante legal de EL CLIENTE:"
        : "Firma manuscrita de EL CLIENTE:",
    );

    doc.font(fonts.bold).fontSize(10).text("EL CLIENTE");
    doc.font(fonts.regular).fontSize(10);
    if (isBrandConsulting) {
      doc.text(`Razón social: ${view.signature.clientName}`);
      doc.text(
        `Representante legal: ${evidence.studentSignerName ?? view.signature.signatoryName}`,
      );
    } else {
      doc.text(`Nombre: ${evidence.studentSignerName ?? view.signature.signatoryName}`);
    }
    doc.text(`Fecha de firma: ${formatDateTime(evidence.studentSignedAt)}`);
    doc.text(`IP de firma: ${evidence.studentSignedIp ?? "—"}`);
    doc.text(`Hash de firma: ${shortHash(evidence.studentSignatureHash)}`);
    doc.moveDown(0.6);

    // Integrantes adicionales firmantes del equipo: SOCIO 2, SOCIO 3, … Cada
    // bloque lleva su firma manuscrita, nombre, fecha, IP (si existe) y hash.
    (evidence.memberSigners ?? []).forEach((member, index) => {
      const label = `SOCIO ${index + 2}`;
      drawSignatureImage(
        member.signatureImage,
        `Firma manuscrita de ${label}:`,
      );
      doc.font(fonts.bold).fontSize(10).text(label);
      doc.font(fonts.regular).fontSize(10);
      doc.text(`Nombre: ${member.name}`);
      doc.text(`Fecha de firma: ${formatDateTime(member.signedAt)}`);
      if (member.signedIp) {
        doc.text(`IP de firma: ${member.signedIp}`);
      }
      doc.text(`Hash de firma: ${shortHash(member.signatureHash)}`);
      doc.moveDown(0.6);
    });

    // Firma manuscrita de Jose Naicipa, arriba del encabezado LA EMPRESA.
    drawSignatureImage(
      evidence.ceoSignatureImage,
      "Firma manuscrita de LA EMPRESA:",
    );

    doc.font(fonts.bold).fontSize(10).text("LA EMPRESA");
    doc.font(fonts.regular).fontSize(10);
    doc.text(`Nombre: ${evidence.ceoSignerName ?? view.signature.ceoName}`);
    doc.text(`Fecha de firma: ${formatDateTime(evidence.ceoSignedAt)}`);
    doc.text(`Hash de firma: ${shortHash(evidence.ceoSignatureHash)}`);
    doc.moveDown(0.6);

    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor("#555555")
      .text(`Versión de plantilla: ${evidence.templateVersion ?? "—"}`);

    doc.end();
  });
}

// Forma mínima de una inscripción para regenerar el PDF firmado final: el
// cuerpo legal (ContractDataShape) más la evidencia de firma del estudiante y
// del CEO y los snapshots congelados. La usan la aprobación (Torre), la descarga
// del PDF y el reintento de subida a Drive para producir SIEMPRE el mismo
// documento a partir de los datos guardados.
export interface SignedContractPdfEnrollment extends ContractDataShape {
  contractSignedAt: Date | string | null;
  contractSignerName: string | null;
  contractSignedIp: string | null;
  contractStudentSignatureHash: string | null;
  contractStudentSignatureImage: string | null;
  contractCeoSignerName: string | null;
  contractCeoSignedAt: Date | string | null;
  contractCeoSignatureHash: string | null;
  contractCeoSignatureImage: string | null;
  contractTemplateVersion: string | null;
  contractManualClausesSnapshot: string | null;
  contractSectionsSnapshot: string | null;
}

// Genera el PDF firmado final de una inscripción reconstruyendo el ContractInput
// canónico (con cláusulas y secciones congeladas) y la evidencia de firma de
// todas las partes (titular, socios firmantes y CEO). Es la fuente única que
// comparten la aprobación, la descarga y el reintento de Drive, de modo que el
// documento sea idéntico independientemente de quién lo dispare.
export function renderSignedContractPdfForEnrollment(
  enrollment: SignedContractPdfEnrollment,
): Promise<Buffer> {
  const manualClauses =
    parseManualClausesSnapshot(enrollment.contractManualClausesSnapshot) ?? [];
  const sectionsSnapshot =
    parseContractSectionsSnapshot(enrollment.contractSectionsSnapshot) ?? undefined;
  const input = buildContractInputFromData(
    enrollment,
    enrollment.contractSignedAt,
    manualClauses,
    sectionsSnapshot,
  );
  const memberSigners = contractSignerMembers(enrollment.student.members ?? []).map(
    (m) => ({
      name: m.contractSignerName ?? m.fullName,
      signedAt: m.contractSignedAt,
      signedIp: m.contractSignedIp,
      signatureHash: m.contractSignatureHash,
      signatureImage: m.contractSignatureImage,
    }),
  );
  return generateSignedContractPdf({
    input,
    evidence: {
      studentSignerName: enrollment.contractSignerName,
      studentSignedAt: enrollment.contractSignedAt,
      studentSignedIp: enrollment.contractSignedIp,
      studentSignatureHash: enrollment.contractStudentSignatureHash,
      studentSignatureImage: enrollment.contractStudentSignatureImage,
      ceoSignerName: enrollment.contractCeoSignerName,
      ceoSignedAt: enrollment.contractCeoSignedAt,
      ceoSignatureHash: enrollment.contractCeoSignatureHash,
      ceoSignatureImage: enrollment.contractCeoSignatureImage,
      templateVersion: enrollment.contractTemplateVersion,
      memberSigners,
    },
  });
}
