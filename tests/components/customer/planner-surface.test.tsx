import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
const DYNAMIC_IMPORT_TIMEOUT_MS = 5_000;
const DYNAMIC_IMPORT_TEST_TIMEOUT_MS = 10_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

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

    expect(await screen.findByText(copy.simulatedDisclosure, {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
  }, DYNAMIC_IMPORT_TEST_TIMEOUT_MS);

  it("renders the Supabase planner with the runtime disclosure", async () => {
    mocks.loadPortalSurfaceComposition.mockResolvedValue(supabaseComposition());

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByText(copy.runtimeDisclosure, {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
  }, DYNAMIC_IMPORT_TEST_TIMEOUT_MS);

  it("keeps an unavailable composition recoverable through a user-triggered retry", async () => {
    mocks.loadPortalSurfaceComposition
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(supabaseComposition());

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByRole("alert", {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));

    expect(await screen.findByText(copy.runtimeDisclosure, {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
    expect(mocks.loadPortalSurfaceComposition).toHaveBeenCalledTimes(2);
  }, DYNAMIC_IMPORT_TEST_TIMEOUT_MS);

  it("fails closed when composition initialization rejects", async () => {
    const composition = supabaseComposition();
    Object.assign(composition, { initialized: Promise.reject(new Error("initialization failed")) });
    mocks.loadPortalSurfaceComposition.mockResolvedValue(composition);

    render(<PlannerSurface locale="vi" copy={copy} />);

    expect(await screen.findByRole("alert", {}, {
      timeout: DYNAMIC_IMPORT_TIMEOUT_MS,
    })).toBeVisible();
    expect(screen.queryByText(copy.runtimeDisclosure)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.simulatedDisclosure)).not.toBeInTheDocument();
  }, DYNAMIC_IMPORT_TEST_TIMEOUT_MS);

  it("ignores a late composition completion after unmount", async () => {
    const compositionLoad = deferred<SupabasePortalShell>();
    mocks.loadPortalSurfaceComposition.mockReturnValue(compositionLoad.promise);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { container, unmount } = render(<PlannerSurface locale="vi" copy={copy} />);

      unmount();
      await act(async () => {
        compositionLoad.resolve(supabaseComposition());
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container).toBeEmptyDOMElement();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
