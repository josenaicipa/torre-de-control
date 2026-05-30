// Shared helpers for the Seguimientos bulk-actions surface: zod schema used by
// the endpoint, pure set utilities for the row/group checkboxes, and an
// outcome summarizer the bulk bar uses to talk back to the operator. Keeping
// them isolated from React lets the unit tests pin behavior without spinning
// up Prisma or the renderer.

import { z } from "zod";
import { CONTACT_CHANNELS, FOLLOW_UP_OUTCOMES } from "./follow-up-schema";

// The bulk surface intentionally exposes a smaller patch than the per-id
// endpoint. Free-form text edits (notes / result / per-case dates) stay in
// the drawer where the operator can review one case at a time; the bulk bar
// only touches status, priority, responsable, plus the Phase B fields that
// make sense to apply uniformly to a batch: snoozedUntil (posponer), the
// contact channel used for the round, and the outcome of the round. An
// accidental click on 50 selected rows still cannot wipe out per-case notes
// or one-off dates.
const dateLikeString = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: "Fecha inválida",
  });

export const bulkPatchSchema = z
  .object({
    ids: z
      .array(z.string().trim().min(1, "id vacío"))
      .min(1, "Sin seguimientos seleccionados")
      .max(100, "Máximo 100 seguimientos por lote")
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Hay ids duplicados en la selección",
      }),
    patch: z
      .object({
        status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"]).optional(),
        priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
        assignedToId: z.string().optional().nullable(),
        outcome: z.enum(FOLLOW_UP_OUTCOMES).optional().nullable(),
        contactChannel: z.enum(CONTACT_CHANNELS).optional().nullable(),
        snoozedUntil: dateLikeString.optional().nullable(),
      })
      .strict()
      .refine((p) => Object.keys(p).length > 0, {
        message: "El lote no tiene cambios",
      }),
  })
  .strict();

export type BulkPatchInput = z.infer<typeof bulkPatchSchema>;

export interface BulkFailure {
  id: string;
  message: string;
  code?: string;
}

export interface BulkOutcome {
  requested: number;
  updated: number;
  failed: number;
  failures: BulkFailure[];
}

// Toggle a single row's selection without mutating the source so React state
// updates remain referentially safe.
export function toggleSelection(source: Set<string>, id: string): Set<string> {
  const next = new Set(source);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function mergeSelection(
  source: Set<string>,
  ids: readonly string[],
): Set<string> {
  const next = new Set(source);
  for (const id of ids) next.add(id);
  return next;
}

export function removeFromSelection(
  source: Set<string>,
  ids: readonly string[],
): Set<string> {
  const next = new Set(source);
  for (const id of ids) next.delete(id);
  return next;
}

// "Every id of this visible group is already selected" — used to drive the
// indeterminate/checked state of the master and per-bucket checkboxes.
export function isEverySelected(
  source: Set<string>,
  ids: readonly string[],
): boolean {
  if (ids.length === 0) return false;
  for (const id of ids) if (!source.has(id)) return false;
  return true;
}

export function isSomeSelected(
  source: Set<string>,
  ids: readonly string[],
): boolean {
  if (ids.length === 0) return false;
  for (const id of ids) if (source.has(id)) return true;
  return false;
}

// Master checkbox click: if the group is fully selected, clear it; otherwise
// add the missing ids so a partial selection becomes complete in one click.
export function diffSelectionForGroup(
  source: Set<string>,
  ids: readonly string[],
): Set<string> {
  if (ids.length === 0) return new Set(source);
  if (isEverySelected(source, ids)) return removeFromSelection(source, ids);
  return mergeSelection(source, ids);
}

export interface BulkOutcomeSummary {
  tone: "success" | "partial" | "error";
  message: string;
}

export function summarizeBulkOutcome(outcome: BulkOutcome): BulkOutcomeSummary {
  const { updated, failed } = outcome;
  if (updated > 0 && failed === 0) {
    const word = updated === 1 ? "seguimiento actualizado" : "seguimientos actualizados";
    return { tone: "success", message: `${updated} ${word}.` };
  }
  if (updated > 0 && failed > 0) {
    return {
      tone: "partial",
      message: `${updated} actualizados · ${failed} con error.`,
    };
  }
  return {
    tone: "error",
    message: "No se pudo actualizar la selección.",
  };
}
