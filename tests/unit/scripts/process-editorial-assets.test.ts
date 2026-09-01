import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { check, compare, mark, photo } from "@/scripts/process-editorial-assets.mjs";

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

    await photo(source, output, { width: 3, height: 3 });
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

    await mark(source, output, { color: "#791312" });
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

    await mark(source, output, { color: "#17345F" });
    await expect(check([output])).resolves.toHaveLength(1);

    const oversized = join(directory, "category-craft.webp");
    const randomPixels = randomBytes(256 * 256 * 3);
    await sharp(randomPixels, { raw: { width: 256, height: 256, channels: 3 } }).webp({ lossless: true }).toFile(oversized);
    await expect(check([oversized])).rejects.toThrow(/size|limit/i);
  });

  it("rejects malformed photo input", async () => {
    const directory = await temporaryDirectory();
    await expect(photo(join(directory, "missing.png"), join(directory, "output.webp"), { width: 10, height: 10 })).rejects.toThrow(/input|decode|ENOENT|missing/i);
  });

  it("rejects corrupt bytes and marks without independent transparent and opaque alpha bounds", async () => {
    const directory = await temporaryDirectory();
    const corrupt = join(directory, "category-history.webp");
    await writeFile(corrupt, Buffer.from("not an image"));
    await expect(check([corrupt])).rejects.toThrow(/Input|decode|corrupt|invalid/i);

    const opaque = join(directory, "category-market.webp");
    await sharp({ create: { width: 256, height: 256, channels: 3, background: "#17345F" } }).webp({ lossless: true }).toFile(opaque);
    await expect(check([opaque])).rejects.toThrow(/alpha/i);
  });

  it("creates a side-by-side comparison only for same-size images", async () => {
    const directory = await temporaryDirectory();
    const left = join(directory, "left.png");
    const right = join(directory, "right.png");
    const comparison = join(directory, "comparison.png");
    await sharp({ create: { width: 4, height: 3, channels: 3, background: "#ffffff" } }).png().toFile(left);
    await sharp({ create: { width: 4, height: 3, channels: 3, background: "#791312" } }).png().toFile(right);

    await compare(left, right, comparison);
    await expect(readFile(comparison)).resolves.toBeInstanceOf(Buffer);
    await expect(sharp(comparison).metadata()).resolves.toMatchObject({ format: "png", width: 8, height: 3 });
    const decoded = await sharp(comparison).raw().toBuffer({ resolveWithObject: true });
    expect([...decoded.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...decoded.data.subarray(4 * 4, 4 * 4 + 4)]).toEqual([0x79, 0x13, 0x12, 255]);

    const mismatched = join(directory, "mismatched.png");
    await sharp({ create: { width: 5, height: 3, channels: 3, background: "#ffffff" } }).png().toFile(mismatched);
    await expect(compare(left, mismatched, comparison)).rejects.toThrow(/same|dimension|size/i);
  });

  it("keeps CLI writes inside the production allowlist and rejects hostile output paths", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "source.png");
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ffffff" } }).png().toFile(source);

    const traversal = runProcessor("photo", source, "public/images/editorial/../outside.webp", "--width", "1600", "--height", "1200");
    expect(traversal.status).not.toBe(0);
    expect(`${traversal.stdout}\n${traversal.stderr}`).toMatch(/allowlist|production|path|output/i);

    const outOfScope = runProcessor("photo", source, "out/hero.webp", "--width", "1600", "--height", "1200");
    expect(outOfScope.status).not.toBe(0);
    expect(`${outOfScope.stdout}\n${outOfScope.stderr}`).toMatch(/allowlist|production|path|output/i);

    const absolute = runProcessor("photo", source, join(directory, "absolute.webp"), "--width", "1600", "--height", "1200");
    expect(absolute.status).not.toBe(0);
    expect(`${absolute.stdout}\n${absolute.stderr}`).toMatch(/relative|path|output/i);

    const equalsInput = runProcessor("photo", "public/images/editorial/saigon-artisan-hero.webp", "public/images/editorial/saigon-artisan-hero.webp");
    expect(equalsInput.status).not.toBe(0);
    expect(`${equalsInput.stdout}\n${equalsInput.stderr}`).toMatch(/input|output|overwrite|same/i);

    const markEqualsInput = runProcessor("mark", "public/images/editorial/category-street-food.webp", "public/images/editorial/category-street-food.webp", "--color", "#791312");
    expect(markEqualsInput.status).not.toBe(0);
    expect(`${markEqualsInput.stdout}\n${markEqualsInput.stderr}`).toMatch(/input|output|overwrite|same/i);

    const compareOutOfScope = runProcessor("compare", source, source, "out/comparison.png");
    expect(compareOutOfScope.status).not.toBe(0);
    expect(`${compareOutOfScope.stdout}\n${compareOutOfScope.stderr}`).toMatch(/docs\/design\/qa|path|scope/i);
  }, 15_000);

  it("rejects invalid dimensions, colors, and unknown flags at the CLI boundary", async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, "source.png");
    await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ffffff" } }).png().toFile(source);

    const invalidDimensions = runProcessor("photo", source, "public/images/editorial/saigon-artisan-hero.webp", "--width", "0", "--height", "1200");
    expect(invalidDimensions.status).not.toBe(0);
    expect(`${invalidDimensions.stdout}\n${invalidDimensions.stderr}`).toMatch(/width|positive|dimension/i);

    const invalidColor = runProcessor("mark", source, "public/images/editorial/category-street-food.webp", "--color", "#123");
    expect(invalidColor.status).not.toBe(0);
    expect(`${invalidColor.stdout}\n${invalidColor.stderr}`).toMatch(/color|hex/i);

    const unknownFlag = runProcessor("check", "--unknown", "value");
    expect(unknownFlag.status).not.toBe(0);
    expect(`${unknownFlag.stdout}\n${unknownFlag.stderr}`).toMatch(/unknown|option|flag/i);

    const unsafeCheck = runProcessor("check", "out/hero.webp");
    expect(unsafeCheck.status).not.toBe(0);
    expect(`${unsafeCheck.stdout}\n${unsafeCheck.stderr}`).toMatch(/allowlist|production|path|output/i);

    const safeProductionCheck = runProcessor("check", "public/images/editorial/saigon-artisan-hero.webp");
    expect(safeProductionCheck.status, safeProductionCheck.stderr).toBe(0);
  });
});
