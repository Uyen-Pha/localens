// @vitest-environment node

import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("public repository hygiene", () => {
  it("ignores generated runtime logs without hiding source files", () => {
    const result = spawnSync(
      "git",
      ["check-ignore", "--no-index", "--stdin"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        input: ["demo-final.stdout.log", ".env.local", "app/page.tsx", ""].join("\n"),
        windowsHide: true,
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/)).toEqual([
      "demo-final.stdout.log",
      ".env.local",
    ]);
  });
});
