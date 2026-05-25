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
  mentorUserId: z.string().cuid().optional().nullable(),
  closerUserId: z.string().cuid().optional().nullable(),
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
  mentorUserId: z.string().cuid().optional(),
  closerUserId: z.string().cuid().optional(),
  status: studentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

// ───────── Payments + Schedule ─────────

export const createScheduleSchema = z.object({
  totalAmount: z.number().positive().max(1_000_000),
  installments: z.number().int().min(1).max(24),
  currency: z.string().length(3).default("USD"),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  frequency: z.enum(["monthly", "biweekly"]).default("monthly"),
  replaceExisting: z.boolean().default(false),
});

export const createPaymentSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  currency: z.string().length(3).default("USD"),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  method: z.string().max(100).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  scheduleId: z.string().cuid().optional().nullable(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const addInstallmentSchema = z.object({
  amountDue: z.number().positive().max(1_000_000),
  currency: z.string().length(3).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});

export type AddInstallmentInput = z.infer<typeof addInstallmentSchema>;

// Progress Updates

export const createProgressUpdateSchema = z.object({
  periodStart: z.string().regex(ISO_DATE_REGEX, "expected YYYY-MM-DD"),
  periodEnd: z.string().regex(ISO_DATE_REGEX, "expected YYYY-MM-DD"),
  progressLevel: progressLevelSchema,
  bottleneck: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().min(1, "notes required").max(5000),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  monthlyRevenue: z.number().nonnegative().optional().nullable(),
  monthlyRevenueCurrency: z.string().length(3).optional().nullable(),
  monthlyOrders: z.number().int().nonnegative().optional().nullable(),
});

export type CreateProgressUpdateInput = z.infer<typeof createProgressUpdateSchema>;
