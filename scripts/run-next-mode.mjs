import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: run-next-mode.mjs <dev|build> <demo|supabase> [next arguments...]";

function parseArguments(argv) {
  const [command, mode, ...nextArguments] = argv;
  if ((command !== "dev" && command !== "build") || (mode !== "demo" && mode !== "supabase")) {
    const error = new Error(usage);
    error.code = "NEXT_MODE_USAGE";
    throw error;
  }
  return { command, mode, nextArguments };
}

export function runNextMode({
  argv = process.argv.slice(2),
  cwd = fileURLToPath(new URL("..", import.meta.url)),
  executable = process.execPath,
  env = process.env,
  spawn: spawnChild = spawn,
  signals = process,
} = {}) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    return Promise.reject(error);
  }
  const nextBinary = resolve(cwd, "node_modules", "next", "dist", "bin", "next");
  const child = spawnChild(executable, [nextBinary, parsed.command, ...parsed.nextArguments], {
    cwd,
    env: { ...env, NEXT_PUBLIC_LOCALLENS_RUNTIME: parsed.mode },
    stdio: "inherit",
    windowsHide: true,
  });

  return new Promise((resolveCompletion) => {
    let shutdownSignal = null;
    const cleanup = () => {
      signals.off("SIGINT", onSigint);
      signals.off("SIGTERM", onSigterm);
    };
    const forward = (signal) => {
      if (shutdownSignal !== null) return;
      shutdownSignal = signal;
      child.kill(signal);
    };
    const onSigint = () => forward("SIGINT");
    const onSigterm = () => forward("SIGTERM");
    signals.once("SIGINT", onSigint);
    signals.once("SIGTERM", onSigterm);
    child.once("error", () => {
      cleanup();
      resolveCompletion(1);
    });
    child.once("close", (status) => {
      cleanup();
      resolveCompletion(shutdownSignal === null ? status ?? 1 : 0);
    });
  });
}

async function main() {
  try {
    process.exitCode = await runNextMode();
  } catch (error) {
    console.error(error?.code === "NEXT_MODE_USAGE" ? error.message : "Unable to start the project-local Next binary.");
    process.exitCode = error?.code === "NEXT_MODE_USAGE" ? 2 : 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
