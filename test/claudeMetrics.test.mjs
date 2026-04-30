import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createClaudeMetricsService } from "../server/claudeMetrics.mjs";

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJsonl(filePath, lines) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function createClaudeFixture() {
  const root = await makeTempDir("claude-metrics-");
  const claudeDir = path.join(root, ".claude");
  const projectDir = path.join(root, "project-a");
  const projectLogsDir = path.join(
    claudeDir,
    "projects",
    projectDir.replace(/[\\/]/g, "-").replace(/\s+/g, "-"),
  );

  await fs.mkdir(path.join(claudeDir, "agents"), { recursive: true });
  await fs.mkdir(path.join(claudeDir, "skills"), { recursive: true });
  await fs.mkdir(path.join(claudeDir, "plugins"), { recursive: true });
  await fs.mkdir(path.join(claudeDir, "memory"), { recursive: true });
  await fs.mkdir(path.join(claudeDir, "logs"), { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(path.join(claudeDir, "agents", "alpha.md"), "agent", "utf8");
  await fs.writeFile(path.join(claudeDir, "skills", "beta.md"), "skill", "utf8");
  await fs.writeFile(path.join(claudeDir, "plugins", "gamma.txt"), "plugin", "utf8");
  await fs.writeFile(path.join(claudeDir, "memory", "memory-note.txt"), "memory", "utf8");
  await fs.writeFile(path.join(claudeDir, "logs", "events.log"), "log", "utf8");

  await writeJsonl(path.join(claudeDir, "history.jsonl"), [
    JSON.stringify({
      sessionId: "session-1",
      project: projectDir,
      timestamp: "2026-04-28T09:00:00.000Z",
    }),
  ]);

  await writeJsonl(path.join(projectLogsDir, "main.jsonl"), [
    JSON.stringify({
      sessionId: "session-1",
      timestamp: "2026-04-28T09:00:00.000Z",
      type: "user",
      message: {
        role: "user",
        content: "Inspect metrics",
      },
      project: projectDir,
    }),
    "{this-is-not-json",
    JSON.stringify({
      sessionId: "session-1",
      timestamp: "2026-04-28T09:00:02.000Z",
      type: "assistant",
      message: {
        role: "assistant",
        model: "claude-sonnet-4",
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: "Metrics loaded",
          },
          {
            type: "tool_use",
            name: "web.search_query",
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 25,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
          web_search_requests: 1,
        },
      },
    }),
  ]);

  return { root, claudeDir, projectDir, projectLogsDir };
}

test("loadMetrics returns meta and partial warnings when malformed lines are present", async () => {
  const { claudeDir, projectDir } = await createClaudeFixture();
  let now = 1_000;
  const service = createClaudeMetricsService({
    claudeDir,
    now: () => now,
    metricsCacheTtlMs: 10_000,
    sessionCacheTtlMs: 5_000,
  });

  const result = await service.loadMetrics();
  const resolvedClaudeDir = await fs.realpath(claudeDir);

  assert.equal(result.meta.status, "partial");
  assert.equal(result.meta.dataSource, "live");
  assert.equal(result.meta.cacheAgeMs, 0);
  assert.equal(result.readOnlyMode, true);
  assert.equal(result.sourcePath, resolvedClaudeDir);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].projectPath, projectDir);
  assert.ok(result.warnings.some((warning) => warning.includes("Malformed JSON")));
});

test("loadMetrics uses a TTL cache and refreshes after expiry", async () => {
  const { claudeDir } = await createClaudeFixture();
  let now = 1_000;
  const service = createClaudeMetricsService({
    claudeDir,
    now: () => now,
    metricsCacheTtlMs: 50,
    sessionCacheTtlMs: 20,
  });

  const first = await service.loadMetrics();
  now += 10;
  const second = await service.loadMetrics();
  now += 100;
  const third = await service.loadMetrics();

  assert.equal(first.meta.dataSource, "live");
  assert.equal(second.meta.dataSource, "cache");
  assert.equal(second.meta.cacheAgeMs, 10);
  assert.equal(third.meta.dataSource, "live");
});

test("loadSessionProjectLogDetails returns explicit statuses and metadata", async () => {
  const { claudeDir, projectDir } = await createClaudeFixture();
  let now = 5_000;
  const service = createClaudeMetricsService({
    claudeDir,
    now: () => now,
    metricsCacheTtlMs: 50,
    sessionCacheTtlMs: 25,
  });

  const missingPath = await service.loadSessionProjectLogDetails("session-1", "");
  const invalidPath = await service.loadSessionProjectLogDetails("session-1", "../outside");
  const missingDir = await service.loadSessionProjectLogDetails(
    "session-1",
    path.join(projectDir, "missing"),
  );

  const filePath = path.join(projectDir, "not-a-dir.txt");
  await fs.writeFile(filePath, "plain file", "utf8");
  const nonDirectory = await service.loadSessionProjectLogDetails("session-1", filePath);

  const emptyProjectDir = await makeTempDir("claude-empty-project-");
  const noLogs = await service.loadSessionProjectLogDetails("session-1", emptyProjectDir);

  const unknownSession = await service.loadSessionProjectLogDetails("session-2", projectDir);
  const ok = await service.loadSessionProjectLogDetails("session-1", projectDir);
  now += 10;
  const cached = await service.loadSessionProjectLogDetails("session-1", projectDir);

  assert.equal(missingPath.status, "no_project_path");
  assert.equal(invalidPath.status, "invalid_project_path");
  assert.equal(missingDir.status, "project_not_found");
  assert.equal(nonDirectory.status, "project_not_directory");
  assert.equal(noLogs.status, "no_logs");
  assert.equal(unknownSession.status, "session_not_found_in_logs");
  assert.equal(ok.status, "ok");
  assert.equal(ok.meta.dataSource, "live");
  assert.equal(cached.meta.dataSource, "cache");
  assert.equal(cached.meta.cacheAgeMs, 10);
});
