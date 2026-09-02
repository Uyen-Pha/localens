import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

import { buildSecurityHeaders } from "../../../lib/security/headers";

const mutableEnv = process.env as Record<string, string | undefined>;
const envKeys = [
  "NEXT_PUBLIC_LOCALLENS_RUNTIME",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VERCEL_ENV",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function headerMap(
  headers: ReadonlyArray<{ key: string; value: string }>,
): Map<string, string> {
  return new Map(headers.map(({ key, value }) => [key, value]));
}

function cspDirective(csp: string, name: string): string {
  return csp
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith(`${name} `)) ?? "";
}

async function configFor(input: {
  runtime: "demo" | "supabase";
  phase?: string;
  supabaseUrl?: string;
  vercelEnvironment?: string;
}) {
  vi.resetModules();
  mutableEnv.NEXT_PUBLIC_LOCALLENS_RUNTIME = input.runtime;
  if (input.supabaseUrl === undefined) delete mutableEnv.NEXT_PUBLIC_SUPABASE_URL;
  else mutableEnv.NEXT_PUBLIC_SUPABASE_URL = input.supabaseUrl;
  if (input.vercelEnvironment === undefined) delete mutableEnv.VERCEL_ENV;
  else mutableEnv.VERCEL_ENV = input.vercelEnvironment;

  const { default: nextConfig } = await import("../../../next.config");
  return nextConfig(input.phase ?? PHASE_DEVELOPMENT_SERVER);
}

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete mutableEnv[key];
    else mutableEnv[key] = value;
  }
  vi.resetModules();
});

describe("buildSecurityHeaders", () => {
  it("returns the required browser protections and denies framing", () => {
    const headers = headerMap(buildSecurityHeaders({ runtime: "demo" }));

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toBeTruthy();
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("does not allow wildcards in sensitive CSP source directives", () => {
    const csp = headerMap(buildSecurityHeaders({ runtime: "demo" })).get(
      "Content-Security-Policy",
    );

    expect(csp).toBeDefined();
    for (const directive of ["default-src", "script-src", "connect-src"]) {
      expect(cspDirective(csp!, directive)).not.toMatch(/(?:^|\s)\*(?:\s|$)/);
    }
  });

  it("adds only the canonical HTTPS Supabase origin to connect-src", () => {
    const csp = headerMap(buildSecurityHeaders({
      runtime: "supabase",
      supabaseUrl: "https://user:secret@Project.Supabase.co:443/rest/v1?token=secret#fragment",
    })).get("Content-Security-Policy")!;
    const connectSrc = cspDirective(csp, "connect-src");

    expect(connectSrc).toContain("https://project.supabase.co");
    expect(connectSrc).not.toMatch(/user|secret|rest\/v1|token|fragment/i);
  });

  it.each([undefined, "", "not-a-url", "ftp://project.supabase.co"])(
    "rejects a missing or malformed Supabase URL: %s",
    (supabaseUrl) => {
      expect(() => buildSecurityHeaders({ runtime: "supabase", supabaseUrl }))
        .toThrow(/Supabase URL/i);
    },
  );

  it("rejects public HTTP Supabase origins", () => {
    expect(() => buildSecurityHeaders({
      runtime: "supabase",
      supabaseUrl: "http://project.supabase.co",
    })).toThrow(/HTTPS/i);
  });

  it.each([
    "http://localhost:54321/rest/v1",
    "http://127.0.0.1:54321/auth/v1",
    "http://[::1]:54321/storage/v1",
  ])("allows local HTTP Supabase origin %s", (supabaseUrl) => {
    const csp = headerMap(buildSecurityHeaders({ runtime: "supabase", supabaseUrl }))
      .get("Content-Security-Policy")!;

    expect(cspDirective(csp, "connect-src")).toContain(new URL(supabaseUrl).origin);
  });

  it.each(["development", "preview"] as const)(
    "omits HSTS in Vercel %s",
    (vercelEnvironment) => {
      const headers = headerMap(buildSecurityHeaders({
        runtime: "supabase",
        supabaseUrl: "https://project.supabase.co",
        vercelEnvironment,
      }));

      expect(headers.has("Strict-Transport-Security")).toBe(false);
    },
  );

  it("adds HSTS only in Vercel production", () => {
    const headers = headerMap(buildSecurityHeaders({
      runtime: "supabase",
      supabaseUrl: "https://project.supabase.co",
      vercelEnvironment: "production",
    }));

    expect(headers.get("Strict-Transport-Security")).toMatch(/max-age=/);
  });

  it("allows eval only for an explicitly development policy", () => {
    const developmentCsp = headerMap(buildSecurityHeaders({
      runtime: "supabase",
      supabaseUrl: "https://project.supabase.co",
      vercelEnvironment: "development",
    })).get("Content-Security-Policy")!;
    const unknownCsp = headerMap(buildSecurityHeaders({
      runtime: "supabase",
      supabaseUrl: "https://project.supabase.co",
    })).get("Content-Security-Policy")!;

    expect(cspDirective(developmentCsp, "script-src")).toContain("'unsafe-eval'");
    expect(cspDirective(unknownCsp, "script-src")).not.toContain("'unsafe-eval'");
  });
});

describe("Next runtime security header configuration", () => {
  it("omits the headers own property from demo config", async () => {
    const config = await configFor({ runtime: "demo", phase: PHASE_PRODUCTION_BUILD });

    expect(Object.hasOwn(config, "headers")).toBe(false);
    expect(config.output).toBe("export");
  });

  it("returns the helper output for every Supabase route", async () => {
    const supabaseUrl = "https://project.supabase.co/path?ignored=yes";
    const config = await configFor({
      runtime: "supabase",
      phase: PHASE_PRODUCTION_BUILD,
      supabaseUrl,
      vercelEnvironment: "production",
    });

    expect(Object.hasOwn(config, "headers")).toBe(true);
    expect(config.headers).toBeTypeOf("function");
    await expect(config.headers!()).resolves.toEqual([{
      source: "/(.*)",
      headers: buildSecurityHeaders({
        runtime: "supabase",
        supabaseUrl,
        vercelEnvironment: "production",
      }),
    }]);
  });

  it.each([
    { name: "missing", vercelEnvironment: undefined },
    { name: "unknown", vercelEnvironment: "self-hosted" },
    { name: "preview", vercelEnvironment: "preview" },
    { name: "production", vercelEnvironment: "production" },
  ])("omits unsafe-eval from $name production builds", async ({ vercelEnvironment }) => {
    const config = await configFor({
      runtime: "supabase",
      phase: PHASE_PRODUCTION_BUILD,
      supabaseUrl: "https://project.supabase.co",
      vercelEnvironment,
    });
    const [{ headers }] = await config.headers!();
    const csp = headerMap(headers).get("Content-Security-Policy")!;

    expect(cspDirective(csp, "script-src")).not.toContain("'unsafe-eval'");
  });

  it("includes unsafe-eval for the Next development phase without VERCEL_ENV", async () => {
    const config = await configFor({
      runtime: "supabase",
      phase: PHASE_DEVELOPMENT_SERVER,
      supabaseUrl: "http://127.0.0.1:54321",
    });
    const [{ headers }] = await config.headers!();
    const csp = headerMap(headers).get("Content-Security-Policy")!;

    expect(cspDirective(csp, "script-src")).toContain("'unsafe-eval'");
  });
});
