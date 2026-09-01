import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { parseRuntimeMode } from "./lib/env/runtime";

export default function nextConfig(phase: string): NextConfig {
  const mode = parseRuntimeMode(process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME);

  return {
    ...(mode === "demo" && phase === PHASE_PRODUCTION_BUILD ? { output: "export" } : {}),
    trailingSlash: true,
    images: { unoptimized: true },
    reactStrictMode: true,
  };
}
