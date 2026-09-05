import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  runRuntimeItineraryE2E,
  runRuntimeItineraryE2EMain,
} from "./run-runtime-itinerary-e2e.mjs";

export function createIsolatedRuntimeAuthOptions(options = {}) {
  return {
    ...options,
    playwrightSpec: "tests/e2e/runtime-auth.spec.ts",
    playwrightConfig: "playwright.runtime.config.ts",
  };
}

export function runIsolatedRuntimeAuthE2E(options = {}) {
  return runRuntimeItineraryE2E(createIsolatedRuntimeAuthOptions(options));
}

export function runIsolatedRuntimeAuthE2EMain({
  run = runIsolatedRuntimeAuthE2E,
  errorLogger = console.error,
  signals = process,
} = {}) {
  return runRuntimeItineraryE2EMain({ run, errorLogger, signals });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runIsolatedRuntimeAuthE2EMain();
}
