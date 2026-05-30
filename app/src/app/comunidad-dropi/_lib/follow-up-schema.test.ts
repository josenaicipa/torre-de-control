import { describe, expect, it } from "vitest";
import {
  CONTACT_CHANNELS,
  FOLLOW_UP_OUTCOMES,
  followUpPatchSchema,
} from "./follow-up-schema";

describe("FOLLOW_UP_OUTCOMES", () => {
  it("includes every value the team needs in the drawer", () => {
    expect([...FOLLOW_UP_OUTCOMES].sort()).toEqual(
      [
        "ANSWERED",
        "INTERESTED",
        "NOT_INTERESTED",
        "NO_ANSWER",
        "NO_REPLY",
        "OTHER",
        "SCHEDULED",
      ].sort(),
    );
  });
});

describe("CONTACT_CHANNELS", () => {
  it("covers WhatsApp / llamada / email / otro", () => {
    expect([...CONTACT_CHANNELS].sort()).toEqual(
      ["CALL", "EMAIL", "OTHER", "WHATSAPP"].sort(),
    );
  });
});

describe("followUpPatchSchema", () => {
  it("accepts an empty patch — per-id PATCH only fails when nothing parses, not when nothing changes (caller decides)", () => {
    const result = followUpPatchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts every legacy field that the drawer already saved", () => {
    const result = followUpPatchSchema.safeParse({
      status: "DONE",
      priority: "P1",
      assignedToId: "user-1",
      suggestedAction: "Llamar",
      notes: "Notas largas",
      result: "Resultado libre",
      dueDate: "2026-06-01",
      contactedAt: "2026-05-30",
      nextActionAt: "2026-06-05",
    });
    expect(result.success).toBe(true);
  });

  it("accepts each outcome value", () => {
    for (const outcome of FOLLOW_UP_OUTCOMES) {
      const result = followUpPatchSchema.safeParse({ outcome });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown outcome values", () => {
    const result = followUpPatchSchema.safeParse({ outcome: "GHOSTED" });
    expect(result.success).toBe(false);
  });

  it("accepts outcome: null to clear the prior value", () => {
    const result = followUpPatchSchema.safeParse({ outcome: null });
    expect(result.success).toBe(true);
  });

  it("accepts each contactChannel value", () => {
    for (const channel of CONTACT_CHANNELS) {
      const result = followUpPatchSchema.safeParse({ contactChannel: channel });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown contactChannel values", () => {
    const result = followUpPatchSchema.safeParse({ contactChannel: "SMS" });
    expect(result.success).toBe(false);
  });

  it("accepts contactChannel: null to clear the prior value", () => {
    const result = followUpPatchSchema.safeParse({ contactChannel: null });
    expect(result.success).toBe(true);
  });

  it("accepts snoozedUntil as ISO string", () => {
    const result = followUpPatchSchema.safeParse({
      snoozedUntil: "2026-06-10T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts snoozedUntil as YYYY-MM-DD (the date input format)", () => {
    const result = followUpPatchSchema.safeParse({
      snoozedUntil: "2026-06-10",
    });
    expect(result.success).toBe(true);
  });

  it("accepts snoozedUntil: null to lift the snooze", () => {
    const result = followUpPatchSchema.safeParse({ snoozedUntil: null });
    expect(result.success).toBe(true);
  });

  it("rejects snoozedUntil with garbage strings", () => {
    const result = followUpPatchSchema.safeParse({ snoozedUntil: "manana" });
    expect(result.success).toBe(false);
  });
});
