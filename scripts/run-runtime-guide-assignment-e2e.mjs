import path from "node:path";
import { fileURLToPath } from "node:url";

import { runRuntimeItineraryE2E } from "./run-runtime-itinerary-e2e.mjs";

export function runRuntimeGuideAssignmentE2E(options = {}) {
  return runRuntimeItineraryE2E({
    ...options,
    playwrightSpec: "tests/e2e/runtime-guide-assignment.spec.ts",
    playwrightConfig: "playwright.runtime-guide-assignment.config.ts",
  });
}

export async function runRuntimeGuideAssignmentE2EMain({
  run = runRuntimeGuideAssignmentE2E,
  errorLogger = console.error,
} = {}) {
  try {
    await run();
    return 0;
  } catch (error) {
    try {
      errorLogger("RUNTIME_GUIDE_ASSIGNMENT_FAILED: isolated local runtime acceptance failed");
      if (error?.cleanupFailed) {
        errorLogger("RUNTIME_GUIDE_ASSIGNMENT_CLEANUP_FAILED: owned resource cleanup could not be confirmed");
      }
    } catch {
      // Logging failure must not change the stable exit contract.
    }
    return error?.status ?? 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRuntimeGuideAssignmentE2EMain();
}
