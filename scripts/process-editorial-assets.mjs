import { mkdir, stat } from "node:fs/promises";
import { dirname, basename } from "node:path";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PRODUCTION_ASSET_ROOT = resolve(REPOSITORY_ROOT, "public", "images", "editorial");
export const QA_EVIDENCE_ROOT = resolve(REPOSITORY_ROOT, "docs", "design", "qa");

export const EDITORIAL_ASSETS = Object.freeze({
  "saigon-artisan-hero.webp": Object.freeze({ width: 1600, height: 1200, maxBytes: 900 * 1024, kind: "photo" }),
  "saigon-post-office-inset.webp": Object.freeze({ width: 720, height: 960, maxBytes: 500 * 1024, kind: "photo" }),
  "category-street-food.webp": Object.freeze({ width: 256, height: 256, maxBytes: 80 * 1024, kind: "mark", color: "#791312" }),
  "category-history.webp": Object.freeze({ width: 256, height: 256, maxBytes: 80 * 1024, kind: "mark", color: "#17345F" }),
  "category-craft.webp": Object.freeze({ width: 256, height: 256, maxBytes: 80 * 1024, kind: "mark", color: "#B56E00" }),
  "category-market.webp": Object.freeze({ width: 256, height: 256, maxBytes: 80 * 1024, kind: "mark", color: "#17345F" }),
});

const MARK_SIZE = 256;

function fail(message) {
  throw new Error(message);
}

function assertPositiveDimension(value, label) {
  const dimension = Number(value);
  if (!Number.isInteger(dimension) || dimension <= 0) {
    fail(`${label} must be a positive integer`);
  }
  return dimension;
}

function parseColor(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value ?? "")) {
    fail(`color must be a six-digit hex value, received ${value ?? "missing"}`);
  }
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

async function ensureParent(filePath) {
  await mkdir(dirname(resolve(filePath)), { recursive: true });
}

function expectedAsset(filePath) {
  const name = basename(filePath);
  const config = EDITORIAL_ASSETS[name];
  if (!config) {
    fail(`unknown editorial asset name: ${name}`);
  }
  return config;
}

function hasTraversalSegment(filePath) {
  return /(^|[\\/])\.\.($|[\\/])/.test(filePath);
}

function resolveRepositoryInput(inputPath) {
  return resolve(REPOSITORY_ROOT, inputPath);
}

function resolveProductionOutput(outputPath, kind) {
  if (isAbsolute(outputPath)) {
    fail("output path must be relative to the repository root");
  }
  if (hasTraversalSegment(outputPath)) {
    fail("output path must not contain traversal segments");
  }
  const resolvedOutput = resolve(REPOSITORY_ROOT, outputPath);
  const productionRelative = relative(PRODUCTION_ASSET_ROOT, resolvedOutput);
  if (!productionRelative || productionRelative.startsWith(`..${sep}`) || isAbsolute(productionRelative) || productionRelative.includes(sep)) {
    fail("output path must be a direct file in the production editorial asset allowlist");
  }
  const config = EDITORIAL_ASSETS[basename(resolvedOutput)];
  if (!config || (kind && config.kind !== kind)) {
    fail(`output path is not an allowlisted ${kind ?? "editorial"} production asset`);
  }
  return resolvedOutput;
}

function resolveQaOutput(outputPath) {
  if (isAbsolute(outputPath)) {
    fail("comparison output path must be relative to the repository root");
  }
  if (hasTraversalSegment(outputPath)) {
    fail("comparison output path must not contain traversal segments");
  }
  const resolvedOutput = resolve(REPOSITORY_ROOT, outputPath);
  const qaRelative = relative(QA_EVIDENCE_ROOT, resolvedOutput);
  if (!qaRelative || qaRelative.startsWith(`..${sep}`) || isAbsolute(qaRelative)) {
    fail("comparison output path must stay inside docs/design/qa");
  }
  if (!resolvedOutput.toLowerCase().endsWith(".png")) {
    fail("comparison output path must be a PNG evidence file");
  }
  return resolvedOutput;
}

