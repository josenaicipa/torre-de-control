import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DriveConfigError,
  isDriveConfigured,
  uploadSignedContractPdfToDrive,
} from "./drive-client";

const KEYS = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_DRIVE_CLIENT_EMAIL",
  "GOOGLE_DRIVE_PRIVATE_KEY",
] as const;

describe("drive-client without configuration", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("reports not configured", () => {
    expect(isDriveConfigured()).toBe(false);
  });

  it("rejects upload with a clear DriveConfigError, never a network call", async () => {
    await expect(
      uploadSignedContractPdfToDrive("folder-1", "Contrato.pdf", "AAAA"),
    ).rejects.toBeInstanceOf(DriveConfigError);
  });

  it("rejects when the folder id is missing before reading credentials", async () => {
    await expect(
      uploadSignedContractPdfToDrive("", "Contrato.pdf", "AAAA"),
    ).rejects.toBeInstanceOf(DriveConfigError);
  });
});
