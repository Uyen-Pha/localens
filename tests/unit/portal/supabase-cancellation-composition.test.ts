// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const browserClient = { auth: {}, from: vi.fn(), rpc: vi.fn() };

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: vi.fn(() => browserClient),
}));

import { createSupabasePortalShell } from "@/lib/application/portal/supabase-shell";

describe("Supabase cancellation composition", () => {
  it("exposes generic cancellation without legacy request or decision seams", () => {
    const shell = createSupabasePortalShell({
      mode: "supabase",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-publishable-key",
    });

    expect(shell.bookingCancellations.cancelBooking).toBeTypeOf("function");
    expect(shell.bookingCancellations.listOwnCancellations).toBeTypeOf("function");
    expect(shell.bookingCancellations.listAdminCancellations).toBeTypeOf("function");
    expect(shell.fixedTour).not.toHaveProperty("requestCancellation");
    expect(shell.fixedTour).not.toHaveProperty("listOwnCancellationRequests");
    expect(shell.fixedTour).not.toHaveProperty("listCancellationQueue");
    expect(shell.fixedTour).not.toHaveProperty("decideCancellation");
  });
});
