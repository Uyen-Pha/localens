// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const browserClient = { auth: {}, from: vi.fn(), rpc: vi.fn() };

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: vi.fn(() => browserClient),
}));

import { createSupabasePortalShell } from "@/lib/application/portal/supabase-shell";

describe("Supabase cancellation composition", () => {
  it("exposes the generic booking cancellation adapter alongside legacy Task 3 seams", () => {
    const shell = createSupabasePortalShell({
      mode: "supabase",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-publishable-key",
    });

    expect(shell.bookingCancellations.cancelBooking).toBeTypeOf("function");
    expect(shell.bookingCancellations.listOwnCancellations).toBeTypeOf("function");
    expect(shell.bookingCancellations.listAdminCancellations).toBeTypeOf("function");
    expect(shell.fixedTour.requestCancellation).toBeTypeOf("function");
    expect(shell.fixedTour.decideCancellation).toBeTypeOf("function");
  });
});
