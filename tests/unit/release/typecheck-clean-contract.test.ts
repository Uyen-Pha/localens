// @vitest-environment node

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("typecheck release contract", () => {
  it("leaves tracked source unchanged after a successful project typecheck", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "localens-typecheck-contract-"));
    const checkout = join(temporaryRoot, "checkout");
    temporaryRoots.push(temporaryRoot);

    const clone = spawnSync(
      "git",
      ["clone", "--quiet", "--no-local", projectRoot, checkout],
      { encoding: "utf8", windowsHide: true },
    );
    expect(clone.status, clone.stderr).toBe(0);

    writeFileSync(
      join(checkout, "package.json"),
      readFileSync(join(projectRoot, "package.json")),
    );
    symlinkSync(
      join(projectRoot, "node_modules"),
      join(checkout, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const statusBefore = spawnSync(
      "git",
      ["status", "--short", "--untracked-files=no"],
      { cwd: checkout, encoding: "utf8", windowsHide: true },
    );
    expect(statusBefore.status, statusBefore.stderr).toBe(0);

    const typecheck = process.platform === "win32"
      ? spawnSync("corepack pnpm typecheck", {
          cwd: checkout,
          encoding: "utf8",
          shell: true,
          windowsHide: true,
        })
      : spawnSync("corepack", ["pnpm", "typecheck"], {
          cwd: checkout,
          encoding: "utf8",
          windowsHide: true,
        });
    expect(
      typecheck.status,
      `${typecheck.error?.message ?? ""}\n${typecheck.stdout}\n${typecheck.stderr}`,
    ).toBe(0);

    const statusAfter = spawnSync(
      "git",
      ["status", "--short", "--untracked-files=no"],
      { cwd: checkout, encoding: "utf8", windowsHide: true },
    );
    expect(statusAfter.status, statusAfter.stderr).toBe(0);
    expect(statusAfter.stdout).toBe(statusBefore.stdout);
  }, 120_000);
});
