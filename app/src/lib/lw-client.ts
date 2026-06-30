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
 * Upgrades: an upgrade is a NEW enrollment linked to the previous one via
 * `upgradeFromEnrollment`. On approval/retry we enrol the new level's configs
 * AND revoke the previous level's configs that are NOT also part of the new
 * level (shared access — e.g. an advanced-classes bundle present in both levels
 * — is kept). New access is only granted before old access is revoked, and the
 * old access is revoked only if enrolling the new level fully succeeded, so a
 * student is never left without access.
 *
 * Secrets (LW_ACCESS_TOKEN, LW_CLIENT_ID) are only read from the environment and
 * sent as request headers — never logged or returned.
 */
import { prisma } from "./prisma";
import { syncGhlLearnWorldsAccess } from "./ghl-client";

export interface EnrollLearnWorldsResult {
  ok: boolean;
  accessStatus: "ACTIVE" | "SYNC_ERROR";
  syncStatus: "ok" | "error";
  error: string | null;
  /** Number of active LW access configs the new product exposes. */
  configCount: number;
  /** Configs of the new level that were enrolled successfully. */
  enrolledCount: number;
  /** Previous-level configs (not shared with the new level) revoked successfully. */
  revokedCount: number;
  /**
   * Message describing a failed revocation of the previous level, when the new
   * access was granted but the old one could not be removed. null otherwise.
   */
  revokeError: string | null;
  /** True when a brand-new LearnWorlds user had to be created for this access. */
  userCreated?: boolean;
  /**
   * Non-fatal GHL mirror warning: the LearnWorlds access succeeded but mirroring
   * the password/tags into GHL did not. null/undefined otherwise. Never turns
   * the LW result into an error.
   */
  ghlWarning?: string | null;
}

interface ActiveConfig {
  lwProductType: "COURSE" | "BUNDLE" | "SUBSCRIPTION";
  lwExternalId: string;
  lwDisplayName: string | null;
}

interface LearnWorldsCredentials {
  baseUrl: string;
  token: string;
  clientId: string;
}

/** Two configs grant the same access when they share LW type + external id. */
function configKey(config: { lwProductType: string; lwExternalId: string }): string {
  return `${config.lwProductType}:${config.lwExternalId}`;
}

function configLabel(config: ActiveConfig): string {
  return config.lwDisplayName ?? config.lwExternalId;
}

/** Enrols a single config. Returns an error label on failure, or null on success. */
async function enrollConfig(
  creds: LearnWorldsCredentials,
  email: string,
  config: ActiveConfig,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${creds.baseUrl.replace(/\/$/, "")}/users/${email}/enrollment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.token}`,
          "Lw-Client": creds.clientId,
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
      return `${configLabel(config)}: HTTP ${response.status}${
        detail ? ` — ${detail.slice(0, 200)}` : ""
      }`;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return `${configLabel(config)}: ${message}`;
  }
}

/** Revokes a single config. Returns an error label on failure, or null on success. */
async function revokeConfig(
  creds: LearnWorldsCredentials,
  email: string,
  config: ActiveConfig,
): Promise<string | null> {
  try {
    const response = await fetch(
      `${creds.baseUrl.replace(/\/$/, "")}/users/${email}/enrollment`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${creds.token}`,
          "Lw-Client": creds.clientId,
        },
        body: JSON.stringify({
          productId: config.lwExternalId,
          productType: config.lwProductType.toLowerCase(),
          justification: "Acceso del nivel anterior revocado por upgrade desde Torre de Control",
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return `${configLabel(config)}: HTTP ${response.status}${
        detail ? ` — ${detail.slice(0, 200)}` : ""
      }`;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return `${configLabel(config)}: ${message}`;
  }
}

/** Splits a full name into a first token (capitalized) and the remaining last name. */
function splitName(fullName: string | null | undefined): {
  firstNameCapitalized: string;
  firstNameRaw: string;
  lastName: string;
} {
  const tokens = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstNameRaw = tokens[0] ?? "";
  const firstNameCapitalized = firstNameRaw
    ? firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1).toLowerCase()
    : "";
  return {
    firstNameCapitalized,
    firstNameRaw,
    lastName: tokens.slice(1).join(" "),
  };
}

type PasswordResult =
  | { ok: true; password: string }
  | { ok: false; error: string };

/**
 * Deterministic LearnWorlds password used ONLY when creating a brand-new user:
 * first name (first letter uppercase) + last 4 digits of the phone + "*".
 * E.g. "christian ..." + phone ending 2863 -> "Christian2863*". Never invents a
 * password: if there is no name or no 4 phone digits it returns an error so the
 * caller can surface it to Torre instead of creating an unusable account.
 */
function deriveLearnWorldsPassword(
  fullName: string | null | undefined,
  phone: string | null | undefined,
): PasswordResult {
  const { firstNameCapitalized } = splitName(fullName);
  if (!firstNameCapitalized) {
    return {
      ok: false,
      error:
        "No se puede crear el usuario en LearnWorlds automáticamente: el estudiante no tiene un nombre para generar la contraseña.",
    };
  }
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) {
    return {
      ok: false,
      error:
        "No se puede crear el usuario en LearnWorlds automáticamente: el estudiante no tiene un teléfono con al menos 4 dígitos para generar la contraseña.",
    };
  }
  return { ok: true, password: `${firstNameCapitalized}${digits.slice(-4)}*` };
}

