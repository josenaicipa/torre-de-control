import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this app so the build doesn't pick up an
  // unrelated lockfile higher up the filesystem.
  outputFileTracingRoot: path.join(import.meta.dirname),
};

export default nextConfig;
