import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import type { PublicEnv } from "@/lib/env/public";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const env: PublicEnv = {
  NEXT_PUBLIC_APP_URL: "https://localens.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_demo",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAA_demo",
};

describe("browser Supabase client boundary", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("constructs a browser client with the publishable configuration", () => {
    const client = { from: vi.fn() };
    createClientMock.mockReturnValue(client);

    expect(createBrowserSupabaseClient(env)).toBe(client);
    expect(createClientMock).toHaveBeenCalledWith(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  });
});
