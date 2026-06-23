// Catálogo inicial de Operaciones (seed editable). Define los programas
// principales configurables por nivel (N3/N4/N5), sus accesos LearnWorlds y los
// tags automáticos. Cualquier instalación arranca con esto, pero el catálogo es
// editable desde la UI: precios, nombres y slugs LW cambian sin tocar código y
// las ventas guardan snapshot histórico, así que editar aquí no reescribe
// contratos pasados.
//
// Los tres programas principales (Nivel 3/4/5) reemplazan a la antigua
// "Mentoría principal" fija. El producto legacy `mentoria-principal` se conserva
// (isActive false, programLevel 4) para que estudiantes/enrollments existentes
// sigan resolviendo su producto sin backfill destructivo; la interpretación
// histórica es Nivel 4.

export const defaultOperacionesProducts = [
  {
    name: "Nivel 3 · Dropshipping Total Guiado",
    slug: "nivel-3-dropshipping-total-guiado",
    description:
      "Programa principal Nivel 3. Accesos LearnWorlds: nivel3-dropshipping-total-guiado + clases-avanzadas.",
    basePriceUsd: 750,
    currency: "USD",
    saleLimit: "ONE_PER_STUDENT" as const,
    allowsInstallments: true,
    requiresInitialPayment: true,
    generatesCommission: true,
    defaultCommissionPercent: 0,
    isMainProduct: true,
    isActive: true,
    programLevel: 3,
    displayOrder: 1,
    contractDisplayName: "Dropshipping Total Guiado",
    includesAdvancedClasses: true,
  },
  {
    name: "Nivel 4 · Mentoría VIP 1:1 Dropshipping",
    slug: "nivel-4-mentoria-vip-1-1-dropshipping",
    description:
      "Programa principal Nivel 4. Accesos LearnWorlds: nivel5 + clases-avanzadas.",
    basePriceUsd: 3000,
    currency: "USD",
    saleLimit: "ONE_PER_STUDENT" as const,
    allowsInstallments: true,
    requiresInitialPayment: true,
    generatesCommission: true,
    defaultCommissionPercent: 0,
    isMainProduct: true,
    isActive: true,
    programLevel: 4,
    displayOrder: 2,
    contractDisplayName: "Mentoría VIP 1:1 Dropshipping",
    includesAdvancedClasses: true,
  },
  {
    name: "Nivel 5 · Mentoría FUNDADORES 1:1 Dropshipping",
    slug: "nivel-5-mentoria-fundadores-1-1-dropshipping",
    description:
      "Programa principal Nivel 5. Accesos LearnWorlds: nivel5-fundadores-1-1 + clases-avanzadas.",
    basePriceUsd: 5000,
    currency: "USD",
    saleLimit: "ONE_PER_STUDENT" as const,
    allowsInstallments: true,
    requiresInitialPayment: true,
    generatesCommission: true,
    defaultCommissionPercent: 0,
    isMainProduct: true,
    isActive: true,
    programLevel: 5,
    displayOrder: 3,
    contractDisplayName: "Mentoría FUNDADORES 1:1 Dropshipping",
    includesAdvancedClasses: true,
  },
  {
    name: "Mentoría principal (legacy)",
    slug: "mentoria-principal",
    description:
      "Producto principal histórico, interpretado como Nivel 4. Conservado inactivo para no romper inscripciones previas; las nuevas ventas usan los programas Nivel 3/4/5.",
    basePriceUsd: 0,
    currency: "USD",
    saleLimit: "ONE_PER_STUDENT" as const,
    allowsInstallments: true,
    requiresInitialPayment: true,
    generatesCommission: true,
    defaultCommissionPercent: 0,
    isMainProduct: false,
    isActive: false,
    programLevel: 4,
    displayOrder: 99,
    contractDisplayName: null,
    includesAdvancedClasses: true,
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
    programLevel: null,
    displayOrder: 100,
    contractDisplayName: null,
    includesAdvancedClasses: false,
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

// Accesos LearnWorlds por producto. Cada programa principal concede su curso de
// nivel + `clases-avanzadas` (acceso transversal que se conserva en upgrades).
// `lwExternalId` puede ajustarse desde la UI; aquí va el slug LW recomendado.
export const defaultLearnWorldsAccessPlaceholders = [
  {
    productSlug: "nivel-3-dropshipping-total-guiado",
    accessType: "COURSE" as const,
    lwDisplayName: "Nivel 3 · Dropshipping Total Guiado",
    lwExternalId: "nivel3-dropshipping-total-guiado",
    isActive: true,
  },
  {
    productSlug: "nivel-3-dropshipping-total-guiado",
    accessType: "COURSE" as const,
    lwDisplayName: "Clases avanzadas",
    lwExternalId: "clases-avanzadas",
    isActive: true,
  },
  {
    productSlug: "nivel-4-mentoria-vip-1-1-dropshipping",
    accessType: "COURSE" as const,
    lwDisplayName: "Nivel 5",
    lwExternalId: "nivel5",
    isActive: true,
  },
  {
    productSlug: "nivel-4-mentoria-vip-1-1-dropshipping",
    accessType: "COURSE" as const,
    lwDisplayName: "Clases avanzadas",
    lwExternalId: "clases-avanzadas",
    isActive: true,
  },
  {
    productSlug: "nivel-5-mentoria-fundadores-1-1-dropshipping",
    accessType: "COURSE" as const,
    lwDisplayName: "Nivel 5 · Fundadores 1:1",
    lwExternalId: "nivel5-fundadores-1-1",
    isActive: true,
  },
  {
    productSlug: "nivel-5-mentoria-fundadores-1-1-dropshipping",
    accessType: "COURSE" as const,
    lwDisplayName: "Clases avanzadas",
    lwExternalId: "clases-avanzadas",
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
