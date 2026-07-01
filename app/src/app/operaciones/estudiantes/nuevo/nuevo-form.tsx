"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useExchangeRate } from "../_lib/use-exchange-rate";
import { ExchangeRateStatusLine } from "../_lib/exchange-rate-status";
import { MoneyInput } from "../_lib/money-input";
import {
  COUNTRIES,
  DOCUMENT_TYPES,
  subdivisionsForCountry,
} from "@/lib/legal-locations";

interface Mentor { id: string; name: string | null; email: string }
interface Closer { id: string; name: string | null; email: string; position: string }

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

interface TeamMember {
  fullName: string;
  email: string;
  phone: string;
  documentType: string;
  documentNumber: string;
  isContractSigner: boolean;
}

const MAX_ADDITIONAL_MEMBERS = 4;

function emptyMember(): TeamMember {
  return {
    fullName: "",
    email: "",
    phone: "",
    documentType: "",
    documentNumber: "",
    isContractSigner: false,
  };
}

type InitialPaymentType = "FULL_PAYMENT" | "DOWN_PAYMENT" | "RESERVATION";
type InstallmentFrequency = "monthly" | "biweekly";
type ContractTemplateKind = "TRADITIONAL" | "BUSINESS" | "BRAND_CONSULTING";

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

interface SaleState {
  productId: string;
  totalAmountUsd: string;
  endsAt: string;
  grantAccessNow: boolean;
  paymentAccountId: string;
  currency: string;
  contractTemplateKind: ContractTemplateKind;
  notes: string;
  // Initial payment
  hasInitialPayment: boolean;
  initialPaymentAmount: string;
  initialPaymentCurrency: string;
  initialPaymentOfficialUsd: string;
  initialPaymentExchangeRate: string;
  initialPaymentPaidAt: string;
  initialPaymentType: InitialPaymentType;
  // Installments
  installmentCount: string;
  firstDueDate: string;
  installmentFrequency: InstallmentFrequency;
}

