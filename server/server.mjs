import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { createClaudeMetricsService } from "./claudeMetrics.mjs";
import { sendError, sendJson } from "./http.mjs";

const PORT = Number(process.env.PORT || 4310);
const DIST_DIR = path.resolve(process.cwd(), "dist");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
};

async function serveStatic(res, distDir, pathname) {
  const urlPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(distDir, urlPath);

  let real;
  try {
    real = await fs.realpath(filePath);
  } catch {
    return serveIndexFallback(res, distDir);
  }

  if (!real.startsWith(distDir)) {
    sendError(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(real);
    const ext = path.extname(real).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    sendError(res, 404, "Not found");
  }
}

async function serveIndexFallback(res, distDir) {
  const fallback = path.join(distDir, "index.html");
  try {
    const html = await fs.readFile(fallback);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    sendError(res, 500, "Build output not found. Run: npm run build");
  }
}

export function createRequestHandler({
  distDir = DIST_DIR,
  metricsService = createClaudeMetricsService(),
} = {}) {
  const routeHandlers = new Map([
    [
      "/api/metrics",
      async (_requestUrl, _req, res) => {
        try {
          const result = await metricsService.loadMetrics();
          sendJson(res, 200, result);
        } catch (error) {
          sendError(
            res,
            500,
            "Failed to load .claude metrics",
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    ],
    [
      "/api/session-details",
      async (requestUrl, _req, res) => {
        const sessionId = requestUrl.searchParams.get("sessionId") || "";
        const projectPath = requestUrl.searchParams.get("projectPath") || "";
        if (!sessionId) {
          sendError(res, 400, "sessionId query parameter is required.");
          return;
        }

        try {
          const details = await metricsService.loadSessionProjectLogDetails(
            sessionId,
            projectPath,
          );
          sendJson(res, 200, details);
        } catch (error) {
          sendError(
            res,
            500,
            "Failed to load session project log details",
            error instanceof Error ? error.message : String(error),
          );
        }
      },
    ],
    [
      "/api/health",
      async (_requestUrl, _req, res) => {
        const health = await metricsService.getHealth({ distDir });
        sendJson(res, 200, health);
      },
    ],
  ]);

  return async function requestHandler(req, res) {
    if (!req.url) {
      sendError(res, 400, "Invalid request");
      return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method && req.method !== "GET") {
      sendError(res, 405, "Read-only server. Only GET is allowed.");
      return;
    }

    const routeHandler =
      routeHandlers.get(requestUrl.pathname) ||
      (requestUrl.pathname === "/api/session-details/"
        ? routeHandlers.get("/api/session-details")
        : undefined);

    if (routeHandler) {
      await routeHandler(requestUrl, req, res);
      return;
    }

    await serveStatic(res, distDir, requestUrl.pathname);
  };
}

export function createServer(options = {}) {
  return http.createServer(createRequestHandler(options));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Read-only Claude dashboard running at http://localhost:${PORT}`);
  });
}
