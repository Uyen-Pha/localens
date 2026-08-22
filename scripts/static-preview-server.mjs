import { createServer } from "node:http";
import { realpath, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_PORT = 3100;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
};

function isContained(rootDir, candidatePath) {
  const relativePath = path.relative(rootDir, candidatePath);
  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
}

function decodePath(requestUrl) {
  let pathname;

  try {
    pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  } catch {
    return null;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (
    !decodedPath.startsWith("/") ||
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    decodedPath.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }

  return decodedPath;
}

async function notFoundFile(rootDir) {
  const filePath = path.join(rootDir, "404.html");
  try {
    const resolvedFilePath = await realpath(filePath);
    const details = await stat(resolvedFilePath);
    return details.isFile() && isContained(rootDir, resolvedFilePath)
      ? resolvedFilePath
      : null;
  } catch {
    return null;
  }
}

export async function resolveStaticFile(outDir, requestUrl) {
  const rootDir = await realpath(path.resolve(outDir)).catch(() =>
    path.resolve(outDir),
  );
  const decodedPath = decodePath(requestUrl);

  if (decodedPath === null) {
    return {
      filePath: await notFoundFile(rootDir),
      status: 404,
    };
  }

  const relativePath = decodedPath.replace(/^\/+/, "") || "index.html";
  let candidatePath = path.resolve(rootDir, relativePath);

  if (!isContained(rootDir, candidatePath)) {
    return {
      filePath: await notFoundFile(rootDir),
      status: 404,
    };
  }

  try {
    candidatePath = await realpath(candidatePath);
    if (!isContained(rootDir, candidatePath)) {
      return {
        filePath: await notFoundFile(rootDir),
        status: 404,
      };
    }

    let details = await stat(candidatePath);
    if (details.isDirectory()) {
      candidatePath = path.join(candidatePath, "index.html");
      if (!isContained(rootDir, candidatePath)) {
        return {
          filePath: await notFoundFile(rootDir),
          status: 404,
        };
      }
      candidatePath = await realpath(candidatePath);
      if (!isContained(rootDir, candidatePath)) {
        return {
          filePath: await notFoundFile(rootDir),
          status: 404,
        };
      }
      details = await stat(candidatePath);
    }

    if (details.isFile()) {
      return { filePath: candidatePath, status: 200 };
    }
  } catch {
    // Missing and unreadable routes use the exported 404 artifact below.
  }

  return {
    filePath: await notFoundFile(rootDir),
    status: 404,
  };
}

export function contentTypeFor(filePath) {
  return (
    CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

export async function handleStaticRequest(request, response, outDir) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("allow", "GET, HEAD");
    response.end("Method Not Allowed");
    return;
  }

  const resolved = await resolveStaticFile(outDir, request.url ?? "/");
  if (!resolved?.filePath) {
    response.statusCode = 404;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(request.method === "HEAD" ? undefined : "Not Found");
    return;
  }

  response.statusCode = resolved.status;
  response.setHeader("content-type", contentTypeFor(resolved.filePath));

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  try {
    response.end(await readFile(resolved.filePath));
  } catch {
    response.statusCode = 404;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end("Not Found");
  }
}

export function createStaticPreviewServer({
  outDir = path.resolve(process.cwd(), "out"),
  host = LOOPBACK_HOST,
} = {}) {
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Static preview server only supports loopback hosts");
  }

  return createServer((request, response) => {
    handleStaticRequest(request, response, outDir).catch(() => {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("content-type", "text/plain; charset=utf-8");
      }
      response.end("Internal Server Error");
    });
  });
}

export async function startStaticPreviewServer(options = {}) {
  const host = options.host ?? LOOPBACK_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const server = createStaticPreviewServer({ ...options, host, port });

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Static preview server did not expose a TCP address");
  }

  return {
    server,
    url: `http://${host}:${address.port}`,
    close: () => closeServer(server),
  };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.code !== "ERR_SERVER_NOT_RUNNING") {
        reject(error);
        return;
      }
      resolve();
    });
    // Playwright keeps HTTP/1.1 connections alive between requests. Drain
    // them explicitly so SIGTERM always produces a deterministic shutdown.
    server.closeAllConnections?.();
  });
}

function cliPort() {
  const index = process.argv.indexOf("--port");
  if (index >= 0 && process.argv[index + 1]) {
    return Number(process.argv[index + 1]);
  }
  return Number(process.env.PORT ?? DEFAULT_PORT);
}

const invokedScript = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (invokedScript === import.meta.url) {
  const preview = await startStaticPreviewServer({ port: cliPort() });
  console.log(`Static preview server listening at ${preview.url}`);

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    setTimeout(() => process.exit(0), 2_000).unref();
    preview.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
