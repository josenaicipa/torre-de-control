/**
 * Server-side LearnWorlds provisioning for a StudentProductEnrollment.
 *
 * Torre de Control is the source of truth: access is only granted here, after a
 * contract has been approved. This module takes a single enrollment, reads the
 * product's active LearnWorlds access configs and enrols the student in each one
 * via the LearnWorlds Admin API. It never throws for expected failures (missing
 * env, API errors): it persists the outcome on the enrollment and returns a
 * structured result so the caller can render it.
 *
 * Secrets (LW_ACCESS_TOKEN, LW_CLIENT_ID) are only read from the environment and
 * sent as request headers — never logged or returned.
 */
import { prisma } from "./prisma";

export interface EnrollLearnWorldsResult {
  ok: boolean;
  accessStatus: "ACTIVE" | "SYNC_ERROR";
  syncStatus: "ok" | "error";
  error: string | null;
  /** Number of active LW access configs the product exposes. */
  configCount: number;
}

interface ActiveConfig {
  lwProductType: "COURSE" | "BUNDLE" | "SUBSCRIPTION";
  lwExternalId: string;
  lwDisplayName: string | null;
}

/**
 * Provisions LearnWorlds access for the given enrollment and persists the
 * result. Resolves (never rejects) with the outcome whenever it can.
 */
export async function enrollEnrollmentInLearnWorlds(
  enrollmentId: string,
): Promise<EnrollLearnWorldsResult> {
  const enrollment = await prisma.studentProductEnrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      student: { select: { email: true, fullName: true } },
      product: {
        select: {
          learnWorldsAccessConfigs: {
            where: { isActive: true },
            select: {
              lwProductType: true,
              lwExternalId: true,
              lwDisplayName: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!enrollment) {
    throw new Error("Inscripción no encontrada");
  }

  const configs: ActiveConfig[] = enrollment.product.learnWorldsAccessConfigs;

  // No LearnWorlds provisioning needed: the product grants access on its own
  // (e.g. mentorship without a course). Mark access ACTIVE directly.
  if (configs.length === 0) {
    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        accessStatus: "ACTIVE",
        accessGrantedAt: new Date(),
        learnWorldsSyncStatus: "ok",
        learnWorldsSyncError: null,
      },
    });
    return {
      ok: true,
      accessStatus: "ACTIVE",
      syncStatus: "ok",
      error: null,
      configCount: 0,
    };
  }

  const baseUrl = process.env.LW_BASE_URL;
  const token = process.env.LW_ACCESS_TOKEN;
  const clientId = process.env.LW_CLIENT_ID;

  if (!baseUrl || !token || !clientId) {
    const error =
      "Faltan credenciales de LearnWorlds en el servidor (LW_BASE_URL, LW_ACCESS_TOKEN o LW_CLIENT_ID). No se pudo liberar el acceso.";
    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        accessStatus: "SYNC_ERROR",
        learnWorldsSyncStatus: "error",
        learnWorldsSyncError: error,
      },
    });
    return {
      ok: false,
      accessStatus: "SYNC_ERROR",
      syncStatus: "error",
      error,
      configCount: configs.length,
    };
  }

  const email = enrollment.student.email;
  const failures: string[] = [];

  for (const config of configs) {
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/users/${email}/enrollment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Lw-Client": clientId,
          },
          body: JSON.stringify({
            productId: config.lwExternalId,
            productType: config.lwProductType.toLowerCase(),
            price: 0,
            send_enrollment_email: true,
            justification: "Acceso liberado desde Torre de Control",
          }),
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const label = config.lwDisplayName ?? config.lwExternalId;
        failures.push(
          `${label}: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
        );
      }
    } catch (err) {
      const label = config.lwDisplayName ?? config.lwExternalId;
      const message = err instanceof Error ? err.message : "error desconocido";
      failures.push(`${label}: ${message}`);
    }
  }

  if (failures.length > 0) {
    const error = `No se pudo liberar el acceso en LearnWorlds: ${failures.join(" · ")}`;
    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        accessStatus: "SYNC_ERROR",
        learnWorldsSyncStatus: "error",
        learnWorldsSyncError: error,
      },
    });
    return {
      ok: false,
      accessStatus: "SYNC_ERROR",
      syncStatus: "error",
      error,
      configCount: configs.length,
    };
  }

  await prisma.studentProductEnrollment.update({
    where: { id: enrollment.id },
    data: {
      accessStatus: "ACTIVE",
      accessGrantedAt: new Date(),
      learnWorldsSyncStatus: "ok",
      learnWorldsSyncError: null,
    },
  });
  return {
    ok: true,
    accessStatus: "ACTIVE",
    syncStatus: "ok",
    error: null,
    configCount: configs.length,
  };
}
