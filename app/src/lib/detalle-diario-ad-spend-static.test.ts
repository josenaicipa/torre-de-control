import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../..");
const dashboardFiles = [
  "index.html",
  "Plataforma/index.html",
  "app/public/index.html",
  "app/public/Plataforma/index.html",
];

describe("Detalle Diario > Gasto Publicitario historical monthly rows", () => {
  it.each(dashboardFiles)(
    "keeps Marketing Histórico month-total spend out of daily cells but in Total / Mes for %s",
    (relativePath) => {
      const source = readFileSync(resolve(repoRoot, relativePath), "utf8");

      expect(source).toContain('const HISTORICAL_MARKETING_MEMBER="Marketing Histórico";');
      expect(source).toContain(
        "const isHistoricalMonthlyAdSpendEntry=e=>e?.member===HISTORICAL_MARKETING_MEMBER;",
      );
      expect(source).toContain('const AUTO_ADS_MEMBER="Auto Ads";');
      expect(source).toContain('const HISTORICAL_AD_SPEND_DAILY_CUTOFF="2026-05-22";');
      expect(source).toContain(
        'const isAutoAdSpendBeforeDailyCutoff=e=>e?.member===AUTO_ADS_MEMBER&&String(e?.date||"")<HISTORICAL_AD_SPEND_DAILY_CUTOFF;',
      );
      expect(source).toContain(
        "const dailyAdEntries=entries.filter(e=>!isMonthlyOnlyAdSpendEntry(e));",
      );
      expect(source).toContain(
        'const totalGastoDay=sdAds("gastoMeta")+sdAds("gastoGoogle")+sdAds("gastoTikTok")+sdAds("gastoOtros");',
      );
      expect(source).toContain(
        '{l:"$ Total Gasto",fn:d=>d.totalGastoDay||null,fmt:"$",totFn:()=>mGastoTotal||null}',
      );
      expect(source).toContain(
        '{l:"Meta",fn:d=>d.sdAds("gastoMeta")||null,fmt:"$",sub:true,totFn:()=>mGastoMeta||null}',
      );
    },
  );
});
