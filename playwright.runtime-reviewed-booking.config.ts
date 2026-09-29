import { defineConfig } from '@playwright/test';
import { createRuntimeItineraryPlaywrightConfig } from './playwright.runtime-itinerary.config';

// Inherits loopback URLs, isolated project/output ownership, approved browser,
// one worker and disabled credential-bearing traces/screenshots/video.
const isolated = createRuntimeItineraryPlaywrightConfig(process.env);
export default defineConfig({
  ...isolated,
  use: { ...isolated.use, serviceWorkers: 'block' },
  testMatch: 'runtime-reviewed-booking.spec.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
});
