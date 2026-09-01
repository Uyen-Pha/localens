import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The executable JavaScript boundary is covered by focused process tests.
import { runNextMode } from "@/scripts/run-next-mode.mjs";

describe("run-next-mode child lifecycle", () => {
  it("forwards shutdown only to its owned Next child and waits for that child to close", async () => {
    const signals = new EventEmitter();
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn((signal: string) => {
      queueMicrotask(() => child.emit("close", null, signal));
      return true;
    });
    const spawn = vi.fn(() => child);

    const completion = runNextMode({
      argv: ["dev", "demo", "--hostname", "127.0.0.1", "--port", "3300"],
      cwd: "C:/repo",
      executable: "C:/node/node.exe",
      spawn,
      signals,
      env: { ORIGINAL: "kept" },
      platform: "linux",
    });
    signals.emit("SIGTERM");

    await expect(completion).resolves.toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      "C:/node/node.exe",
      expect.arrayContaining(["dev", "--hostname", "127.0.0.1", "--port", "3300"]),
      expect.objectContaining({ env: { ORIGINAL: "kept", NEXT_PUBLIC_LOCALLENS_RUNTIME: "demo" } }),
    );
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  });

  it("uses a bounded owned-tree stop on Windows instead of leaving a Next descendant alive", async () => {
    const signals = new EventEmitter();
    const child = new EventEmitter() as EventEmitter & {
      kill: ReturnType<typeof vi.fn>;
      pid: number;
    };
    child.pid = 4321;
    child.kill = vi.fn(() => true);
    const forceOwnedTree = vi.fn(() => {
      queueMicrotask(() => child.emit("close", null, "SIGTERM"));
      return true;
    });

    const completion = runNextMode({
      argv: ["dev", "demo", "--hostname", "127.0.0.1", "--port", "3300"],
      cwd: "C:/repo",
      executable: "C:/node/node.exe",
      spawn: vi.fn(() => child),
      signals,
      env: {},
      platform: "win32",
      forceOwnedTree,
      shutdownConfirmMs: 0,
    });
    signals.emit("SIGTERM");

    await expect(completion).resolves.toBe(0);
    expect(forceOwnedTree).toHaveBeenCalledWith(child, "win32");
    expect(child.kill).not.toHaveBeenCalled();
    expect(signals.listenerCount("SIGTERM")).toBe(0);
    expect(signals.listenerCount("SIGINT")).toBe(0);
  }, 1_000);
});
