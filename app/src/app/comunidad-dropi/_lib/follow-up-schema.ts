// Shared zod schema + enum constants for Comunidad Dropi seguimientos PATCH
// surfaces. Extracted from the route handler so the schema, the drawer payload
// and the tests share a single source of truth — UI labels stay in Spanish in
// tokens.ts, the wire values stay in English here.

import { z } from "zod";

export const FOLLOW_UP_OUTCOMES = [
  "ANSWERED",
  "NO_ANSWER",
  "INTERESTED",
  "NOT_INTERESTED",
  "SCHEDULED",
  "NO_REPLY",
  "OTHER",
] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

export const CONTACT_CHANNELS = ["WHATSAPP", "CALL", "EMAIL", "OTHER"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

// Accept either an ISO timestamp or a YYYY-MM-DD calendar day (the value the
// drawer's `<input type="date">` produces). Anything else is rejected so a
// typo cannot land in the database as an invalid Date.
const dateLikeString = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: "Fecha inválida",
  });

export const followUpPatchSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "DISMISSED"]).optional(),
  priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
  assignedToId: z.string().optional().nullable(),
  suggestedAction: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  result: z.string().trim().max(1000).optional().nullable(),
  outcome: z.enum(FOLLOW_UP_OUTCOMES).optional().nullable(),
  contactChannel: z.enum(CONTACT_CHANNELS).optional().nullable(),
  snoozedUntil: dateLikeString.optional().nullable(),
  dueDate: dateLikeString.optional().nullable(),
  contactedAt: dateLikeString.optional().nullable(),
  nextActionAt: dateLikeString.optional().nullable(),
});
export type FollowUpPatchInput = z.infer<typeof followUpPatchSchema>;
