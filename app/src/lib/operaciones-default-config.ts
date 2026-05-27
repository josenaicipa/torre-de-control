export const defaultOperacionesProducts = [
  {
    name: "Mentoría principal",
    slug: "mentoria-principal",
    description: "Producto principal de mentoría. Accesos LearnWorlds configurables: Nivel 5 y Clases avanzadas.",
    basePriceUsd: 0,
    currency: "USD",
    saleLimit: "ONE_PER_STUDENT" as const,
    allowsInstallments: true,
    requiresInitialPayment: true,
    generatesCommission: true,
    defaultCommissionPercent: 0,
    isMainProduct: true,
    isActive: true,
  },
  {
    name: "Marca Propia",
    slug: "marca-propia",
    description: "Producto adicional sin comisión. Valor base 1000 USD, máximo una venta activa por estudiante.",
    basePriceUsd: 1000,
    currency: "USD",
    saleLimit: "ONE_PER_STUDENT" as const,
    allowsInstallments: true,
    requiresInitialPayment: true,
    generatesCommission: false,
    defaultCommissionPercent: 0,
    isMainProduct: false,
    isActive: true,
  },
] as const;

export const defaultOperacionesTags = [
  {
    name: "Separó cupo",
    slug: "separo-cupo",
    description: "Estudiante con separación/abono inicial registrado.",
    color: "#f59e0b",
    isAutomatic: true,
    allowAutomaticAssignment: true,
    isActive: true,
  },
  {
    name: "Sin acceso",
    slug: "sin-acceso",
    description: "Estudiante sin acceso activo en LearnWorlds.",
    color: "#ef4444",
    isAutomatic: true,
    allowAutomaticAssignment: true,
    isActive: true,
  },
  {
    name: "No inició",
    slug: "no-inicio",
    description: "Estudiante activo o separado cuya mentoría aún no inicia.",
    color: "#6366f1",
    isAutomatic: true,
    allowAutomaticAssignment: true,
    isActive: true,
  },
] as const;

export const defaultLearnWorldsAccessPlaceholders = [
  {
    productSlug: "mentoria-principal",
    accessType: "COURSE" as const,
    lwDisplayName: "Nivel 5",
    lwExternalId: null,
    isActive: true,
  },
  {
    productSlug: "mentoria-principal",
    accessType: "COURSE" as const,
    lwDisplayName: "Clases avanzadas",
    lwExternalId: null,
    isActive: true,
  },
  {
    productSlug: "marca-propia",
    accessType: "COURSE" as const,
    lwDisplayName: "Marca Propia",
    lwExternalId: null,
    isActive: true,
  },
] as const;
