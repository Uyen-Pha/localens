import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const SAFE_TEXT_EXTENSIONS = new Set([
  ".json",
  ".log",
  ".md",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
const REDACTIONS = [
  [
    /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  ],
  [/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]"],
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "[REDACTED_SUPABASE_KEY]"],
  [/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/(PASSWORD|SECRET|SERVICE_ROLE_KEY|ACCESS_TOKEN)=([^\s"'<>]+)/gi, "$1=[REDACTED]"],
  [/(Authorization\s*[:=]\s*)(?:(?:Bearer|Basic)\s+)?[^\s"',;<>]+/gi, "$1[REDACTED]"],
  [/(Cookie\s*[:=]\s*)[^\r\n]+/gi, "$1[REDACTED]"],
  [
    /((?:"|')?[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|PRIVATE_KEY|API_KEY|APIKEY)(?:"|')?\s*[:=]\s*(?:"|')?)[^"'\s,;<>]+/gi,
    "$1[REDACTED]",
  ],
  [/((?:api[-_]?key|apikey)\s*[:=]\s*)[^\s"',;<>]+/gi, "$1[REDACTED]"],
];

function portable(value) {
  return value.split(path.sep).join("/");
}

function redact(value) {
  let safe = value;
  for (const [pattern, replacement] of REDACTIONS) safe = safe.replace(pattern, replacement);
  return safe;
}

function shouldCopyText(file) {
  if (!SAFE_TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) return false;
  if (statSync(file).size > MAX_TEXT_BYTES) return false;
  return !readFileSync(file).includes(0);
}

function visit(sourceRoot, entry, destinationRoot, label, manifest) {
  for (const item of readdirSync(entry, { withFileTypes: true })) {
    const source = path.join(entry, item.name);
    const relative = portable(path.relative(sourceRoot, source));
    const manifestPath = `${label}/${relative}`;
    if (item.isSymbolicLink()) {
      manifest.skipped.push(manifestPath);
    } else if (item.isDirectory()) {
      visit(sourceRoot, source, destinationRoot, label, manifest);
    } else if (!item.isFile() || !shouldCopyText(source)) {
      manifest.skipped.push(manifestPath);
    } else {
      const target = path.join(destinationRoot, label, relative);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, redact(readFileSync(source, "utf8")), "utf8");
      manifest.copied.push(manifestPath);
    }
  }
}

export function prepareRedactedArtifacts(destination, sources) {
  const destinationRoot = path.resolve(destination);
  if (existsSync(destinationRoot)) {
    throw new Error(`refusing to reuse artifact directory: ${destinationRoot}`);
  }
  mkdirSync(destinationRoot, { recursive: true });
  const manifest = { copied: [], skipped: [] };

  for (const sourceValue of sources) {
    const sourceRoot = path.resolve(sourceValue);
    const label = path.basename(sourceRoot);
    if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
      manifest.skipped.push(`${label}/`);
      continue;
    }
    visit(sourceRoot, sourceRoot, destinationRoot, label, manifest);
  }

  manifest.copied.sort();
  manifest.skipped.sort();
  writeFileSync(
    path.join(destinationRoot, "redaction-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [destination, ...sources] = process.argv.slice(2);
  if (!destination || sources.length === 0) {
    console.error("usage: node scripts/redact-ci-artifacts.mjs DESTINATION SOURCE...");
    process.exitCode = 2;
  } else {
    prepareRedactedArtifacts(destination, sources);
  }
}
