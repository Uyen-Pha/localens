import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The executable JavaScript boundary is covered by focused runner tests.
import { runDemoE2E, runDemoE2EMain } from "@/scripts/run-demo-e2e.mjs";

describe("owned demo E2E runner", () => {
  it("starts a fixture-only demo server, runs Playwright against its base URL, and cleans up", async () => {
    const events: string[] = [];
    const serverEnvironments: Record<string, string | undefined>[] = [];
    const playwrightEnvironments: Record<string, string | undefined>[] = [];

    await runDemoE2E({
      cwd: "C:/repo",
      env: { Path: "C:/Windows/System32", PARENT_VALUE: "kept" },
      logger: vi.fn(),
      startServer: vi.fn(async (env: Record<string, string | undefined>) => {
        events.push("server:start");
        serverEnvironments.push(env);
        return { stop: vi.fn(async () => { events.push("server:stop"); }) };
      }),
      warmServer: vi.fn(async () => { events.push("server:warm"); }),
      runPlaywright: vi.fn(async (env: Record<string, string | undefined>) => {
        events.push("playwright");
        playwrightEnvironments.push(env);
        return { status: 0 };
      }),
    });

    expect(events).toEqual(["server:start", "server:warm", "playwright", "server:stop"]);
    expect(serverEnvironments[0]).toMatchObject({
      NEXT_PUBLIC_LOCALLENS_RUNTIME: "demo",
      NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
    });
    expect(playwrightEnvironments[0]).toMatchObject({
      PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3300",
      NEXT_PUBLIC_LOCALLENS_E2E_FIXTURES: "1",
    });
  });

  it("cleans the owned server after Playwright failure and preserves a stable error", async () => {
    const stop = vi.fn(async () => {});
    const error = await runDemoE2E({
      cwd: "C:/repo",
      env: {},
      logger: vi.fn(),
      startServer: vi.fn(async () => ({ stop })),
      warmServer: vi.fn(async () => undefined),
      runPlaywright: vi.fn(async () => ({ status: 7 })),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "DEMO_E2E_PLAYWRIGHT_FAILED", status: 7 });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("stops the owned server when deterministic route warmup fails", async () => {
    const stop = vi.fn(async () => undefined);
    const error = await runDemoE2E({
      cwd: "C:/repo",
      env: {},
      logger: vi.fn(),
      startServer: vi.fn(async () => ({ stop })),
      warmServer: vi.fn(async () => { throw new Error("warmup-secret"); }),
      runPlaywright: vi.fn(),
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "DEMO_E2E_FAILED" });
    expect(String(error)).not.toContain("warmup-secret");
    expect(stop).toHaveBeenCalledOnce();
  });

  it("main redacts unknown failures", async () => {
    const errorLogger = vi.fn();
    const status = await runDemoE2EMain({
      run: async () => { throw new Error("parent-secret"); },
      errorLogger,
    });

    expect(status).toBe(2);
    expect(errorLogger).toHaveBeenCalledWith("DEMO_E2E_FAILED: demo browser acceptance failed");
    expect(errorLogger.mock.calls.flat().join(" ")).not.toContain("parent-secret");
  });

  it("main preserves the stable cleanup marker when startup and owned-server cleanup both fail", async () => {
    const errorLogger = vi.fn();
    const startupError = Object.assign(new Error("startup-secret"), {
      serverCleanupError: new Error("cleanup-secret"),
    });

    const status = await runDemoE2EMain({
      run: async () => { throw startupError; },
      errorLogger,
    });

    expect(status).toBe(2);
    expect(errorLogger).toHaveBeenNthCalledWith(1, "DEMO_E2E_FAILED: demo browser acceptance failed");
    expect(errorLogger).toHaveBeenNthCalledWith(
      2,
      "DEMO_E2E_CLEANUP_FAILED: owned demo server cleanup could not be confirmed",
    );
    expect(errorLogger.mock.calls.flat().join(" ")).not.toMatch(/startup-secret|cleanup-secret/);
  });
});
