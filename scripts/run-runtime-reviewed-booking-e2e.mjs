import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRuntimeItineraryE2E, runRuntimeItineraryE2EMain } from './run-runtime-itinerary-e2e.mjs';

// Reuse the owned, randomly ported local stack, migration reset, auth seed,
// browser credentials, redaction and cleanup. Never accept a caller's DB URL.
export function runRuntimeReviewedBookingE2E(options = {}) {
  return runRuntimeItineraryE2E({
    ...options,
    playwrightSpec: 'tests/e2e/runtime-reviewed-booking.spec.ts',
    playwrightConfig: 'playwright.runtime-reviewed-booking.config.ts',
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRuntimeItineraryE2EMain({ run: runRuntimeReviewedBookingE2E });
}
