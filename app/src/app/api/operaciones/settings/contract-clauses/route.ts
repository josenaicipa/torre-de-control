import { NextResponse } from "next/server";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { validateManualClausesInput } from "@/lib/operaciones-manual-clauses";
import {
  MANUAL_CLAUSES_SETTING_KEY,
  getManualContractClauses,
  setManualContractClauses,
} from "@/lib/operaciones-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cláusulas manuales configurables del contrato: configuración global de
// Operaciones que se anexa al final de TODOS los contratos emitidos.

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
    const validated = validateManualClausesInput(clausesInput);
    if (!validated.ok) return jsonError(400, validated.error);

    const saved = await setManualContractClauses(validated.clauses, actor.userId);

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