// API errors from /api/operaciones/students arrive as `{ error, details? }`.
// When the schema rejected the body, `details` is the `ZodError.flatten()`
// shape: `{ formErrors, fieldErrors }`. We translate the top-level field keys
// to Spanish labels so the alert reads better than "Validación fallida".
interface ApiErrorDetails {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

const STUDENT_FIELD_LABELS: Record<string, string> = {
  fullName: "Nombre",
  legalName: "Nombre legal",
  email: "Correo",
  phone: "Teléfono",
  startDate: "Fecha de inicio",
  durationMonths: "Duración",
  mentorUserId: "Mentor",
  closerUserId: "Closer",
  ghlContactId: "Contacto GHL",
  notes: "Notas",
  personality: "Personalidad",
  initialEnrollment: "Venta inicial",
};

function formatApiError(
  fallback: string,
  json: { error?: string; details?: ApiErrorDetails } | null | undefined,
): string {
  const base = json?.error ?? fallback;
  const details = json?.details;
  if (!details) return base;
  const fieldErrors = details.fieldErrors ?? {};
  const formErrors = details.formErrors ?? [];
  const parts: string[] = [];
  for (const [field, msgs] of Object.entries(fieldErrors)) {
    if (!msgs || msgs.length === 0) continue;
    const label = STUDENT_FIELD_LABELS[field] ?? field;
    parts.push(`${label}: ${msgs[0]}`);
  }
  for (const msg of formErrors) {
    if (msg) parts.push(msg);
  }
  if (parts.length === 0) return base;
  return `${base}: ${parts.join(" · ")}`;
}

function buildInitialSaleState(startDate: string): SaleState {
  return {
    productId: "",
    totalAmountUsd: "",
    endsAt: "",
    grantAccessNow: false,
    paymentAccountId: "",
    currency: "USD",
    contractTemplateKind: "TRADITIONAL",
    notes: "",
    hasInitialPayment: false,
    initialPaymentAmount: "",
    initialPaymentCurrency: "USD",
    initialPaymentOfficialUsd: "",
    initialPaymentExchangeRate: "",
    initialPaymentPaidAt: startDate,
    initialPaymentType: "DOWN_PAYMENT",
    installmentCount: "",
    firstDueDate: "",
    installmentFrequency: "monthly",
  };
}

export function NuevoEstudianteForm({
  mentors,
  closers,
}: {
  mentors: Mentor[];
  closers: Closer[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student fields are kept as controlled state so we can mirror startDate
  // into the enrollment's startedAt / paidAt defaults.
  const [fullName, setFullName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [durationMonths, setDurationMonths] = useState("12");
  const [mentorUserId, setMentorUserId] = useState("");
  const [closerUserId, setCloserUserId] = useState("");
  const [notes, setNotes] = useState("");

  // Equipo / firma múltiple. El titular es siempre firmante por defecto; aquí
  // se capturan hasta 4 integrantes adicionales (equipo de máximo 5).
  const [members, setMembers] = useState<TeamMember[]>([]);

  function addMember() {
    setMembers((prev) =>
      prev.length >= MAX_ADDITIONAL_MEMBERS ? prev : [...prev, emptyMember()],
    );
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function updateMember<K extends keyof TeamMember>(
    index: number,
    key: K,
    value: TeamMember[K],
  ) {
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [key]: value } : m)),
    );
  }

  // Datos legales opcionales para el contrato. El teléfono y el nombre legal
  // ya viven arriba; aquí sólo se capturan documento, dirección y ubicación.
  const [documentType, setDocumentType] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [legalCountry, setLegalCountry] = useState("");
  const [legalState, setLegalState] = useState("");
  const [legalCity, setLegalCity] = useState("");

  // Identidad empresarial (EL CLIENTE) para contratos Brand Consulting: razón
  // social firmante, su NIT/documento y su representante legal. Son distintos
  // del estudiante (fullName) y de sus datos legales personales (legalName /
  // documentType / documentNumber) de arriba.
  const [companyLegalName, setCompanyLegalName] = useState("");
  const [companyDocumentType, setCompanyDocumentType] = useState("");
  const [companyDocumentNumber, setCompanyDocumentNumber] = useState("");
  const [companyRepresentativeName, setCompanyRepresentativeName] = useState("");

  const legalSubdivisions = useMemo(
    () => subdivisionsForCountry(legalCountry),
    [legalCountry],
  );

  function onChangeLegalCountry(value: string) {
    setLegalCountry(value);
    setLegalState("");
  }

  // Catalog data fetched on mount.
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Optional initial sale block. "Fecha del pago" mantiene su propio default
  // (hoy) — la fecha de inicio del estudiante arranca vacía y no debe
  // arrastrar visualmente al pago inicial.
  const [sellNow, setSellNow] = useState(true);
  const [sale, setSale] = useState<SaleState>(() =>
    buildInitialSaleState(new Date().toISOString().slice(0, 10)),
  );
  // Si el usuario edita manualmente el "Equivalente USD oficial", no lo
  // pisamos cuando se recalcule desde monto/tasa.
  const [officialUsdManual, setOfficialUsdManual] = useState(false);

  // Fetch active products + payment accounts on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const [productsRes, accountsRes] = await Promise.all([
          fetch("/api/operaciones/products?active=true"),
          fetch("/api/operaciones/payment-accounts?active=true"),
        ]);
        const [productsJson, accountsJson] = await Promise.all([
          productsRes.json(),
          accountsRes.json(),
        ]);
        if (cancelled) return;
        if (!productsRes.ok || !accountsRes.ok) {
          setCatalogError(
            productsJson.error ??
              accountsJson.error ??
              "No se pudo cargar el catálogo de productos / cuentas",
          );
          return;
        }
        const loadedProducts: Product[] = productsJson.products ?? [];
        setProducts(loadedProducts);
        setPaymentAccounts(accountsJson.paymentAccounts ?? []);

        // Pre-select the main active product when available.
        const main = loadedProducts.find((p) => p.isMainProduct && p.isActive);
        if (main) {
          setSale((prev) => applyProductSelection(prev, main));
        }
      } catch {
        if (!cancelled) {
          setCatalogError("Error de red al cargar el catálogo");
        }
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror student startDate into enrollment defaults whenever it changes.
  useEffect(() => {
    setSale((prev) => ({
      ...prev,
      initialPaymentPaidAt: prev.initialPaymentPaidAt || startDate,
    }));
  }, [startDate]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === sale.productId) ?? null,
    [products, sale.productId],
  );

  // Cuando la venta inicial usa el contrato Brand Consulting, el "nombre legal"
  // deja de ser el del estudiante para pasar a ser la razón social del cliente.
  const isBrandConsulting =
    sellNow && sale.contractTemplateKind === "BRAND_CONSULTING";

  // TRM automática: solo aplica cuando hay pago inicial activo y la
  // moneda es COP. El padre conserva el valor del input; el hook avisa
  // por callback cuando consigue un valor automático.
  const initialPaymentIsCop =
    sale.initialPaymentCurrency.toUpperCase() === "COP";
  const onAutoRate = useCallback((rate: number) => {
    setSale((prev) => ({ ...prev, initialPaymentExchangeRate: String(rate) }));
  }, []);
  const trm = useExchangeRate({
    currency: sale.initialPaymentCurrency,
    date: sale.initialPaymentPaidAt,
    enabled: sale.hasInitialPayment && initialPaymentIsCop,
    onAutoRate,
  });

  // Auto-calc del Equivalente USD oficial = monto / tasa, salvo que el
  // usuario haya editado el campo manualmente.
  useEffect(() => {
    if (!sale.hasInitialPayment) return;
    if (sale.initialPaymentCurrency.toUpperCase() === "USD") return;
    if (officialUsdManual) return;
    const amount = toNum(sale.initialPaymentAmount);
    const rate = toNum(sale.initialPaymentExchangeRate);
    if (amount > 0 && rate > 0) {
      const computed = Math.round((amount / rate) * 100) / 100;
      const computedStr = String(computed);
      setSale((prev) =>
        prev.initialPaymentOfficialUsd === computedStr
          ? prev
          : { ...prev, initialPaymentOfficialUsd: computedStr },
      );
    }
  }, [
    sale.hasInitialPayment,
    sale.initialPaymentCurrency,
    sale.initialPaymentAmount,
    sale.initialPaymentExchangeRate,
    officialUsdManual,
  ]);

  // Cuando se cambia la moneda a USD o se desactiva el pago inicial,
  // limpiar la marca de "editado manual" para que vuelva a auto-calc.
  useEffect(() => {
    if (!sale.hasInitialPayment) {
      setOfficialUsdManual(false);
    }
  }, [sale.hasInitialPayment]);
  useEffect(() => {
    if (sale.initialPaymentCurrency.toUpperCase() === "USD") {
      setOfficialUsdManual(false);
    }
  }, [sale.initialPaymentCurrency]);

  function applyProductSelection(prev: SaleState, product: Product): SaleState {
    return {
      ...prev,
      productId: product.id,
      totalAmountUsd: String(toNum(product.basePriceUsd)),
      currency: "USD",
      hasInitialPayment: product.requiresInitialPayment
        ? true
        : prev.hasInitialPayment,
      installmentCount: product.allowsInstallments ? prev.installmentCount : "",
      firstDueDate: product.allowsInstallments ? prev.firstDueDate : "",
    };
  }

  function updateSale<K extends keyof SaleState>(key: K, value: SaleState[K]) {
    setSale((prev) => ({ ...prev, [key]: value }));
  }

  function onSelectProduct(productId: string) {
    const product = products.find((p) => p.id === productId) ?? null;
    setSale((prev) =>
      product
        ? applyProductSelection(prev, product)
        : {
            ...prev,
            productId: "",
            totalAmountUsd: "",
            currency: "USD",
            installmentCount: "",
            firstDueDate: "",
          },
    );
  }

  function onSelectPaymentAccount(accountId: string) {
    const account = paymentAccounts.find((a) => a.id === accountId) ?? null;
    setSale((prev) => ({
      ...prev,
      paymentAccountId: accountId,
      initialPaymentCurrency: account
        ? account.currency
        : prev.initialPaymentCurrency,
    }));
  }

  // Derived sale values used both for preview and validation.
  const totalAmountUsdNum = toNum(sale.totalAmountUsd);
  const initialPaymentUsdNum = sale.hasInitialPayment
    ? sale.initialPaymentCurrency.toUpperCase() === "USD"
      ? toNum(sale.initialPaymentAmount)
      : toNum(sale.initialPaymentOfficialUsd)
    : 0;
  const estimatedBalanceUsd = Math.max(
    0,
    Math.round((totalAmountUsdNum - initialPaymentUsdNum) * 100) / 100,
  );
  const installmentCountNum = Number.parseInt(sale.installmentCount, 10);
  const estimatedPerInstallment =
    estimatedBalanceUsd > 0 &&
    Number.isFinite(installmentCountNum) &&
    installmentCountNum > 0
      ? Math.round((estimatedBalanceUsd / installmentCountNum) * 100) / 100
      : null;

  const initialPaymentInNonUsd =
    sale.hasInitialPayment && sale.initialPaymentCurrency.toUpperCase() !== "USD";
  // El plan de cuotas solo aplica cuando el pago inicial es de tipo
  // "Pago inicial" (DOWN_PAYMENT). En reservas o pagos totales no debe
  // mostrarse ni exigirse — esos flujos liquidan el saldo por fuera.
  const showInstallmentSection =
    sale.hasInitialPayment && sale.initialPaymentType === "DOWN_PAYMENT";
  const needsInstallmentPlan =
    showInstallmentSection &&
    estimatedBalanceUsd > 0 &&
    (selectedProduct?.allowsInstallments ?? true);
  const balanceWithoutInstallmentsAllowed =
    showInstallmentSection &&
    estimatedBalanceUsd > 0 &&
    selectedProduct != null &&
    !selectedProduct.allowsInstallments;

  function validateSale(): string | null {
    if (!sellNow) return null;
    if (!selectedProduct) return "Selecciona un producto para la venta inicial";
    if (!(totalAmountUsdNum > 0)) return "Monto total USD debe ser > 0";

    if (sale.hasInitialPayment) {
      if (!(toNum(sale.initialPaymentAmount) > 0)) {
        return "Monto del pago inicial requerido";
      }
      if (!sale.initialPaymentPaidAt) return "Fecha del pago inicial requerida";
      if (!sale.paymentAccountId) {
        return "Selecciona una cuenta receptora activa para el pago inicial";
      }
      const account = paymentAccounts.find(
        (a) => a.id === sale.paymentAccountId,
      );
      if (!account || !account.isActive) {
        return "La cuenta receptora debe estar activa";
      }
      if (
        sale.initialPaymentCurrency.toUpperCase() !== "USD" &&
        !(toNum(sale.initialPaymentOfficialUsd) > 0)
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
      if (!sale.firstDueDate) {
        return "Primera fecha de cuota requerida cuando hay saldo restante";
      }
    }
    return null;
  }

  function buildInitialEnrollmentBody(
    startedAt: string,
  ): Record<string, unknown> | null {
    if (!sellNow || !selectedProduct) return null;
    const body: Record<string, unknown> = {
      productId: selectedProduct.id,
      startedAt,
      totalAmountUsd: totalAmountUsdNum,
      currency: sale.currency,
      installmentFrequency: sale.installmentFrequency,
      grantAccessNow: sale.grantAccessNow,
      paymentAccountId: sale.paymentAccountId || null,
      contractTemplateKind: sale.contractTemplateKind,
      notes: sale.notes.trim() ? sale.notes.trim() : null,
    };
    if (sale.endsAt) body.endsAt = sale.endsAt;
    if (
      sale.hasInitialPayment &&
      sale.initialPaymentType === "DOWN_PAYMENT" &&
      estimatedBalanceUsd > 0 &&
      Number.isFinite(installmentCountNum) &&
      installmentCountNum > 0
    ) {
      body.installmentCount = installmentCountNum;
      body.firstDueDate = sale.firstDueDate;
    }
    if (sale.hasInitialPayment) {
      const amount = toNum(sale.initialPaymentAmount);
      const initialPayment: Record<string, unknown> = {
        amount,
        currency: sale.initialPaymentCurrency,
        paidAt: sale.initialPaymentPaidAt,
        initialPaymentType: sale.initialPaymentType,
        paymentAccountId: sale.paymentAccountId || null,
      };
      if (sale.initialPaymentCurrency.toUpperCase() !== "USD") {
        initialPayment.officialAmountUsd = toNum(sale.initialPaymentOfficialUsd);
        initialPayment.receivedAmount = amount;
        initialPayment.receivedCurrency = sale.initialPaymentCurrency;
        if (toNum(sale.initialPaymentExchangeRate) > 0) {
          initialPayment.exchangeRate = toNum(sale.initialPaymentExchangeRate);
        }
      }
      body.initialPayment = initialPayment;
    }
    return body;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const saleError = validateSale();
    if (saleError) {
      setError(saleError);
      return;
    }

    if (members.some((m) => !m.fullName.trim())) {
      setError("Cada integrante del equipo debe tener nombre");
      return;
    }

    setLoading(true);

    const effectiveStartDate =
      startDate || new Date().toISOString().slice(0, 10);
    const initialEnrollment = buildInitialEnrollmentBody(effectiveStartDate);
    const body: Record<string, unknown> = {
      fullName,
      email,
      phone: phone || null,
      startDate: effectiveStartDate,
      durationMonths: Number(durationMonths),
      mentorUserId: mentorUserId || null,
      closerUserId: closerUserId || null,
      legalName: legalName || null,
      documentType: documentType || null,
      documentNumber: documentNumber || null,
      legalAddress: legalAddress || null,
      legalCountry: legalCountry || null,
      legalState: legalState || null,
      legalCity: legalCity || null,
      companyLegalName: companyLegalName || null,
      companyDocumentType: companyDocumentType || null,
      companyDocumentNumber: companyDocumentNumber || null,
      companyRepresentativeName: companyRepresentativeName || null,
      notes: notes || null,
    };
    if (initialEnrollment) {
      body.initialEnrollment = initialEnrollment;
    }
    if (members.length > 0) {
      body.members = members.map((m) => ({
        fullName: m.fullName.trim(),
        email: m.email.trim() ? m.email.trim() : null,
        phone: m.phone.trim() ? m.phone.trim() : null,
        documentType: m.documentType.trim() ? m.documentType.trim() : null,
        documentNumber: m.documentNumber.trim() ? m.documentNumber.trim() : null,
        isContractSigner: m.isContractSigner,
      }));
    }

    try {
      const res = await fetch("/api/operaciones/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(formatApiError("Error al crear estudiante", json));
        setLoading(false);
        return;
      }
      const studentId = json.student.id as string;
      const target = json.enrollment
        ? `/operaciones/estudiantes/${studentId}?tab=ventas`
        : `/operaciones/estudiantes/${studentId}`;
      router.push(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setLoading(false);
    }
  }

  const catalogExplanation = useMemo(() => {
    if (catalogLoading) return "Cargando catálogo de productos...";
    if (catalogError) return catalogError;
    const active = products.filter((p) => p.isActive);
    if (active.length === 0) {
      return "No hay productos activos en el catálogo. Crea uno desde Operaciones · Catálogo o el estudiante quedará sin inscripción inicial.";
    }
    const main = active.find((p) => p.isMainProduct);
    if (main) {
      return `Producto principal pre-seleccionado: ${main.name}. Puedes cambiarlo o desactivar la venta inicial.`;
    }
    return "El catálogo no tiene un producto marcado como principal. Selecciona uno manualmente abajo.";
  }, [products, catalogLoading, catalogError]);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">Datos del estudiante</h2>

        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700">Nombre completo *</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Correo *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Teléfono (E.164)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+573001234567"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Mentor líder</label>
            <select
              value={mentorUserId}
              onChange={(e) => setMentorUserId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— Sin asignar —</option>
              {mentors.map((m) => (
                <option key={m.id} value={m.id}>{m.name ?? m.email}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Closer (cerró la venta)</label>
            <select
              value={closerUserId}
              onChange={(e) => setCloserUserId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— Sin asignar —</option>
              {closers.map((closer) => (
                <option key={closer.id} value={closer.id}>
                  {closer.name ?? closer.email}{closer.position === "ADMIN" ? " (Admin)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Fecha de inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Duración (meses) *</label>
            <input
              type="number"
              min={1}
              max={60}
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Notas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Datos legales para contrato (opcional)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Necesarios para generar el contrato real. Puedes completarlos ahora o
            más tarde desde el detalle del estudiante. El teléfono se toma de los
            campos de arriba.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Nombre legal (opcional)
          </label>
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {isBrandConsulting && (
            <p className="mt-1 text-xs text-slate-500">
              Datos personales del estudiante. La razón social, el NIT de la
              empresa y su representante legal se capturan aparte, más abajo.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Tipo de documento
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— Selecciona —</option>
              {DOCUMENT_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Número de documento
            </label>
            <input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              maxLength={100}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Dirección / domicilio
          </label>
          <input
            value={legalAddress}
            onChange={(e) => setLegalAddress(e.target.value)}
            maxLength={300}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">País</label>
            <select
              value={legalCountry}
              onChange={(e) => onChangeLegalCountry(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— Selecciona —</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Departamento / Estado / Provincia
            </label>
            {legalSubdivisions.length > 0 ? (
              <select
                value={legalState}
                onChange={(e) => setLegalState(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— Selecciona —</option>
                {legalSubdivisions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={legalState}
                onChange={(e) => setLegalState(e.target.value)}
                maxLength={120}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Ciudad</label>
          <input
            value={legalCity}
            onChange={(e) => setLegalCity(e.target.value)}
            maxLength={120}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {isBrandConsulting && (
          <div className="space-y-4 rounded-md border border-indigo-200 bg-indigo-50 p-4">
            <div>
              <h3 className="text-sm font-semibold text-indigo-900">
                Datos de la empresa (EL CLIENTE)
              </h3>
              <p className="mt-1 text-xs text-indigo-800">
                En Brand Consulting EL CLIENTE es la empresa, no el estudiante.
                La empresa (razón social + NIT) firma a través de su
                representante legal. El estudiante, la empresa y el representante
                pueden ser tres personas/entidades distintas.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Razón social
              </label>
              <input
                value={companyLegalName}
                onChange={(e) => setCompanyLegalName(e.target.value)}
                maxLength={200}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Tipo de documento empresa
                </label>
                <select
                  value={companyDocumentType}
                  onChange={(e) => setCompanyDocumentType(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">— Selecciona —</option>
                  {DOCUMENT_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {dt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  NIT / documento empresa
                </label>
                <input
                  value={companyDocumentNumber}
                  onChange={(e) => setCompanyDocumentNumber(e.target.value)}
                  maxLength={100}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Representante legal firmante
              </label>
              <input
                value={companyRepresentativeName}
                onChange={(e) => setCompanyRepresentativeName(e.target.value)}
                maxLength={200}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Persona que firma en nombre de la empresa. Puede ser distinta del
                estudiante.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Equipo / integrantes (opcional)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Agrega hasta {MAX_ADDITIONAL_MEMBERS} integrantes adicionales
              (equipo de hasta {MAX_ADDITIONAL_MEMBERS + 1} contando al titular).
              El titular firma el contrato por defecto; marca “Firma contrato” en
              los integrantes que también deban firmarlo.
            </p>
          </div>
          <button
            type="button"
            onClick={addMember}
            disabled={members.length >= MAX_ADDITIONAL_MEMBERS}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            + Agregar integrante
          </button>
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-slate-500">
            Sin integrantes adicionales. El estudiante titular entra solo.
          </p>
        ) : (
          <div className="space-y-4">
            {members.map((member, index) => (
              <div
                key={index}
                className="rounded-md border border-slate-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">
                    Integrante {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMember(index)}
                    className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline"
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700">
                      Nombre <span className="text-rose-600">*</span>
                    </label>
                    <input
                      value={member.fullName}
                      onChange={(e) =>
                        updateMember(index, "fullName", e.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Correo
                    </label>
                    <input
                      type="email"
                      value={member.email}
                      onChange={(e) =>
                        updateMember(index, "email", e.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Teléfono
                    </label>
                    <input
                      value={member.phone}
                      onChange={(e) =>
                        updateMember(index, "phone", e.target.value)
                      }
                      placeholder="+573001234567"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Tipo de documento
                    </label>
                    <select
                      value={member.documentType}
                      onChange={(e) =>
                        updateMember(index, "documentType", e.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Selecciona —</option>
                      {DOCUMENT_TYPES.map((dt) => (
                        <option key={dt.value} value={dt.value}>
                          {dt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Número de documento
                    </label>
                    <input
                      value={member.documentNumber}
                      onChange={(e) =>
                        updateMember(index, "documentNumber", e.target.value)
                      }
                      maxLength={100}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={member.isContractSigner}
                    onChange={(e) =>
                      updateMember(index, "isContractSigner", e.target.checked)
                    }
                  />
                  Firma contrato
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Venta inicial</h2>
            <p className="mt-1 text-xs text-slate-500">{catalogExplanation}</p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={sellNow}
              onChange={(e) => setSellNow(e.target.checked)}
            />
            Vender producto al crear
          </label>
        </div>

        {sellNow && !catalogLoading && !catalogError && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Producto <span className="text-rose-600">*</span>
                  </label>
                  <Link
                    href="/operaciones/catalogo?tab=productos"
                    target="_blank"
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    + Crear producto
                  </Link>
                </div>
                <select
                  value={sale.productId}
                  onChange={(e) => onSelectProduct(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required={sellNow}
                >
                  <option value="">— Selecciona —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.isMainProduct ? " (Principal)" : ""}
                    </option>
                  ))}
                </select>
                {products.length === 0 && (
                  <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Primero crea un producto en{" "}
                    <Link
                      href="/operaciones/catalogo?tab=productos"
                      target="_blank"
                      className="font-medium underline hover:text-amber-900"
                    >
                      Catálogo
                    </Link>
                    .
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Monto total USD <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={sale.totalAmountUsd}
                  onChange={(e) => updateSale("totalAmountUsd", e.target.value)}
                  required={sellNow}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  La inscripción se registra en USD.
                  {selectedProduct
                    ? ` Precio base del producto: ${formatUsd(selectedProduct.basePriceUsd)} (editable).`
                    : ""}
                </span>
              </div>
            </div>

            {selectedProduct && (
              <p className="text-xs text-slate-500">
                {selectedProduct.allowsInstallments ? "Permite cuotas" : "No permite cuotas"} ·{" "}
                {selectedProduct.requiresInitialPayment ? "Pago inicial marcado por defecto" : "Pago inicial opcional"}
                {selectedProduct.generatesCommission ? " · Genera comisión" : ""}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Tipo de contrato
              </label>
              <select
                value={sale.contractTemplateKind}
                onChange={(e) =>
                  updateSale(
                    "contractTemplateKind",
                    e.target.value as ContractTemplateKind,
                  )
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-xs"
              >
                <option value="TRADITIONAL">Tradicional</option>
                <option value="BUSINESS">Empresarial</option>
                <option value="BRAND_CONSULTING">Brand Consulting</option>
              </select>
              {sale.contractTemplateKind === "BUSINESS" && (
                <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  Este contrato empresarial usa los datos legales del estudiante
                  (nombre legal, documento, domicilio, duración y valor).
                  Completa esos campos para poder firmarlo.
                </p>
              )}
              {sale.contractTemplateKind === "BRAND_CONSULTING" && (
                <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  Brand Consulting usa la razón social + NIT de la empresa como
                  EL CLIENTE que contrata, y su representante legal como
                  firmante. Completa los datos de la empresa (más abajo) —
                  distintos del estudiante — para poder firmarlo.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={sale.grantAccessNow}
                onChange={(e) => updateSale("grantAccessNow", e.target.checked)}
              />
              Otorgar acceso ahora (estado de acceso: Activo)
            </label>

            <fieldset className="rounded-md border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-700">
                Pago inicial
              </legend>
              <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={sale.hasInitialPayment}
                  onChange={(e) => updateSale("hasInitialPayment", e.target.checked)}
                />
                Registrar pago inicial ahora
              </label>

              {sale.hasInitialPayment && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <label className="block text-sm font-medium text-slate-700">
                        Cuenta receptora <span className="text-rose-600">*</span>
                      </label>
                      <Link
                        href="/operaciones/catalogo?tab=cuentas"
                        target="_blank"
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        + Crear cuenta receptora
                      </Link>
                    </div>
                    <select
                      value={sale.paymentAccountId}
                      onChange={(e) => onSelectPaymentAccount(e.target.value)}
                      required={sale.hasInitialPayment}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Selecciona —</option>
                      {paymentAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName} ({a.currency})
                        </option>
                      ))}
                    </select>
                    {paymentAccounts.length === 0 && (
                      <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Primero crea una cuenta receptora en{" "}
                        <Link
                          href="/operaciones/catalogo?tab=cuentas"
                          target="_blank"
                          className="font-medium underline hover:text-amber-900"
                        >
                          Catálogo
                        </Link>
                        .
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Fecha del pago <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="date"
                      value={sale.initialPaymentPaidAt}
                      onChange={(e) => updateSale("initialPaymentPaidAt", e.target.value)}
                      required={sale.hasInitialPayment}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Tipo de pago inicial <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={sale.initialPaymentType}
                      onChange={(e) =>
                        updateSale("initialPaymentType", e.target.value as InitialPaymentType)
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="DOWN_PAYMENT">Pago inicial</option>
                      <option value="FULL_PAYMENT">Pago total</option>
                      <option value="RESERVATION">Separado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Monto <span className="text-rose-600">*</span>
                    </label>
                    <MoneyInput
                      value={sale.initialPaymentAmount}
                      onChange={(next) => updateSale("initialPaymentAmount", next)}
                      required={sale.hasInitialPayment}
                      placeholder="0"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Moneda</label>
                    <input
                      value={sale.initialPaymentCurrency}
                      disabled
                      className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm uppercase text-slate-700"
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Se establece según la cuenta receptora.
                    </span>
                  </div>

                  {initialPaymentInNonUsd && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">
                          Tasa de cambio
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          min="0"
                          value={sale.initialPaymentExchangeRate}
                          onChange={(e) => {
                            updateSale("initialPaymentExchangeRate", e.target.value);
                            trm.markManual();
                          }}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <ExchangeRateStatusLine
                          currency={sale.initialPaymentCurrency}
                          status={trm.status}
                          effectiveDate={trm.effectiveDate}
                          source={trm.source}
                          errorMessage={trm.errorMessage}
                          paidAt={sale.initialPaymentPaidAt}
                          onUseToday={trm.reset}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">
                          Equivalente USD oficial <span className="text-rose-600">*</span>
                        </label>
                        <MoneyInput
                          value={sale.initialPaymentOfficialUsd}
                          onChange={(next) => {
                            updateSale("initialPaymentOfficialUsd", next);
                            setOfficialUsdManual(true);
                          }}
                          required={initialPaymentInNonUsd}
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
                      </div>
                    </>
                  )}
                </div>
              )}
            </fieldset>

            {showInstallmentSection && (
              <fieldset className="rounded-md border border-slate-200 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-700">Plan de cuotas</legend>
                {balanceWithoutInstallmentsAllowed ? (
                  <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    Este producto no permite cuotas y el pago inicial no cubre el total. Ajusta el monto o
                    cambia el producto.
                  </p>
                ) : needsInstallmentPlan ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        # cuotas <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={sale.installmentCount}
                        onChange={(e) => updateSale("installmentCount", e.target.value)}
                        required={needsInstallmentPlan}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Primera fecha <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="date"
                        value={sale.firstDueDate}
                        onChange={(e) => updateSale("firstDueDate", e.target.value)}
                        required={needsInstallmentPlan}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Frecuencia</label>
                      <select
                        value={sale.installmentFrequency}
                        onChange={(e) =>
                          updateSale("installmentFrequency", e.target.value as InstallmentFrequency)
                        }
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="monthly">Mensual</option>
                        <option value="biweekly">Quincenal</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Sin saldo restante: no se generarán cuotas.
                  </p>
                )}
              </fieldset>
            )}

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
          </div>
        )}
      </section>

      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || catalogLoading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium !text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Crear estudiante"}
        </button>
      </div>
    </form>
  );
}