type EnsureUserResult =
  | { status: "exists" }
  | { status: "created"; password: string }
  | { status: "error"; error: string };

/**
 * Ensures the student exists in LearnWorlds before enrolment. GETs the user;
 * if it does not exist (404) it creates them with a deterministic password and
 * reports it back so the caller can mirror it to GHL. An existing user is left
 * untouched (its password is never reset). Any other failure is surfaced as an
 * error so the caller can mark the enrolment as a sync error.
 */
async function ensureLearnWorldsUser(
  creds: LearnWorldsCredentials,
  student: { email: string; fullName: string | null; phone: string | null },
): Promise<EnsureUserResult> {
  const base = creds.baseUrl.replace(/\/$/, "");
  const authHeaders = {
    Authorization: `Bearer ${creds.token}`,
    "Lw-Client": creds.clientId,
  };

  try {
    const lookup = await fetch(`${base}/users/${student.email}`, {
      method: "GET",
      headers: authHeaders,
    });
    if (lookup.ok) {
      return { status: "exists" };
    }
    if (lookup.status !== 404) {
      const detail = await lookup.text().catch(() => "");
      return {
        status: "error",
        error: `No se pudo verificar el usuario en LearnWorlds: HTTP ${lookup.status}${
          detail ? ` — ${detail.slice(0, 200)}` : ""
        }`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return {
      status: "error",
      error: `No se pudo verificar el usuario en LearnWorlds: ${message}`,
    };
  }

  const passwordResult = deriveLearnWorldsPassword(student.fullName, student.phone);
  if (!passwordResult.ok) {
    return { status: "error", error: passwordResult.error };
  }

  const { firstNameRaw, lastName } = splitName(student.fullName);
  try {
    const created = await fetch(`${base}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        email: student.email,
        username: student.fullName ?? student.email,
        fullName: student.fullName ?? student.email,
        firstName: firstNameRaw,
        lastName,
        password: passwordResult.password,
        ...(student.phone
          ? { phone: student.phone, custom_fields: { cf_whatsapp: student.phone } }
          : {}),
      }),
    });
    if (!created.ok) {
      const detail = await created.text().catch(() => "");
      return {
        status: "error",
        error: `No se pudo crear el usuario en LearnWorlds: HTTP ${created.status}${
          detail ? ` — ${detail.slice(0, 200)}` : ""
        }`,
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "error desconocido";
    return {
      status: "error",
      error: `No se pudo crear el usuario en LearnWorlds: ${message}`,
    };
  }

  return { status: "created", password: passwordResult.password };
}

/**
 * Closes the previous-level enrollment after a successful upgrade: its LW access
 * was revoked (or shared and superseded by the new level), so the row is marked
 * REVOKED/COMPLETED so Torre reflects that the old level no longer grants access.
 * Only called when the new access is ACTIVE and no revocation failed.
 */
async function closeUpgradeSourceEnrollment(sourceEnrollmentId: string): Promise<void> {
  await prisma.studentProductEnrollment.update({
    where: { id: sourceEnrollmentId },
    data: {
      status: "COMPLETED",
      accessStatus: "REVOKED",
      learnWorldsSyncStatus: "ok",
      learnWorldsSyncError: null,
    },
  });
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
      upgradeFromEnrollmentId: true,
      startedAt: true,
      endsAt: true,
      student: {
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          status: true,
          durationAssumed: true,
        },
      },
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
      // Upgrade source: the previous-level enrollment whose access must be
      // revoked (except shared configs). All of its configs are considered for
      // revocation — including any later deactivated — so a prior level never
      // strands access. Active filtering only applies to what we GRANT.
      upgradeFromEnrollment: {
        select: {
          product: {
            select: {
              learnWorldsAccessConfigs: {
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
      },
    },
  });

  if (!enrollment) {
    throw new Error("Inscripción no encontrada");
  }

  const configs: ActiveConfig[] = enrollment.product.learnWorldsAccessConfigs;
  const previousConfigs: ActiveConfig[] =
    enrollment.upgradeFromEnrollment?.product.learnWorldsAccessConfigs ?? [];

  // Previous-level configs that the new level does NOT re-grant. Shared access
  // (same LW type + external id) is kept so we don't yank an advanced-classes
  // bundle the student still owns at the new level.
  const currentKeys = new Set(configs.map(configKey));
  const configsToRevoke = previousConfigs.filter(
    (config) => !currentKeys.has(configKey(config)),
  );

  // Nothing to grant and nothing to revoke: the product grants access on its
  // own (e.g. mentorship without a course). Mark access ACTIVE directly.
  if (configs.length === 0 && configsToRevoke.length === 0) {
    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        accessStatus: "ACTIVE",
        accessGrantedAt: new Date(),
        learnWorldsSyncStatus: "ok",
        learnWorldsSyncError: null,
      },
    });
    // New access is ACTIVE; close the previous level so Torre stops showing it
    // as granting access.
    if (enrollment.upgradeFromEnrollmentId) {
      await closeUpgradeSourceEnrollment(enrollment.upgradeFromEnrollmentId);
    }
    return {
      ok: true,
      accessStatus: "ACTIVE",
      syncStatus: "ok",
      error: null,
      configCount: 0,
      enrolledCount: 0,
      revokedCount: 0,
      revokeError: null,
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
      enrolledCount: 0,
      revokedCount: 0,
      revokeError: null,
    };
  }

  const creds: LearnWorldsCredentials = { baseUrl, token, clientId };
  const email = enrollment.student.email;

  // Step 0 — make sure the student exists in LearnWorlds before enrolling.
  // Only relevant when there is something to grant; a pure revocation (upgrade
  // with no new configs) targets a user that already exists. If the user is
  // missing we create it with a deterministic password and remember it so we
  // can mirror it to GHL after access is live.
  let userCreated = false;
  let createdPassword: string | null = null;
  if (configs.length > 0) {
    const ensured = await ensureLearnWorldsUser(creds, {
      email,
      fullName: enrollment.student.fullName,
      phone: enrollment.student.phone,
    });
    if (ensured.status === "error") {
      await prisma.studentProductEnrollment.update({
        where: { id: enrollment.id },
        data: {
          accessStatus: "SYNC_ERROR",
          learnWorldsSyncStatus: "error",
          learnWorldsSyncError: ensured.error,
        },
      });
      return {
        ok: false,
        accessStatus: "SYNC_ERROR",
        syncStatus: "error",
        error: ensured.error,
        configCount: configs.length,
        enrolledCount: 0,
        revokedCount: 0,
        revokeError: null,
        userCreated: false,
      };
    }
    if (ensured.status === "created") {
      userCreated = true;
      createdPassword = ensured.password;
    }
  }

  // Step 1 — grant the new level first, so we never revoke old access before
  // the replacement exists.
  const enrollErrors: string[] = [];
  for (const config of configs) {
    const error = await enrollConfig(creds, email, config);
    if (error) enrollErrors.push(error);
  }
  const enrolledCount = configs.length - enrollErrors.length;

  // If granting the new level failed, do NOT revoke the previous level: leaving
  // the old access in place is safer than stranding the student.
  if (enrollErrors.length > 0) {
    const error = `No se pudo liberar el acceso en LearnWorlds: ${enrollErrors.join(" · ")}`;
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
      enrolledCount,
      revokedCount: 0,
      revokeError: null,
    };
  }

  // Step 2 — revoke previous-level access not shared with the new level.
  const revokeErrors: string[] = [];
  for (const config of configsToRevoke) {
    const error = await revokeConfig(creds, email, config);
    if (error) revokeErrors.push(error);
  }
  const revokedCount = configsToRevoke.length - revokeErrors.length;

  // New access is live but the old level could not be fully removed. The
  // student is NOT locked out, but they keep duplicate access until this is
  // resolved, so surface it as a sync error with an actionable message.
  if (revokeErrors.length > 0) {
    const revokeError = `Se liberó el nuevo acceso en LearnWorlds, pero no se pudo revocar el acceso del nivel anterior (el estudiante puede tener acceso duplicado): ${revokeErrors.join(" · ")}`;
    await prisma.studentProductEnrollment.update({
      where: { id: enrollment.id },
      data: {
        accessStatus: "SYNC_ERROR",
        learnWorldsSyncStatus: "error",
        learnWorldsSyncError: revokeError,
      },
    });
    return {
      ok: false,
      accessStatus: "SYNC_ERROR",
      syncStatus: "error",
      error: revokeError,
      configCount: configs.length,
      enrolledCount,
      revokedCount,
      revokeError,
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
  // New access is ACTIVE and the previous level was fully revoked (or shared and
  // superseded): close the source enrollment so Torre reflects the old access as
  // revoked. Skipped above whenever a revocation failed.
  if (enrollment.upgradeFromEnrollmentId) {
    await closeUpgradeSourceEnrollment(enrollment.upgradeFromEnrollmentId);
  }

  // Best-effort GHL mirror: only when we just created the LW user, so the GHL
  // workflow/email can deliver the access credentials. A GHL failure must NEVER
  // turn the LearnWorlds access into an error — it is surfaced as a non-fatal
  // warning only.
  let ghlWarning: string | null = null;
  if (userCreated && createdPassword) {
    const { firstNameRaw, lastName } = splitName(enrollment.student.fullName);
    const ghlResult = await syncGhlLearnWorldsAccess({
      email,
      firstName: firstNameRaw || null,
      lastName: lastName || null,
      phone: enrollment.student.phone,
      password: createdPassword,
    });
    if (!ghlResult.ok) ghlWarning = ghlResult.warning;
  }

  return {
    ok: true,
    accessStatus: "ACTIVE",
    syncStatus: "ok",
    error: null,
    configCount: configs.length,
    enrolledCount,
    revokedCount,
    revokeError: null,
    userCreated,
    ghlWarning,
  };
}
