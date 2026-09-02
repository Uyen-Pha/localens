// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalRuntime = process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function setRuntime(mode: "demo" | "supabase"): void {
  process.env.NEXT_PUBLIC_LOCALLENS_RUNTIME = mode;
  if (mode === "supabase") {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "local-publishable-key";
  } else {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
}

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("portal runtime loader", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.doUnmock("@/lib/application/portal/composition");
    vi.doUnmock("@/lib/application/portal/supabase-shell");
    vi.doUnmock("@/lib/supabase/client");
    vi.doUnmock("@/lib/infrastructure/supabase/portal-session-adapter");
    vi.doUnmock("@/lib/infrastructure/supabase/fixed-tour-runtime-adapter");
    restore("NEXT_PUBLIC_LOCALLENS_RUNTIME", originalRuntime);
    restore("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
    restore("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", originalKey);
  });

  it("dynamically imports only the demo composition path in demo mode", async () => {
    setRuntime("demo");
    const demoComposition = { mode: "demo", initialized: Promise.resolve() };
    const demoModuleImported = vi.fn();
    const supabaseModuleImported = vi.fn();
    const createPortalComposition = vi.fn().mockReturnValue(demoComposition);
    const createSupabasePortalShell = vi.fn();
    vi.doMock("@/lib/application/portal/composition", () => {
      demoModuleImported();
      return { createPortalComposition };
    });
    vi.doMock("@/lib/application/portal/supabase-shell", () => {
      supabaseModuleImported();
      return { createSupabasePortalShell };
    });

    const { loadPortalSurfaceComposition } = await import("@/components/portals/portal-session");

    await expect(loadPortalSurfaceComposition()).resolves.toBe(demoComposition);
    expect(createPortalComposition).toHaveBeenCalledWith({
      mode: "demo",
      storage: window.sessionStorage,
    });
    expect(demoModuleImported).toHaveBeenCalledOnce();
    expect(supabaseModuleImported).not.toHaveBeenCalled();
    expect(createSupabasePortalShell).not.toHaveBeenCalled();
  });

  it("preserves the legacy synchronous demo accessor through the lazy loader", async () => {
    setRuntime("demo");
    window.sessionStorage.clear();

    const { getDemoPortalComposition } = await import("@/components/portals/portal-session");
    const composition = getDemoPortalComposition();

    expect(composition.mode).toBe("demo");
    await expect(composition.initialized).resolves.toBeUndefined();
    await expect(composition.session.getSession()).resolves.toBeNull();
  });

  it("dynamically imports only the Supabase shell path in Supabase mode", async () => {
    setRuntime("supabase");
    const shell = { mode: "supabase", session: {}, initialized: Promise.resolve() };
    const demoModuleImported = vi.fn();
    const supabaseModuleImported = vi.fn();
    const createPortalComposition = vi.fn();
    const createSupabasePortalShell = vi.fn().mockReturnValue(shell);
    vi.doMock("@/lib/application/portal/composition", () => {
      demoModuleImported();
      return { createPortalComposition };
    });
    vi.doMock("@/lib/application/portal/supabase-shell", () => {
      supabaseModuleImported();
      return { createSupabasePortalShell };
    });

    const { loadPortalSurfaceComposition } = await import("@/components/portals/portal-session");

    await expect(loadPortalSurfaceComposition()).resolves.toBe(shell);
    expect(createSupabasePortalShell).toHaveBeenCalledWith({
      mode: "supabase",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-publishable-key",
    });
    expect(supabaseModuleImported).toHaveBeenCalledOnce();
    expect(demoModuleImported).not.toHaveBeenCalled();
    expect(createPortalComposition).not.toHaveBeenCalled();
  });

  it("caches one resolved composition per browser page", async () => {
    setRuntime("supabase");
    const shell = { mode: "supabase", session: {}, initialized: Promise.resolve() };
    const createSupabasePortalShell = vi.fn().mockReturnValue(shell);
    vi.doMock("@/lib/application/portal/supabase-shell", () => ({ createSupabasePortalShell }));

    const { loadPortalSurfaceComposition } = await import("@/components/portals/portal-session");

    const [first, second] = await Promise.all([
      loadPortalSurfaceComposition(),
      loadPortalSurfaceComposition(),
    ]);
    expect(first).toBe(shell);
    expect(second).toBe(shell);
    expect(createSupabasePortalShell).toHaveBeenCalledOnce();
  });

  it("keeps a rejected Supabase shell import rejected without loading demo", async () => {
    setRuntime("supabase");
    const createPortalComposition = vi.fn();
    vi.doMock("@/lib/application/portal/composition", () => ({ createPortalComposition }));
    vi.doMock("@/lib/application/portal/supabase-shell", () => {
      throw new Error("Supabase shell import failed");
    });

    const { loadPortalSurfaceComposition } = await import("@/components/portals/portal-session");

    await expect(loadPortalSurfaceComposition()).rejects.toBeInstanceOf(Error);
    expect(createPortalComposition).not.toHaveBeenCalled();
  });

  it("keeps invalid Supabase configuration rejected without loading demo", async () => {
    setRuntime("supabase");
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    const createPortalComposition = vi.fn();
    const createSupabasePortalShell = vi.fn();
    vi.doMock("@/lib/application/portal/composition", () => ({ createPortalComposition }));
    vi.doMock("@/lib/application/portal/supabase-shell", () => ({ createSupabasePortalShell }));

    const { loadPortalSurfaceComposition } = await import("@/components/portals/portal-session");

    await expect(loadPortalSurfaceComposition()).rejects.toMatchObject({
      code: "PRODUCTION_CONFIGURATION",
    });
    expect(createSupabasePortalShell).not.toHaveBeenCalled();
    expect(createPortalComposition).not.toHaveBeenCalled();
  });

  it("maps client creation failures to redacted production configuration errors", async () => {
    const publishableKey = "publishable-key-do-not-leak";
    vi.doMock("@/lib/supabase/client", () => ({
      createBrowserSupabaseClient: () => {
        throw new Error(publishableKey);
      },
    }));

    const [{ createSupabasePortalShell }, { PortalError }] = await Promise.all([
      import("@/lib/application/portal/supabase-shell"),
      import("@/lib/application/portal/contracts"),
    ]);

    let thrown: unknown;
    try {
      createSupabasePortalShell({
        mode: "supabase",
        supabaseUrl: "http://127.0.0.1:54321",
        supabasePublishableKey: publishableKey,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PortalError);
    expect(thrown).toMatchObject({ code: "PRODUCTION_CONFIGURATION" });
    expect((thrown as Error).message).not.toContain(publishableKey);
  });

  it("wires session and fixed-tour adapters to one shared browser client", async () => {
    const client = { marker: "one-browser-client" };
    const session = {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    };
    const fixedTour = {
      listPublishedTours: vi.fn(),
      listAvailability: vi.fn(),
      beginBooking: vi.fn(),
      listOwnBookings: vi.fn(),
      listOwnPaymentStatuses: vi.fn(),
      completeSimulatedPayment: vi.fn(),
      listOwnCancellationRequests: vi.fn(),
      requestCancellation: vi.fn(),
      listCancellationQueue: vi.fn(),
      decideCancellation: vi.fn(),
    };
    const createBrowserSupabaseClient = vi.fn().mockReturnValue(client);
    const createSupabasePortalSessionAdapter = vi.fn().mockReturnValue(session);
    const createSupabaseFixedTourRuntimeAdapter = vi.fn().mockReturnValue(fixedTour);
    vi.doMock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient }));
    vi.doMock("@/lib/infrastructure/supabase/portal-session-adapter", () => ({
      createSupabasePortalSessionAdapter,
    }));
    vi.doMock("@/lib/infrastructure/supabase/fixed-tour-runtime-adapter", () => ({
      createSupabaseFixedTourRuntimeAdapter,
    }));

    const { createSupabasePortalShell } = await import("@/lib/application/portal/supabase-shell");
    const shell = createSupabasePortalShell({
      mode: "supabase",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-publishable-key",
    });

    expect(createSupabasePortalSessionAdapter).toHaveBeenCalledWith(client);
    expect(createSupabaseFixedTourRuntimeAdapter).toHaveBeenCalledWith(client);
    expect(shell.session).toBe(session);
    expect(shell.fixedTour).toBe(fixedTour);
  });
});
