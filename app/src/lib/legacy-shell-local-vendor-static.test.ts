import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const appRoot = resolve(__dirname, "../..");

function read(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function expectVendorized(html: string) {
  expect(html).toContain('src="/vendor/react-18.production.min.js"');
  expect(html).toContain('src="/vendor/react-dom-18.production.min.js"');
  expect(html).toContain('src="/vendor/babel-standalone.min.js"');
  expect(html).toContain("Cargando Torre de Control…");
  expect(html).toContain("runtime:\"classic\"");
  expect(html).not.toContain("https://unpkg.com/react");
  expect(html).not.toContain("https://unpkg.com/react-dom");
  expect(html).not.toContain("https://unpkg.com/@babel/standalone");
}

describe("legacy Torre shell runtime assets", () => {
  it("loads critical React/Babel runtime from same-origin files in the Next public shell", () => {
    expectVendorized(read("app/public/index.html"));
  });

  it("keeps all mirrored legacy shell copies vendorized", () => {
    expectVendorized(read("app/public/Plataforma/index.html"));
    expectVendorized(read("index.html"));
    expectVendorized(read("Plataforma/index.html"));
  });

  it("ships the same-origin vendor files used by the shell", () => {
    for (const dir of [resolve(appRoot, "public/vendor"), resolve(repoRoot, "vendor")]) {
      expect(readFileSync(resolve(dir, "react-18.production.min.js"), "utf8")).toContain("React");
      expect(readFileSync(resolve(dir, "react-dom-18.production.min.js"), "utf8")).toContain("ReactDOM");
      expect(readFileSync(resolve(dir, "babel-standalone.min.js"), "utf8")).toContain("Babel");
    }
  });
});
