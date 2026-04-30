import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createClaudeMetricsService } from "../server/claudeMetrics.mjs";
import { createRequestHandler } from "../server/server.mjs";

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function requestJson(handler, requestPath, method = "GET") {
  let statusCode = 0;
  let body = "";
  const req = {
    url: requestPath,
    method,
    headers: {
      host: "localhost",
    },
  };
  const res = {
    writeHead(code) {
      statusCode = code;
    },
    end(chunk = "") {
      body = String(chunk);
    },
  };

  await handler(req, res);
  return { statusCode, body };
}

test("health endpoint reports dist availability, claude accessibility, and warm cache state", async () => {
  const root = await makeTempDir("claude-health-");
  const claudeDir = path.join(root, ".claude");
  const distDir = path.join(root, "dist");
  await fs.mkdir(claudeDir, { recursive: true });
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(path.join(distDir, "index.html"), "<!doctype html>", "utf8");

  const service = createClaudeMetricsService({
    claudeDir,
    now: () => 1_000,
    metricsCacheTtlMs: 10_000,
    sessionCacheTtlMs: 5_000,
  });

  const handler = createRequestHandler({
    distDir,
    metricsService: service,
  });

  const cold = await requestJson(handler, "/api/health");
  await service.loadMetrics().catch(() => {});
  const warm = await requestJson(handler, "/api/health");
  const blockedMethod = await requestJson(handler, "/api/health", "POST");

  assert.equal(cold.statusCode, 200);
  assert.match(cold.body, /"metricsCacheWarm":false/);
  assert.match(cold.body, /"distAvailable":true/);
  assert.match(cold.body, /"claudeDirAccessible":true/);
  assert.equal(warm.statusCode, 200);
  assert.match(warm.body, /"metricsCacheWarm":true/);
  assert.equal(blockedMethod.statusCode, 405);
});
