import { z } from "zod";

/**
 * Schemas de validación para todos los inputs del módulo Operaciones.
 * Usados en API routes (body validation) y formularios (client validation reusable).
 */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const studentStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "DROPPED",
  "EXTENDED",
  "ACCESS_REVOKED",
]);

export const progressLevelSchema = z.enum(["ALTO", "MEDIO", "BAJO", "SIN_DATO"]);

export const createStudentSchema = z.object({
  fullName: z.string().trim().min(1, "fullName required").max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(50).optional().nullable(),
  startDate: z.string().regex(ISO_DATE_REGEX, "expected YYYY-MM-DD"),
  durationMonths: z.number().int().min(1).max(60),
  mentorId: z.string().cuid().optional().nullable(),
  programId: z.string().cuid().optional().nullable(),
  ghlContactId: z.string().trim().max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  personality: z.string().max(500).optional().nullable(),
  legalName: z.string().max(200).optional().nullable(),
});

export const updateStudentSchema = createStudentSchema.partial().extend({
  status: studentStatusSchema.optional(),
  currentProgressLevel: progressLevelSchema.optional(),
  currentBottleneck: z.string().max(500).optional().nullable(),
});

export const listStudentsQuerySchema = z.object({
  search: z.string().max(200).optional(),
  mentorId: z.string().cuid().optional(),
  programId: z.string().cuid().optional(),
  status: studentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const createMentorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(50).optional().nullable(),
});

export const updateMentorSchema = createMentorSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type CreateMentorInput = z.infer<typeof createMentorSchema>;
export type UpdateMentorInput = z.infer<typeof updateMentorSchema>;
