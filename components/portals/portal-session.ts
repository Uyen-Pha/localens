"use client";

import {
  createPortalComposition,
  type DemoPortalComposition,
} from "@/lib/application/portal/composition";

let demoComposition: DemoPortalComposition | null = null;

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
    demoComposition = createPortalComposition({
      mode: "demo",
      storage: window.sessionStorage,
    });
  }

  return demoComposition;
}

/** Test-only injection keeps UI tests on the same explicit session boundary. */
export function useDemoPortalComposition(composition: DemoPortalComposition): void {
  demoComposition = composition;
}
