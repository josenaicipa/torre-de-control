// Acceso a la configuración global de Operaciones (tabla OperacionesSetting).
// Hoy guarda la firma manuscrita fija de Jose Naicipa que se estampa en todos
// los contratos aprobados.
import { prisma } from "./prisma";

// Key de la firma fija de Jose Naicipa (data URL PNG/JPEG).
export const JOSE_SIGNATURE_SETTING_KEY = "jose_signature_image";

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
