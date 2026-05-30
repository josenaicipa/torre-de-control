import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, UnauthenticatedError } from "./actor";
import { UploadValidationError } from "./comunidad-dropi-upload-validation";

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status },
  );
}

/**
 * Catch genérico para routes. Mapea errores conocidos a HTTP correctos.
 */
export function handleApiError(err: unknown) {
  if (err instanceof UnauthenticatedError) {
    return jsonError(401, "No autorizado");
  }
  if (err instanceof ForbiddenError) {
    return jsonError(403, err.message);
  }
  if (err instanceof ZodError) {
    return jsonError(400, "Validación fallida", err.flatten());
  }
  if (err instanceof UploadValidationError) {
    return jsonError(400, err.message);
  }
  console.error("API error:", err);
  return jsonError(500, "Error interno del servidor");
}
