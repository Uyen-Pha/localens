import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parsePublicEnv } from "@/lib/env/public";

const validSource = {
  NEXT_PUBLIC_APP_URL: "https://localens.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_demo",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAA_demo",
};

describe("public environment contract", () => {
  it("returns the normalized browser-safe configuration", () => {
    expect(
      parsePublicEnv({
        ...validSource,
        STRIPE_SECRET_KEY: "edge-function-only",
      }),
    ).toEqual(validSource);
  });

  it("accepts an omitted Turnstile site key when Turnstile is disabled", () => {
    const source = { ...validSource };
    Reflect.deleteProperty(source, "NEXT_PUBLIC_TURNSTILE_SITE_KEY");

    expect(parsePublicEnv(source)).toEqual(source);
  });

  it("rejects a missing publishable key", () => {
    expect(() =>
      parsePublicEnv({
        ...validSource,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow();
  });

  it("rejects a non-HTTP(S) application URL", () => {
    expect(() =>
      parsePublicEnv({
        ...validSource,
        NEXT_PUBLIC_APP_URL: "ftp://localens.example.com",
      }),
    ).toThrow();
  });

  it("accepts mixed-case HTTP(S) schemes for app and Supabase URLs", () => {
    const source = {
      ...validSource,
      NEXT_PUBLIC_APP_URL: "HtTpS://localens.example.com",
      NEXT_PUBLIC_SUPABASE_URL: "HTTPS://project.supabase.co",
    };

    expect(parsePublicEnv(source)).toEqual(source);
  });

  it("reports malformed URLs as ZodError", () => {
    expect(() =>
      parsePublicEnv({
        ...validSource,
        NEXT_PUBLIC_APP_URL: "not a url",
      }),
    ).toThrow(z.ZodError);
  });
});
