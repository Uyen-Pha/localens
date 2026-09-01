import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { once } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

const modulePath = path.resolve(process.cwd(), "scripts/static-preview-server.mjs");
const moduleUrl = pathToFileURL(modulePath).href;
const temporaryDirectories: string[] = [];

async function loadStaticPreviewServer() {
  expect(existsSync(modulePath)).toBe(true);
  return import(moduleUrl);
}

async function makeOutFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "localens-static-preview-"));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "en"), { recursive: true });
  await mkdir(path.join(root, "en", "tours", "__next.$d$locale", "tours"), { recursive: true });
  await writeFile(path.join(root, "en", "index.html"), "<h1>English</h1>");
  await writeFile(
    path.join(root, "en", "tours", "__next.$d$locale", "tours", "__PAGE__.txt"),
    "RSC payload",
  );
  await writeFile(path.join(root, "404.html"), "<h1>404</h1>");
  await writeFile(path.join(root, "styles.css"), "body { color: red; }");
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("static preview server", () => {
  it("resolves directory indexes and keeps traversal inside out", async () => {
    const { resolveStaticFile } = await loadStaticPreviewServer();
    const outDir = await makeOutFixture();

    expect(await resolveStaticFile(outDir, "/en/")).toEqual({
      filePath: path.join(outDir, "en", "index.html"),
      status: 200,
    });
    expect(await resolveStaticFile(outDir, "/missing/")).toEqual({
      filePath: path.join(outDir, "404.html"),
      status: 404,
    });
    expect(await resolveStaticFile(outDir, "/%2e%2e/package.json")).toEqual({
      filePath: path.join(outDir, "404.html"),
      status: 404,
    });
  });

  it("maps Next 16 flattened RSC request names to exported segment directories", async () => {
    const { resolveStaticFile } = await loadStaticPreviewServer();
    const outDir = await makeOutFixture();

    expect(
      await resolveStaticFile(
        outDir,
        "/en/tours/__next.$d$locale.tours.__PAGE__.txt?_rsc=fixture",
      ),
    ).toEqual({
      filePath: path.join(
        outDir,
        "en",
        "tours",
        "__next.$d$locale",
        "tours",
        "__PAGE__.txt",
      ),
      status: 200,
    });
  });

  it("does not serve a symlink whose real target is outside out", async () => {
    const { resolveStaticFile } = await loadStaticPreviewServer();
    const outDir = await makeOutFixture();
    const outsideDir = await mkdtemp(path.join(os.tmpdir(), "localens-outside-"));
    temporaryDirectories.push(outsideDir);
    const outsideFile = path.join(outsideDir, "secret.json");
    await writeFile(outsideFile, '{"secret":true}');

    try {
      await symlink(outsideFile, path.join(outDir, "escape.json"));
    } catch {
      return;
    }

    expect(await resolveStaticFile(outDir, "/escape.json")).toEqual({
      filePath: path.join(outDir, "404.html"),
      status: 404,
    });
  });

  it("serves static content with deterministic status and content types", async () => {
    const { startStaticPreviewServer } = await loadStaticPreviewServer();
    const outDir = await makeOutFixture();
    const preview = await startStaticPreviewServer({ outDir, port: 0 });

    try {
      const home = await fetch(`${preview.url}/en/`);
      expect(home.status).toBe(200);
      expect(home.headers.get("content-type")).toContain("text/html");
      expect(await home.text()).toContain("English");

      const styles = await fetch(`${preview.url}/styles.css`);
      expect(styles.status).toBe(200);
      expect(styles.headers.get("content-type")).toContain("text/css");

      const rsc = await fetch(
        `${preview.url}/en/tours/__next.$d$locale.tours.__PAGE__.txt?_rsc=fixture`,
      );
      expect(rsc.status).toBe(200);
      expect(rsc.headers.get("content-type")).toContain("text/plain");
      expect(await rsc.text()).toBe("RSC payload");

      const missing = await fetch(`${preview.url}/missing/`);
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain("404");

      const traversal = await fetch(`${preview.url}/%2e%2e/package.json`);
      expect(traversal.status).toBe(404);
      expect(await traversal.text()).toContain("404");
    } finally {
      await preview.close();
    }
  });

  it("rejects non-loopback binding", async () => {
    const { startStaticPreviewServer } = await loadStaticPreviewServer();
    const outDir = await makeOutFixture();

    await expect(
      startStaticPreviewServer({ outDir, host: "0.0.0.0", port: 0 }),
    ).rejects.toThrow(/loopback/i);
  });

  it("exits after SIGTERM even when a browser-style keep-alive request was served", async () => {
    const child = spawn(process.execPath, [modulePath, "--port", "0"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const listening = new Promise<string>((resolve, reject) => {
      child.once("error", reject);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("Static preview server listening at")) {
          resolve(output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? "");
        }
      });
    });

    try {
      const url = await listening;
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const response = await fetch(`${url}/en/`);
      await response.text();

      child.kill("SIGTERM");
      const closeResult = await Promise.race([
        once(child, "close"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("preview shutdown timed out")), 3_000),
        ),
      ]);
      expect(closeResult[0] === 0 || closeResult[1] === "SIGTERM").toBe(true);
    } finally {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  });
});
