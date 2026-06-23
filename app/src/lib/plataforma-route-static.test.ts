import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "../..");
const routeSource = () => readFileSync(resolve(appRoot, "src/app/Plataforma/route.ts"), "utf8");

describe("ruta /Plataforma sirve el shell legacy canónico", () => {
  it("sirve public/Plataforma/index.html para que el bookmark sin index.html no quede en 404", () => {
    const source = routeSource();
    expect(source).toContain("readFile");
    expect(source).toContain('join(process.cwd(), "public", "Plataforma", "index.html")');
    expect(source).toContain("text/html");
    expect(source).toContain("no-store");
  });
});
