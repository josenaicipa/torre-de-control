import {
  CONTRACT_BULLET_PREFIX,
  type ContractSection,
  type ManualClause,
} from "@/lib/operaciones-contract-template";
import { CONTRACT_SECTIONS_LIMITS } from "@/lib/operaciones-contract";

// Topes estrictos para edición de cláusulas manuales. Rechazan el request en
// vez de truncar para dar feedback claro a Operaciones.
export const MANUAL_CLAUSES_EDITOR_LIMITS = {
  maxClauses: 10,
  maxHeadingLength: 120,
  maxBodyLength: 4000,
} as const;

function normalizeParagraph(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("- ")) {
    return `${CONTRACT_BULLET_PREFIX}${trimmed.slice(2).trim()}`;
  }
  return trimmed;
}

function extractRawLines(clause: {
  body?: unknown;
  paragraphs?: unknown;
}): string[] | null {
  if (Array.isArray(clause.paragraphs)) {
    if (!clause.paragraphs.every((p) => typeof p === "string")) return null;
    return clause.paragraphs;
  }
  if (typeof clause.body === "string") {
    return clause.body.split(/\r?\n/);
  }
  return null;
}

function validateClause(
  input: unknown,
  index: number,
): { ok: true; clause: ManualClause } | { ok: false; error: string } {
  const position = index + 1;
  if (!input || typeof input !== "object") {
    return { ok: false, error: `Cláusula ${position}: formato inválido` };
  }
  const raw = input as {
    heading?: unknown;
    body?: unknown;
    paragraphs?: unknown;
  };

  const heading = typeof raw.heading === "string" ? raw.heading.trim() : "";
  if (!heading) {
    return {
      ok: false,
      error: `Cláusula ${position}: el título es obligatorio`,
    };
  }
  if (heading.length > MANUAL_CLAUSES_EDITOR_LIMITS.maxHeadingLength) {
    return {
      ok: false,
      error: `Cláusula ${position}: el título supera ${MANUAL_CLAUSES_EDITOR_LIMITS.maxHeadingLength} caracteres`,
    };
  }

  const rawLines = extractRawLines(raw);
  if (rawLines === null) {
    return {
      ok: false,
      error: `Cláusula ${position}: el cuerpo es obligatorio`,
    };
  }
  const bodyLength = rawLines.join("\n").length;
  if (bodyLength > MANUAL_CLAUSES_EDITOR_LIMITS.maxBodyLength) {
    return {
      ok: false,
      error: `Cláusula ${position}: el cuerpo supera ${MANUAL_CLAUSES_EDITOR_LIMITS.maxBodyLength} caracteres`,
    };
  }

  const paragraphs = rawLines
    .map(normalizeParagraph)
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) {
    return {
      ok: false,
      error: `Cláusula ${position}: agrega al menos un párrafo de cuerpo`,
    };
  }

  return { ok: true, clause: { heading, paragraphs } };
}

export function validateManualClausesInput(
  clausesInput: unknown,
): { ok: true; clauses: ManualClause[] } | { ok: false; error: string } {
  if (!Array.isArray(clausesInput)) {
    return { ok: false, error: "Envía las cláusulas como un arreglo en 'clauses'" };
  }
  if (clausesInput.length > MANUAL_CLAUSES_EDITOR_LIMITS.maxClauses) {
    return {
      ok: false,
      error: `Solo se permiten hasta ${MANUAL_CLAUSES_EDITOR_LIMITS.maxClauses} cláusulas manuales`,
    };
  }

  const clauses: ManualClause[] = [];
  for (let i = 0; i < clausesInput.length; i++) {
    const result = validateClause(clausesInput[i], i);
    if (!result.ok) return result;
    clauses.push(result.clause);
  }
  return { ok: true, clauses };
}

// Valida la edición del contrato COMPLETO por inscripción (todas las secciones,
// no solo las cláusulas manuales). Rechaza el request con un mensaje claro en
// vez de truncar. Conserva el `id` enviado si es estable y único; si falta o se
// repite, asigna `section-N`.
function validateSection(
  input: unknown,
  index: number,
  usedIds: Set<string>,
): { ok: true; section: ContractSection } | { ok: false; error: string } {
  const position = index + 1;
  if (!input || typeof input !== "object") {
    return { ok: false, error: `Sección ${position}: formato inválido` };
  }
  const raw = input as {
    id?: unknown;
    heading?: unknown;
    body?: unknown;
    paragraphs?: unknown;
  };

  const heading = typeof raw.heading === "string" ? raw.heading.trim() : "";
  if (!heading) {
    return { ok: false, error: `Sección ${position}: el título es obligatorio` };
  }
  if (heading.length > CONTRACT_SECTIONS_LIMITS.maxHeadingLength) {
    return {
      ok: false,
      error: `Sección ${position}: el título supera ${CONTRACT_SECTIONS_LIMITS.maxHeadingLength} caracteres`,
    };
  }

  const rawLines = extractRawLines(raw);
  if (rawLines === null) {
    return { ok: false, error: `Sección ${position}: el cuerpo es obligatorio` };
  }
  const bodyLength = rawLines.join("\n").length;
  if (bodyLength > CONTRACT_SECTIONS_LIMITS.maxParagraphLength * CONTRACT_SECTIONS_LIMITS.maxParagraphsPerSection) {
    return {
      ok: false,
      error: `Sección ${position}: el cuerpo es demasiado extenso`,
    };
  }

  const paragraphs = rawLines
    .map(normalizeParagraph)
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) {
    return {
      ok: false,
      error: `Sección ${position}: agrega al menos un párrafo de cuerpo`,
    };
  }
  if (paragraphs.length > CONTRACT_SECTIONS_LIMITS.maxParagraphsPerSection) {
    return {
      ok: false,
      error: `Sección ${position}: supera ${CONTRACT_SECTIONS_LIMITS.maxParagraphsPerSection} párrafos`,
    };
  }

  const rawId =
    typeof raw.id === "string" ? raw.id.trim().slice(0, 80) : "";
  const id = rawId && !usedIds.has(rawId) ? rawId : `section-${position}`;
  usedIds.add(id);

  return { ok: true, section: { id, heading, paragraphs } };
}

export function validateContractSectionsInput(
  sectionsInput: unknown,
): { ok: true; sections: ContractSection[] } | { ok: false; error: string } {
  if (!Array.isArray(sectionsInput)) {
    return { ok: false, error: "Envía las secciones como un arreglo en 'sections'" };
  }
  if (sectionsInput.length === 0) {
    return { ok: false, error: "El contrato debe tener al menos una sección" };
  }
  if (sectionsInput.length > CONTRACT_SECTIONS_LIMITS.maxSections) {
    return {
      ok: false,
      error: `Solo se permiten hasta ${CONTRACT_SECTIONS_LIMITS.maxSections} secciones`,
    };
  }

  const sections: ContractSection[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < sectionsInput.length; i++) {
    const result = validateSection(sectionsInput[i], i, usedIds);
    if (!result.ok) return result;
    sections.push(result.section);
  }
  return { ok: true, sections };
}
