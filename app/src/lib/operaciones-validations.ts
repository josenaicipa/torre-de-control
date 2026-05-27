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

// Payment and Schedule updates

export const updatePaymentSchema = z.object({
  amount: z.number().positive().max(1_000_000).optional(),
  currency: z.string().length(3).optional(),
  paidAt: z.string().regex(ISO_DATE_REGEX, "expected YYYY-MM-DD").optional(),
  method: z.string().max(100).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  scheduleId: z.string().cuid().optional().nullable(),
});

export const updateScheduleSchema = z.object({
  amountDue: z.number().positive().max(1_000_000).optional(),
  currency: z.string().length(3).optional(),
  dueDate: z.string().regex(ISO_DATE_REGEX, "expected YYYY-MM-DD").optional(),
});

export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

// Student Monthly Metrics

export const upsertMonthlyMetricsSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  revenue: z.number().nonnegative(),
  currency: z.string().length(3).default("COP"),
  orders: z.number().int().nonnegative(),
  status: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpsertMonthlyMetricsInput = z.infer<typeof upsertMonthlyMetricsSchema>;

// ───────── Operaciones · Products architecture (PR1) ─────────
//
// All schemas mirror the Prisma models in app/prisma/schema.prisma. Money
// fields cap at 1M USD as elsewhere; percent fields are 0-100 with cents.
// Slugs are lower-kebab; currencies are ISO 4217 3-letter codes (we don't
// enforce the full list — Prisma accepts the string).

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(SLUG_REGEX, "expected lower-kebab-case slug");

const moneyUsdSchema = z.number().nonnegative().max(1_000_000);
const percentSchema = z.number().min(0).max(100);

export const productSaleLimitSchema = z.enum(["ONE_PER_STUDENT", "UNLIMITED"]);

// LearnWorlds resource kinds we provision against; matches the Prisma enum
// LearnWorldsAccessType. `lwExternalId` is the LW course/bundle slug or id and
// is required for the integration to resolve the resource; the other fields
// are convenience metadata cached on our side (see schema.prisma).
export const learnWorldsAccessTypeSchema = z.enum([
  "COURSE",
  "BUNDLE",
  "SUBSCRIPTION",
]);

export const learnWorldsAccessConfigInputSchema = z.object({
  lwProductType: learnWorldsAccessTypeSchema,
  lwExternalId: z.string().trim().min(1).max(200),
  lwDisplayName: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().default(true),
});

export type LearnWorldsAccessConfigInput = z.infer<
  typeof learnWorldsAccessConfigInputSchema
>;

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(5000).optional().nullable(),
  basePriceUsd: moneyUsdSchema,
  currency: z.string().length(3).default("USD"),
  saleLimit: productSaleLimitSchema.default("ONE_PER_STUDENT"),
  allowsInstallments: z.boolean().default(true),
  requiresInitialPayment: z.boolean().default(false),
  generatesCommission: z.boolean().default(false),
  defaultCommissionPercent: percentSchema.default(0),
  isMainProduct: z.boolean().default(false),
  isActive: z.boolean().default(true),
  // Optional initial set of LearnWorlds resources granted by this product.
  // An empty array is valid (no LW access); omit the field entirely if the
  // caller doesn't want to set any.
  learnWorldsAccessConfigs: z
    .array(learnWorldsAccessConfigInputSchema)
    .optional(),
});

// PATCH /products/[id]: every field is optional and defaults are dropped so
// the parsed body reflects only what the caller actually sent (Zod's
// `.partial()` keeps `.default()` values, which would silently rewrite
// unrelated fields). When `learnWorldsAccessConfigs` is present, the route
// replaces the existing set (deleteMany + createMany inside a transaction);
// when omitted, the existing configs are left untouched.
export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(5000).optional().nullable(),
  basePriceUsd: moneyUsdSchema.optional(),
  currency: z.string().length(3).optional(),
  saleLimit: productSaleLimitSchema.optional(),
  allowsInstallments: z.boolean().optional(),
  requiresInitialPayment: z.boolean().optional(),
  generatesCommission: z.boolean().optional(),
  defaultCommissionPercent: percentSchema.optional(),
  isMainProduct: z.boolean().optional(),
  isActive: z.boolean().optional(),
  learnWorldsAccessConfigs: z
    .array(learnWorldsAccessConfigInputSchema)
    .optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// Query param schema for the catalog list endpoints (products,
