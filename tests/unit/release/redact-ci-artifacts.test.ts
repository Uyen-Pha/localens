import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("CI failure artifact redactor", () => {
  it("copies only redacted text evidence and excludes binary Playwright artifacts", () => {
    const root = mkdtempSync(join(tmpdir(), "localens-ci-redaction-"));
    roots.push(root);
    const logs = join(root, "ci-logs");
    const report = join(root, "playwright-report");
    const results = join(root, "test-results");
    const output = join(root, "safe-output");
    mkdirSync(logs);
    mkdirSync(report);
    mkdirSync(results);

    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
    const githubToken = "ghp_unsafeGithubTokenFixture1234567890";
    const genericToken = "unsafe-generic-control-token";
    const basicCredential = Buffer.from("unsafe-user:unsafe-password").toString("base64");
    const privateKey = [
      "-----BEGIN PRIVATE KEY-----",
      "unsafe-private-key-material",
      "-----END PRIVATE KEY-----",
    ].join("\n");
    const encryptedPrivateKey = [
      "-----BEGIN ENCRYPTED PRIVATE KEY-----",
      "unsafe-encrypted-private-key-material",
      "-----END ENCRYPTED PRIVATE KEY-----",
    ].join("\n");
    writeFileSync(join(logs, "runtime.log"), [
      "DATABASE_URL=postgresql://postgres:unsafe@127.0.0.1:54322/postgres",
      `Authorization: Bearer ${jwt}`,
      `Authorization: Basic ${basicCredential}`,
      "SUPABASE_SERVICE_ROLE_KEY=sb_secret_unsafe-value",
      "ACCESS_TOKEN=unsafe-token",
      `GITHUB_TOKEN=${githubToken}`,
      `LOCALENS_RUNTIME_GEMINI_CONTROL_TOKEN=${genericToken}`,
      privateKey,
      encryptedPrivateKey,
    ].join("\n"));
    const embeddedZip = Buffer.from(`archive:${jwt}:sb_secret_inside-html-archive`).toString("base64");
    writeFileSync(
      join(report, "index.html"),
      `<template id="playwrightReportBase64">data:application/zip;base64,${embeddedZip}</template>`,
    );
    writeFileSync(join(report, "summary.json"), JSON.stringify({ token: jwt, key: "sb_publishable_unsafe-value" }));
    writeFileSync(join(report, "trace.zip"), Buffer.from([0, 1, 2, ...Buffer.from("sb_secret_inside-archive")]));
    writeFileSync(join(results, "screenshot.png"), Buffer.from([0, 1, 2, 3]));

    const run = spawnSync(process.execPath, [
      join(process.cwd(), "scripts", "redact-ci-artifacts.mjs"),
      output,
      logs,
      report,
      results,
    ], { encoding: "utf8" });

    expect(run.status, run.stderr).toBe(0);
    const safeLog = readFileSync(join(output, "ci-logs", "runtime.log"), "utf8");
    const safeReport = readFileSync(join(output, "playwright-report", "summary.json"), "utf8");
    expect(safeLog).not.toContain("unsafe");
    expect(safeLog).not.toContain(jwt);
    expect(safeLog).not.toContain(githubToken);
    expect(safeLog).not.toContain(genericToken);
    expect(safeLog).not.toContain(basicCredential);
    expect(safeLog).not.toContain("BEGIN PRIVATE KEY");
    expect(safeLog).not.toContain("BEGIN ENCRYPTED PRIVATE KEY");
    expect(safeLog).toContain("[REDACTED_DATABASE_URL]");
    expect(safeLog).toContain("[REDACTED]");
    expect(safeReport).not.toContain(jwt);
    expect(safeReport).not.toContain("sb_publishable_unsafe-value");
    expect(existsSync(join(output, "playwright-report", "index.html"))).toBe(false);
    expect(existsSync(join(output, "playwright-report", "trace.zip"))).toBe(false);
    expect(existsSync(join(output, "test-results", "screenshot.png"))).toBe(false);

    const manifest = JSON.parse(readFileSync(join(output, "redaction-manifest.json"), "utf8")) as {
      copied: string[];
      skipped: string[];
    };
    expect(manifest.copied).toEqual(expect.arrayContaining([
      "ci-logs/runtime.log",
      "playwright-report/summary.json",
    ]));
    expect(manifest.skipped).toEqual(expect.arrayContaining([
      "playwright-report/trace.zip",
      "playwright-report/index.html",
      "test-results/screenshot.png",
    ]));
  });

  it("fails closed instead of reusing a possibly unsafe output directory", () => {
    const root = mkdtempSync(join(tmpdir(), "localens-ci-redaction-existing-"));
    roots.push(root);
    const logs = join(root, "ci-logs");
    const output = join(root, "safe-output");
    mkdirSync(logs);
    mkdirSync(output);
    writeFileSync(join(output, "sentinel.txt"), "do-not-upload");

    const run = spawnSync(process.execPath, [
      join(process.cwd(), "scripts", "redact-ci-artifacts.mjs"),
      output,
      logs,
    ], { encoding: "utf8" });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("refusing to reuse artifact directory");
    expect(readFileSync(join(output, "sentinel.txt"), "utf8")).toBe("do-not-upload");
  });
});
