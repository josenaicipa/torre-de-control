// Acceso a la configuración global de Operaciones (tabla OperacionesSetting).
// Hoy guarda la firma manuscrita fija de Jose Naicipa que se estampa en todos
// los contratos aprobados.
import { prisma } from "./prisma";
import { parseManualClauses } from "./operaciones-contract";
import type { ManualClause } from "./operaciones-contract-template";

// Key de la firma fija de Jose Naicipa (data URL PNG/JPEG).
export const JOSE_SIGNATURE_SETTING_KEY = "jose_signature_image";

// Key de las cláusulas manuales configurables (JSON ManualClause[]).
export const MANUAL_CLAUSES_SETTING_KEY = "manual_contract_clauses";

export interface JoseSignatureSetting {
  dataUrl: string;
  updatedAt: Date;
  updatedById: string | null;
  updatedByName: string | null;
}

// Devuelve la firma fija de Jose o null si aún no se ha configurado.
export async function getJoseSignature(): Promise<JoseSignatureSetting | null> {
  const setting = await prisma.operacionesSetting.findUnique({
    where: { key: JOSE_SIGNATURE_SETTING_KEY },
    select: {
      value: true,
      updatedAt: true,
      updatedById: true,
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!setting || !setting.value) return null;
  return {
    dataUrl: setting.value,
    updatedAt: setting.updatedAt,
    updatedById: setting.updatedById,
    updatedByName: setting.updatedBy?.name ?? setting.updatedBy?.email ?? null,
  };
}

// Guarda (upsert) la firma fija de Jose Naicipa.
export async function setJoseSignature(
  dataUrl: string,
  updatedById: string,
): Promise<void> {
  await prisma.operacionesSetting.upsert({
    where: { key: JOSE_SIGNATURE_SETTING_KEY },
    create: { key: JOSE_SIGNATURE_SETTING_KEY, value: dataUrl, updatedById },
    update: { value: dataUrl, updatedById },
  });
}

export interface ManualContractClausesSetting {
  clauses: ManualClause[];
  updatedAt: Date;
  updatedById: string | null;
  updatedByName: string | null;
}

// Devuelve las cláusulas manuales configuradas o null si aún no se han
// guardado. El valor en BD es JSON; si está corrupto se trata como ausente
// (mejor mostrar el contrato sin cláusulas extra que romper el flujo).
export async function getManualContractClauses(): Promise<ManualContractClausesSetting | null> {
  const setting = await prisma.operacionesSetting.findUnique({
    where: { key: MANUAL_CLAUSES_SETTING_KEY },
    select: {
      value: true,
      updatedAt: true,
      updatedById: true,
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!setting || !setting.value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(setting.value);
  } catch {
    return null;
  }
  return {
    clauses: parseManualClauses(parsed),
    updatedAt: setting.updatedAt,
    updatedById: setting.updatedById,
    updatedByName: setting.updatedBy?.name ?? setting.updatedBy?.email ?? null,
  };
}

// Guarda (upsert) las cláusulas manuales como JSON. Se normalizan antes de
// persistir para que la BD nunca contenga entradas inválidas y devuelve la
// lista normalizada que quedó efectivamente guardada.
export async function setManualContractClauses(
  clauses: ManualClause[],
  updatedById: string,
): Promise<ManualClause[]> {
  const normalized = parseManualClauses(clauses);
  const value = JSON.stringify(normalized);
  await prisma.operacionesSetting.upsert({
    where: { key: MANUAL_CLAUSES_SETTING_KEY },
    create: { key: MANUAL_CLAUSES_SETTING_KEY, value, updatedById },
    update: { value, updatedById },
  });
  return normalized;
}
