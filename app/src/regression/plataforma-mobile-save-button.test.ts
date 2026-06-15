import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Regression guard for the mobile Safari/iPhone blocker in the legacy
 * "Plataforma" control surface (control.unlockedecom.co/Plataforma).
 *
 * Bug: On iOS Safari the closer report ("Comercial" → DetalleColaborador →
 * "Llenar reporte") "Guardar" button could not be reached. The app shell used
 * `height:100vh`, which on iOS resolves to the *large* viewport (toolbars
 * retracted). With `html/body{overflow:hidden}` and `.main-content{overflow:hidden}`,
 * the only scroll lives in `.page-content`, whose bottom — and its reserved
 * bottom padding — was pushed behind the Safari bottom toolbar and the fixed
 * `.mobile-bottom-nav`. Result: the save button sat under / too close to the nav.
 *
 * Fix invariants asserted here (deterministic static analysis, no browser):
 *  1. The app shell uses the *dynamic* viewport (`100dvh`) so the layout matches
 *     the visible viewport on iOS, while keeping a `100vh` fallback for engines
 *     without `dvh` support (desktop: dvh === vh, so layout is unchanged).
 *  2. The mobile `.page-content` scroll container reserves enough bottom space
 *     (a fixed reserve >= the fixed nav height, plus `env(safe-area-inset-bottom)`).
 *  3. The scroll container sets `scroll-padding-bottom` (also safe-area aware) so
 *     focus / scrollIntoView lands content above the fixed nav.
 *  4. The fixed `.mobile-bottom-nav` itself honors `env(safe-area-inset-bottom)`.
 */

const HTML_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/Plataforma/index.html",
);

const html = readFileSync(HTML_PATH, "utf8");

/** Minimum fixed bottom reserve (px) the scroll container must keep clear for the
 *  fixed mobile bottom nav. The nav is ~59px tall before its own safe-area inset;
 *  96px leaves comfortable, deterministic clearance above it. */
const MIN_BOTTOM_RESERVE_PX = 96;

/**
 * Return every CSS rule block (`{ ... }`) whose selector list mentions `selector`.
 * The selector is bounded by `[\w-]` lookarounds so `.page-content` does not also
 * match a hypothetical `.page-content-wrapper` / `.my-page-content` superset rule.
 */
function ruleBlocksFor(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])[^{}]*\\{([^{}]*)\\}`, "g");
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks;
}

describe("Plataforma mobile save-button viewport regression", () => {
  it("ships the canonical Plataforma static file with the mobile bottom nav", () => {
    expect(html.length).toBeGreaterThan(1000);
    // Canonical (live) copy has the mobile bottom nav; the stale root copy does not.
    expect(html).toMatch(/mobile-bottom-nav\{display:flex!important\}/);
  });

  it("uses the dynamic viewport (100dvh) for the app shell with a 100vh fallback", () => {
    const mainContentBlocks = ruleBlocksFor(".main-content");
    const dvhBlock = mainContentBlocks.find((b) => b.includes("100dvh"));
    expect(
      dvhBlock,
      "expected a .main-content CSS rule that sets height:100dvh",
    ).toBeTruthy();
    // Fallback for engines without dvh support (and desktop parity).
    expect(
      dvhBlock,
      "expected the dvh rule to keep a 100vh fallback declaration",
    ).toContain("100vh");
  });

  it("reserves enough safe-area-aware bottom space in the mobile scroll container", () => {
    const pageContentBlocks = ruleBlocksFor(".page-content");
    const paddingBlock = pageContentBlocks.find((b) =>
      /padding:[^;]*calc\(\s*\d+px\s*\+\s*env\(safe-area-inset-bottom/.test(b),
    );
    expect(
      paddingBlock,
      "expected a mobile .page-content rule with safe-area-aware bottom padding",
    ).toBeTruthy();

    const reserve = paddingBlock!.match(
      /padding:[^;]*calc\(\s*(\d+)px\s*\+\s*env\(safe-area-inset-bottom/,
    );
    expect(reserve).toBeTruthy();
    expect(Number(reserve![1])).toBeGreaterThanOrEqual(MIN_BOTTOM_RESERVE_PX);
  });

  it("sets scroll-padding-bottom so focused content lands above the fixed nav", () => {
    const pageContentBlocks = ruleBlocksFor(".page-content");
    const hasScrollPadding = pageContentBlocks.some((b) =>
      /scroll-padding-bottom:[^;]*env\(safe-area-inset-bottom/.test(b),
    );
    expect(
      hasScrollPadding,
      "expected .page-content to set a safe-area-aware scroll-padding-bottom",
    ).toBe(true);
  });

  it("keeps the fixed mobile bottom nav inside the safe area", () => {
    // Anchor on the JSX nav ELEMENT (the last "mobile-bottom-nav" occurrence — the
    // CSS rule comes first in the <style> block, the rendered element comes after),
    // and assert its own inline fixed-position style honors env(safe-area-inset-bottom).
    const navElIdx = html.lastIndexOf("mobile-bottom-nav");
    expect(navElIdx).toBeGreaterThan(-1);
    const navWindow = html.slice(navElIdx, navElIdx + 600);
    expect(navWindow).toContain('position:"fixed"');
    expect(navWindow).toMatch(/env\(safe-area-inset-bottom/);
  });
});
