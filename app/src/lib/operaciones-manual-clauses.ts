import { CONTRACT_BULLET_PREFIX, type ManualClause } from "@/lib/operaciones-contract-template";

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
