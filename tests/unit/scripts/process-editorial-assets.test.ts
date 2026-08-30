import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

sharp.cache(false);
sharp.concurrency(1);

const repoRoot = process.cwd();
const processor = resolve(repoRoot, "scripts/process-editorial-assets.mjs");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));
});

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "locallens-editorial-assets-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runProcessor(...args: string[]) {
  return spawnSync(process.execPath, [processor, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

async function writeRgbPng(filePath: string, width: number, height: number, pixels: Buffer) {
  await sharp(pixels, { raw: { width, height, channels: 3 } }).withMetadata({ density: 144 }).png().toFile(filePath);
}

describe("process-editorial-assets CLI", () => {
  it("crops photo sources to the requested dimensions and strips metadata", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "photo-source.png");
    const output = join(directory, "photo-output.webp");
    await writeRgbPng(source, 4, 2, Buffer.alloc(4 * 2 * 3, 90));

    const result = runProcessor("photo", source, output, "--width", "3", "--height", "3");

    expect(result.status, result.stderr).toBe(0);
    const metadata = await sharp(output).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 3, height: 3 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("converts mark luminance into antialiased alpha while applying the requested color", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "mark-source.png");
    const output = join(directory, "category-street-food.webp");
    const pixels = Buffer.alloc(256 * 256 * 3);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const value = x < 85 ? 0 : x < 170 ? 128 : 255;
        const index = (y * 256 + x) * 3;
        pixels[index] = value;
        pixels[index + 1] = value;
        pixels[index + 2] = value;
      }
    }
    await sharp(pixels, { raw: { width: 256, height: 256, channels: 3 } }).png().toFile(source);

    const result = runProcessor("mark", source, output, "--color", "#791312");

    expect(result.status, result.stderr).toBe(0);
    const decoded = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(decoded.info).toMatchObject({ width: 256, height: 256, channels: 4 });
    const pixelAt = (x: number) => decoded.data.subarray((x * 4), (x * 4) + 4);
    expect([...pixelAt(20)]).toEqual([0x79, 0x13, 0x12, 255]);
    expect(pixelAt(128)[3]).toBeGreaterThan(0);
    expect(pixelAt(128)[3]).toBeLessThan(255);
    expect(pixelAt(230)[3]).toBe(0);
  });

  it("checks transparent and opaque bounds, dimensions, decoding, and byte limits", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "mark-source.png");
    const output = join(directory, "category-history.webp");
    const pixels = Buffer.alloc(256 * 256 * 3, 255);
    pixels.fill(0, 0, 128 * 256 * 3);
    await sharp(pixels, { raw: { width: 256, height: 256, channels: 3 } }).png().toFile(source);

    const processResult = runProcessor("mark", source, output, "--color", "#17345F");
    expect(processResult.status, processResult.stderr).toBe(0);
    const checkResult = runProcessor("check", output);
    expect(checkResult.status, checkResult.stderr).toBe(0);

    const oversized = join(directory, "category-craft.webp");
    const randomPixels = randomBytes(256 * 256 * 3);
    await sharp(randomPixels, { raw: { width: 256, height: 256, channels: 3 } }).webp({ lossless: true }).toFile(oversized);
    const oversizedCheck = runProcessor("check", oversized);
    expect(oversizedCheck.status).not.toBe(0);
    expect(`${oversizedCheck.stdout}\n${oversizedCheck.stderr}`).toMatch(/size|limit/i);
  });

  it("rejects malformed photo input with a non-zero exit status", async () => {
    const directory = await temporaryDirectory();
    const result = runProcessor("photo", join(directory, "missing.png"), join(directory, "output.webp"), "--width", "10", "--height", "10");

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/input|decode|ENOENT|missing/i);
  });

  it("creates a side-by-side comparison only for same-size images", async () => {
    const directory = await temporaryDirectory();
    const left = join(directory, "left.png");
    const right = join(directory, "right.png");
    const comparison = join(directory, "comparison.png");
    await sharp({ create: { width: 4, height: 3, channels: 3, background: "#ffffff" } }).png().toFile(left);
    await sharp({ create: { width: 4, height: 3, channels: 3, background: "#791312" } }).png().toFile(right);

    const result = runProcessor("compare", left, right, comparison);

    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(comparison)).resolves.toBeInstanceOf(Buffer);
    await expect(sharp(comparison).metadata()).resolves.toMatchObject({ format: "png", width: 8, height: 3 });

    const mismatched = join(directory, "mismatched.png");
    await sharp({ create: { width: 5, height: 3, channels: 3, background: "#ffffff" } }).png().toFile(mismatched);
    const mismatchResult = runProcessor("compare", left, mismatched, comparison);
    expect(mismatchResult.status).not.toBe(0);
    expect(`${mismatchResult.stdout}\n${mismatchResult.stderr}`).toMatch(/same|dimension|size/i);
  });
});
