import { copyFile, lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_VERSION = "5.3.0";
export const FONT_COPY_PLAN = Object.freeze([
  Object.freeze({
    name: "@fontsource/cormorant-garamond",
    version: EXPECTED_VERSION,
    source: "cormorant-garamond-latin-600-normal.woff2",
    destination: "public/fonts/cormorant-garamond-600.woff2",
    licenseDestination: "public/fonts/OFL-Cormorant-Garamond.txt",
  }),
  Object.freeze({
    name: "@fontsource/manrope",
    version: EXPECTED_VERSION,
    source: "manrope-latin-400-normal.woff2",
    destination: "public/fonts/manrope-400.woff2",
    licenseDestination: "public/fonts/OFL-Manrope.txt",
  }),
  Object.freeze({
    name: "@fontsource/manrope",
    version: EXPECTED_VERSION,
    source: "manrope-latin-600-normal.woff2",
    destination: "public/fonts/manrope-600.woff2",
    licenseDestination: "public/fonts/OFL-Manrope.txt",
  }),
]);

function fail(message) {
  throw new Error(message);
}

function assertContained(basePath, candidatePath, label, { direct = false } = {}) {
  const base = resolve(basePath);
  const candidate = resolve(candidatePath);
  const candidateRelative = relative(base, candidate);

  if (
    !candidateRelative ||
    candidateRelative === ".." ||
    candidateRelative.startsWith(`..${sep}`) ||
    isAbsolute(candidateRelative) ||
    (direct && candidateRelative.includes(sep))
  ) {
    fail(`${label} must stay inside ${base}`);
  }

  return candidate;
}

function isMissingPathError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

async function canonicalRepositoryRoot(repositoryRoot) {
  const root = resolve(repositoryRoot);
  try {
    return await realpath(root);
  } catch (error) {
    fail(`repository root cannot be resolved: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function assertSafeDestinationChain(repositoryRoot, destinationRoot) {
  const root = resolve(repositoryRoot);
  const destination = resolve(destinationRoot);
  const canonicalRoot = await canonicalRepositoryRoot(root);
  const destinationRelative = assertContained(root, destination, "font output directory").slice(root.length + 1);
  let current = root;

  for (const segment of destinationRelative.split(sep)) {
    current = join(current, segment);
    let currentInfo;
    try {
      currentInfo = await lstat(current);
    } catch (error) {
      if (isMissingPathError(error)) break;
      fail(`font output directory cannot be inspected: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (currentInfo.isSymbolicLink()) {
      fail("font output directory must not contain a symbolic link, junction, or reparse point");
    }

    let currentCanonical;
    try {
      currentCanonical = await realpath(current);
    } catch (error) {
      fail(`font output directory cannot be canonicalized: ${error instanceof Error ? error.message : String(error)}`);
    }
    const expectedCanonical = resolve(canonicalRoot, relative(root, current));
    if (currentCanonical !== expectedCanonical) {
      fail("font output directory canonical path must stay inside the repository root");
    }
    if (!currentInfo.isDirectory()) {
      fail("font output directory chain must contain only directories");
    }
  }

  return canonicalRoot;
}

async function assertRegularFile(filePath, label) {
  let fileInfo;
  try {
    fileInfo = await lstat(filePath);
  } catch (error) {
    fail(`${label} is missing: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!fileInfo.isFile()) {
    fail(`${label} must be a regular file`);
  }
}

async function readPinnedPackage(packageRoot, packageName) {
  const packageDirectory = assertContained(
    join(packageRoot, "node_modules"),
    join(packageRoot, "node_modules", ...packageName.split("/")),
    `${packageName} package path`,
  );
  const packageJsonPath = assertContained(
    packageDirectory,
    join(packageDirectory, "package.json"),
    `${packageName} package metadata`,
    { direct: true },
  );
  await assertRegularFile(packageJsonPath, `${packageName} package metadata`);

  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  } catch (error) {
    fail(`${packageName} package metadata is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (packageJson.name !== packageName) {
    fail(`${packageName} package metadata has unexpected name ${packageJson.name ?? "missing"}`);
  }
  if (packageJson.version !== EXPECTED_VERSION) {
    fail(`${packageName} must be version ${EXPECTED_VERSION}, found ${packageJson.version ?? "missing"}`);
  }

  return packageDirectory;
}

async function copyChecked(sourcePath, destinationPath, label) {
  await assertRegularFile(sourcePath, `${label} source`);
  const destinationInfo = await lstat(destinationPath).catch(() => null);
  if (destinationInfo?.isSymbolicLink()) {
    fail(`${label} destination must not be a symbolic link`);
  }
  await copyFile(sourcePath, destinationPath);
}

/** Copy the pinned Fontsource files and licenses into the repository's public font directory. */
export async function copyEditorialFonts({ repositoryRoot = REPOSITORY_ROOT } = {}) {
  const root = resolve(repositoryRoot);
  const outputRoot = assertContained(root, join(root, "public", "fonts"), "font output directory");
  await assertSafeDestinationChain(root, outputRoot);
  const operations = [];
  const licenses = new Map();

  for (const contract of FONT_COPY_PLAN) {
    const packageDirectory = await readPinnedPackage(root, contract.name);
    const sourcePath = assertContained(
      packageDirectory,
      join(packageDirectory, "files", contract.source),
      `${contract.name} source`,
    );
    const destinationPath = assertContained(
      outputRoot,
      join(root, contract.destination),
      `${contract.destination} destination`,
      { direct: true },
    );
    const licenseSource = assertContained(
      packageDirectory,
      join(packageDirectory, "LICENSE"),
      `${contract.name} license`,
      { direct: true },
    );
    const licenseDestination = assertContained(
      outputRoot,
      join(root, contract.licenseDestination),
      `${contract.licenseDestination} destination`,
      { direct: true },
    );

    if (sourcePath === destinationPath || licenseSource === licenseDestination) {
      fail("font source and output paths must be different");
    }

    operations.push({ sourcePath, destinationPath, label: contract.source });
    if (!licenses.has(licenseDestination)) {
      licenses.set(licenseDestination, { sourcePath: licenseSource, label: contract.name });
    }
  }

  for (const operation of operations) {
    await assertRegularFile(operation.sourcePath, `${operation.label} source`);
  }
  for (const { sourcePath, label } of licenses.values()) {
    await assertRegularFile(sourcePath, `${label} license source`);
  }

  await mkdir(outputRoot, { recursive: true });
  await assertSafeDestinationChain(root, outputRoot);
  for (const operation of operations) {
    await copyChecked(operation.sourcePath, operation.destinationPath, operation.label);
  }
  for (const [destinationPath, { sourcePath, label }] of licenses) {
    await copyChecked(sourcePath, destinationPath, `${label} license`);
  }

  return {
    files: operations.map(({ destinationPath }) => destinationPath),
    licenses: [...licenses.keys()],
  };
}

function usage() {
  return "Usage: node scripts/copy-editorial-fonts.mjs";
}

async function main(args) {
  if (args.length !== 0) fail(usage());
  const result = await copyEditorialFonts();
  for (const filePath of [...result.files, ...result.licenses]) {
    console.log(`copied ${filePath}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
