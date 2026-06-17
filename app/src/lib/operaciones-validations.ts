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
  fullName: z.string().trim().min(1, "Nombre completo requerido").max(200),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(50).optional().nullable(),
  startDate: z.string().regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD"),
  durationMonths: z.number().int().min(1).max(60),
  mentorUserId: z.string().cuid().optional().nullable(),
  closerUserId: z.string().cuid().optional().nullable(),
  ghlContactId: z.string().trim().max(100).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  personality: z.string().max(500).optional().nullable(),
  legalName: z.string().max(200).optional().nullable(),
  documentType: z.string().trim().max(50).optional().nullable(),
  documentNumber: z.string().trim().max(100).optional().nullable(),
  legalAddress: z.string().trim().max(300).optional().nullable(),
  legalCity: z.string().trim().max(120).optional().nullable(),
  legalState: z.string().trim().max(120).optional().nullable(),
  legalCountry: z.string().trim().max(120).optional().nullable(),
});

export const updateStudentSchema = createStudentSchema.partial().extend({
  status: studentStatusSchema.optional(),
  currentProgressLevel: progressLevelSchema.optional(),
  currentBottleneck: z.string().max(500).optional().nullable(),
});

/**
 * Palabra exacta que el ADMIN debe escribir para confirmar la eliminación
 * definitiva (hard delete) de un estudiante de prueba y toda su data operativa.
 */
export const HARD_DELETE_CONFIRMATION = "ELIMINAR";

export function isHardDeleteConfirmed(confirmation: unknown): boolean {
  return confirmation === HARD_DELETE_CONFIRMATION;
}

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

// Payment.amount is stored in the raw received currency (e.g. COP for a
// Colombian receiving account); the canonical USD value lives on
// `officialAmountUsd`. For the create/update payment schemas the receiving
// account is the source of truth for currency, so the schema can't
// pre-judge based on `body.currency` — it would reject a legit COP
// 1.500.000 the moment a legacy payload happened to carry
// `currency: "USD"`. Those two schemas therefore only enforce the local
// ceiling (1B) and defer the per-currency cap (USD 1M, local 1B) to the
// route, which knows `account.currency`. The enrollment-side
// `initialPaymentInputSchema` keeps the historical per-currency refine
// because its callers always pass an explicit, trusted currency.
const PAYMENT_AMOUNT_USD_MAX = 1_000_000;
const PAYMENT_AMOUNT_LOCAL_MAX = 1_000_000_000;

function formatMoneyLimit(value: number): string {
  return value.toLocaleString("es-CO");
}

function enforcePaymentAmountByCurrency(
  data: {
    amount?: number | null | undefined;
    currency?: string | null | undefined;
    receivedCurrency?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.amount == null) return;
  const explicit = data.currency ?? data.receivedCurrency ?? null;
  if (explicit == null) {
    if (data.amount > PAYMENT_AMOUNT_LOCAL_MAX) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: `El monto no puede exceder ${formatMoneyLimit(PAYMENT_AMOUNT_LOCAL_MAX)}`,
      });
    }
    return;
  }
  const currency = explicit.toUpperCase();
  const limit =
    currency === "USD" ? PAYMENT_AMOUNT_USD_MAX : PAYMENT_AMOUNT_LOCAL_MAX;
  if (data.amount > limit) {
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: `El monto en ${currency} no puede exceder ${formatMoneyLimit(limit)}`,
    });
  }
}

// Cuotas y cronogramas están canónicamente en USD: la conversión a moneda
// local se hace al registrar cada pago contra una cuenta receptora. Por eso
// el schema no acepta una moneda editable — ignoramos cualquier valor que
// venga en `currency` y el route fija "USD" al insertar las filas.
export const createScheduleSchema = z.object({
  totalAmount: z.number().positive().max(1_000_000),
  installments: z.number().int().min(1).max(24),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado YYYY-MM-DD"),
  frequency: z.enum(["monthly", "biweekly"]).default("monthly"),
  replaceExisting: z.boolean().default(false),
});

