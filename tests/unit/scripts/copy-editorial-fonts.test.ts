import { mkdtemp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const packageContracts = [
  {
    name: "@fontsource/cormorant-garamond",
    version: "5.3.0",
    source: "cormorant-garamond-latin-600-normal.woff2",
    destination: "public/fonts/cormorant-garamond-600.woff2",
    licenseDestination: "public/fonts/OFL-Cormorant-Garamond.txt",
  },
  {
    name: "@fontsource/manrope",
    version: "5.3.0",
    source: "manrope-latin-400-normal.woff2",
    destination: "public/fonts/manrope-400.woff2",
    licenseDestination: "public/fonts/OFL-Manrope.txt",
  },
  {
    name: "@fontsource/manrope",
    version: "5.3.0",
    source: "manrope-latin-600-normal.woff2",
    destination: "public/fonts/manrope-600.woff2",
    licenseDestination: "public/fonts/OFL-Manrope.txt",
  },
] as const;

const scriptPath = path.resolve(process.cwd(), "scripts/copy-editorial-fonts.mjs");

async function loadCopyScript() {
  return import(pathToFileURL(scriptPath).href);
}

async function createFontPackageFixture(root: string) {
  const packages = new Map<string, { version: string; files: Record<string, string> }>();

  for (const contract of packageContracts) {
    const packageFixture = packages.get(contract.name) ?? {
      version: contract.version,
      files: { LICENSE: `${contract.name} OFL-1.1 license` },
    };
    packageFixture.files[contract.source] = `${contract.name}/${contract.source}`;
    packages.set(contract.name, packageFixture);
  }

  for (const [packageName, packageFixture] of packages) {
    const packageDirectory = path.join(root, "node_modules", ...packageName.split("/"));
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      path.join(packageDirectory, "package.json"),
      JSON.stringify({ name: packageName, version: packageFixture.version }),
    );
    for (const [fileName, contents] of Object.entries(packageFixture.files)) {
      const filePath = fileName === "LICENSE"
        ? path.join(packageDirectory, fileName)
        : path.join(packageDirectory, "files", fileName);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, contents);
    }
  }
}

function isLinkCreationPermissionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EPERM" || error.code === "EACCES")
  );
}

describe("copy-editorial-fonts", () => {
  it("pins the two reproducible Fontsource packages to version 5.3.0", async () => {
    const packageVersions = await Promise.all(
      [...new Set(packageContracts.map(({ name }) => name))].map(async (name) => {
        const packageJson = JSON.parse(
          await readFile(path.join(process.cwd(), "node_modules", ...name.split("/"), "package.json"), "utf8"),
        ) as { version?: string };
        return [name, packageJson.version] as const;
      }),
    );

    expect(Object.fromEntries(packageVersions)).toEqual({
      "@fontsource/cormorant-garamond": "5.3.0",
      "@fontsource/manrope": "5.3.0",
    });
  });

  it("copies only the exact source files, renamed licenses, and destinations", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "localens-editorial-fonts-"));

    try {
      await createFontPackageFixture(fixtureRoot);
      const { copyEditorialFonts, FONT_COPY_PLAN } = await loadCopyScript();

      expect(FONT_COPY_PLAN).toEqual(packageContracts);
      await copyEditorialFonts({ repositoryRoot: fixtureRoot });

      for (const contract of packageContracts) {
        const packageSource = path.join(
          fixtureRoot,
          "node_modules",
          ...contract.name.split("/"),
          "files",
          contract.source,
        );
        const output = path.join(fixtureRoot, contract.destination);
        expect(await readFile(output, "utf8")).toBe(await readFile(packageSource, "utf8"));
        const licenseOutput = path.join(fixtureRoot, contract.licenseDestination);
        expect(await readFile(licenseOutput, "utf8")).toBe(
          `${contract.name} OFL-1.1 license`,
        );
      }
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("refuses to copy when an installed package has an unexpected version", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "localens-editorial-fonts-"));

    try {
      await createFontPackageFixture(fixtureRoot);
      await writeFile(
        path.join(fixtureRoot, "node_modules", "@fontsource", "manrope", "package.json"),
        JSON.stringify({ name: "@fontsource/manrope", version: "5.3.1" }),
      );
      const { copyEditorialFonts } = await loadCopyScript();

      await expect(copyEditorialFonts({ repositoryRoot: fixtureRoot })).rejects.toThrow(
        "@fontsource/manrope must be version 5.3.0",
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("rejects a linked public/fonts directory before writing outside the repository", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "localens-editorial-fonts-"));
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "localens-editorial-fonts-outside-"));
    const publicRoot = path.join(fixtureRoot, "public");
    const outsideFonts = path.join(outsideRoot, "fonts");
    const linkedOutput = path.join(publicRoot, "fonts");
    let linkCreated = false;

    try {
      await createFontPackageFixture(fixtureRoot);
      await mkdir(publicRoot, { recursive: true });
      await mkdir(outsideFonts, { recursive: true });

      try {
        await symlink(outsideFonts, linkedOutput, process.platform === "win32" ? "junction" : "dir");
        linkCreated = true;
      } catch (error) {
        if (isLinkCreationPermissionError(error)) {
          console.warn(`Skipping linked output safety regression: ${String(error)}`);
          return;
        }
        throw error;
      }

      const { copyEditorialFonts } = await loadCopyScript();

      await expect(copyEditorialFonts({ repositoryRoot: fixtureRoot })).rejects.toThrow(
        /font output directory.*(symbolic|symlink|junction|reparse|canonical)/i,
      );
      expect(await readdir(outsideFonts)).toEqual([]);
    } finally {
      if (linkCreated) await unlink(linkedOutput).catch(() => undefined);
      await rm(fixtureRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });
});
