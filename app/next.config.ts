import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this app so the build doesn't pick up an
  // unrelated lockfile higher up the filesystem.
  outputFileTracingRoot: path.join(import.meta.dirname),
  // pdfkit lee sus fuentes .afm desde node_modules en runtime; mantenerlo
  // fuera del bundle del servidor evita que el empaquetado rompa esas lecturas.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
