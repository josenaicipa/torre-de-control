import { describe, expect, it } from "vitest";
import { AUTO_ADS_MEMBER, buildAutoAdsRows } from "./ad-spend-sync";

describe("buildAutoAdsRows", () => {
  it("maps high-ticket metrics spend into Auto Ads daily_entries rows", () => {
    const rows = buildAutoAdsRows({
      ad_spend_daily: {
        daily_totals: [
          { date: "2026-05-31", funnel: "high_ticket", channel: "meta", spend: 980.43 },
          { date: "2026-05-31", funnel: "high_ticket", channel: "google", spend: 150.43 },
          { date: "2026-05-31", funnel: "low_ticket", channel: "meta", spend: 230.3 },
          { date: "2026-05-30", funnel: "high_ticket", channel: "meta", spend: "669.46" },
          { date: "2026-05-30", funnel: "high_ticket", channel: "google", spend: 214.59 },
          { date: "2026-05-30", funnel: "high_ticket", channel: "tiktok", spend: 999 },
          { date: "bad", funnel: "high_ticket", channel: "meta", spend: 999 },
        ],
      },
    });

    expect(rows).toEqual([
      expect.objectContaining({
        date: "2026-05-30",
        member: AUTO_ADS_MEMBER,
        gasto_meta: 669.46,
        gasto_google: 214.59,
        gasto_tiktok: 0,
        gasto_otros: 0,
      }),
      expect.objectContaining({
        date: "2026-05-31",
        member: AUTO_ADS_MEMBER,
        gasto_meta: 980.43,
        gasto_google: 150.43,
      }),
    ]);
  });

  it("also accepts the legacy direct daily_totals shape", () => {
    expect(buildAutoAdsRows({
      daily_totals: [
        { date: "2026-05-22", funnel: "high_ticket", channel: "meta", spend: 740.89 },
      ],
    })).toEqual([
      expect.objectContaining({ date: "2026-05-22", gasto_meta: 740.89, gasto_google: 0 }),
    ]);
  });
});
