import PDFDocument from "pdfkit";
import {
  buildContractView,
  isContractBullet,
  contractBulletText,
  type ContractInput,
} from "./operaciones-contract-template";
import { validateSignatureImage } from "./operaciones-contract";

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
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Título
    doc.fontSize(16).font("Helvetica-Bold").text(view.title, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(11).font("Helvetica").text(view.subtitle, { align: "center" });
    doc.moveDown(1);

    // Partes
    doc.fontSize(10).font("Helvetica-Bold").text("REUNIDOS");
    doc.moveDown(0.2);
    doc.font("Helvetica").text(view.parties, { align: "justify" });
    doc.moveDown(0.6);

    // Exponen
    doc.font("Helvetica-Bold").text("EXPONEN");
    doc.moveDown(0.2);
    doc.font("Helvetica").text(view.exponen, { align: "justify" });
    doc.moveDown(0.6);

    // Datos de EL CLIENTE con los campos dinámicos en negrita.
    doc.font("Helvetica-Bold").fontSize(10).text("DATOS DE EL CLIENTE");
    doc.moveDown(0.2);
    const clientFields: Array<[string, string]> = [
      ["Nombre", input.clientName],
      ["Documento", input.clientDocument?.trim() || "—"],
      ["Domicilio", input.clientAddress?.trim() || "—"],
    ];
    for (const [label, value] of clientFields) {
      doc.font("Helvetica").fontSize(10).text(`${label}: `, { continued: true });
      doc.font("Helvetica-Bold").text(value);
    }
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").text("CLÁUSULAS");
    doc.moveDown(0.3);

    // Cláusulas
    for (const section of view.sections) {
      doc.font("Helvetica-Bold").fontSize(10).text(section.heading);
      doc.moveDown(0.15);
      doc.font("Helvetica").fontSize(10);
      for (const paragraph of section.paragraphs) {
        if (isContractBullet(paragraph)) {
          doc.text(`•  ${contractBulletText(paragraph)}`, {
            align: "left",
            indent: 14,
          });
        } else {
          doc.text(paragraph, { align: "justify" });
        }
        doc.moveDown(0.25);
      }
      doc.moveDown(0.3);
    }

    // Fechas de acuerdo
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Fecha de acuerdo: ${view.signature.agreementDateLabel}`);
    doc.text(`Fecha de finalización: ${view.signature.endDateLabel}`);

    // Bloque de evidencia de firma electrónica
    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(11).text("EVIDENCIA DE FIRMA ELECTRÓNICA");
    doc.moveDown(0.4);

    doc.font("Helvetica-Bold").fontSize(10).text("EL CLIENTE");
    doc.font("Helvetica").fontSize(10);
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

    doc.font("Helvetica-Bold").fontSize(10).text("LA EMPRESA");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Nombre: ${evidence.ceoSignerName ?? view.signature.ceoName}`);
    doc.text(`Fecha de firma: ${formatDateTime(evidence.ceoSignedAt)}`);
    doc.text(`Hash de firma: ${shortHash(evidence.ceoSignatureHash)}`);
    doc.moveDown(0.6);

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#555555")
      .text(`Versión de plantilla: ${evidence.templateVersion ?? "—"}`);

    doc.end();
  });
}
