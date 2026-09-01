"use client";

import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";
import { PortalError, PORTAL_PRODUCTION_GAP } from "@/lib/application/portal/contracts";
import { parseBrowserRuntimeConfig } from "@/lib/env/runtime";

let demoComposition: DemoPortalComposition | null = null;
let resolvedComposition: DemoPortalComposition | SupabasePortalShell | null = null;
let compositionLoad: Promise<DemoPortalComposition | SupabasePortalShell> | null = null;

function runtimeSource(): Record<string, unknown> {
  return {
    NEXT_PUBLIC_LOCALLENS_RUNTIME: process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

async function createModeComposition(): Promise<DemoPortalComposition | SupabasePortalShell> {
  let config;
  try {
    config = parseBrowserRuntimeConfig(runtimeSource());
  } catch {
    throw new PortalError(
      "PRODUCTION_CONFIGURATION",
      "The browser runtime configuration is invalid.",
    );
  }

  if (config.mode === "supabase") {
    const { createSupabasePortalShell } = await import("@/lib/application/portal/supabase-shell");
    return createSupabasePortalShell(config);
  }

  const { createPortalComposition } = await import("@/lib/application/portal/composition");
  return createPortalComposition({ mode: "demo", storage: window.sessionStorage });
}

export async function loadPortalSurfaceComposition(): Promise<DemoPortalComposition | SupabasePortalShell> {
  if (typeof window === "undefined") {
    throw new Error("The portal composition is browser-only.");
  }
  if (resolvedComposition !== null) return resolvedComposition;
  if (compositionLoad !== null) return compositionLoad;

  compositionLoad = createModeComposition();
  try {
    const composition = await compositionLoad;
    resolvedComposition = composition;
    if (composition.mode === "demo") demoComposition = composition;
    return composition;
  } finally {
    compositionLoad = null;
  }
}

function lazyPort(path: readonly string[]): object {
  return new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => callLazyDemoMethod(path, property, args),
  });
}

async function callLazyDemoMethod(
  path: readonly string[],
  property: PropertyKey,
  args: readonly unknown[],
): Promise<unknown> {
  const composition = await loadPortalSurfaceComposition();
  if (composition.mode !== "demo") {
    throw new PortalError("PRODUCTION_CONFIGURATION", "A demo portal is unavailable in Supabase mode.");
  }

  let owner: unknown = composition;
  for (const segment of path) owner = (owner as Record<string, unknown>)[segment];
  const method = (owner as Record<PropertyKey, unknown>)[property];
  if (typeof method !== "function") {
    throw new PortalError("PRODUCTION_CONFIGURATION", "The demo portal boundary is incomplete.");
  }
  return method.apply(owner, args);
}

function createLazyDemoComposition(): DemoPortalComposition {
  return {
    mode: "demo",
    productionGap: PORTAL_PRODUCTION_GAP,
    initialized: loadPortalSurfaceComposition().then((composition) => {
      if (composition.mode !== "demo") {
        throw new PortalError("PRODUCTION_CONFIGURATION", "A demo portal is unavailable in Supabase mode.");
      }
      return composition.initialized;
    }),
    session: lazyPort(["session"]),
    customer: {
      account: lazyPort(["customer", "account"]),
      cancellations: lazyPort(["customer", "cancellations"]),
      reviews: lazyPort(["customer", "reviews"]),
    },
    guide: {
      profile: lazyPort(["guide", "profile"]),
      assignments: lazyPort(["guide", "assignments"]),
    },
    admin: {
      users: lazyPort(["admin", "users"]),
      catalog: lazyPort(["admin", "catalog"]),
      personalizedRequests: lazyPort(["admin", "personalizedRequests"]),
      bookings: lazyPort(["admin", "bookings"]),
      cancellations: lazyPort(["admin", "cancellations"]),
      assignments: lazyPort(["admin", "assignments"]),
      reporting: lazyPort(["admin", "reporting"]),
    },
    demoIntegration: lazyPort(["demoIntegration"]),
    demoQuotes: lazyPort(["demoQuotes"]),
    retryInitialization: () => callLazyDemoMethod([], "retryInitialization", []) as Promise<void>,
    resetDemo: () => callLazyDemoMethod([], "resetDemo", []) as Promise<void>,
  } as DemoPortalComposition;
}

/**
 * The browser-only demo boundary is intentionally lazy. It keeps the static
 * route render free of Web API access while preserving the selected identity
 * during soft navigation in one browser tab.
 */
export function getDemoPortalComposition(): DemoPortalComposition {
  if (typeof window === "undefined") {
    throw new Error("The demo portal composition is browser-only.");
  }

  if (demoComposition === null) {
    demoComposition = createLazyDemoComposition();
  }

  return demoComposition;
}

/** Test-only injection keeps UI tests on the same explicit session boundary. */
export function useDemoPortalComposition(composition: DemoPortalComposition): void {
  demoComposition = composition;
  resolvedComposition = composition;
  compositionLoad = null;
}
