/**
 * Shared business logic for opening a StudentProductEnrollment.
 *
 * Used by both POST /api/operaciones/students/[id]/products (existing student)
 * and POST /api/operaciones/students (new student created with an initial
 * enrollment in the same transaction). Centralising it keeps the product /
 * payment-account / installment validations identical across both entry
 * points and removes the long duplicated block that would otherwise live in
 * the new route.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildEnrollmentScheduleRows,
  calculateEnrollmentBalance,
  canSellProductToStudent,
  deriveDefaultCommissionBaseFromInitialPayment,
  type InstallmentPlanRow,
  type ProductSaleLimit,
} from "./operaciones-products";
import {
  buildUpgradeAmounts,
  calculateUpgradeCredit,
  canUpgradeToLevel,
} from "./operaciones-upgrade";
import { buildStudentActivationUpdate } from "@/domain/students";
import type {
  CreateStudentProductEnrollmentInput,
  InitialPaymentInput,
} from "./operaciones-validations";

/**
 * Subset of Prisma we need for the read-side validations. Accepts both the
 * full PrismaClient and a TransactionClient — the route layer decides whether
 * to validate before opening the tx (existing student) or inside it (new
 * student created in the same tx).
 */
type ReadClient = Pick<
  PrismaClient,
  "product" | "paymentAccount" | "studentProductEnrollment"
> | Prisma.TransactionClient;

/** Body shape accepted by both routes: the standard enrollment payload minus
 *  studentId, which the caller resolves out-of-band. */
export type EnrollmentRequestBody = Omit<
  CreateStudentProductEnrollmentInput,
  "studentId"
>;

/** Thrown by prepareEnrollmentCreate to short-circuit with an HTTP-shaped
 *  failure. The route layer maps it to jsonError(status, message). */
export class EnrollmentValidationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "EnrollmentValidationError";
  }
}

interface LoadedProduct {
  id: string;
  name: string;
  isActive: boolean;
  saleLimit: ProductSaleLimit;
  allowsInstallments: boolean;
  requiresInitialPayment: boolean;
  generatesCommission: boolean;
  defaultCommissionPercent: Prisma.Decimal;
  programLevel: number | null;
  basePriceUsd: Prisma.Decimal;
}

/**
 * Computed money + snapshot breakdown for a level upgrade. Present only when
 * the request carried a valid `upgradeFromEnrollmentId`. The route persists
 * these onto the new enrollment so the upgrade chain and the credit applied are
 * auditable later.
 */
export interface PreparedUpgrade {
  fromEnrollmentId: string;
  grossProgramPriceUsd: number;
  upgradeCreditUsd: number;
  netAmountUsd: number;
  programLevelSnapshot: number | null;
  productNameSnapshot: string;
}

export interface PreparedEnrollment {
  product: LoadedProduct;
  initialPayment: InitialPaymentInput | null;
  initialPaymentAccountId: string | null;
  initialPaymentUsd: number;
  totalAmountUsd: number;
  balanceAfterInitial: number;
  scheduleRows: InstallmentPlanRow[];
  commissionBaseUsd: number | null;
  commissionPercent: number | null;
  grantAccess: boolean;
  /** Non-null when this enrollment is a level upgrade of a prior one. */
  upgrade: PreparedUpgrade | null;
}

export interface PrepareEnrollmentOptions {
  /**
   * When provided, the helper enforces the ONE_PER_STUDENT sale limit by
   * counting active enrollments for (studentId, productId). Omit when the
   * student does not exist yet (the count is trivially 0).
   */
  enforceSaleLimitForStudentId?: string;
  /**
   * Target student id, required to validate `upgradeFromEnrollmentId`: the
   * source enrollment must belong to this student and the destination product
   * must not already have an active enrollment. Upgrades are only possible for
   * an existing student, so the new-student flow leaves this unset and any
   * upgrade request without it is rejected.
   */
  studentId?: string;
}

