import { NextResponse } from "next/server";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  CONTRACT_BULLET_PREFIX,
  type ManualClause,
} from "@/lib/operaciones-contract-template";
import {
  MANUAL_CLAUSES_SETTING_KEY,
  getManualContractClauses,
  setManualContractClauses,
} from "@/lib/operaciones-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cláusulas manuales configurables del contrato: configuración global de
// Operaciones que se anexa al final de TODOS los contratos emitidos.

// Topes estrictos del endpoint. Son más restrictivos que los topes tolerantes
// de parseManualClauses (que actúan como red de seguridad al persistir): aquí
// rechazamos el request en vez de truncar para dar feedback claro a la UI.
const MAX_CLAUSES = 10;
const MAX_HEADING_LENGTH = 120;
const MAX_BODY_LENGTH = 4000;

// GET: devuelve las cláusulas configuradas y metadata de auditoría.
export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const setting = await getManualContractClauses();
    return NextResponse.json({
      clauses: setting?.clauses ?? [],
      updatedAt: setting?.updatedAt ?? null,
      updatedByName: setting?.updatedByName ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// Normaliza una línea de cuerpo de cláusula: trimea y convierte viñetas de
// texto plano ("- foo") al prefijo canónico de la plantilla ("• foo") para
// que las cláusulas manuales se rendericen igual que las del cuerpo legal.
function normalizeParagraph(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("- ")) {
    return `${CONTRACT_BULLET_PREFIX}${trimmed.slice(2).trim()}`;
  }
  return trimmed;
}

// Extrae las líneas crudas del cuerpo de la cláusula. La UI envía o bien
// `body` (string con saltos de línea, el caso típico del textarea) o bien
// `paragraphs` (forma canónica). Devuelve null si no llega ninguno de los dos.
function extractRawLines(clause: {
  body?: unknown;
  paragraphs?: unknown;
}): string[] | null {
  if (Array.isArray(clause.paragraphs)) {
    if (!clause.paragraphs.every((p) => typeof p === "string")) return null;
    return clause.paragraphs as string[];
  }
  if (typeof clause.body === "string") {
    return clause.body.split(/\r?\n/);
  }
  return null;
}

interface ValidatedClause {
  heading: string;
  paragraphs: string[];
}

function validateClause(
  input: unknown,
  index: number,
): { ok: true; clause: ValidatedClause } | { ok: false; error: string } {
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
  if (heading.length > MAX_HEADING_LENGTH) {
    return {
      ok: false,
      error: `Cláusula ${position}: el título supera ${MAX_HEADING_LENGTH} caracteres`,
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
  if (bodyLength > MAX_BODY_LENGTH) {
    return {
      ok: false,
      error: `Cláusula ${position}: el cuerpo supera ${MAX_BODY_LENGTH} caracteres`,
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

// PUT: reemplaza la lista completa de cláusulas manuales. La UI envía cada
// cláusula con `heading` y `body` (string) o `paragraphs` (string[]); el
// endpoint valida estricto, normaliza y persiste vía setManualContractClauses.
export async function PUT(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const clausesInput =
      body && typeof body === "object"
        ? (body as { clauses?: unknown }).clauses
        : undefined;
    if (!Array.isArray(clausesInput)) {
      return jsonError(400, "Envía las cláusulas como un arreglo en 'clauses'");
    }
    if (clausesInput.length > MAX_CLAUSES) {
      return jsonError(
        400,
        `Solo se permiten hasta ${MAX_CLAUSES} cláusulas manuales`,
      );
    }

    const validated: ManualClause[] = [];
    for (let i = 0; i < clausesInput.length; i++) {
      const result = validateClause(clausesInput[i], i);
      if (!result.ok) return jsonError(400, result.error);
      validated.push(result.clause);
    }

    const saved = await setManualContractClauses(validated, actor.userId);

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.settings.update_contract_clauses",
      target: MANUAL_CLAUSES_SETTING_KEY,
      metadata: { count: saved.length },
    });

    return NextResponse.json({ ok: true, clauses: saved });
  } catch (err) {
    return handleApiError(err);
  }
}
