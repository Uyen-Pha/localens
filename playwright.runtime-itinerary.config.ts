import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const OUTPUT_DIRECTORY_PREFIX = "localens-runtime-itinerary-playwright-";

function requireLoopbackOrigin(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Local runtime itinerary Playwright requires ${label}`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Local runtime itinerary Playwright requires a local ${label}`);
  }
  if (
    parsed.protocol !== "http:"
    || !LOOPBACK_HOSTS.has(parsed.hostname)
    || parsed.port === ""
    || parsed.pathname !== "/"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new Error(`Local runtime itinerary Playwright requires a local ${label}`);
  }
  return parsed.origin;
}

export function createRuntimeItineraryPlaywrightConfig(
  env: Record<string, string | undefined>,
) {
  const baseURL = requireLoopbackOrigin(env.PLAYWRIGHT_BASE_URL, "application URL");
  requireLoopbackOrigin(env.NEXT_PUBLIC_SUPABASE_URL, "Supabase URL");
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Local runtime itinerary Playwright requires a Supabase browser key");
  }
  const outputDir = env.LOCALENS_RUNTIME_PLAYWRIGHT_OUTPUT_DIR;
  if (!outputDir || outputDir !== outputDir.trim()) {
    throw new Error("Local runtime itinerary Playwright requires an owned output directory");
  }
  const resolvedOutputDir = resolve(outputDir);
  if (
    dirname(resolvedOutputDir) !== resolve(tmpdir())
    || !basename(resolvedOutputDir).startsWith(OUTPUT_DIRECTORY_PREFIX)
  ) {
    throw new Error("Local runtime itinerary Playwright requires an owned output directory");
  }

  let browserProject;
  if (env.CI) {
    browserProject = { name: "chromium", use: { ...devices["Desktop Chrome"] } };
  } else if (env.LOCALENS_RUNTIME_BROWSER === "chrome" || env.LOCALENS_RUNTIME_BROWSER === "msedge") {
    browserProject = {
      name: env.LOCALENS_RUNTIME_BROWSER,
      use: {
        ...devices["Desktop Chrome"],
        channel: env.LOCALENS_RUNTIME_BROWSER,
      },
    };
  } else {
    throw new Error("Local runtime itinerary Playwright requires an approved browser: chrome or msedge");
  }

  return {
    testDir: "./tests/e2e",
    testMatch: "runtime-itinerary.spec.ts",
    outputDir: resolvedOutputDir,
    preserveOutput: "never" as const,
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(env.CI),
    retries: 0,
    reporter: [["line"]] as [["line"]],
    use: {
      baseURL,
      trace: "off" as const,
      screenshot: "off" as const,
      video: "off" as const,
    },
    projects: [browserProject],
  };
}

export default defineConfig(createRuntimeItineraryPlaywrightConfig(process.env));
