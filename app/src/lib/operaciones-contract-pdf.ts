import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  buildContractView,
  buildPartiesSegments,
  formatContractUsd,
  isContractBullet,
  contractBulletText,
  parseContractSegments,
  type ContractInput,
} from "./operaciones-contract-template";
import { validateSignatureImage } from "./operaciones-contract";

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

export interface ContractPdfEvidence {
  studentSignerName: string | null;
  studentSignedAt: Date | string | null;
  studentSignedIp: string | null;
  studentSignatureHash: string | null;
  studentSignatureImage: string | null;
  ceoSignerName: string | null;
  ceoSignedAt: Date | string | null;
  ceoSignatureHash: string | null;
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

    // Bloque de evidencia de firma electrónica
    doc.moveDown(1);
    doc.font(fonts.bold).fontSize(11).text("EVIDENCIA DE FIRMA ELECTRÓNICA");
    doc.moveDown(0.4);

    doc.font(fonts.bold).fontSize(10).text("EL CLIENTE");
    doc.font(fonts.regular).fontSize(10);
    doc.text(`Nombre: ${evidence.studentSignerName ?? view.signature.clientName}`);
    doc.text(`Fecha de firma: ${formatDateTime(evidence.studentSignedAt)}`);
    doc.text(`IP de firma: ${evidence.studentSignedIp ?? "—"}`);
    doc.text(`Hash de firma: ${shortHash(evidence.studentSignatureHash)}`);

    // Imagen de la firma manuscrita. Si la imagen es inválida, no rompe el PDF.
    const signature = validateSignatureImage(evidence.studentSignatureImage);
    if (signature.ok) {
      try {
        const buffer = Buffer.from(signature.base64, "base64");
        doc.moveDown(0.2);
        doc.text("Firma manuscrita:");
        doc.moveDown(0.2);
        doc.image(buffer, { fit: [200, 80] });
      } catch {
        // Imagen corrupta: se omite sin interrumpir la generación del PDF.
      }
    }
    doc.moveDown(0.5);

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
