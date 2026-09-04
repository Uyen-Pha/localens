// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { GEMINI_MODEL } from "@/supabase/functions/_shared/gemini-ranker";
import { parseItineraryEdgeEnv } from "@/supabase/functions/_shared/edge-env";

const validSource = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_test_value",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_value",
  LOCALLENS_QUOTA_HMAC_KEY: "localens-test-quota-key-32-bytes-minimum",
  ALLOWED_ORIGINS: "https://localens.vercel.app",
  LOCALLENS_GEMINI_ENABLED: "1",
  GEMINI_API_KEY: "gemini-test-key",
  GEMINI_MODEL,
};

describe("itinerary Edge environment", () => {
  it("maps exact server variables into the adapter configuration", () => {
    expect(parseItineraryEdgeEnv({ ...validSource, UNRELATED: "ignored" })).toEqual({
      supabaseUrl: validSource.SUPABASE_URL,
      supabaseAnonKey: validSource.SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: validSource.SUPABASE_SERVICE_ROLE_KEY,
      quotaHmacKey: validSource.LOCALLENS_QUOTA_HMAC_KEY,
      allowedOrigins: ["https://localens.vercel.app"],
      geminiEnabled: true,
      geminiApiKey: validSource.GEMINI_API_KEY,
      geminiModel: GEMINI_MODEL,
    });
  });

  it("accepts only the pinned Gemini model and the 0/1 feature flag", () => {
    for (const value of ["gemini-flash-latest", "gemini-3.6-pro", "", " GEMINI_MODEL "]) {
      expect(() => parseItineraryEdgeEnv({ ...validSource, GEMINI_MODEL: value })).toThrow(z.ZodError);
    }
    for (const value of ["true", "false", "2", "", undefined]) {
      expect(() => parseItineraryEdgeEnv({ ...validSource, LOCALLENS_GEMINI_ENABLED: value })).toThrow(z.ZodError);
    }
    expect(parseItineraryEdgeEnv({ ...validSource, GEMINI_MODEL: undefined }).geminiModel).toBe(GEMINI_MODEL);
  });

  it("requires a Gemini API key only while Gemini is enabled", () => {
    expect(() => parseItineraryEdgeEnv({ ...validSource, GEMINI_API_KEY: undefined })).toThrow(z.ZodError);

    const disabled = parseItineraryEdgeEnv({
      ...validSource,
      LOCALLENS_GEMINI_ENABLED: "0",
      GEMINI_API_KEY: undefined,
    });
    expect(disabled).toMatchObject({ geminiEnabled: false, geminiModel: GEMINI_MODEL });
    expect(disabled).not.toHaveProperty("geminiApiKey");
  });

  it("parses a bounded comma-separated HTTPS origin allowlist", () => {
    expect(parseItineraryEdgeEnv({
      ...validSource,
      ALLOWED_ORIGINS: "https://localens.vercel.app, https://preview.localens.example",
    }).allowedOrigins).toEqual([
      "https://localens.vercel.app",
      "https://preview.localens.example",
    ]);

    for (const value of [
      "*",
      "https://localens.vercel.app/route",
      "https://user:password@localens.vercel.app",
      "http://public.example",
      "https://localens.vercel.app,https://localens.vercel.app",
      "https://localens.vercel.app,",
    ]) {
      expect(() => parseItineraryEdgeEnv({ ...validSource, ALLOWED_ORIGINS: value })).toThrow(z.ZodError);
    }
  });

  it("allows HTTP only for loopback origins and Supabase during local runtime", () => {
    const parsed = parseItineraryEdgeEnv({
      ...validSource,
      SUPABASE_URL: "http://127.0.0.1:54321",
      ALLOWED_ORIGINS: "http://localhost:3200,http://127.0.0.1:3000",
    });
    expect(parsed.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(parsed.allowedOrigins).toEqual(["http://localhost:3200", "http://127.0.0.1:3000"]);

    expect(parseItineraryEdgeEnv({
      ...validSource,
      SUPABASE_URL: "http://kong:8000",
    }).supabaseUrl).toBe("http://kong:8000");
    expect(() => parseItineraryEdgeEnv({
      ...validSource,
      SUPABASE_URL: "http://kong:8001",
    })).toThrow(z.ZodError);
    expect(() => parseItineraryEdgeEnv({
      ...validSource,
      ALLOWED_ORIGINS: "http://kong:8000",
    })).toThrow(z.ZodError);
  });

  it("rejects missing, blank, padded, controlled, or weak server secrets", () => {
    for (const [key, value] of [
      ["SUPABASE_URL", undefined],
      ["SUPABASE_ANON_KEY", ""],
      ["SUPABASE_SERVICE_ROLE_KEY", " padded-secret "],
      ["SUPABASE_SERVICE_ROLE_KEY", "secret\nvalue"],
      ["LOCALLENS_QUOTA_HMAC_KEY", "too-short"],
    ] as const) {
      expect(() => parseItineraryEdgeEnv({ ...validSource, [key]: value })).toThrow(z.ZodError);
    }
  });

  it("documents every server-only variable without committing a value or public prefix", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    for (const key of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "LOCALLENS_QUOTA_HMAC_KEY",
      "ALLOWED_ORIGINS",
      "LOCALLENS_GEMINI_ENABLED",
      "GEMINI_API_KEY",
      "GEMINI_MODEL",
    ]) {
      expect(example).toMatch(new RegExp(`^${key}=(?:\\r?\\n|$)`, "m"));
    }
    expect(example).not.toMatch(/NEXT_PUBLIC_(?:GEMINI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|LOCALLENS_QUOTA_HMAC_KEY)/);
  });
});
