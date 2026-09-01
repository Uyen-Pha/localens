import { spawn, spawnSync } from "node:child_process";
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

function forceOwnedProcessTree(child, platform) {
  if (platform === "win32") {
    if (!Number.isInteger(child.pid) || child.pid <= 0) return false;
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return result.status === 0;
  }
  try {
    return child.kill("SIGKILL");
  } catch {
    return false;
  }
}

export function runNextMode({
  argv = process.argv.slice(2),
  cwd = fileURLToPath(new URL("..", import.meta.url)),
  executable = process.execPath,
  env = process.env,
  spawn: spawnChild = spawn,
  signals = process,
  platform = process.platform,
  forceOwnedTree = forceOwnedProcessTree,
  shutdownConfirmMs = 2_000,
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
    let shutdownTimer;
    let settled = false;
    const cleanup = () => {
      if (shutdownTimer) clearTimeout(shutdownTimer);
      signals.off("SIGINT", onSigint);
      signals.off("SIGTERM", onSigterm);
    };
    const finish = (status) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveCompletion(status);
    };
    const forward = (signal) => {
      if (shutdownSignal !== null) return;
      shutdownSignal = signal;
      if (platform === "win32") {
        const stopped = forceOwnedTree(child, platform);
        shutdownTimer = setTimeout(() => finish(stopped ? 0 : 1), shutdownConfirmMs);
        return;
      }
      try {
        if (!child.kill(signal)) finish(1);
      } catch {
        finish(1);
      }
    };
    const onSigint = () => forward("SIGINT");
    const onSigterm = () => forward("SIGTERM");
    signals.once("SIGINT", onSigint);
    signals.once("SIGTERM", onSigterm);
    child.once("error", () => {
      finish(1);
    });
    child.once("close", (status) => {
      finish(shutdownSignal === null ? status ?? 1 : 0);
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
