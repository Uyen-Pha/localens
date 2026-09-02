import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { parseRuntimeMode } from "./lib/env/runtime";

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

  return {
    ...(mode === "demo" && phase === PHASE_PRODUCTION_BUILD ? { output: "export" } : {}),
    ...(distDir ? { distDir } : {}),
    trailingSlash: true,
    images: { unoptimized: true },
    reactStrictMode: true,
  };
}
