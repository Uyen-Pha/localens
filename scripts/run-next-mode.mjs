import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [command, mode, ...nextArguments] = process.argv.slice(2);

if (command !== "dev" && command !== "build") {
  console.error("Usage: run-next-mode.mjs <dev|build> <demo|supabase> [next arguments...]");
  process.exit(2);
}

if (mode !== "demo" && mode !== "supabase") {
  console.error("Usage: run-next-mode.mjs <dev|build> <demo|supabase> [next arguments...]");
  process.exit(2);
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const nextBinary = resolve(projectRoot, "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBinary, command, ...nextArguments], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NEXT_PUBLIC_LOCALLENS_RUNTIME: mode,
  },
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error("Unable to start the project-local Next binary.");
  process.exit(1);
}

process.exit(result.status ?? 1);
