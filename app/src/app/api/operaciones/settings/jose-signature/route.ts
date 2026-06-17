import { NextResponse } from "next/server";
import {
  getActor,
  requireActor,
  requireOperatorOrAdmin,
} from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import { validateSignatureImage } from "@/lib/operaciones-contract";
import { getJoseSignature, setJoseSignature } from "@/lib/operaciones-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Firma fija de Jose Naicipa: configuración global de Operaciones. Se sube una
// sola vez y se reutiliza automáticamente al aprobar cualquier contrato.

// GET: devuelve si existe la firma fija y su data URL para vista previa.
export async function GET() {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireOperatorOrAdmin(actor);

    const signature = await getJoseSignature();
    return NextResponse.json({
      exists: signature !== null,
      dataUrl: signature?.dataUrl ?? null,
      updatedAt: signature?.updatedAt ?? null,
      updatedByName: signature?.updatedByName ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

// PUT: guarda la firma fija de Jose Naicipa (data URL PNG/JPEG, máx. 1 MB).
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
    const signatureImageValue =
      body && typeof body === "object"
        ? (body as { signatureImage?: unknown }).signatureImage
        : undefined;
    if (signatureImageValue === undefined || signatureImageValue === null) {
      return jsonError(
        400,
        "Sube la firma de Jose Naicipa en PNG o JPG para guardarla",
      );
    }
    const signatureImage = validateSignatureImage(signatureImageValue);
    if (!signatureImage.ok) {
      return jsonError(400, signatureImage.error);
    }

    await setJoseSignature(signatureImage.dataUrl, actor.userId);

    await writeAudit({
      actorId: actor.userId,
      action: "operaciones.settings.update_jose_signature",
      target: "jose_signature_image",
      metadata: { bytes: signatureImage.bytes, mime: signatureImage.mime },
    });

    return NextResponse.json({ ok: true, dataUrl: signatureImage.dataUrl });
  } catch (err) {
    return handleApiError(err);
  }
}
