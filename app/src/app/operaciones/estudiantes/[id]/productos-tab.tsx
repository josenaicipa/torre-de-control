"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useExchangeRate } from "../_lib/use-exchange-rate";
import { ExchangeRateStatusLine } from "../_lib/exchange-rate-status";
import { MoneyInput } from "../_lib/money-input";

type Numeric = string | number;

interface LearnWorldsAccessConfig {
  id: string;
  lwProductType: "COURSE" | "BUNDLE" | "SUBSCRIPTION";
  lwExternalId: string;
  lwDisplayName: string | null;
  description: string | null;
  isActive: boolean;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePriceUsd: Numeric;
  currency: string;
  saleLimit: "ONE_PER_STUDENT" | "UNLIMITED";
  allowsInstallments: boolean;
  requiresInitialPayment: boolean;
  generatesCommission: boolean;
  defaultCommissionPercent: Numeric;
  isMainProduct: boolean;
  isActive: boolean;
  learnWorldsAccessConfigs: LearnWorldsAccessConfig[];
}

interface PaymentAccount {
  id: string;
  displayName: string;
  ownerName: string | null;
  providerName: string | null;
  currency: string;
  isActive: boolean;
}

interface EnrollmentPayment {
  id: string;
  amount: Numeric;
  currency: string;
  officialAmountUsd: Numeric | null;
  paidAt: string;
  method: string | null;
  reference: string | null;
  isInitialPayment: boolean;
  initialPaymentType: "FULL_PAYMENT" | "DOWN_PAYMENT" | "RESERVATION" | null;
  paymentAccountId: string | null;
}

interface EnrollmentSchedule {
  id: string;
  installmentNumber: number;
  amountDue: Numeric;
  amountPaid: Numeric;
  currency: string;
  dueDate: string;
  status: "PENDING" | "PAID" | "PARTIAL" | "OVERDUE" | "WAIVED";
}

interface Enrollment {
  id: string;
  productId: string;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "REFUNDED";
  startedAt: string;
  endsAt: string | null;
  totalAmountUsd: Numeric;
  initialPaymentUsd: Numeric | null;
  balanceUsd: Numeric | null;
  installmentCount: number | null;
  commissionBaseUsd: Numeric | null;
  commissionPercent: Numeric | null;
  currency: string;
  paymentAccountId: string | null;
  paymentAccount: PaymentAccount | null;
  accessStatus: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "SYNC_ERROR";
  accessGrantedAt: string | null;
  contractStatus:
    | "DRAFT"
    | "PENDING_SIGNATURE"
    | "SIGNED"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "REJECTED";
  contractUrl: string | null;
  contractSignerName: string | null;
  contractSignedAt: string | null;
  contractApprovedAt: string | null;
  contractRejectedAt: string | null;
  contractRejectionReason: string | null;
  learnWorldsSyncStatus: string;
  learnWorldsSyncError: string | null;
  notes: string | null;
  createdAt: string;
  product: Product;
  payments: EnrollmentPayment[];
  paymentSchedules: EnrollmentSchedule[];
}

type InitialPaymentType = "FULL_PAYMENT" | "DOWN_PAYMENT" | "RESERVATION";
type InstallmentFrequency = "monthly" | "biweekly";

