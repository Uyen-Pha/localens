import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { parseRuntimeMode } from "./lib/env/runtime";
import { buildSecurityHeaders, type SecurityHeaderInput } from "./lib/security/headers";

function parseOwnedDistDir(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = value.match(/^\.next\/e2e-(?:demo|supabase)-([1-9]\d{0,4})$/);
  if (!match || Number(match[1]) > 65_535) {
    throw new Error(
      "LOCALLENS_NEXT_DIST_DIR must be an owned .next/e2e-<mode>-<port> directory",
    );
  }
  return value;
}

export default function nextConfig(phase: string): NextConfig {
  const mode = parseRuntimeMode(process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME);
  const distDir = parseOwnedDistDir(process.env.LOCALLENS_NEXT_DIST_DIR);
  const vercelEnvironment = parseVercelEnvironment(process.env.VERCEL_ENV);

  return {
    ...(mode === "demo" && phase === PHASE_PRODUCTION_BUILD ? { output: "export" } : {}),
    ...(distDir ? { distDir } : {}),
    ...(mode === "supabase" ? {
      headers: async () => [{
        source: "/(.*)",
        headers: [...buildSecurityHeaders({
          runtime: mode,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          vercelEnvironment,
        })],
      }],
    } : {}),
    trailingSlash: true,
    images: { unoptimized: true },
    reactStrictMode: true,
  };
}

function parseVercelEnvironment(
  value: string | undefined,
): SecurityHeaderInput["vercelEnvironment"] {
  if (value === "development" || value === "preview" || value === "production") {
    return value;
  }
  return undefined;
}