// Payments registered through the operations UI must always land in a
// concrete receiving account: the account decides the currency the operator
// actually moved, and the canonical USD value (`officialAmountUsd`) is what
// drives balances and schedule progression. Legacy payments with no account
// stay readable but cannot be edited or recreated through this schema.
export const createPaymentSchema = z.object({
  amount: z.number().positive().max(PAYMENT_AMOUNT_LOCAL_MAX),
  currency: z.string().length(3).optional(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado YYYY-MM-DD"),
  notes: z.string().max(2000).optional().nullable(),
  scheduleId: z.string().cuid().optional().nullable(),
  paymentAccountId: z
    .string()
    .trim()
    .min(1, "Cuenta receptora requerida")
    .max(200),
  officialAmountUsd: z.number().nonnegative().max(1_000_000).optional().nullable(),
  receivedAmount: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  receivedCurrency: z.string().length(3).optional().nullable(),
  exchangeRate: z.number().positive().max(1_000_000).optional().nullable(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// Las cuotas son USD canónico; el `currency` heredado de cronogramas legacy
// se mantiene en BD pero no se acepta como input del operador en cuotas
// nuevas.
export const addInstallmentSchema = z.object({
  amountDue: z.number().positive().max(1_000_000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado YYYY-MM-DD"),
});

export type AddInstallmentInput = z.infer<typeof addInstallmentSchema>;

// Progress Updates

export const createProgressUpdateSchema = z.object({
  periodStart: z.string().regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD"),
  periodEnd: z.string().regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD"),
  progressLevel: progressLevelSchema,
  bottleneck: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().min(1, "Observaciones requeridas").max(5000),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  monthlyRevenue: z.number().nonnegative().optional().nullable(),
  monthlyRevenueCurrency: z.string().length(3).optional().nullable(),
  monthlyOrders: z.number().int().nonnegative().optional().nullable(),
});

export type CreateProgressUpdateInput = z.infer<typeof createProgressUpdateSchema>;

// Payment and Schedule updates

// On edit we never accept `paymentAccountId: null` from the UI: if the field
// is sent at all it must point to a real account so the FX-derivation logic
// below has something to work with. `currency` stays optional but the route
// derives it from the account, not from the body — the schema keeps the
// field only for backward-compatible payloads.
export const updatePaymentSchema = z.object({
  amount: z.number().positive().max(PAYMENT_AMOUNT_LOCAL_MAX).optional(),
  currency: z.string().length(3).optional(),
  paidAt: z.string().regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD").optional(),
  notes: z.string().max(2000).optional().nullable(),
  scheduleId: z.string().cuid().optional().nullable(),
  paymentAccountId: z
    .string()
    .trim()
    .min(1, "Cuenta receptora requerida")
    .max(200)
    .optional(),
  officialAmountUsd: z.number().nonnegative().max(1_000_000).optional().nullable(),
  receivedAmount: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  receivedCurrency: z.string().length(3).optional().nullable(),
  exchangeRate: z.number().positive().max(1_000_000).optional().nullable(),
});

// La moneda de la cuota no es editable: las cuotas son USD canónico y
// cualquier ajuste se aplica sobre `amountDue` en USD. El route descarta
// también filas que vengan con `currency` para no degradar datos legacy.
export const updateScheduleSchema = z.object({
  amountDue: z.number().positive().max(1_000_000).optional(),
  dueDate: z.string().regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD").optional(),
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
  .regex(SLUG_REGEX, "Slug esperado en minúsculas con guiones");

const moneyUsdSchema = z.number().nonnegative().max(1_000_000);
const percentSchema = z.number().min(0).max(100);

// Foreign-key IDs in this codebase come from Prisma `String` columns and are
// not guaranteed to be CUIDs in production (legacy rows, manual seeds, etc.),
// so we only enforce non-empty + a sane upper bound. Use this anywhere a FK is
// accepted from a controlled picker on the client side.
const fkIdSchema = (label: string) =>
  z.string().trim().min(1, `${label} requerido`).max(200);

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

// PaymentAccount inputs are controlled: the titular comes from the User table
// (`ownerUserId`) and the provider from the PaymentProvider catalog
// (`paymentProviderId`). `ownerName` / `providerName` are server-derived
// snapshots of the canonical row at write time, so the API layer never
// accepts them from the client.
export const createPaymentAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  ownerUserId: fkIdSchema("Titular"),
  paymentProviderId: fkIdSchema("Proveedor"),
  currency: z.string().length(3).default("USD"),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

// Same rationale as updateProductSchema: defaults are dropped so PATCH
// reflects only the fields the caller sent.
export const updatePaymentAccountSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  ownerUserId: fkIdSchema("Titular").optional(),
  paymentProviderId: fkIdSchema("Proveedor").optional(),
  currency: z.string().length(3).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type CreatePaymentAccountInput = z.infer<typeof createPaymentAccountSchema>;
export type UpdatePaymentAccountInput = z.infer<typeof updatePaymentAccountSchema>;

export const createPaymentProviderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().max(40).default("OTHER"),
  isActive: z.boolean().default(true),
});

export const updatePaymentProviderSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: z.string().trim().max(40).optional(),
  isActive: z.boolean().optional(),
});

export type CreatePaymentProviderInput = z.infer<typeof createPaymentProviderSchema>;
export type UpdatePaymentProviderInput = z.infer<typeof updatePaymentProviderSchema>;

export const createStudentTagSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  description: z.string().max(500).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#?[0-9a-fA-F]{6}$/, "Color hex esperado como #aabbcc")
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
  startedAt: z
    .string()
    .regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD")
    .optional()
    .nullable(),
  endsAt: z.string().regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD").optional().nullable(),
  totalAmountUsd: moneyUsdSchema,
  initialPaymentUsd: moneyUsdSchema.optional().nullable(),
  installmentCount: z.number().int().min(1).max(24).optional().nullable(),
  commissionBaseUsd: moneyUsdSchema.optional().nullable(),
  commissionPercent: percentSchema.optional().nullable(),
  currency: z.string().length(3).default("USD"),
  paymentAccountId: fkIdSchema("Cuenta receptora").optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export type CreateEnrollmentBaseInput = z.infer<typeof createEnrollmentBaseSchema>;

// Initial payment carried alongside an enrollment creation request. Mirrors
// the Payment model fields the operator can set on day one (FULL_PAYMENT,
// DOWN_PAYMENT, RESERVATION). `paymentAccountId` is optional here so the same
// schema works both for routes that require it (sale flows) and routes that
// leave the account unset; the route layer decides whether to enforce it.
export const initialPaymentTypeSchema = z.enum([
  "FULL_PAYMENT",
  "DOWN_PAYMENT",
  "RESERVATION",
]);

export const initialPaymentInputSchema = z
  .object({
    amount: z.number().positive().max(PAYMENT_AMOUNT_LOCAL_MAX),
    currency: z.string().length(3).default("USD"),
    paidAt: z.string().regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD"),
    initialPaymentType: initialPaymentTypeSchema,
    paymentAccountId: fkIdSchema("Cuenta receptora").optional().nullable(),
    officialAmountUsd: moneyUsdSchema.optional().nullable(),
    receivedAmount: z.number().nonnegative().max(1_000_000_000).optional().nullable(),
    receivedCurrency: z.string().length(3).optional().nullable(),
    exchangeRate: z.number().positive().max(1_000_000).optional().nullable(),
    method: z.string().max(100).optional().nullable(),
    reference: z.string().max(200).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine(enforcePaymentAmountByCurrency);

export type InitialPaymentInput = z.infer<typeof initialPaymentInputSchema>;

export const installmentFrequencySchema = z.enum(["monthly", "biweekly"]);

// Full enrollment creation payload. Extends the base with the day-one initial
// payment (optional at the schema level — the route enforces it when the
// product has `requiresInitialPayment`) plus the installment plan inputs and
// the `grantAccessNow` switch that decides between PENDING and ACTIVE access.
export const createStudentProductEnrollmentSchema =
  createEnrollmentBaseSchema.extend({
    initialPayment: initialPaymentInputSchema.optional().nullable(),
    firstDueDate: z
      .string()
      .regex(ISO_DATE_REGEX, "Formato esperado YYYY-MM-DD")
      .optional()
      .nullable(),
    installmentFrequency: installmentFrequencySchema.default("monthly"),
    grantAccessNow: z.boolean().default(false),
  });

export type CreateStudentProductEnrollmentInput = z.infer<
  typeof createStudentProductEnrollmentSchema
>;

// Shape accepted as `initialEnrollment` on the create-student endpoint: same
// as the standalone enrollment schema minus `studentId` (the route resolves
// it from the student row it is about to create in the same transaction).
export const initialEnrollmentForStudentCreateSchema =
  createStudentProductEnrollmentSchema.omit({ studentId: true });

export type InitialEnrollmentForStudentCreateInput = z.infer<
  typeof initialEnrollmentForStudentCreateSchema
>;

// POST /api/operaciones/students payload: the original student fields plus an
// optional `initialEnrollment` block. When the block is present the route
// atomically creates the Student, the StudentProductEnrollment, the initial
// Payment and the PaymentSchedule rows under the same transaction. Leaving the
// block undefined preserves the old "create student only" behaviour.
export const createStudentWithInitialEnrollmentSchema = createStudentSchema.extend({
  initialEnrollment: initialEnrollmentForStudentCreateSchema.optional().nullable(),
});

export type CreateStudentWithInitialEnrollmentInput = z.infer<
  typeof createStudentWithInitialEnrollmentSchema
>;

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
    { message: "Los porcentajes de referidos deben sumar 100" },
  );

export type ReferralSplitList = z.infer<typeof referralSplitListSchema>;