function assertDistinctOutput(outputPath, ...inputPaths) {
  const normalizedOutput = process.platform === "win32" ? outputPath.toLowerCase() : outputPath;
  for (const inputPath of inputPaths) {
    const normalizedInput = process.platform === "win32" ? inputPath.toLowerCase() : inputPath;
    if (normalizedOutput === normalizedInput) {
      fail("output path must differ from every input path; refusing to overwrite input");
    }
  }
}

function assertKnownOptions(options, allowed, command) {
  const unknown = Object.keys(options).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) {
    fail(`unknown option for ${command}: --${unknown[0]}`);
  }
}

/** Process a documentary image into an exact-size, metadata-free WebP. */
export async function photo(inputPath, outputPath, options = {}) {
  const config = EDITORIAL_ASSETS[basename(outputPath)];
  const width = assertPositiveDimension(options.width ?? config?.width, "width");
  const height = assertPositiveDimension(options.height ?? config?.height, "height");
  await ensureParent(outputPath);
  await sharp(inputPath, { failOn: "error" })
    .resize({ width, height, fit: "cover", position: "attention" })
    .webp({ quality: 82, effort: 6 })
    .toFile(outputPath);
}

/** Convert a black-on-white mark to a colorized, antialiased transparent WebP. */
export async function mark(inputPath, outputPath, options = {}) {
  const config = expectedAsset(outputPath);
  const [red, green, blue] = parseColor(options.color ?? config.color);
  const resized = await sharp(inputPath, { failOn: "error" })
    .resize({
      width: MARK_SIZE,
      height: MARK_SIZE,
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (resized.info.width !== MARK_SIZE || resized.info.height !== MARK_SIZE || resized.info.channels !== 3) {
    fail("mark source could not be normalized to a 256 x 256 RGB image");
  }

  const rgba = Buffer.alloc(MARK_SIZE * MARK_SIZE * 4);
  for (let sourceIndex = 0, outputIndex = 0; sourceIndex < resized.data.length; sourceIndex += 3, outputIndex += 4) {
    const luminance = 0.2126 * resized.data[sourceIndex] + 0.7152 * resized.data[sourceIndex + 1] + 0.0722 * resized.data[sourceIndex + 2];
    rgba[outputIndex] = red;
    rgba[outputIndex + 1] = green;
    rgba[outputIndex + 2] = blue;
    rgba[outputIndex + 3] = Math.max(0, Math.min(255, Math.round(255 - luminance)));
  }

  await ensureParent(outputPath);
  await sharp(rgba, { raw: { width: MARK_SIZE, height: MARK_SIZE, channels: 4 } })
    .webp({ lossless: true })
    .toFile(outputPath);
}

async function checkOne(outputPath) {
  const config = expectedAsset(outputPath);
  const fileSize = (await stat(outputPath)).size;
  if (fileSize > config.maxBytes) {
    fail(`${basename(outputPath)} exceeds size limit (${fileSize} bytes > ${config.maxBytes} bytes)`);
  }

  const metadata = await sharp(outputPath, { failOn: "error" }).metadata();
  if (metadata.format !== "webp") {
    fail(`${basename(outputPath)} must decode as WebP, received ${metadata.format ?? "unknown"}`);
  }
  if (metadata.width !== config.width || metadata.height !== config.height) {
    fail(`${basename(outputPath)} must be ${config.width} x ${config.height}, received ${metadata.width ?? "?"} x ${metadata.height ?? "?"}`);
  }

  let alphaBounds;
  if (config.kind === "mark") {
    if (!metadata.hasAlpha || metadata.channels !== 4) {
      fail(`${basename(outputPath)} must contain an alpha channel`);
    }
    const decoded = await sharp(outputPath, { failOn: "error" }).raw().toBuffer({ resolveWithObject: true });
    let hasTransparent = false;
    let hasOpaque = false;
    for (let index = 3; index < decoded.data.length; index += decoded.info.channels) {
      hasTransparent ||= decoded.data[index] === 0;
      hasOpaque ||= decoded.data[index] === 255;
      if (hasTransparent && hasOpaque) break;
    }
    alphaBounds = { hasTransparent, hasOpaque };
    if (!hasTransparent || !hasOpaque) {
      fail(`${basename(outputPath)} must contain both transparent and opaque alpha pixels`);
    }
  }

  return { file: outputPath, bytes: fileSize, width: metadata.width, height: metadata.height, alphaBounds };
}

/** Validate one or more production outputs against the asset contract. */
export async function check(outputPaths = []) {
  const paths = outputPaths.length > 0 ? outputPaths : Object.keys(EDITORIAL_ASSETS).map((name) => join("public", "images", "editorial", name));
  const results = [];
  for (const outputPath of paths) {
    results.push(await checkOne(outputPath));
  }
  return results;
}

/** Create a same-size PNG comparison with the two inputs placed side by side. */
export async function compare(leftPath, rightPath, outputPath) {
  const [leftMetadata, rightMetadata] = await Promise.all([
    sharp(leftPath, { failOn: "error" }).metadata(),
    sharp(rightPath, { failOn: "error" }).metadata(),
  ]);
  if (leftMetadata.width !== rightMetadata.width || leftMetadata.height !== rightMetadata.height) {
    fail(`compare requires same-size images, received ${leftMetadata.width ?? "?"} x ${leftMetadata.height ?? "?"} and ${rightMetadata.width ?? "?"} x ${rightMetadata.height ?? "?"}`);
  }
  const width = leftMetadata.width;
  const height = leftMetadata.height;
  if (!width || !height) fail("compare inputs must have decodable dimensions");
  const [left, right] = await Promise.all([sharp(leftPath, { failOn: "error" }).png().toBuffer(), sharp(rightPath, { failOn: "error" }).png().toBuffer()]);
  await ensureParent(outputPath);
  await sharp({ create: { width: width * 2, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: width, top: 0 },
    ])
    .png()
    .toFile(outputPath);
}

function parseArgs(args) {
  const positional = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const [rawName, inlineValue] = argument.slice(2).split("=", 2);
    const name = rawName.replaceAll("-", "");
    const value = inlineValue ?? args[++index];
    if (value === undefined || value.startsWith("--")) fail(`missing value for --${rawName}`);
    options[name] = value;
  }
  return { positional, options };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/process-editorial-assets.mjs photo <input> <output> [--width <px> --height <px>]",
    "  node scripts/process-editorial-assets.mjs mark <input> <output> [--color <#RRGGBB>]",
    "  node scripts/process-editorial-assets.mjs check [<output> ...]",
    "  node scripts/process-editorial-assets.mjs compare <left> <right> <output>",
  ].join("\n");
}