function toNum(value: Numeric | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatUsd(value: Numeric | null | undefined): string {
  return `USD $${toNum(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMoney(value: Numeric | null | undefined, currency: string): string {
  return `${currency} $${toNum(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const ENROLLMENT_STATUS_LABEL: Record<Enrollment["status"], [string, string]> = {
  ACTIVE: ["Activo", "bg-emerald-100 text-emerald-700"],
  PAUSED: ["Pausado", "bg-amber-100 text-amber-700"],
  COMPLETED: ["Completado", "bg-slate-200 text-slate-700"],
  CANCELLED: ["Cancelado", "bg-rose-100 text-rose-700"],
  REFUNDED: ["Reembolsado", "bg-rose-100 text-rose-700"],
};

const ACCESS_STATUS_LABEL: Record<Enrollment["accessStatus"], [string, string]> = {
  PENDING: ["Pendiente", "bg-slate-100 text-slate-700"],
  ACTIVE: ["Activo", "bg-emerald-100 text-emerald-700"],
  SUSPENDED: ["Suspendido", "bg-amber-100 text-amber-700"],
  REVOKED: ["Revocado", "bg-rose-100 text-rose-700"],
  SYNC_ERROR: ["Error LW", "bg-rose-100 text-rose-700"],
};

const CONTRACT_STATUS_LABEL: Record<Enrollment["contractStatus"], [string, string]> = {
  DRAFT: ["Borrador", "bg-slate-100 text-slate-700"],
  PENDING_SIGNATURE: ["Pendiente de firma", "bg-amber-100 text-amber-700"],
  SIGNED: ["Firmado", "bg-sky-100 text-sky-700"],
  PENDING_APPROVAL: ["Pendiente aprobación", "bg-amber-100 text-amber-700"],
  APPROVED: ["Aprobado", "bg-emerald-100 text-emerald-700"],
  REJECTED: ["Rechazado", "bg-rose-100 text-rose-700"],
};

const SCHEDULE_STATUS_LABEL: Record<EnrollmentSchedule["status"], [string, string]> = {
  PENDING: ["Pendiente", "bg-slate-100 text-slate-700"],
  PAID: ["Pagado", "bg-emerald-100 text-emerald-700"],
  PARTIAL: ["Parcial", "bg-amber-100 text-amber-700"],
  OVERDUE: ["Vencido", "bg-rose-100 text-rose-700"],
  WAIVED: ["Condonado", "bg-slate-200 text-slate-700"],
};

const INITIAL_PAYMENT_TYPE_LABEL: Record<InitialPaymentType, string> = {
  FULL_PAYMENT: "Pago total",
  DOWN_PAYMENT: "Pago inicial",
  RESERVATION: "Reserva",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {children}
    </span>
  );
}

export function ProductosTab({
  studentId,
  canWrite,
}: {
  studentId: string;
  canWrite: boolean;
}) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      const [enrollmentsRes, productsRes, accountsRes] = await Promise.all([
        fetch(`/api/operaciones/students/${studentId}/products`),
        fetch(`/api/operaciones/products?active=true`),
        fetch(`/api/operaciones/payment-accounts?active=true`),
      ]);
      const [enrollmentsJson, productsJson, accountsJson] = await Promise.all([
        enrollmentsRes.json(),
        productsRes.json(),
        accountsRes.json(),
      ]);
      if (!enrollmentsRes.ok || !productsRes.ok || !accountsRes.ok) {
        setLoadError(
          enrollmentsJson.error ??
            productsJson.error ??
            accountsJson.error ??
            "No se pudieron cargar los productos del estudiante",
        );
        return;
      }
      setEnrollments(enrollmentsJson.enrollments ?? []);
      setProducts(productsJson.products ?? []);
      setPaymentAccounts(accountsJson.paymentAccounts ?? []);
    } catch {
      setLoadError("No se pudieron cargar los productos del estudiante");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) return <p className="text-sm text-slate-500">Cargando productos...</p>;
  if (loadError)
    return <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Productos del estudiante</h3>
        {canWrite && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium !text-white hover:bg-slate-800"
          >
            + Vender producto
          </button>
        )}
      </div>

      {enrollments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
          Este estudiante no tiene productos asignados todavía.
        </div>
      ) : (
        <div className="space-y-4">
          {enrollments.map((enrollment) => (
            <EnrollmentCard
              key={enrollment.id}
              enrollment={enrollment}
              studentId={studentId}
              canWrite={canWrite}
              onChanged={() => void reload()}
            />
          ))}
        </div>
      )}

      {canWrite && showForm && (
        <SellProductForm
          studentId={studentId}
          products={products}
          paymentAccounts={paymentAccounts}
          onCancel={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function EnrollmentCard({
  enrollment,
  studentId,
  canWrite,
  onChanged,
}: {
  enrollment: Enrollment;
  studentId: string;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [enrollmentStatusLabel, enrollmentStatusTone] = ENROLLMENT_STATUS_LABEL[enrollment.status];
  const [accessStatusLabel, accessStatusTone] = ACCESS_STATUS_LABEL[enrollment.accessStatus];
  const [contractStatusLabel, contractStatusTone] =
    CONTRACT_STATUS_LABEL[enrollment.contractStatus];
  const initialPayments = enrollment.payments.filter((p) => p.isInitialPayment);

  const [actionLoading, setActionLoading] = useState<
    "approve" | "retry-lw" | "contract-test" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ACTION_ERROR_LABEL: Record<"approve" | "retry-lw" | "contract-test", string> = {
    approve: "No se pudo aprobar el contrato",
    "retry-lw": "No se pudo reintentar la sincronización con LearnWorlds",
    "contract-test": "No se pudo crear el contrato",
  };

  async function runAction(action: "approve" | "retry-lw" | "contract-test") {
    setActionError(null);
    setActionLoading(action);
    try {
      const response = await fetch(
        `/api/operaciones/students/${studentId}/products/${enrollment.id}/${action}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        const baseMessage = json.error ?? ACTION_ERROR_LABEL[action];
        if (Array.isArray(json.missingFields) && json.missingFields.length > 0) {
          const labels = json.missingFields
            .map((f: { label?: string }) => f.label)
            .filter(Boolean)
            .join(", ");
          setActionError(`${baseMessage} Faltan: ${labels}`);
        } else {
          setActionError(baseMessage);
        }
        return;
      }
      onChanged();
    } catch {
      setActionError("Error de red al ejecutar la acción");
    } finally {
      setActionLoading(null);
    }
  }

  function signUrl(): string {
    if (!enrollment.contractUrl) return "";
    if (typeof window === "undefined" || enrollment.contractUrl.startsWith("http")) {
      return enrollment.contractUrl;
    }
    return `${window.location.origin}${enrollment.contractUrl}`;
  }

  async function copySignLink() {
    try {
      await navigator.clipboard.writeText(signUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("No se pudo copiar el link de firma");
    }
  }

  const canApprove =
    canWrite &&
    (enrollment.contractStatus === "SIGNED" ||
      enrollment.contractStatus === "PENDING_APPROVAL");
  const canRetryLw =
    canWrite &&
    (enrollment.accessStatus === "SYNC_ERROR" ||
      (enrollment.contractStatus === "APPROVED" && enrollment.accessStatus !== "ACTIVE"));
  const canCreateTestContract = canWrite && enrollment.contractStatus !== "APPROVED";
  const hasSignLink = Boolean(enrollment.contractUrl);
  const canDownloadPdf = enrollment.contractStatus === "APPROVED";
  // El estudiante ya firmó pero falta la firma de Jose Naicipa (aprobación).
  const pdfPendingJoseSignature =
    enrollment.contractStatus === "SIGNED" ||
    enrollment.contractStatus === "PENDING_APPROVAL";
  const pdfUrl = `/api/operaciones/students/${studentId}/products/${enrollment.id}/contract-pdf`;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-slate-900">{enrollment.product.name}</h4>
            {enrollment.product.isMainProduct && (
              <Badge tone="bg-indigo-100 text-indigo-700">Principal</Badge>
            )}
            <Badge tone={enrollmentStatusTone}>{enrollmentStatusLabel}</Badge>
            <Badge tone={accessStatusTone}>Acceso: {accessStatusLabel}</Badge>
            <Badge tone={contractStatusTone}>Contrato: {contractStatusLabel}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Inicio: {enrollment.startedAt.slice(0, 10)}
            {enrollment.endsAt ? ` · Fin: ${enrollment.endsAt.slice(0, 10)}` : ""}
            {enrollment.paymentAccount
              ? ` · Cuenta: ${enrollment.paymentAccount.displayName}`
              : ""}
          </p>
          {(enrollment.contractSignedAt ||
            enrollment.contractApprovedAt ||
            enrollment.contractRejectedAt ||
            enrollment.contractUrl) && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {enrollment.contractSignedAt && (
                <span>Firmado: {enrollment.contractSignedAt.slice(0, 10)}</span>
              )}
              {enrollment.contractApprovedAt && (
                <span>Aprobado: {enrollment.contractApprovedAt.slice(0, 10)}</span>
              )}
              {enrollment.contractStatus === "APPROVED" && (
                <span className="font-semibold text-emerald-700">
                  Firmado por Jose Naicipa
                </span>
              )}
              {enrollment.contractRejectedAt && (
                <span>Rechazado: {enrollment.contractRejectedAt.slice(0, 10)}</span>
              )}
              {enrollment.contractUrl && (
                <a
                  href={enrollment.contractUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  Ver contrato
                </a>
              )}
            </p>
          )}
          {enrollment.contractRejectionReason && (
            <p className="mt-1 text-xs text-rose-600">
              Motivo de rechazo: {enrollment.contractRejectionReason}
            </p>
          )}
        </div>
        <div className="text-right text-sm">
          <p className="text-slate-500">Total</p>
          <p className="font-semibold text-slate-900">{formatUsd(enrollment.totalAmountUsd)}</p>
        </div>
      </div>

      {(canApprove ||
        canRetryLw ||
        canCreateTestContract ||
        hasSignLink ||
        canDownloadPdf ||
        pdfPendingJoseSignature) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canCreateTestContract && (
            <button
              type="button"
              onClick={() => void runAction("contract-test")}
              disabled={actionLoading !== null}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {actionLoading === "contract-test"
                ? "Generando..."
                : hasSignLink
                  ? "Regenerar link de firma"
                  : "Crear contrato"}
            </button>
          )}
          {hasSignLink && (
            <>
              <button
                type="button"
                onClick={() => void copySignLink()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {copied ? "¡Link copiado!" : "Copiar link de firma"}
              </button>
              <a
                href={enrollment.contractUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Abrir link de firma
              </a>
            </>
          )}
          {canApprove && (
            <button
              type="button"
              onClick={() => void runAction("approve")}
              disabled={actionLoading !== null}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {actionLoading === "approve"
                ? "Firmando y aprobando..."
                : "Firmar como Jose Naicipa y aprobar contrato"}
            </button>
          )}
          {canRetryLw && (
            <button
              type="button"
              onClick={() => void runAction("retry-lw")}
              disabled={actionLoading !== null}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {actionLoading === "retry-lw" ? "Reintentando..." : "Reintentar sync LW"}
            </button>
          )}
          {canDownloadPdf && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Descargar PDF del contrato firmado
            </a>
          )}
          {pdfPendingJoseSignature && (
            <button
              type="button"
              disabled
              title="El PDF del contrato firmado se habilita cuando Jose Naicipa firma y aprueba el contrato."
              className="cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-400"
            >
              PDF disponible después de la firma de Jose Naicipa
            </button>
          )}
        </div>
      )}

      {actionError && (
        <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{actionError}</p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric label="Pago inicial" value={formatUsd(enrollment.initialPaymentUsd ?? 0)} />
        <Metric label="Saldo USD" value={formatUsd(enrollment.balanceUsd ?? 0)} />
        <Metric
          label="Cuotas"
          value={
            enrollment.installmentCount
              ? `${enrollment.paymentSchedules.length}/${enrollment.installmentCount}`
              : "—"
          }
        />
      </div>

      {enrollment.learnWorldsSyncStatus === "error" && enrollment.learnWorldsSyncError && (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Error de sincronización LW: {enrollment.learnWorldsSyncError}
        </p>
      )}

      {initialPayments.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Pagos iniciales</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-700">
            {initialPayments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span>{p.paidAt.slice(0, 10)}</span>
                <span className="font-medium">{formatMoney(p.amount, p.currency)}</span>
                {p.currency.toUpperCase() !== "USD" && p.officialAmountUsd != null && (
                  <span className="text-xs text-slate-500">
                    ({formatUsd(p.officialAmountUsd)})
                  </span>
                )}
                {p.initialPaymentType && (
                  <Badge tone="bg-slate-100 text-slate-700">
                    {INITIAL_PAYMENT_TYPE_LABEL[p.initialPaymentType]}
                  </Badge>
                )}
                {p.method && <span className="text-xs text-slate-500">· {p.method}</span>}
                {p.reference && <span className="text-xs text-slate-500">· {p.reference}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {enrollment.paymentSchedules.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase text-slate-600">#</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase text-slate-600">Vence</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase text-slate-600">Monto</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase text-slate-600">Pagado</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {enrollment.paymentSchedules.map((s) => {
                const [label, tone] = SCHEDULE_STATUS_LABEL[s.status];
                return (
                  <tr key={s.id}>
                    <td className="px-3 py-1.5 text-sm text-slate-900">{s.installmentNumber}</td>
                    <td className="px-3 py-1.5 text-sm text-slate-600">{s.dueDate.slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-sm">{formatMoney(s.amountDue, s.currency)}</td>
                    <td className="px-3 py-1.5 text-sm text-emerald-700">
                      {formatMoney(s.amountPaid, s.currency)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge tone={tone}>{label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {enrollment.product.learnWorldsAccessConfigs.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Accesos LearnWorlds del producto</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-700">
            {enrollment.product.learnWorldsAccessConfigs.map((cfg) => (
              <li key={cfg.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="bg-slate-100 text-slate-700">{cfg.lwProductType}</Badge>
                <span className="font-medium">{cfg.lwDisplayName ?? cfg.lwExternalId}</span>
                <span className="text-xs text-slate-500">id: {cfg.lwExternalId}</span>
                {!cfg.isActive && (
                  <Badge tone="bg-rose-100 text-rose-700">inactivo</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {enrollment.notes && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {enrollment.notes}
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

interface FormState {
  productId: string;
  startedAt: string;
  endsAt: string;
  totalAmountUsd: string;
  installmentCount: string;
  firstDueDate: string;
  installmentFrequency: InstallmentFrequency;
  paymentAccountId: string;
  currency: string;
  commissionPercent: string;
  commissionBaseUsd: string;
  grantAccessNow: boolean;
  notes: string;
  // Initial payment
  hasInitialPayment: boolean;
  initialPaymentAmount: string;
  initialPaymentCurrency: string;
  initialPaymentOfficialUsd: string;
  initialPaymentExchangeRate: string;
  initialPaymentPaidAt: string;
  initialPaymentType: InitialPaymentType;
  initialPaymentNotes: string;
}

function buildInitialFormState(): FormState {
  return {
    productId: "",
    startedAt: todayIso(),
    endsAt: "",
    totalAmountUsd: "",
    installmentCount: "",
    firstDueDate: "",
    installmentFrequency: "monthly",
    paymentAccountId: "",
    currency: "USD",
    commissionPercent: "",
    commissionBaseUsd: "",
    grantAccessNow: false,
    notes: "",
    hasInitialPayment: false,
    initialPaymentAmount: "",
    initialPaymentCurrency: "USD",
    initialPaymentOfficialUsd: "",
    initialPaymentExchangeRate: "",
    initialPaymentPaidAt: todayIso(),
    initialPaymentType: "DOWN_PAYMENT",
    initialPaymentNotes: "",
  };
}

function SellProductForm({
  studentId,
  products,
  paymentAccounts,
  onCancel,
  onSaved,
}: {
  studentId: string;
  products: Product[];
  paymentAccounts: PaymentAccount[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, setState] = useState<FormState>(buildInitialFormState());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [officialUsdManual, setOfficialUsdManual] = useState(false);

  const product = useMemo(
    () => products.find((p) => p.id === state.productId) ?? null,
    [products, state.productId],
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function onSelectProduct(productId: string) {
    const selected = products.find((p) => p.id === productId) ?? null;
    setState((prev) => ({
      ...prev,
      productId,
      totalAmountUsd: selected ? String(toNum(selected.basePriceUsd)) : "",
      currency: selected?.currency ?? "USD",
      commissionPercent: selected?.generatesCommission
        ? String(toNum(selected.defaultCommissionPercent))
        : "",
      commissionBaseUsd: "",
      hasInitialPayment: selected?.requiresInitialPayment ?? prev.hasInitialPayment,
      installmentCount: selected?.allowsInstallments ? prev.installmentCount : "",
      firstDueDate: selected?.allowsInstallments ? prev.firstDueDate : "",
    }));
  }

  function onSelectPaymentAccount(accountId: string) {
    const account = paymentAccounts.find((a) => a.id === accountId) ?? null;
    setState((prev) => ({
      ...prev,
      paymentAccountId: accountId,
      initialPaymentCurrency: account
        ? account.currency
        : prev.initialPaymentCurrency,
    }));
  }

  // Derived numeric values for preview + validation.
  const totalAmountUsdNum = toNum(state.totalAmountUsd);
  const initialPaymentUsdNum = state.hasInitialPayment
    ? state.initialPaymentCurrency.toUpperCase() === "USD"
      ? toNum(state.initialPaymentAmount)
      : toNum(state.initialPaymentOfficialUsd)
    : 0;
  const estimatedBalanceUsd = Math.max(
    0,
    Math.round((totalAmountUsdNum - initialPaymentUsdNum) * 100) / 100,
  );
  const installmentCountNum = Number.parseInt(state.installmentCount, 10);
  const estimatedPerInstallment =
    estimatedBalanceUsd > 0 && Number.isFinite(installmentCountNum) && installmentCountNum > 0
      ? Math.round((estimatedBalanceUsd / installmentCountNum) * 100) / 100
      : null;

  const requiresInitialPayment = product?.requiresInitialPayment ?? false;
  const initialPaymentInNonUsd =
    state.hasInitialPayment && state.initialPaymentCurrency.toUpperCase() !== "USD";
  const initialPaymentIsCop =
    state.initialPaymentCurrency.toUpperCase() === "COP";
  const needsInstallmentPlan = estimatedBalanceUsd > 0 && (product?.allowsInstallments ?? true);
  const balanceWithoutInstallmentsAllowed =
    estimatedBalanceUsd > 0 && product != null && !product.allowsInstallments;

  const onAutoRate = useCallback((rate: number) => {
    setState((prev) => ({ ...prev, initialPaymentExchangeRate: String(rate) }));
  }, []);
  const trm = useExchangeRate({
    currency: state.initialPaymentCurrency,
    date: state.initialPaymentPaidAt,
    enabled: state.hasInitialPayment && initialPaymentIsCop,
    onAutoRate,
  });

  // Auto-calc Equivalente USD oficial = monto / tasa salvo override manual.
  useEffect(() => {
    if (!state.hasInitialPayment) return;
    if (state.initialPaymentCurrency.toUpperCase() === "USD") return;
    if (officialUsdManual) return;
    const amount = toNum(state.initialPaymentAmount);
    const rate = toNum(state.initialPaymentExchangeRate);
    if (amount > 0 && rate > 0) {
      const computed = Math.round((amount / rate) * 100) / 100;
      const computedStr = String(computed);
      setState((prev) =>
        prev.initialPaymentOfficialUsd === computedStr
          ? prev
          : { ...prev, initialPaymentOfficialUsd: computedStr },
      );
    }
  }, [
    state.hasInitialPayment,
    state.initialPaymentCurrency,
    state.initialPaymentAmount,
    state.initialPaymentExchangeRate,
    officialUsdManual,
  ]);

  useEffect(() => {
    if (!state.hasInitialPayment) {
      setOfficialUsdManual(false);
    }
  }, [state.hasInitialPayment]);
  useEffect(() => {
    if (state.initialPaymentCurrency.toUpperCase() === "USD") {
      setOfficialUsdManual(false);
    }
  }, [state.initialPaymentCurrency]);

  function validate(): string | null {
    if (!product) return "Selecciona un producto";
    if (!(totalAmountUsdNum > 0)) return "Monto total USD debe ser > 0";

    if (requiresInitialPayment && !state.hasInitialPayment) {
      return "Este producto requiere un pago inicial";
    }
    if (state.hasInitialPayment) {
      if (!(toNum(state.initialPaymentAmount) > 0)) return "Monto del pago inicial requerido";
      if (!state.initialPaymentPaidAt) return "Fecha del pago inicial requerida";
      if (!state.paymentAccountId) {
        return "Selecciona una cuenta receptora para el pago inicial";
      }
      if (
        state.initialPaymentCurrency.toUpperCase() !== "USD" &&
        !(toNum(state.initialPaymentOfficialUsd) > 0)
      ) {
        return "El equivalente USD oficial es obligatorio cuando la moneda del pago no es USD";
      }
      if (initialPaymentUsdNum - totalAmountUsdNum > 0.01) {
        return "El pago inicial (USD) no puede exceder el monto total";
      }
    }
    if (balanceWithoutInstallmentsAllowed) {
      return "Este producto no permite cuotas; el pago inicial debe cubrir el monto total";
    }
    if (needsInstallmentPlan) {
      if (!Number.isFinite(installmentCountNum) || installmentCountNum < 1) {
        return "Cantidad de cuotas requerida cuando hay saldo restante";
      }
      if (!state.firstDueDate) {
        return "Primera fecha de cuota requerida cuando hay saldo restante";
      }
    }
    return null;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        studentId,
        productId: state.productId,
        startedAt: state.startedAt || null,
        endsAt: state.endsAt || null,
        totalAmountUsd: totalAmountUsdNum,
        currency: state.currency,
        installmentFrequency: state.installmentFrequency,
        grantAccessNow: state.grantAccessNow,
        notes: state.notes.trim() ? state.notes.trim() : null,
        paymentAccountId: state.paymentAccountId || null,
      };
      if (estimatedBalanceUsd > 0 && Number.isFinite(installmentCountNum) && installmentCountNum > 0) {
        body.installmentCount = installmentCountNum;
        body.firstDueDate = state.firstDueDate;
      }
      if (product?.generatesCommission) {
        if (state.commissionPercent.trim() !== "") {
          body.commissionPercent = toNum(state.commissionPercent);
        }
        if (state.commissionBaseUsd.trim() !== "") {
          body.commissionBaseUsd = toNum(state.commissionBaseUsd);
        }
      }
      if (state.hasInitialPayment) {
        const amount = toNum(state.initialPaymentAmount);
        const initialPayment: Record<string, unknown> = {
          amount,
          currency: state.initialPaymentCurrency,
          paidAt: state.initialPaymentPaidAt,
          initialPaymentType: state.initialPaymentType,
          paymentAccountId: state.paymentAccountId || null,
        };
        if (state.initialPaymentCurrency.toUpperCase() !== "USD") {
          initialPayment.officialAmountUsd = toNum(state.initialPaymentOfficialUsd);
          initialPayment.receivedAmount = amount;
          initialPayment.receivedCurrency = state.initialPaymentCurrency;
          if (toNum(state.initialPaymentExchangeRate) > 0) {
            initialPayment.exchangeRate = toNum(state.initialPaymentExchangeRate);
          }
        }
        if (state.initialPaymentNotes.trim()) {
          initialPayment.notes = state.initialPaymentNotes.trim();
        }
        body.initialPayment = initialPayment;
      }

      const response = await fetch(`/api/operaciones/students/${studentId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error ?? "Error al crear inscripción");
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch {
      setError("Error de red al crear inscripción");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-base font-semibold text-slate-900">Vender producto / asignar</h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancelar
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Producto" required>
          <select
            value={state.productId}
            onChange={(e) => onSelectProduct(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            required
          >
            <option value="">— Selecciona —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cuenta receptora">
          <select
            value={state.paymentAccountId}
            onChange={(e) => onSelectPaymentAccount(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Sin cuenta —</option>
            {paymentAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.currency})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Inicio">
          <input
            type="date"
            value={state.startedAt}
            onChange={(e) => update("startedAt", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Fin (opcional)">
          <input
            type="date"
            value={state.endsAt}
            onChange={(e) => update("endsAt", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Monto total USD" required>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={state.totalAmountUsd}
            onChange={(e) => update("totalAmountUsd", e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>

        <Field label="Moneda de inscripción">
          <select
            value={state.currency}
            onChange={(e) => update("currency", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="USD">USD</option>
            <option value="COP">COP</option>
            <option value="MXN">MXN</option>
            <option value="EUR">EUR</option>
          </select>
        </Field>
      </div>

      {product && (
        <p className="text-xs text-slate-500">
          {product.allowsInstallments ? "Permite cuotas" : "No permite cuotas"} ·{" "}
          {product.requiresInitialPayment ? "Pago inicial obligatorio" : "Pago inicial opcional"}
          {product.generatesCommission ? " · Genera comisión" : " · Sin comisión"}
        </p>
      )}

      {/* Initial payment block */}
      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          Pago inicial {requiresInitialPayment && <span className="text-rose-600">*</span>}
        </legend>

        <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={state.hasInitialPayment}
            disabled={requiresInitialPayment}
            onChange={(e) => update("hasInitialPayment", e.target.checked)}
          />
          Registrar pago inicial ahora
        </label>

        {state.hasInitialPayment && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Fecha del pago" required>
              <input
                type="date"
                value={state.initialPaymentPaidAt}
                onChange={(e) => update("initialPaymentPaidAt", e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Tipo de pago inicial" required>
              <select
                value={state.initialPaymentType}
                onChange={(e) =>
                  update("initialPaymentType", e.target.value as InitialPaymentType)
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="DOWN_PAYMENT">Pago inicial</option>
                <option value="FULL_PAYMENT">Pago total</option>
                <option value="RESERVATION">Separado</option>
              </select>
            </Field>

            <Field label="Monto" required>
              <MoneyInput
                value={state.initialPaymentAmount}
                onChange={(next) => update("initialPaymentAmount", next)}
                required
                placeholder="0"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Moneda" hint="Se establece según la cuenta receptora.">
              <input
                value={state.initialPaymentCurrency}
                disabled
                className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm uppercase text-slate-700"
              />
            </Field>

            {initialPaymentInNonUsd && (
              <Field label="Tasa de cambio">
                <input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={state.initialPaymentExchangeRate}
                  onChange={(e) => {
                    update("initialPaymentExchangeRate", e.target.value);
                    trm.markManual();
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <ExchangeRateStatusLine
                  currency={state.initialPaymentCurrency}
                  status={trm.status}
                  effectiveDate={trm.effectiveDate}
                  source={trm.source}
                  errorMessage={trm.errorMessage}
                  paidAt={state.initialPaymentPaidAt}
                  onUseToday={trm.reset}
                />
              </Field>
            )}

            {initialPaymentInNonUsd ? (
              <Field label="Equivalente USD (oficial)" required>
                <MoneyInput
                  value={state.initialPaymentOfficialUsd}
                  onChange={(next) => {
                    update("initialPaymentOfficialUsd", next);
                    setOfficialUsdManual(true);
                  }}
                  required
                  placeholder="0"
                  className="mt-1 w-full rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold"
                />
                <span className="mt-1 block text-xs text-amber-700">
                  {officialUsdManual
                    ? "Editado manualmente. Bórralo para volver al cálculo automático monto / tasa."
                    : "Se calcula automáticamente como monto / tasa. Puedes editarlo si lo necesitas."}
                </span>
                {officialUsdManual && (
                  <button
                    type="button"
                    onClick={() => setOfficialUsdManual(false)}
                    className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    Volver al cálculo automático
                  </button>
                )}
              </Field>
            ) : (
              <Field
                label="Equivalente USD (oficial)"
                hint="Aplica solo cuando la moneda del pago no es USD"
              >
                <input
                  type="text"
                  inputMode="decimal"
                  value={state.initialPaymentOfficialUsd}
                  disabled
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </Field>
            )}

            <Field label="Notas pago inicial">
              <textarea
                value={state.initialPaymentNotes}
                onChange={(e) => update("initialPaymentNotes", e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>
          </div>
        )}
      </fieldset>

      {/* Bloque de plan de cuotas */}
      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">Plan de cuotas</legend>

        {balanceWithoutInstallmentsAllowed ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
            Este producto no permite cuotas y el pago inicial no cubre el total. Ajusta el monto o
            cambia el producto.
          </p>
        ) : needsInstallmentPlan ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="# cuotas" required>
              <input
                type="number"
                min="1"
                max="24"
                value={state.installmentCount}
                onChange={(e) => update("installmentCount", e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Primera fecha" required>
              <input
                type="date"
                value={state.firstDueDate}
                onChange={(e) => update("firstDueDate", e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Frecuencia">
              <select
                value={state.installmentFrequency}
                onChange={(e) =>
                  update("installmentFrequency", e.target.value as InstallmentFrequency)
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
              </select>
            </Field>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Sin saldo restante: no se generarán cuotas.
          </p>
        )}
      </fieldset>

      {product?.generatesCommission && (
        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">Comisión</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Comisión %">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={state.commissionPercent}
                onChange={(e) => update("commissionPercent", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Base comisionable USD (opcional)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={state.commissionBaseUsd}
                onChange={(e) => update("commissionBaseUsd", e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </Field>
          </div>
        </fieldset>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={state.grantAccessNow}
          onChange={(e) => update("grantAccessNow", e.target.checked)}
        />
        Otorgar acceso ahora (estado de acceso: Activo)
      </label>

      <Field label="Notas">
        <textarea
          value={state.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </Field>

      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <p>
          <span className="text-slate-500">Saldo estimado USD:</span>{" "}
          <span className="font-semibold">{formatUsd(estimatedBalanceUsd)}</span>
        </p>
        {estimatedPerInstallment != null && (
          <p>
            <span className="text-slate-500">Cuotas estimadas:</span>{" "}
            <span className="font-semibold">
              {installmentCountNum} × {formatUsd(estimatedPerInstallment)}
            </span>
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium !text-white disabled:opacity-50"
        >
          {submitting ? "Guardando..." : "Crear inscripción"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
