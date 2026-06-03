"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  computeStudentFinanceTotals,
  paymentUsdValue,
} from "@/lib/student-payments-finance";
import { useExchangeRate } from "../_lib/use-exchange-rate";
import { ExchangeRateStatusLine } from "../_lib/exchange-rate-status";

interface Schedule {
  id: string;
  installmentNumber: number;
  amountDue: string | number;
  amountPaid: string | number;
  currency: string;
  dueDate: string;
  status: string;
}

interface PaymentAccount {
  id: string;
  displayName: string;
  currency: string;
  isActive: boolean;
}

interface Payment {
  id: string;
  amount: string | number;
  currency: string;
  paidAt: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  officialAmountUsd: string | number | null;
  receivedAmount: string | number | null;
  receivedCurrency: string | null;
  schedule: { id: string; installmentNumber: number } | null;
  recordedBy: { id: string; name: string | null; email: string } | null;
  paymentAccount?: {
    id: string;
    displayName: string;
    currency: string;
    ownerName: string;
    providerName: string;
  } | null;
}

interface EnrollmentSummary {
  totalAmountUsd: string | number;
  balanceUsd: string | number | null;
}

function toNum(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function formatMoney(value: string | number, currency: string): string {
  return `${currency} $${toNum(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatUsd(value: number): string {
  return `USD $${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, [string, string]> = {
    PENDING: ["Pendiente", "bg-slate-100 text-slate-700"],
    PAID: ["Pagado", "bg-emerald-100 text-emerald-700"],
    PARTIAL: ["Parcial", "bg-amber-100 text-amber-700"],
    OVERDUE: ["Vencido", "bg-rose-100 text-rose-700"],
    WAIVED: ["Condonado", "bg-slate-200 text-slate-700"],
  };
  const [label, className] = labels[status] ?? [status, "bg-slate-100 text-slate-700"];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

export function PagosTab({
  studentId,
  canWrite,
}: {
  studentId: string;
  canWrite: boolean;
}) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showAddInstallment, setShowAddInstallment] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [editScheduleId, setEditScheduleId] = useState<string | null>(null);
  const [editPaymentId, setEditPaymentId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      const [schedulesResponse, paymentsResponse, productsResponse, accountsResponse] =
        await Promise.all([
          fetch(`/api/operaciones/students/${studentId}/schedule`),
          fetch(`/api/operaciones/students/${studentId}/payments`),
          fetch(`/api/operaciones/students/${studentId}/products`),
          fetch(`/api/operaciones/payment-accounts?active=true`),
        ]);
      const [scheduleJson, paymentJson, productsJson, accountsJson] = await Promise.all([
        schedulesResponse.json(),
        paymentsResponse.json(),
        productsResponse.json(),
        accountsResponse.json(),
      ]);
      if (
        !schedulesResponse.ok ||
        !paymentsResponse.ok ||
        !productsResponse.ok ||
        !accountsResponse.ok
      ) {
        setLoadError(
          scheduleJson.error ??
            paymentJson.error ??
            productsJson.error ??
            accountsJson.error ??
            "No se pudieron cargar los pagos",
        );
        return;
      }
      setSchedules(scheduleJson.schedules ?? []);
      setPayments(paymentJson.payments ?? []);
      setEnrollments(productsJson.enrollments ?? []);
      setPaymentAccounts(accountsJson.paymentAccounts ?? []);
    } catch {
      setLoadError("No se pudieron cargar los pagos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // Reload whenever the viewed student changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function handleDeleteSchedule(scheduleId: string) {
    if (!window.confirm("¿Eliminar esta cuota?")) return;
    const response = await fetch(
      `/api/operaciones/students/${studentId}/schedule/${scheduleId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      window.alert(json.error ?? "Error al eliminar cuota");
      return;
    }
    void reload();
  }

  async function handleDeletePayment(paymentId: string) {
    if (!window.confirm("¿Eliminar este pago?")) return;
    const response = await fetch(
      `/api/operaciones/students/${studentId}/payments/${paymentId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      window.alert(json.error ?? "Error al eliminar pago");
      return;
    }
    void reload();
  }

  if (loading) return <p className="text-sm text-slate-500">Cargando pagos...</p>;
  if (loadError) return <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>;

  const totals = computeStudentFinanceTotals(enrollments, payments);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Total programa</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatUsd(totals.totalUsd)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Pagado</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{formatUsd(totals.paidUsd)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Saldo pendiente</p>
          <p className="mt-1 text-xl font-bold text-rose-700">{formatUsd(totals.balanceUsd)}</p>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Cronograma de cuotas</h3>
          {canWrite && (
            schedules.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowScheduleForm(true)}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium !text-white hover:bg-slate-800"
              >
                + Configurar cronograma
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddInstallment(true)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                + Agregar cuota
              </button>
            )
          )}
        </div>

        {schedules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No hay cronograma configurado.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">#</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Vencimiento</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Monto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Pagado</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Estado</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="px-3 py-2 text-sm text-slate-900">{schedule.installmentNumber}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{schedule.dueDate.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-sm">{formatMoney(schedule.amountDue, schedule.currency)}</td>
                    <td className="px-3 py-2 text-sm text-emerald-700">
                      {formatMoney(schedule.amountPaid, schedule.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={schedule.status} />
                    </td>
                    <td className="px-3 py-2">
                      {canWrite && (
                        <div className="flex items-center gap-1">
                          {schedule.status !== "PAID" && schedule.status !== "WAIVED" && (
                            <button
                              type="button"
                              onClick={() => setShowPaymentForm(schedule.id)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              Registrar pago
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditScheduleId(schedule.id)}
                            className="rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-slate-50"
                            title="Editar cuota"
                            aria-label="Editar cuota"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSchedule(schedule.id)}
                            className="rounded-md border border-rose-300 p-1 text-rose-700 hover:bg-rose-50"
                            title="Eliminar cuota"
                            aria-label="Eliminar cuota"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Histórico de pagos</h3>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowPaymentForm("standalone")}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              + Pago sin cuota
            </button>
          )}
        </div>
        {payments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
            No hay pagos registrados todavía.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Fecha</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Monto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Cuenta receptora</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Cuota</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Registró</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payments.map((payment) => {
                  const usd = paymentUsdValue(payment);
                  const hasReceivedDetail =
                    payment.receivedAmount != null &&
                    payment.receivedCurrency != null &&
                    payment.receivedCurrency.toUpperCase() !== "USD";
                  const showOriginalCurrencyDetail =
                    !hasReceivedDetail && payment.currency.toUpperCase() !== "USD";
                  return (
                  <tr key={payment.id}>
                    <td className="px-3 py-2 text-sm text-slate-600">{payment.paidAt.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-sm font-medium">
                      <div>{formatUsd(usd)}</div>
                      {hasReceivedDetail && (
                        <div className="text-xs font-normal text-slate-500">
                          Recibido: {formatMoney(payment.receivedAmount!, payment.receivedCurrency!)}
                        </div>
                      )}
                      {showOriginalCurrencyDetail && (
                        <div className="text-xs font-normal text-slate-500">
                          Recibido: {formatMoney(payment.amount, payment.currency)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {payment.paymentAccount?.displayName ?? payment.method ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {payment.schedule ? `#${payment.schedule.installmentNumber}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {payment.recordedBy?.name ?? payment.recordedBy?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditPaymentId(payment.id)}
                            className="rounded-md border border-slate-300 p-1 text-slate-600 hover:bg-slate-50"
                            title="Editar pago"
                            aria-label="Editar pago"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeletePayment(payment.id)}
                            className="rounded-md border border-rose-300 p-1 text-rose-700 hover:bg-rose-50"
                            title="Eliminar pago"
                            aria-label="Eliminar pago"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {payments.some((payment) => !payment.schedule) && (
          <p className="mt-2 text-xs italic text-slate-500">
            Los pagos sin cuota suman al total pagado pero no actualizan el estado individual de las cuotas. Si
            querés asignar un pago a una cuota específica, usá el botón &quot;Registrar pago&quot; de esa cuota.
          </p>
        )}
      </section>

      {showScheduleForm && (
        <ScheduleDialog
          studentId={studentId}
          onClose={() => setShowScheduleForm(false)}
          onSaved={() => {
            setShowScheduleForm(false);
            void reload();
          }}
        />
      )}

      {showPaymentForm && (
        <PaymentDialog
          studentId={studentId}
          scheduleId={showPaymentForm === "standalone" ? null : showPaymentForm}
          paymentAccounts={paymentAccounts}
          onClose={() => setShowPaymentForm(null)}
          onSaved={() => {
            setShowPaymentForm(null);
            void reload();
          }}
        />
      )}

      {showAddInstallment && (
        <AddInstallmentDialog
          studentId={studentId}
          currency={schedules[0]?.currency ?? "USD"}
          onClose={() => setShowAddInstallment(false)}
          onSaved={() => {
            setShowAddInstallment(false);
            void reload();
          }}
        />
      )}

      {editScheduleId && schedules.find((schedule) => schedule.id === editScheduleId) && (
        <EditScheduleDialog
          schedule={schedules.find((schedule) => schedule.id === editScheduleId)!}
          studentId={studentId}
          onClose={() => setEditScheduleId(null)}
          onSaved={() => {
            setEditScheduleId(null);
            void reload();
          }}
        />
      )}

      {editPaymentId && payments.find((payment) => payment.id === editPaymentId) && (
        <EditPaymentDialog
          payment={payments.find((payment) => payment.id === editPaymentId)!}
          studentId={studentId}
          schedules={schedules}
          paymentAccounts={paymentAccounts}
          onClose={() => setEditPaymentId(null)}
          onSaved={() => {
            setEditPaymentId(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function ScheduleDialog({
  studentId,
  onClose,
  onSaved,
}: {
  studentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/operaciones/students/${studentId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalAmount: Number(formData.get("totalAmount")),
        installments: Number(formData.get("installments")),
        currency: String(formData.get("currency")),
        firstDueDate: String(formData.get("firstDueDate")),
        frequency: String(formData.get("frequency")),
      }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.error ?? "Error al crear cronograma");
      setLoading(false);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title="Configurar cronograma" error={error} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Monto total">
          <input name="totalAmount" type="number" step="0.01" min="1" required defaultValue={3000} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="# de cuotas">
          <input name="installments" type="number" min="1" max="24" required defaultValue={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <CurrencySelect />
        <Field label="Frecuencia">
          <select name="frequency" defaultValue="monthly" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="monthly">Mensual</option>
            <option value="biweekly">Quincenal</option>
          </select>
        </Field>
        <Field label="Fecha 1er vencimiento">
          <input name="firstDueDate" type="date" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <DialogActions loading={loading} onClose={onClose} submitLabel="Crear cronograma" />
      </form>
    </Dialog>
  );
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface PaymentFormState {
  amount: string;
  paymentAccountId: string;
  paidAt: string;
  exchangeRate: string;
  officialAmountUsd: string;
  notes: string;
}

function PaymentDialog({
  studentId,
  scheduleId,
  paymentAccounts,
  onClose,
  onSaved,
}: {
  studentId: string;
  scheduleId: string | null;
  paymentAccounts: PaymentAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const activeAccounts = paymentAccounts.filter((account) => account.isActive);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<PaymentFormState>({
    amount: "",
    paymentAccountId: "",
    paidAt: today,
    exchangeRate: "",
    officialAmountUsd: "",
    notes: "",
  });
  const [officialUsdManual, setOfficialUsdManual] = useState(false);

  const selectedAccount =
    paymentAccounts.find((account) => account.id === form.paymentAccountId) ??
    null;
  const accountCurrency = selectedAccount?.currency.toUpperCase() ?? "";
  const isNonUsdAccount =
    selectedAccount != null && accountCurrency !== "USD";

  function updateField<K extends keyof PaymentFormState>(
    key: K,
    value: PaymentFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const onAutoRate = useCallback((rate: number) => {
    setForm((prev) => ({ ...prev, exchangeRate: String(rate) }));
  }, []);
  const trm = useExchangeRate({
    currency: accountCurrency,
    date: form.paidAt,
    enabled: isNonUsdAccount && accountCurrency === "COP",
    onAutoRate,
  });

  // Reset manual override when leaving the non-USD branch.
  useEffect(() => {
    if (!isNonUsdAccount) setOfficialUsdManual(false);
  }, [isNonUsdAccount]);

  // Auto-compute officialAmountUsd from amount / exchangeRate unless the user
  // typed an override.
  useEffect(() => {
    if (!isNonUsdAccount) return;
    if (officialUsdManual) return;
    const amount = toNumber(form.amount);
    const rate = toNumber(form.exchangeRate);
    if (amount > 0 && rate > 0) {
      const computed = Math.round((amount / rate) * 100) / 100;
      const computedStr = String(computed);
      setForm((prev) =>
        prev.officialAmountUsd === computedStr
          ? prev
          : { ...prev, officialAmountUsd: computedStr },
      );
    }
  }, [isNonUsdAccount, form.amount, form.exchangeRate, officialUsdManual]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) {
      setError("Seleccioná una cuenta receptora");
      return;
    }
    const amount = toNumber(form.amount);
    if (!(amount > 0)) {
      setError("Monto requerido");
      return;
    }
    if (isNonUsdAccount) {
      const rate = toNumber(form.exchangeRate);
      const officialUsd = toNumber(form.officialAmountUsd);
      if (!(rate > 0) && !(officialUsd > 0)) {
        setError(`Tasa de cambio requerida para cuentas en ${accountCurrency}`);
        return;
      }
      if (!(officialUsd > 0)) {
        setError("El equivalente USD oficial debe ser mayor a 0");
        return;
      }
    }
    setLoading(true);
    setError(null);
    const body: Record<string, unknown> = {
      amount,
      paidAt: form.paidAt,
      notes: form.notes.trim() ? form.notes.trim() : null,
      paymentAccountId: selectedAccount.id,
      scheduleId,
    };
    if (isNonUsdAccount) {
      const rate = toNumber(form.exchangeRate);
      if (rate > 0) body.exchangeRate = rate;
      const officialUsd = toNumber(form.officialAmountUsd);
      if (officialUsd > 0) body.officialAmountUsd = officialUsd;
    }
    const response = await fetch(
      `/api/operaciones/students/${studentId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.error ?? "Error al registrar pago");
      setLoading(false);
      return;
    }
    onSaved();
  }

  return (
    <Dialog
      title={scheduleId ? "Registrar pago de cuota" : "Registrar pago"}
      error={error}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Cuenta receptora">
          {activeAccounts.length === 0 ? (
            <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No hay cuentas receptoras activas. Configurá una en Operaciones &gt; Cuentas.
            </p>
          ) : (
            <select
              required
              value={form.paymentAccountId}
              onChange={(event) =>
                updateField("paymentAccountId", event.target.value)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Seleccioná una cuenta
              </option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName} ({account.currency})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Moneda">
          <input
            type="text"
            readOnly
            value={selectedAccount?.currency ?? ""}
            placeholder="Definida por la cuenta"
            className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          />
        </Field>
        <Field label={selectedAccount ? `Monto (${selectedAccount.currency})` : "Monto"}>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={form.amount}
            onChange={(event) => updateField("amount", event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Fecha del pago">
          <input
            type="date"
            required
            value={form.paidAt}
            onChange={(event) => updateField("paidAt", event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        {isNonUsdAccount && (
          <>
            <Field label={`Tasa de cambio (1 USD = ? ${accountCurrency})`}>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.exchangeRate}
                onChange={(event) => {
                  updateField("exchangeRate", event.target.value);
                  trm.markManual();
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <ExchangeRateStatusLine
                currency={accountCurrency}
                status={trm.status}
                effectiveDate={trm.effectiveDate}
                source={trm.source}
                errorMessage={trm.errorMessage}
                paidAt={form.paidAt}
                onUseToday={trm.reset}
              />
            </Field>
            <Field label="Equivalente USD oficial">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.officialAmountUsd}
                onChange={(event) => {
                  setOfficialUsdManual(true);
                  updateField("officialAmountUsd", event.target.value);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              {officialUsdManual && (
                <button
                  type="button"
                  className="mt-1 text-xs text-slate-500 underline"
                  onClick={() => setOfficialUsdManual(false)}
                >
                  Restablecer auto-cálculo
                </button>
              )}
            </Field>
          </>
        )}
        <Field label="Notas">
          <textarea
            rows={2}
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <DialogActions loading={loading} onClose={onClose} submitLabel="Registrar pago" />
      </form>
    </Dialog>
  );
}

function AddInstallmentDialog({
  studentId,
  currency,
  onClose,
  onSaved,
}: {
  studentId: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/operaciones/students/${studentId}/schedule/installments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountDue: Number(formData.get("amountDue")),
        currency: String(formData.get("currency")),
        dueDate: String(formData.get("dueDate")),
      }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json.error ?? "Error al agregar cuota");
      setLoading(false);
      return;
    }
    onSaved();
  }

  return (
    <Dialog title="Agregar cuota" error={error} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Monto">
          <input name="amountDue" type="number" step="0.01" min="0.01" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <CurrencySelect defaultCurrency={currency} />
        <Field label="Fecha de vencimiento">
          <input name="dueDate" type="date" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <DialogActions loading={loading} onClose={onClose} submitLabel="Agregar cuota" />
      </form>
    </Dialog>
  );
}

function EditScheduleDialog({
  schedule,
  studentId,
  onClose,
  onSaved,
}: {
  schedule: Schedule;
  studentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/operaciones/students/${studentId}/schedule/${schedule.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountDue: Number(formData.get("amountDue")),
            currency: String(formData.get("currency")),
            dueDate: String(formData.get("dueDate")),
          }),
        },
      );
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error ?? "Error al guardar cuota");
        setLoading(false);
        return;
      }
      onSaved();
    } catch {
      setError("Error de red al guardar cuota");
      setLoading(false);
    }
  }

  return (
    <Dialog title={`Editar cuota #${schedule.installmentNumber}`} error={error} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Monto">
          <input
            name="amountDue"
            type="number"
            step="0.01"
            min="0.01"
            defaultValue={toNum(schedule.amountDue)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <CurrencySelect defaultCurrency={schedule.currency} />
        <Field label="Fecha de vencimiento">
          <input
            name="dueDate"
            type="date"
            defaultValue={schedule.dueDate.slice(0, 10)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <DialogActions loading={loading} onClose={onClose} submitLabel="Guardar cambios" />
      </form>
    </Dialog>
  );
}

function EditPaymentDialog({
  payment,
  studentId,
  schedules,
  paymentAccounts,
  onClose,
  onSaved,
}: {
  payment: Payment;
  studentId: string;
  schedules: Schedule[];
  paymentAccounts: PaymentAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const currentAccountId = payment.paymentAccount?.id ?? "";

  // Legacy rows with no linked account are read-only: the new model needs a
  // receiving account to derive currency / USD value, and we don't want to
  // silently strip data from them.
  if (!currentAccountId) {
    return (
      <Dialog title="Pago heredado (solo lectura)" error={null} onClose={onClose}>
        <div className="space-y-3 text-sm text-slate-700">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
            Este pago se registró antes de exigir una cuenta receptora y no se
            puede editar desde acá. Eliminalo y volvé a registrarlo si
            necesitás corregirlo.
          </p>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="text-slate-500">Monto</dt>
            <dd>{formatMoney(payment.amount, payment.currency)}</dd>
            <dt className="text-slate-500">Fecha</dt>
            <dd>{payment.paidAt.slice(0, 10)}</dd>
            {payment.method && (
              <>
                <dt className="text-slate-500">Método</dt>
                <dd>{payment.method}</dd>
              </>
            )}
            {payment.reference && (
              <>
                <dt className="text-slate-500">Referencia</dt>
                <dd>{payment.reference}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            Cerrar
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <EditPaymentDialogForm
      payment={payment}
      studentId={studentId}
      schedules={schedules}
      paymentAccounts={paymentAccounts}
      currentAccountId={currentAccountId}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function EditPaymentDialogForm({
  payment,
  studentId,
  schedules,
  paymentAccounts,
  currentAccountId,
  onClose,
  onSaved,
}: {
  payment: Payment;
  studentId: string;
  schedules: Schedule[];
  paymentAccounts: PaymentAccount[];
  currentAccountId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const accountOptions = paymentAccounts.filter(
    (account) => account.isActive || account.id === currentAccountId,
  );

  const [form, setForm] = useState<PaymentFormState & { scheduleId: string }>({
    amount: String(toNum(payment.amount)),
    paymentAccountId: currentAccountId,
    paidAt: payment.paidAt.slice(0, 10),
    exchangeRate:
      payment.receivedCurrency &&
      payment.receivedCurrency.toUpperCase() !== "USD"
        ? String(
            Math.round(
              (toNum(payment.receivedAmount ?? payment.amount) /
                Math.max(toNum(payment.officialAmountUsd), 0.0001)) *
                10000,
            ) / 10000,
          )
        : "",
    officialAmountUsd:
      payment.officialAmountUsd != null
        ? String(toNum(payment.officialAmountUsd))
        : "",
    notes: payment.notes ?? "",
    scheduleId: payment.schedule?.id ?? "",
  });
  // Start in auto-recalc mode: if the operator edits amount or exchangeRate
  // the displayed USD updates from amount/rate and the new auto value is
  // what gets sent. Only flip to manual when the user actually types into
  // the Equivalente USD field, so we never re-submit the stale stored USD
  // as an override.
  const [officialUsdManual, setOfficialUsdManual] = useState(false);

  const selectedAccount =
    paymentAccounts.find((account) => account.id === form.paymentAccountId) ??
    null;
  const accountCurrency = selectedAccount?.currency.toUpperCase() ?? "";
  const isNonUsdAccount =
    selectedAccount != null && accountCurrency !== "USD";

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const onAutoRate = useCallback((rate: number) => {
    setForm((prev) => ({ ...prev, exchangeRate: String(rate) }));
  }, []);
  const trm = useExchangeRate({
    currency: accountCurrency,
    date: form.paidAt,
    enabled: isNonUsdAccount && accountCurrency === "COP",
    onAutoRate,
  });

  useEffect(() => {
    if (!isNonUsdAccount) setOfficialUsdManual(false);
  }, [isNonUsdAccount]);

  useEffect(() => {
    if (!isNonUsdAccount) return;
    if (officialUsdManual) return;
    const amount = toNumber(form.amount);
    const rate = toNumber(form.exchangeRate);
    if (amount > 0 && rate > 0) {
      const computed = Math.round((amount / rate) * 100) / 100;
      const computedStr = String(computed);
      setForm((prev) =>
        prev.officialAmountUsd === computedStr
          ? prev
          : { ...prev, officialAmountUsd: computedStr },
      );
    }
  }, [isNonUsdAccount, form.amount, form.exchangeRate, officialUsdManual]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) {
      setError("Seleccioná una cuenta receptora");
      return;
    }
    const amount = toNumber(form.amount);
    if (!(amount > 0)) {
      setError("Monto requerido");
      return;
    }
    if (isNonUsdAccount) {
      const officialUsd = toNumber(form.officialAmountUsd);
      if (!(officialUsd > 0)) {
        setError("El equivalente USD oficial debe ser mayor a 0");
        return;
      }
    }
    setLoading(true);
    setError(null);
    const body: Record<string, unknown> = {
      amount,
      paidAt: form.paidAt,
      notes: form.notes.trim() ? form.notes.trim() : null,
      paymentAccountId: selectedAccount.id,
      scheduleId: form.scheduleId || null,
    };
    if (isNonUsdAccount) {
      const rate = toNumber(form.exchangeRate);
      if (rate > 0) body.exchangeRate = rate;
      // Only forward the USD field as an explicit override when the user
      // actually edited it. Otherwise the route recomputes from amount/rate
      // (or conserves the existing USD when nothing relevant changed).
      if (officialUsdManual) {
        const officialUsd = toNumber(form.officialAmountUsd);
        if (officialUsd > 0) body.officialAmountUsd = officialUsd;
      }
    }
    try {
      const response = await fetch(
        `/api/operaciones/students/${studentId}/payments/${payment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(json.error ?? "Error al guardar pago");
        setLoading(false);
        return;
      }
      onSaved();
    } catch {
      setError("Error de red al guardar pago");
      setLoading(false);
    }
  }

  return (
    <Dialog title="Editar pago" error={error} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Cuenta receptora">
          {accountOptions.length === 0 ? (
            <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No hay cuentas receptoras disponibles.
            </p>
          ) : (
            <select
              required
              value={form.paymentAccountId}
              onChange={(event) =>
                updateField("paymentAccountId", event.target.value)
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName} ({account.currency})
                  {!account.isActive ? " — inactiva" : ""}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Moneda">
          <input
            type="text"
            readOnly
            value={selectedAccount?.currency ?? ""}
            className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          />
        </Field>
        <Field label={selectedAccount ? `Monto (${selectedAccount.currency})` : "Monto"}>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={form.amount}
            onChange={(event) => updateField("amount", event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Fecha del pago">
          <input
            type="date"
            required
            value={form.paidAt}
            onChange={(event) => updateField("paidAt", event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        {isNonUsdAccount && (
          <>
            <Field label={`Tasa de cambio (1 USD = ? ${accountCurrency})`}>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.exchangeRate}
                onChange={(event) => {
                  updateField("exchangeRate", event.target.value);
                  trm.markManual();
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <ExchangeRateStatusLine
                currency={accountCurrency}
                status={trm.status}
                effectiveDate={trm.effectiveDate}
                source={trm.source}
                errorMessage={trm.errorMessage}
                paidAt={form.paidAt}
                onUseToday={trm.reset}
              />
            </Field>
            <Field label="Equivalente USD oficial">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.officialAmountUsd}
                onChange={(event) => {
                  setOfficialUsdManual(true);
                  updateField("officialAmountUsd", event.target.value);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              {officialUsdManual && (
                <button
                  type="button"
                  className="mt-1 text-xs text-slate-500 underline"
                  onClick={() => setOfficialUsdManual(false)}
                >
                  Restablecer auto-cálculo
                </button>
              )}
            </Field>
          </>
        )}
        <Field label="Asignar a cuota">
          <select
            value={form.scheduleId}
            onChange={(event) => updateField("scheduleId", event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sin asignar</option>
            {schedules.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                Cuota #{schedule.installmentNumber} ({formatMoney(schedule.amountDue, schedule.currency)} -{" "}
                {schedule.dueDate.slice(0, 10)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notas">
          <textarea
            rows={2}
            value={form.notes}
            onChange={(event) => updateField("notes", event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <DialogActions loading={loading} onClose={onClose} submitLabel="Guardar cambios" />
      </form>
    </Dialog>
  );
}

function Dialog({
  title,
  error,
  children,
}: {
  title: string;
  error: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md space-y-3 rounded-lg bg-white p-6">
        <h3 className="text-lg font-bold">{title}</h3>
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function CurrencySelect({
  defaultCurrency = "USD",
  locked = false,
}: {
  defaultCurrency?: string;
  locked?: boolean;
}) {
  return (
    <Field label="Moneda">
      <select
        name={locked ? undefined : "currency"}
        defaultValue={defaultCurrency}
        disabled={locked}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
      >
        <option value="USD">USD</option>
        <option value="COP">COP</option>
        <option value="MXN">MXN</option>
        <option value="EUR">EUR</option>
      </select>
      {locked && <input type="hidden" name="currency" value={defaultCurrency} />}
    </Field>
  );
}

function DialogActions({
  loading,
  onClose,
  submitLabel,
}: {
  loading: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
        Cancelar
      </button>
      <button type="submit" disabled={loading} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium !text-white disabled:opacity-50">
        {loading ? "Guardando..." : submitLabel}
      </button>
    </div>
  );
}
