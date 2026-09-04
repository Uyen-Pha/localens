// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const browserClient = { auth: {}, from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } };

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: vi.fn(() => browserClient),
}));

import { createSupabasePortalShell } from "@/lib/application/portal/supabase-shell";

describe("Supabase planner composition", () => {
  it("exposes the fail-closed Supabase planner port alongside existing runtime ports", () => {
    const shell = createSupabasePortalShell({
      mode: "supabase",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-publishable-key",
    });

    expect(shell.mode).toBe("supabase");
    expect(shell.planner.getSession).toBeTypeOf("function");
    expect(shell.planner.recommend).toBeTypeOf("function");
    expect(shell.planner.refine).toBeTypeOf("function");
    expect(shell.planner.getPlan).toBeTypeOf("function");
  });
});
