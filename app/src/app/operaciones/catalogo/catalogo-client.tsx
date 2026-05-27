"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Role } from "@prisma/client";

type Numeric = string | number;
type LwType = "COURSE" | "BUNDLE" | "SUBSCRIPTION";
type SaleLimit = "ONE_PER_STUDENT" | "UNLIMITED";

interface LearnWorldsAccessConfig {
  id: string;
  lwProductType: LwType;
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
  saleLimit: SaleLimit;
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
  notes: string | null;
}

type Tab = "productos" | "cuentas";

function parseTab(value: string | null): Tab {
  return value === "cuentas" ? "cuentas" : "productos";
}

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

function canWriteRole(role: Role): boolean {
  return role === "ADMIN" || role === "OPERATOR";
}

export function CatalogoClient({ role }: { role: Role }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryTab = parseTab(searchParams?.get("tab") ?? null);

  const [tab, setTabState] = useState<Tab>(queryTab);
  const [products, setProducts] = useState<Product[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const canWrite = canWriteRole(role);

  // Sync local tab state when the URL ?tab=... changes (e.g. user navigates here
  // from "Crear producto" / "Crear cuenta receptora" links in other pages).
  useEffect(() => {
    setTabState((prev) => (prev === queryTab ? prev : queryTab));
  }, [queryTab]);

  function setTab(next: Tab) {
    setTabState(next);
    if (next === queryTab) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      const [productsRes, accountsRes] = await Promise.all([
        fetch(`/api/operaciones/products?active=all`),
        fetch(`/api/operaciones/payment-accounts?active=all`),
      ]);
      const [productsJson, accountsJson] = await Promise.all([
        productsRes.json(),
        accountsRes.json(),
      ]);
      if (!productsRes.ok || !accountsRes.ok) {
        setLoadError(
          productsJson.error ??
            accountsJson.error ??
            "No se pudo cargar el catálogo",
        );
        return;
      }
      setProducts(productsJson.products ?? []);
      setPaymentAccounts(accountsJson.paymentAccounts ?? []);
    } catch {
      setLoadError("No se pudo cargar el catálogo");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function notifySuccess(message: string) {
    setFlash(message);
    setTimeout(() => setFlash(null), 4000);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Catálogo compartido por todo Operaciones: <strong>Productos</strong> y{" "}
        <strong>Cuentas receptoras</strong> se usan al crear estudiantes y
        registrar ventas. Si un selector aparece vacío al crear un estudiante,
        vení acá y dalo de alta.
      </p>
      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === "productos"} onClick={() => setTab("productos")}>
          Productos
        </TabButton>
        <TabButton active={tab === "cuentas"} onClick={() => setTab("cuentas")}>
          Cuentas receptoras
        </TabButton>
      </div>

      {flash && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {flash}
        </div>
      )}

      {loadError && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando catálogo...</p>
      ) : tab === "productos" ? (
        <ProductosSection
          products={products}
          canWrite={canWrite}
          onReload={reload}
          onSuccess={notifySuccess}
        />
      ) : (
        <CuentasSection
          paymentAccounts={paymentAccounts}
          canWrite={canWrite}
          onReload={reload}
          onSuccess={notifySuccess}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
        active
          ? "border-slate-900 text-slate-900"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Productos ─────────────────────────────────────────────────────────────

function ProductosSection({
  products,
  canWrite,
  onReload,
  onSuccess,
}: {
  products: Product[];
  canWrite: boolean;
  onReload: () => Promise<void> | void;
  onSuccess: (message: string) => void;
}) {
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function toggleActive(product: Product) {
    setBusyId(product.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/operaciones/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRowError(json.error ?? "No se pudo actualizar el producto");
        return;
      }
      onSuccess(
        `Producto ${product.name} ${!product.isActive ? "activado" : "desactivado"}`,
      );
      await onReload();
    } catch {
      setRowError("Error de red al actualizar el producto");
    } finally {
      setBusyId(null);
    }
  }

  if (editing) {
    return (
      <ProductForm
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={async (msg) => {
          onSuccess(msg);
          setEditing(null);
          await onReload();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Productos</h2>
          <p className="text-xs text-slate-500">
            Estos productos son los que aparecen en el selector al crear un
            estudiante o registrar una venta. Marcá uno como principal para que
            quede pre-seleccionado.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Nuevo producto
          </button>
        )}
      </div>

      {rowError && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {rowError}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <Th>Nombre</Th>
              <Th>Slug</Th>
              <Th>Precio base</Th>
              <Th>Estado</Th>
              <Th>Main</Th>
              <Th>Cuotas</Th>
              <Th>Pago inicial</Th>
              <Th>Comisión</Th>
              <Th>LW configs</Th>
              {canWrite && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={canWrite ? 10 : 9}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No hay productos cargados.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-2 text-sm font-medium text-slate-900">
                    {p.name}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">{p.slug}</td>
                  <td className="px-4 py-2 text-sm text-slate-700">
                    {formatUsd(p.basePriceUsd)}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <Badge tone={p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                      {p.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {p.isMainProduct ? "Sí" : "No"}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {p.allowsInstallments ? "Sí" : "No"}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {p.requiresInitialPayment ? "Sí" : "No"}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {p.generatesCommission
                      ? `Sí · ${toNum(p.defaultCommissionPercent).toFixed(2)}%`
                      : "No"}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {p.learnWorldsAccessConfigs.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {p.learnWorldsAccessConfigs.map((cfg) => (
                          <li key={cfg.id} className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="bg-slate-100 text-slate-700">{cfg.lwProductType}</Badge>
                            <span className="font-medium text-slate-700">
                              {cfg.lwDisplayName ?? cfg.lwExternalId}
                            </span>
                            <span className="text-xs text-slate-400">id: {cfg.lwExternalId}</span>
                            {!cfg.isActive && (
                              <Badge tone="bg-rose-100 text-rose-700">inactivo</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  {canWrite && (
                    <td className="whitespace-nowrap px-4 py-2 text-sm">
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="mr-2 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => void toggleActive(p)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                      >
                        {busyId === p.id
                          ? "..."
                          : p.isActive
                            ? "Desactivar"
                            : "Activar"}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface LwConfigDraft {
  lwProductType: LwType;
  lwExternalId: string;
  lwDisplayName: string;
  description: string;
  isActive: boolean;
}

interface ProductFormState {
  name: string;
  slug: string;
  description: string;
  basePriceUsd: string;
  saleLimit: SaleLimit;
  allowsInstallments: boolean;
  requiresInitialPayment: boolean;
  generatesCommission: boolean;
  defaultCommissionPercent: string;
  isMainProduct: boolean;
  isActive: boolean;
  learnWorldsAccessConfigs: LwConfigDraft[];
}

function buildProductFormState(initial: Product | null): ProductFormState {
  if (!initial) {
    return {
      name: "",
      slug: "",
      description: "",
      basePriceUsd: "",
      saleLimit: "ONE_PER_STUDENT",
      allowsInstallments: true,
      requiresInitialPayment: false,
      generatesCommission: false,
      defaultCommissionPercent: "0",
      isMainProduct: false,
      isActive: true,
      learnWorldsAccessConfigs: [],
    };
  }
  return {
    name: initial.name,
    slug: initial.slug,
    description: initial.description ?? "",
    basePriceUsd: String(toNum(initial.basePriceUsd)),
    saleLimit: initial.saleLimit,
    allowsInstallments: initial.allowsInstallments,
    requiresInitialPayment: initial.requiresInitialPayment,
    generatesCommission: initial.generatesCommission,
    defaultCommissionPercent: String(toNum(initial.defaultCommissionPercent)),
    isMainProduct: initial.isMainProduct,
    isActive: initial.isActive,
    learnWorldsAccessConfigs: initial.learnWorldsAccessConfigs.map((cfg) => ({
      lwProductType: cfg.lwProductType,
      lwExternalId: cfg.lwExternalId,
      lwDisplayName: cfg.lwDisplayName ?? "",
      description: cfg.description ?? "",
      isActive: cfg.isActive,
    })),
  };
}

function ProductForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Product | null;
  onCancel: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [state, setState] = useState<ProductFormState>(() =>
    buildProductFormState(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = initial !== null;

  function update<K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function updateConfig<K extends keyof LwConfigDraft>(
    idx: number,
    key: K,
    value: LwConfigDraft[K],
  ) {
    setState((prev) => ({
      ...prev,
      learnWorldsAccessConfigs: prev.learnWorldsAccessConfigs.map((c, i) =>
        i === idx ? { ...c, [key]: value } : c,
      ),
    }));
  }

  function addConfigRow() {
    setState((prev) => ({
      ...prev,
      learnWorldsAccessConfigs: [
        ...prev.learnWorldsAccessConfigs,
        {
          lwProductType: "COURSE",
          lwExternalId: "",
          lwDisplayName: "",
          description: "",
          isActive: true,
        },
      ],
    }));
  }

  function removeConfigRow(idx: number) {
    setState((prev) => ({
      ...prev,
      learnWorldsAccessConfigs: prev.learnWorldsAccessConfigs.filter(
        (_, i) => i !== idx,
      ),
    }));
  }

  function validate(): string | null {
    if (!state.name.trim()) return "Nombre requerido";
    if (!state.slug.trim()) return "Slug requerido";
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(state.slug.trim())) {
      return "Slug debe ser kebab-case en minúscula";
    }
    const base = toNum(state.basePriceUsd);
    if (!(base >= 0)) return "Precio base USD inválido";
    if (state.generatesCommission) {
      const pct = toNum(state.defaultCommissionPercent);
      if (pct < 0 || pct > 100) return "Comisión % debe estar entre 0 y 100";
    }
    for (let i = 0; i < state.learnWorldsAccessConfigs.length; i++) {
      const cfg = state.learnWorldsAccessConfigs[i]!;
      if (!cfg.lwExternalId.trim()) {
        return `LW config #${i + 1}: externalId requerido`;
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
        name: state.name.trim(),
        slug: state.slug.trim(),
        description: state.description.trim() ? state.description.trim() : null,
        basePriceUsd: toNum(state.basePriceUsd),
        saleLimit: state.saleLimit,
        allowsInstallments: state.allowsInstallments,
        requiresInitialPayment: state.requiresInitialPayment,
        generatesCommission: state.generatesCommission,
        defaultCommissionPercent: state.generatesCommission
          ? toNum(state.defaultCommissionPercent)
          : 0,
        isMainProduct: state.isMainProduct,
        isActive: state.isActive,
        learnWorldsAccessConfigs: state.learnWorldsAccessConfigs.map((cfg) => ({
          lwProductType: cfg.lwProductType,
          lwExternalId: cfg.lwExternalId.trim(),
          lwDisplayName: cfg.lwDisplayName.trim()
            ? cfg.lwDisplayName.trim()
            : null,
          description: cfg.description.trim() ? cfg.description.trim() : null,
          isActive: cfg.isActive,
        })),
      };

      const url = isEdit
        ? `/api/operaciones/products/${initial!.id}`
        : `/api/operaciones/products`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Error al guardar producto");
        setSubmitting(false);
        return;
      }
      await onSaved(isEdit ? "Producto actualizado" : "Producto creado");
    } catch {
      setError("Error de red al guardar producto");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">
          {isEdit ? `Editar producto: ${initial!.name}` : "Nuevo producto"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancelar
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required>
          <input
            value={state.name}
            onChange={(e) => update("name", e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Slug" required hint="lower-kebab-case, ej: mentoring-elite">
          <input
            value={state.slug}
            onChange={(e) => update("slug", e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Precio base USD" required>
          <input
            type="number"
            step="0.01"
            min="0"
            value={state.basePriceUsd}
            onChange={(e) => update("basePriceUsd", e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Límite de venta">
          <select
            value={state.saleLimit}
            onChange={(e) => update("saleLimit", e.target.value as SaleLimit)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ONE_PER_STUDENT">Uno por estudiante</option>
            <option value="UNLIMITED">Ilimitado</option>
          </select>
        </Field>
        <Field label="Descripción">
          <textarea
            value={state.description}
            onChange={(e) => update("description", e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
        </Field>
        <div />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Toggle
          label="Permite cuotas"
          checked={state.allowsInstallments}
          onChange={(v) => update("allowsInstallments", v)}
        />
        <Toggle
          label="Requiere pago inicial"
          checked={state.requiresInitialPayment}
          onChange={(v) => update("requiresInitialPayment", v)}
        />
        <Toggle
          label="Genera comisión"
          checked={state.generatesCommission}
          onChange={(v) => update("generatesCommission", v)}
        />
        <Toggle
          label="Producto principal (main)"
          checked={state.isMainProduct}
          onChange={(v) => update("isMainProduct", v)}
        />
        <Toggle
          label="Activo"
          checked={state.isActive}
          onChange={(v) => update("isActive", v)}
        />
      </div>

      {state.generatesCommission && (
        <Field label="Comisión % por defecto">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={state.defaultCommissionPercent}
            onChange={(e) => update("defaultCommissionPercent", e.target.value)}
            className="mt-1 w-full max-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
      )}

      <fieldset className="rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          Accesos LearnWorlds
        </legend>
        <p className="mb-2 text-xs text-slate-500">
          Define los recursos LW que el producto otorga. Editando producto, esta
          lista reemplaza la existente al guardar.
        </p>
        {state.learnWorldsAccessConfigs.length === 0 ? (
          <p className="text-sm text-slate-500">Sin accesos configurados.</p>
        ) : (
          <div className="space-y-3">
            {state.learnWorldsAccessConfigs.map((cfg, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-2">
                  <Field label="Tipo" required>
                    <select
                      value={cfg.lwProductType}
                      onChange={(e) =>
                        updateConfig(idx, "lwProductType", e.target.value as LwType)
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="COURSE">COURSE</option>
                      <option value="BUNDLE">BUNDLE</option>
                      <option value="SUBSCRIPTION">SUBSCRIPTION</option>
                    </select>
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="External ID" required>
                    <input
                      value={cfg.lwExternalId}
                      onChange={(e) => updateConfig(idx, "lwExternalId", e.target.value)}
                      required
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Nombre visible">
                    <input
                      value={cfg.lwDisplayName}
                      onChange={(e) => updateConfig(idx, "lwDisplayName", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Descripción">
                    <input
                      value={cfg.description}
                      onChange={(e) => updateConfig(idx, "description", e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </Field>
                </div>
                <div className="flex items-end justify-between gap-2 sm:col-span-1">
                  <label className="flex items-center gap-1 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={cfg.isActive}
                      onChange={(e) => updateConfig(idx, "isActive", e.target.checked)}
                    />
                    Activo
                  </label>
                </div>
                <div className="sm:col-span-12">
                  <button
                    type="button"
                    onClick={() => removeConfigRow(idx)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Eliminar fila
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addConfigRow}
          className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          + Agregar acceso LW
        </button>
      </fieldset>

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
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}

// ─── Cuentas receptoras ────────────────────────────────────────────────────

function CuentasSection({
  paymentAccounts,
  canWrite,
  onReload,
  onSuccess,
}: {
  paymentAccounts: PaymentAccount[];
  canWrite: boolean;
  onReload: () => Promise<void> | void;
  onSuccess: (message: string) => void;
}) {
  const [editing, setEditing] = useState<PaymentAccount | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function toggleActive(account: PaymentAccount) {
    setBusyId(account.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/operaciones/payment-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setRowError(json.error ?? "No se pudo actualizar la cuenta");
        return;
      }
      onSuccess(
        `Cuenta ${account.displayName} ${!account.isActive ? "activada" : "desactivada"}`,
      );
      await onReload();
    } catch {
      setRowError("Error de red al actualizar la cuenta");
    } finally {
      setBusyId(null);
    }
  }

  if (editing) {
    return (
      <PaymentAccountForm
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={async (msg) => {
          onSuccess(msg);
          setEditing(null);
          await onReload();
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Cuentas receptoras
          </h2>
          <p className="text-xs text-slate-500">
            Son las cuentas donde se acreditan los pagos de los estudiantes
            (banco, Stripe, Wise, etc.). Aparecen como opciones al cobrar el
            pago inicial y futuras cuotas.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + Nueva cuenta
          </button>
        )}
      </div>

      {rowError && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {rowError}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <Th>Nombre visible</Th>
              <Th>Titular</Th>
              <Th>Proveedor</Th>
              <Th>Moneda</Th>
              <Th>Estado</Th>
              <Th>Notas</Th>
              {canWrite && <Th>Acciones</Th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {paymentAccounts.length === 0 ? (
              <tr>
                <td
                  colSpan={canWrite ? 7 : 6}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No hay cuentas receptoras cargadas.
                </td>
              </tr>
            ) : (
              paymentAccounts.map((a) => (
                <tr key={a.id} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-2 text-sm font-medium text-slate-900">
                    {a.displayName}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {a.ownerName ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {a.providerName ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">{a.currency}</td>
                  <td className="px-4 py-2 text-sm">
                    <Badge tone={a.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                      {a.isActive ? "Activa" : "Inactiva"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">
                    {a.notes ? (
                      <span className="block max-w-[280px] truncate" title={a.notes}>
                        {a.notes}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canWrite && (
                    <td className="whitespace-nowrap px-4 py-2 text-sm">
                      <button
                        type="button"
                        onClick={() => setEditing(a)}
                        className="mr-2 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => void toggleActive(a)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-50"
                      >
                        {busyId === a.id
                          ? "..."
                          : a.isActive
                            ? "Desactivar"
                            : "Activar"}
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PaymentAccountFormState {
  displayName: string;
  ownerName: string;
  providerName: string;
  currency: string;
  isActive: boolean;
  notes: string;
}

function buildPaymentAccountFormState(
  initial: PaymentAccount | null,
): PaymentAccountFormState {
  if (!initial) {
    return {
      displayName: "",
      ownerName: "",
      providerName: "",
      currency: "USD",
      isActive: true,
      notes: "",
    };
  }
  return {
    displayName: initial.displayName,
    ownerName: initial.ownerName ?? "",
    providerName: initial.providerName ?? "",
    currency: initial.currency,
    isActive: initial.isActive,
    notes: initial.notes ?? "",
  };
}

function PaymentAccountForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: PaymentAccount | null;
  onCancel: () => void;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const [state, setState] = useState<PaymentAccountFormState>(() =>
    buildPaymentAccountFormState(initial),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = initial !== null;

  function update<K extends keyof PaymentAccountFormState>(
    key: K,
    value: PaymentAccountFormState[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!state.displayName.trim()) return "Nombre visible requerido";
    if (!/^[A-Za-z]{3}$/.test(state.currency.trim())) {
      return "Moneda debe ser código ISO de 3 letras (ej: USD)";
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
        displayName: state.displayName.trim(),
        ownerName: state.ownerName.trim() ? state.ownerName.trim() : null,
        providerName: state.providerName.trim()
          ? state.providerName.trim()
          : null,
        currency: state.currency.trim().toUpperCase(),
        isActive: state.isActive,
        notes: state.notes.trim() ? state.notes.trim() : null,
      };

      const url = isEdit
        ? `/api/operaciones/payment-accounts/${initial!.id}`
        : `/api/operaciones/payment-accounts`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Error al guardar cuenta");
        setSubmitting(false);
        return;
      }
      await onSaved(isEdit ? "Cuenta actualizada" : "Cuenta creada");
    } catch {
      setError("Error de red al guardar cuenta");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">
          {isEdit
            ? `Editar cuenta: ${initial!.displayName}`
            : "Nueva cuenta receptora"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancelar
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre visible" required>
          <input
            value={state.displayName}
            onChange={(e) => update("displayName", e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Titular">
          <input
            value={state.ownerName}
            onChange={(e) => update("ownerName", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Proveedor" hint="Banco, Stripe, Wise, etc.">
          <input
            value={state.providerName}
            onChange={(e) => update("providerName", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Moneda" required hint="Código ISO de 3 letras">
          <input
            value={state.currency}
            onChange={(e) => update("currency", e.target.value)}
            required
            maxLength={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
          />
        </Field>
        <Field label="Notas">
          <textarea
            value={state.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
        </Field>
        <div className="flex items-end">
          <Toggle
            label="Activa"
            checked={state.isActive}
            onChange={(v) => update("isActive", v)}
          />
        </div>
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
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {children}
    </span>
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
