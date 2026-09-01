import { describe, expect, it } from "vitest";

import { parseBrowserRuntimeConfig, parseRuntimeMode } from "@/lib/env/runtime";

describe("runtime mode configuration", () => {
  it("accepts the two supported runtime modes", () => {
    expect(parseRuntimeMode("demo")).toBe("demo");
    expect(parseRuntimeMode("supabase")).toBe("supabase");
  });

  it("rejects missing and unsupported runtime modes without inferring a default", () => {
    expect(() => parseRuntimeMode(undefined)).toThrow(/NEXT_PUBLIC_LOCALLENS_RUNTIME/);
    expect(() => parseRuntimeMode("production")).toThrow(/demo.*supabase/);
  });

  it("returns a demo config without requiring Supabase variables", () => {
    expect(parseBrowserRuntimeConfig({ NEXT_PUBLIC_LOCALLENS_RUNTIME: "demo" })).toEqual({ mode: "demo" });
  });

  it("ignores Supabase placeholders in demo mode", () => {
    expect(
      parseBrowserRuntimeConfig({
        NEXT_PUBLIC_LOCALLENS_RUNTIME: "demo",
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toEqual({ mode: "demo" });
  });

  it("requires public Supabase configuration in Supabase mode", () => {
    expect(() =>
      parseBrowserRuntimeConfig({
        NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      }),
    ).toThrow();
  });

  it("returns a discriminated Supabase browser configuration", () => {
    expect(
      parseBrowserRuntimeConfig({
        NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-key",
      }),
    ).toEqual({
      mode: "supabase",
      supabaseUrl: "http://127.0.0.1:54321",
      supabasePublishableKey: "local-test-key",
    });
  });

  it("names public variables without printing rejected values", () => {
    const rejectedUrl = "ftp://do-not-print.example.com";

    try {
      parseBrowserRuntimeConfig({
        NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: rejectedUrl,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
      });
      throw new Error("Expected Supabase URL validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect((error as Error).message).not.toContain(rejectedUrl);
    }

    try {
      parseBrowserRuntimeConfig({
        NEXT_PUBLIC_LOCALLENS_RUNTIME: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      });
      throw new Error("Expected Supabase publishable-key validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    }
  });
});
