import { describe, expect, it } from "vitest";
import {
  buildDayMetrics,
  isShowedStatus,
  localDateKey,
  SHOWED_LEAD_STATUSES,
  type AppointmentLead,
} from "./appointments";

describe("isShowedStatus", () => {
  it("treats every GHL showed alias as a show-up", () => {
    for (const status of SHOWED_LEAD_STATUSES) {
      expect(isShowedStatus(status)).toBe(true);
      expect(isShowedStatus(status.toUpperCase())).toBe(true);
      expect(isShowedStatus(`  ${status}  `)).toBe(true);
    }
  });

  it("does not count non-showed statuses", () => {
    expect(isShowedStatus("confirmed")).toBe(false);
    expect(isShowedStatus("no_show")).toBe(false);
    expect(isShowedStatus("")).toBe(false);
    expect(isShowedStatus(null)).toBe(false);
    expect(isShowedStatus(undefined)).toBe(false);
  });
});

describe("buildDayMetrics — GHL showed is source of truth", () => {
  it("counts a future-dated showed lead as a show-up", () => {
    const leads: AppointmentLead[] = [
      {
        contactId: "future-1",
        status: "showed",
        startTime: "2099-05-15T09:00:00-05:00",
      },
    ];
    const m = buildDayMetrics(leads);
    expect(m.booked).toBe(1);
    expect(m.showed).toBe(1);
  });

  it("counts a past-dated showed lead as a show-up", () => {
    const leads: AppointmentLead[] = [
      { contactId: "past-1", status: "showed", startTime: "2026-05-15T06:00:00-05:00" },
    ];
    const m = buildDayMetrics(leads);
    expect(m.booked).toBe(1);
    expect(m.showed).toBe(1);
  });

  it("counts a showed lead with missing startTime", () => {
    const leads: AppointmentLead[] = [
      { contactId: "nostart-1", status: "showed", startTime: null },
    ];
    const m = buildDayMetrics(leads);
    expect(m.showed).toBe(1);
  });

  it("books but does not count a non-showed status", () => {
    const leads: AppointmentLead[] = [
      { contactId: "confirmed-1", status: "confirmed", startTime: "2026-05-15T06:00:00-05:00" },
    ];
    const m = buildDayMetrics(leads);
    expect(m.booked).toBe(1);
    expect(m.showed).toBe(0);
  });

  it("counts every showed alias", () => {
    const leads: AppointmentLead[] = SHOWED_LEAD_STATUSES.map((status, i) => ({
      contactId: `${status}-${i}`,
      status,
      startTime: "2099-05-15T09:00:00-05:00",
    }));
    const m = buildDayMetrics(leads);
    expect(m.booked).toBe(SHOWED_LEAD_STATUSES.length);
    expect(m.showed).toBe(SHOWED_LEAD_STATUSES.length);
  });

  it("counts mixed past and future showed leads", () => {
    const leads: AppointmentLead[] = [
      { contactId: "future-1", status: "showed", startTime: "2099-05-15T09:00:00-05:00" },
      { contactId: "past-1", status: "showed", startTime: "2026-05-15T06:00:00-05:00" },
    ];
    const m = buildDayMetrics(leads);
    expect(m.booked).toBe(2);
    expect(m.showed).toBe(2);
  });

  it("skips low-ticket leads", () => {
    const leads: AppointmentLead[] = [
      { contactId: "ht-1", status: "showed" },
      { contactId: "lt-1", status: "showed", isLowTicket: true },
    ];
    const m = buildDayMetrics(leads);
    expect(m.booked).toBe(1);
    expect(m.showed).toBe(1);
  });

  it("dedupes by contactId then email", () => {
    const leads: AppointmentLead[] = [
      { contactId: "dup", status: "showed" },
      { contactId: "dup", status: "showed" },
      { email: "Dup@Example.com", status: "confirmed" },
      { email: "dup@example.com", status: "showed" },
    ];
    const m = buildDayMetrics(leads);
    // one unique contactId + one unique email = 2 booked, both first-seen
    expect(m.booked).toBe(2);
    // contactId "dup" first-seen is showed; email first-seen is confirmed
    expect(m.showed).toBe(1);
  });

  it("keeps anonymous rows distinct", () => {
    const leads: AppointmentLead[] = [
      { status: "showed" },
      { status: "showed" },
    ];
    const m = buildDayMetrics(leads);
    expect(m.booked).toBe(2);
    expect(m.showed).toBe(2);
  });
});

describe("localDateKey — deterministic by timezone", () => {
  it("buckets a late-night UTC time into the correct Bogota day", () => {
    // 2026-05-16T02:00:00Z is 2026-05-15 21:00 in America/Bogota (-05:00)
    expect(localDateKey("2026-05-16T02:00:00Z", "America/Bogota")).toBe("2026-05-15");
  });

  it("is stable across server timezones for the same instant", () => {
    const instant = "2026-05-15T11:00:00-05:00";
    expect(localDateKey(instant, "America/Bogota")).toBe("2026-05-15");
    expect(localDateKey(instant, "UTC")).toBe("2026-05-15");
  });

  it("throws on an invalid timestamp", () => {
    expect(() => localDateKey("not-a-date")).toThrow();
  });
});
