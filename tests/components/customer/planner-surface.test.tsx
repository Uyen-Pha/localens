import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlannerSurface } from "@/components/customer/planner-surface";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { DemoPortalComposition } from "@/lib/application/portal/composition";
import type { SupabasePortalShell } from "@/lib/application/portal/supabase-shell";

const mocks = vi.hoisted(() => ({
  loadPortalSurfaceComposition: vi.fn(),
}));

vi.mock("@/components/portals/portal-session", () => ({
  loadPortalSurfaceComposition: mocks.loadPortalSurfaceComposition,
}));

afterEach(() => {
  cleanup();
  mocks.loadPortalSurfaceComposition.mockReset();
});

const copy = getDictionary("vi").planner;

function demoComposition(): DemoPortalComposition {
  return {
    mode: "demo",
    initialized: Promise.resolve(),
  } as DemoPortalComposition;
}

function supabaseComposition(): SupabasePortalShell {
  return {
    mode: "supabase",
    initialized: Promise.resolve(),
    planner: {
      getSession: async () => null,
      recommend: async () => ({
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          messageKey: "planner.service_unavailable",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000000",
        },
      }),
      refine: async () => ({
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          messageKey: "planner.service_unavailable",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000000",
        },
      }),
      getPlan: async () => ({
        ok: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          messageKey: "planner.service_unavailable",
          retryable: true,
          correlationId: "00000000-0000-4000-8000-000000000000",
        },
      }),
    },
  } as unknown as SupabasePortalShell;
}

describe("PlannerSurface", () => {
  it("renders the existing deterministic planner in demo mode", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(demoComposition());

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByText(copy.simulatedDisclosure)).toBeVisible();
  });

  it("renders the Supabase planner with the runtime disclosure", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(supabaseComposition());

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByText(copy.runtimeDisclosure)).toBeVisible();
  });

  it("keeps an unavailable composition recoverable through a user-triggered retry", async () => {
    mocks.loadPortalSurfaceComposition
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(supabaseComposition());

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByRole("alert")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText(copy.runtimeDisclosure)).toBeVisible();
    expect(mocks.loadPortalSurfaceComposition).toHaveBeenCalledTimes(2);
  });
});