// payment-accounts). `active=all` disables filtering; the default mirrors the
// UI expectation that pickers only show active rows.
export const listCatalogActiveQuerySchema = z.object({
  active: z.enum(["true", "false", "all"]).default("true"),
});

export type ListCatalogActiveQuery = z.infer<typeof listCatalogActiveQuerySchema>;

export const createPaymentAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  ownerName: z.string().trim().max(200).optional().nullable(),
  providerName: z.string().trim().max(120).optional().nullable(),
  currency: z.string().length(3).default("USD"),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

// Same rationale as updateProductSchema: defaults are dropped so PATCH
// reflects only the fields the caller sent.
export const updatePaymentAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  ownerName: z.string().trim().max(200).optional().nullable(),
  providerName: z.string().trim().max(120).optional().nullable(),
  currency: z.string().length(3).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreatePaymentAccountInput = z.infer<typeof createPaymentAccountSchema>;
export type UpdatePaymentAccountInput = z.infer<typeof updatePaymentAccountSchema>;

export const createStudentTagSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  description: z.string().max(500).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#?[0-9a-fA-F]{6}$/, "expected hex color like #aabbcc")
    .optional()
    .nullable(),
  isAutomatic: z.boolean().default(false),
  allowAutomaticAssignment: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateStudentTagSchema = createStudentTagSchema.partial();

export type CreateStudentTagInput = z.infer<typeof createStudentTagSchema>;
export type UpdateStudentTagInput = z.infer<typeof updateStudentTagSchema>;

export const enrollmentStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
]);

export const accessStatusSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
  "SYNC_ERROR",
]);

// Base shape for enrolling a student in a product. Downstream flows (initial
// payment + installment plan creation) are validated by their own schemas;
// this only covers the StudentProductEnrollment row itself.
export const createEnrollmentBaseSchema = z.object({
  studentId: z.string().cuid(),
  productId: z.string().cuid(),
  startedAt: z.string().regex(ISO_DATE_REGEX, "expected YYYY-MM-DD"),
  endsAt: z.string().regex(ISO_DATE_REGEX, "expected YYYY-MM-DD").optional().nullable(),
  totalAmountUsd: moneyUsdSchema,
  initialPaymentUsd: moneyUsdSchema.optional().nullable(),
  installmentCount: z.number().int().min(1).max(24).optional().nullable(),
  commissionBaseUsd: moneyUsdSchema.optional().nullable(),
  commissionPercent: percentSchema.optional().nullable(),
  currency: z.string().length(3).default("USD"),
  paymentAccountId: z.string().cuid().optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export type CreateEnrollmentBaseInput = z.infer<typeof createEnrollmentBaseSchema>;

// A single referral row inside an enrollment's commission split. The full
// commission editor sums these and must total 100% (see
// referralSplitListSchema below and validateReferralSplitsSumTo100 in
// operaciones-products.ts).
export const referralSplitItemSchema = z.object({
  referralId: z.string().cuid(),
  splitPercent: percentSchema,
  commissionBaseUsd: moneyUsdSchema,
});

export type ReferralSplitItem = z.infer<typeof referralSplitItemSchema>;

// List-level validator that enforces the cent-tolerant sum-to-100 rule on the
// split percentages. Same tolerance as validateReferralSplitsSumTo100 in
// operaciones-products.ts so the API and the form-side validation agree.
export const referralSplitListSchema = z
  .array(referralSplitItemSchema)
  .refine(
    (items) => {
      if (items.length === 0) return true;
      const sum = items.reduce((acc, item) => acc + item.splitPercent, 0);
      return Math.abs(sum - 100) <= 0.01;
    },
    { message: "referral splits must sum to 100" },
  );

export type ReferralSplitList = z.infer<typeof referralSplitListSchema>;