/**
 * Runs every read-side validation needed before persisting a new enrollment:
 * loads the product, validates the initial payment account, the FX rule for
 * non-USD initial payments, the total-vs-initial cap, the installment-plan
 * rule for the remaining balance and (optionally) the sale-limit check.
 *
 * Returns the prepared values ready to be written by createValidatedEnrollmentInTx.
 * Throws EnrollmentValidationError(status, message) on the first failure.
 */
export async function prepareEnrollmentCreate(
  client: ReadClient,
  body: EnrollmentRequestBody,
  opts: PrepareEnrollmentOptions = {},
): Promise<PreparedEnrollment> {
  const product = await client.product.findUnique({
    where: { id: body.productId },
    select: {
      id: true,
      name: true,
      isActive: true,
      saleLimit: true,
      allowsInstallments: true,
      requiresInitialPayment: true,
      generatesCommission: true,
      defaultCommissionPercent: true,
      programLevel: true,
      basePriceUsd: true,
    },
  });
  if (!product) {
    throw new EnrollmentValidationError(404, "Producto no encontrado");
  }
  if (!product.isActive) {
    throw new EnrollmentValidationError(400, "El producto no está activo");
  }

  // Upgrade path: when the request points at a prior enrollment, the
  // destination total is not the caller-supplied amount but the catalog gross
  // of the destination program minus the credit actually paid on the origin.
  const upgrade = await prepareUpgrade(client, body, product, opts.studentId);

  const initialPayment = body.initialPayment ?? null;
  if (product.requiresInitialPayment && !initialPayment) {
    throw new EnrollmentValidationError(
      400,
      "Este producto requiere un pago inicial",
    );
  }

  // Business rule: every initial payment must land in a known active receiver
  // account. We fall back to the enrollment-level account so the caller can
  // set it once and have the payment inherit it; the resolved id is what we
  // persist on Payment.paymentAccountId.
  const initialPaymentAccountId = initialPayment
    ? (initialPayment.paymentAccountId ?? body.paymentAccountId ?? null)
    : null;
  if (initialPayment && !initialPaymentAccountId) {
    throw new EnrollmentValidationError(
      400,
      "El pago inicial requiere una cuenta receptora (paymentAccountId)",
    );
  }

  // Business rule: the dashboard balance is denominated in USD, so any
  // non-USD initial payment must carry an explicit officialAmountUsd > 0
  // for the FX-resolved value. Without it the enrollment balance would
  // silently underreport.
  if (
    initialPayment &&
    initialPayment.currency.toUpperCase() !== "USD" &&
    (initialPayment.officialAmountUsd == null ||
      Number(initialPayment.officialAmountUsd) <= 0)
  ) {
    throw new EnrollmentValidationError(
      400,
      "officialAmountUsd > 0 es obligatorio cuando initialPayment.currency no es USD",
    );
  }

  // Single round-trip to validate every referenced account (enrollment +
  // initial payment, de-duplicated when they coincide).
  const accountIdsToCheck = Array.from(
    new Set(
      [body.paymentAccountId ?? null, initialPaymentAccountId].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  );
  if (accountIdsToCheck.length > 0) {
    const accounts = await client.paymentAccount.findMany({
      where: { id: { in: accountIdsToCheck } },
      select: { id: true, isActive: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const id of accountIdsToCheck) {
      const found = byId.get(id);
      if (!found) {
        throw new EnrollmentValidationError(400, "La cuenta de pago no existe");
      }
      if (!found.isActive) {
        throw new EnrollmentValidationError(
          400,
          "La cuenta de pago no está activa",
        );
      }
    }
  }

  if (
    product.saleLimit === "ONE_PER_STUDENT" &&
    opts.enforceSaleLimitForStudentId
  ) {
    const activeCount = await client.studentProductEnrollment.count({
      where: {
        studentId: opts.enforceSaleLimitForStudentId,
        productId: product.id,
        status: { in: ["ACTIVE", "PAUSED"] },
      },
    });
    if (!canSellProductToStudent(product.saleLimit, activeCount)) {
      throw new EnrollmentValidationError(
        409,
        "El estudiante ya tiene un enrollment activo o pausado de este producto",
      );
    }
  }

  const initialPaymentUsd = initialPayment
    ? Number(
        initialPayment.officialAmountUsd ??
          (initialPayment.currency.toUpperCase() === "USD"
            ? initialPayment.amount
            : 0),
      )
    : 0;

  // For an upgrade the net (gross − credit) is authoritative and overrides the
  // caller-supplied total; a normal sale keeps the agreed body amount.
  const totalAmountUsd = upgrade
    ? upgrade.netAmountUsd
    : Number(body.totalAmountUsd);
  if (initialPaymentUsd - totalAmountUsd > 0.01) {
    throw new EnrollmentValidationError(
      400,
      "El pago inicial (USD) no puede exceder el monto total del enrollment",
    );
  }
  const balanceAfterInitial = Math.max(
    0,
    Math.round((totalAmountUsd - initialPaymentUsd) * 100) / 100,
  );

  // Saldo restante después del inicial: el plan de cuotas solo se exige cuando
  // hay financiación (sin inicial, o inicial tipo DOWN_PAYMENT). Reservas y
  // pagos totales pueden dejar saldo sin plan formal — el saldo se cobra por
  // fuera y se refleja en balanceUsd. Si el saldo es 0 no se exige nada y
  // tampoco se crea schedule (buildEnrollmentScheduleRows devuelve []).
  const balanceFinancedByInstallments =
    balanceAfterInitial > 0 &&
    (!initialPayment || initialPayment.initialPaymentType === "DOWN_PAYMENT");
  if (balanceFinancedByInstallments && !product.allowsInstallments) {
    throw new EnrollmentValidationError(
      400,
      "Este producto no permite cuotas; el pago inicial debe cubrir el monto total",
    );
  }
  if (balanceFinancedByInstallments) {
    if (!body.installmentCount || !body.firstDueDate) {
      throw new EnrollmentValidationError(
        400,
        "Con saldo restante > 0 se requieren installmentCount y firstDueDate",
      );
    }
  }

  const scheduleRows = buildEnrollmentScheduleRows({
    totalAmountUsd,
    initialPaymentUsd,
    installmentCount: body.installmentCount ?? null,
    firstDueDate: body.firstDueDate
      ? new Date(`${body.firstDueDate}T00:00:00.000Z`)
      : null,
    frequency: body.installmentFrequency,
  });

  const commissionBaseUsd = product.generatesCommission
    ? body.commissionBaseUsd != null
      ? Number(body.commissionBaseUsd)
      : deriveDefaultCommissionBaseFromInitialPayment(
          initialPayment
            ? {
                isInitialPayment: true,
                initialPaymentType: initialPayment.initialPaymentType,
                officialAmountUsd: initialPayment.officialAmountUsd ?? null,
                amount: initialPayment.amount,
                currency: initialPayment.currency,
              }
            : null,
        )
    : null;

  const commissionPercent = product.generatesCommission
    ? body.commissionPercent != null
      ? Number(body.commissionPercent)
      : Number(product.defaultCommissionPercent)
    : null;

  return {
    product,
    initialPayment,
    initialPaymentAccountId,
    initialPaymentUsd,
    totalAmountUsd,
    balanceAfterInitial,
    scheduleRows,
    commissionBaseUsd,
    commissionPercent,
    grantAccess: body.grantAccessNow === true,
    upgrade,
  };
}

/**
 * Validates and prices a level upgrade. Returns null for a normal sale (no
 * `upgradeFromEnrollmentId`). Throws EnrollmentValidationError on any rule
 * violation: missing student context, unknown / foreign source enrollment, a
 * non-upward level move, or an already-active enrollment of the destination
 * product. The credit is what the student really paid on the origin and the
 * net (gross − credit, floored at 0) is what the upgrade will charge.
 */
async function prepareUpgrade(
  client: ReadClient,
  body: EnrollmentRequestBody,
  product: LoadedProduct,
  studentId: string | undefined,
): Promise<PreparedUpgrade | null> {
  if (!body.upgradeFromEnrollmentId) return null;
  if (!studentId) {
    throw new EnrollmentValidationError(
      400,
      "Un upgrade requiere un estudiante existente",
    );
  }

  const source = await client.studentProductEnrollment.findUnique({
    where: { id: body.upgradeFromEnrollmentId },
    select: {
      id: true,
      studentId: true,
      programLevelSnapshot: true,
      product: { select: { programLevel: true } },
      payments: {
        select: { amount: true, currency: true, officialAmountUsd: true },
      },
    },
  });
  if (!source) {
    throw new EnrollmentValidationError(
      404,
      "La inscripción de origen del upgrade no existe",
    );
  }
  if (source.studentId !== studentId) {
    throw new EnrollmentValidationError(
      400,
      "La inscripción de origen pertenece a otro estudiante",
    );
  }

  const sourceLevel = source.programLevelSnapshot ?? source.product?.programLevel ?? null;
  const targetLevel = product.programLevel ?? null;
  if (!canUpgradeToLevel(sourceLevel, targetLevel)) {
    throw new EnrollmentValidationError(
      400,
      "El nivel destino del upgrade debe ser superior al de origen",
    );
  }

  // No second active enrollment of the destination program: an upgrade replaces
  // the prior level, it does not stack on top of an existing destination sale.
  const activeDestinationCount = await client.studentProductEnrollment.count({
    where: {
      studentId,
      productId: product.id,
      status: { in: ["ACTIVE", "PAUSED"] },
    },
  });
  if (activeDestinationCount > 0) {
    throw new EnrollmentValidationError(
      409,
      "El estudiante ya tiene una inscripción activa del producto destino",
    );
  }

  const credit = calculateUpgradeCredit(
    source.payments.map((p) => ({
      amount: p.amount.toString(),
      currency: p.currency,
      officialAmountUsd: p.officialAmountUsd?.toString() ?? null,
    })),
  );
  const amounts = buildUpgradeAmounts(product.basePriceUsd.toString(), credit);

  return {
    fromEnrollmentId: source.id,
    grossProgramPriceUsd: amounts.grossProgramPriceUsd,
    upgradeCreditUsd: amounts.upgradeCreditUsd,
    netAmountUsd: amounts.netAmountUsd,
    programLevelSnapshot: targetLevel,
    productNameSnapshot: product.name,
  };
}

export interface CreateValidatedEnrollmentArgs {
  tx: Prisma.TransactionClient;
  studentId: string;
  actorUserId: string;
  body: EnrollmentRequestBody;
  validated: PreparedEnrollment;
}

export interface CreateValidatedEnrollmentResult {
  enrollment: Awaited<
    ReturnType<Prisma.TransactionClient["studentProductEnrollment"]["update"]>
  >;
  createdPaymentId: string | null;
}

/**
 * Writes the enrollment, the optional initial payment and the schedule rows
 * inside the provided transaction, then re-computes the cached balanceUsd via
 * calculateEnrollmentBalance. The caller owns the transaction so multi-entity
 * flows (e.g. student + enrollment) can share atomicity.
 */
export async function createValidatedEnrollmentInTx(
  args: CreateValidatedEnrollmentArgs,
): Promise<CreateValidatedEnrollmentResult> {
  const { tx, studentId, actorUserId, body, validated } = args;
  const {
    product,
    initialPayment,
    initialPaymentAccountId,
    initialPaymentUsd,
    totalAmountUsd,
    balanceAfterInitial,
    scheduleRows,
    commissionBaseUsd,
    commissionPercent,
    upgrade,
  } = validated;

  const enrollment = await tx.studentProductEnrollment.create({
    data: {
      studentId,
      productId: product.id,
      status: "ACTIVE",
      startedAt: body.startedAt
        ? new Date(`${body.startedAt}T00:00:00.000Z`)
        : null,
      endsAt: body.endsAt
        ? new Date(`${body.endsAt}T00:00:00.000Z`)
        : null,
      totalAmountUsd,
      initialPaymentUsd: initialPayment ? initialPaymentUsd : null,
      balanceUsd: balanceAfterInitial,
      installmentCount: body.installmentCount ?? null,
      commissionBaseUsd,
      commissionPercent,
      currency: body.currency,
      paymentAccountId: body.paymentAccountId ?? null,
      contractTemplateKind: body.contractTemplateKind ?? "TRADITIONAL",
      // A new enrollment never grants real access: Torre de Control owns the
      // decision. Access stays PENDING until the contract is approved and
      // LearnWorlds is provisioned. grantAccessNow is ignored on purpose.
      accessStatus: "PENDING",
      accessGrantedAt: null,
      learnWorldsSyncStatus: "pending",
      notes: body.notes ?? null,
      ...(upgrade
        ? {
            upgradeFromEnrollmentId: upgrade.fromEnrollmentId,
            grossProgramPriceUsd: upgrade.grossProgramPriceUsd,
            upgradeCreditUsd: upgrade.upgradeCreditUsd,
            netAmountUsd: upgrade.netAmountUsd,
            programLevelSnapshot: upgrade.programLevelSnapshot,
            productNameSnapshot: upgrade.productNameSnapshot,
          }
        : {}),
    },
  });

  let createdPaymentId: string | null = null;
  if (initialPayment) {
    const paidAt = new Date(`${initialPayment.paidAt}T12:00:00.000Z`);
    const payment = await tx.payment.create({
      data: {
        studentId,
        enrollmentId: enrollment.id,
        paymentAccountId: initialPaymentAccountId,
        amount: initialPayment.amount,
        currency: initialPayment.currency,
        officialAmountUsd: initialPayment.officialAmountUsd ?? null,
        receivedAmount: initialPayment.receivedAmount ?? null,
        receivedCurrency: initialPayment.receivedCurrency ?? null,
        exchangeRate: initialPayment.exchangeRate ?? null,
        isInitialPayment: true,
        initialPaymentType: initialPayment.initialPaymentType,
        paidAt,
        method: initialPayment.method ?? null,
        reference: initialPayment.reference ?? null,
        notes: initialPayment.notes ?? null,
        recordedById: actorUserId,
      },
    });
    createdPaymentId = payment.id;
  }

  if (scheduleRows.length > 0) {
    await tx.paymentSchedule.createMany({
      data: scheduleRows.map((row) => ({
        studentId,
        enrollmentId: enrollment.id,
        installmentNumber: row.installmentNumber,
        amountDue: row.amountDue,
        currency: body.currency,
        dueDate: row.dueDate,
        status: "PENDING" as const,
      })),
    });
  }

  const payments = await tx.payment.findMany({
    where: { enrollmentId: enrollment.id },
    select: {
      amount: true,
      currency: true,
      officialAmountUsd: true,
    },
  });
  const balance = calculateEnrollmentBalance(
    totalAmountUsd,
    payments.map((p) => ({
      amount: p.amount.toString(),
      currency: p.currency,
      officialAmountUsd: p.officialAmountUsd?.toString() ?? null,
    })),
  );
  const updated = await tx.studentProductEnrollment.update({
    where: { id: enrollment.id },
    data: { balanceUsd: balance.balanceUsd },
    include: {
      product: true,
      paymentAccount: true,
      payments: { orderBy: { paidAt: "desc" } },
      paymentSchedules: { orderBy: { installmentNumber: "asc" } },
    },
  });

  // A real enrollment means the student is no longer a pending n8n/GHL ficha:
  // flip a minimal INACTIVE+durationAssumed row to ACTIVE and replace its
  // technical default duration with the enrollment's real dates. Conservative
  // by design (see buildStudentActivationUpdate): manual/withdrawn states and
  // real INACTIVE rows are never touched here.
  const student = await tx.student.findUnique({
    where: { id: studentId },
    select: { status: true, durationAssumed: true },
  });
  if (student) {
    const activation = buildStudentActivationUpdate({
      status: student.status,
      durationAssumed: student.durationAssumed,
      enrollmentStartedAt: updated.startedAt,
      enrollmentEndsAt: updated.endsAt,
    });
    if (activation) {
      await tx.student.update({ where: { id: studentId }, data: activation });
    }
  }

  return { enrollment: updated, createdPaymentId };
}