async function main(args) {
  const [command, ...rest] = args;
  const { positional, options } = parseArgs(rest);
  if (!command) fail(usage());
  if (command === "photo") {
    if (positional.length !== 2) fail(usage());
    assertKnownOptions(options, ["width", "height"], command);
    const inputPath = resolveRepositoryInput(positional[0]);
    const outputPath = resolveProductionOutput(positional[1], "photo");
    assertDistinctOutput(outputPath, inputPath);
    await photo(inputPath, outputPath, { width: options.width, height: options.height });
    return;
  }
  if (command === "mark") {
    if (positional.length !== 2) fail(usage());
    assertKnownOptions(options, ["color"], command);
    const inputPath = resolveRepositoryInput(positional[0]);
    const outputPath = resolveProductionOutput(positional[1], "mark");
    assertDistinctOutput(outputPath, inputPath);
    await mark(inputPath, outputPath, { color: options.color });
    return;
  }
  if (command === "check") {
    assertKnownOptions(options, [], command);
    const paths = positional.map((path) => resolveProductionOutput(path));
    const results = await check(paths);
    for (const result of results) {
      const alpha = result.alphaBounds ? ` alpha=transparent:${result.alphaBounds.hasTransparent},opaque:${result.alphaBounds.hasOpaque}` : "";
      console.log(`ok ${result.file} ${result.width}x${result.height} ${result.bytes} bytes${alpha}`);
    }
    return;
  }
  if (command === "compare") {
    if (positional.length !== 3) fail(usage());
    assertKnownOptions(options, [], command);
    const leftPath = resolveRepositoryInput(positional[0]);
    const rightPath = resolveRepositoryInput(positional[1]);
    const outputPath = resolveQaOutput(positional[2]);
    assertDistinctOutput(outputPath, leftPath, rightPath);
    await compare(leftPath, rightPath, outputPath);
    return;
  }
  fail(`unknown command: ${command}\n${usage()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
