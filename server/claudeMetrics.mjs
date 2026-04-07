import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MODEL_CONTEXT_WINDOWS = [
  { pattern: /claude-sonnet/i, window: 200_000 },
  { pattern: /claude-haiku/i, window: 200_000 },
  { pattern: /claude-opus/i, window: 200_000 },
];

const PROJECT_LOG_SCAN_FILE_LIMIT = 500;
const PROJECT_LOG_SCAN_DIR_EXCLUDES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
]);

function parseTimestamp(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getContextWindow(modelName) {
  for (const def of MODEL_CONTEXT_WINDOWS) {
    if (def.pattern.test(modelName)) return def.window;
  }
  return null;
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function walkFiles(dirPath) {
  const out = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const children = await walkFiles(absPath);
      out.push(...children);
    } else if (entry.isFile()) {
      out.push(absPath);
    }
  }
  return out;
}

async function walkFilesIfExists(dirPath) {
  try {
    return await walkFiles(dirPath);
  } catch {
    return [];
  }
}

function looksLikeLogFile(filePath) {
  const lower = path.basename(filePath).toLowerCase();
  return (
    lower.includes("log") ||
    lower.endsWith(".jsonl") ||
    lower.endsWith(".log") ||
    lower.endsWith(".ndjson")
  );
}

function looksLikeMemoryFile(filePath) {
  return path.basename(filePath).toLowerCase().includes("memory");
}

async function buildInventory(claudeDir) {
  const [
    agentFiles,
    skillFiles,
    pluginFiles,
    memoryDirFiles,
    logDirFiles,
    rootEntries,
  ] = await Promise.all([
    walkFilesIfExists(path.join(claudeDir, "agents")),
    walkFilesIfExists(path.join(claudeDir, "skills")),
    walkFilesIfExists(path.join(claudeDir, "plugins")),
    walkFilesIfExists(path.join(claudeDir, "memory")),
    walkFilesIfExists(path.join(claudeDir, "logs")),
    fs.readdir(claudeDir, { withFileTypes: true }).catch(() => []),
  ]);

  const rootFiles = rootEntries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(claudeDir, entry.name));

  const trackedSet = new Set([
    ...agentFiles,
    ...skillFiles,
    ...pluginFiles,
    ...memoryDirFiles,
    ...logDirFiles,
    ...rootFiles,
  ]);

  const memoryRootFiles = rootFiles.filter(looksLikeMemoryFile);
  const memoryFiles = new Set([...memoryDirFiles, ...memoryRootFiles]);
  const logFiles = new Set([
    ...logDirFiles,
    ...rootFiles.filter(looksLikeLogFile),
  ]);

  return {
    agents: agentFiles.length,
    skills: skillFiles.length,
    plugins: pluginFiles.length,
    memoryFiles: memoryFiles.size,
    logFiles: logFiles.size,
    trackedFiles: trackedSet.size,
  };
}

function initSession(sessionId, sourceFile, isSubagent) {
  return {
    sessionId,
    projectPath: "unknown",
    startedAt: null,
    endedAt: null,
    promptCount: 0,
    assistantTurns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalContextTokens: 0,
    webSearchRequests: 0,
    knownCostUsd: null,
    peakContextPct: null,
    modelMap: new Map(),
    sourceFiles: new Set([sourceFile]),
    isSubagent,
  };
}

function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  let combined = "";
  for (const item of content) {
    if (typeof item === "string") {
      combined += ` ${item}`;
      continue;
    }
    if (!item || typeof item !== "object") continue;
    if (typeof item.text === "string") combined += ` ${item.text}`;
    if (typeof item.content === "string") combined += ` ${item.content}`;
  }
  return combined;
}

function toSortedNameCountArray(map) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

async function walkProjectJsonlFiles(
  rootDir,
  limit = PROJECT_LOG_SCAN_FILE_LIMIT,
) {
  const out = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (PROJECT_LOG_SCAN_DIR_EXCLUDES.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      if (
        !entry.name.endsWith(".jsonl") ||
        entry.name.endsWith(".jsonl.wakatime")
      )
        continue;

      out.push(path.join(dir, entry.name));
      if (out.length >= limit) return { files: out, limitHit: true };
    }
  }

  return { files: out, limitHit: false };
}

function encodeClaudeProjectKey(projectPath) {
  return projectPath.replace(/[\\/]/g, "-").replace(/\s+/g, "-");
}

async function isDirectory(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function collectProjectJsonlFiles(
  candidateDirs,
  limit = PROJECT_LOG_SCAN_FILE_LIMIT,
) {
  const uniqueFiles = [];
  const seen = new Set();
  let limitHit = false;

  for (const dir of candidateDirs) {
    if (uniqueFiles.length >= limit) {
      limitHit = true;
      break;
    }

    const remaining = limit - uniqueFiles.length;
    const { files, limitHit: dirLimitHit } = await walkProjectJsonlFiles(
      dir,
      remaining,
    );
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      uniqueFiles.push(file);
      if (uniqueFiles.length >= limit) break;
    }

    if (dirLimitHit || uniqueFiles.length >= limit) {
      limitHit = true;
      break;
    }
  }

  return { files: uniqueFiles, limitHit };
}

function toBreakdown(map, total) {
  if (!map || map.size === 0 || total <= 0) return [];
  return Array.from(map.entries())
    .map(([name, count]) => ({
      name,
      count,
      pct: (count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

function extractSkillNames(text) {
  const matches = [];
  const normalized = text.toLowerCase();
  const explicit = normalized.match(/\$?[a-z0-9_-]*skill[a-z0-9_-]*/g) || [];
  for (const token of explicit) {
    if (token.length < 5) continue;
    matches.push(token.replace(/^\$/, ""));
  }

  const pathLike = normalized.match(/\/skills\/([a-z0-9._-]+)/g) || [];
  for (const token of pathLike) {
    const name = token.split("/").pop();
    if (name) matches.push(name.replace(/\.md$/, ""));
  }

  return matches;
}

async function parseHistoryFile(claudeDir, sessions) {
  const historyPath = path.join(claudeDir, "history.jsonl");
  const text = await readTextIfExists(historyPath);
  if (!text) return;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const obj = safeJsonParse(line);
    if (!obj || typeof obj !== "object") continue;

    const sessionId = typeof obj.sessionId === "string" ? obj.sessionId : null;
    if (!sessionId) continue;

    if (!sessions.has(sessionId)) {
      const seeded = initSession(sessionId, historyPath, false);
      if (typeof obj.project === "string") seeded.projectPath = obj.project;
      sessions.set(sessionId, seeded);
    }

    const session = sessions.get(sessionId);
    if (!session) continue;

    const ts = parseTimestamp(obj.timestamp);
    if (ts !== null) {
      session.startedAt =
        session.startedAt === null ? ts : Math.min(session.startedAt, ts);
      session.endedAt =
        session.endedAt === null ? ts : Math.max(session.endedAt, ts);
    }

    session.promptCount += 1;
    if (session.projectPath === "unknown" && typeof obj.project === "string") {
      session.projectPath = obj.project;
    }
  }
}

async function parseCostBackups(claudeDir) {
  const backupDir = path.join(claudeDir, "backups");
  const costBySession = new Map();

  let files = [];
  try {
    files = await walkFiles(backupDir);
  } catch {
    return costBySession;
  }

  const backupFiles = files.filter((f) =>
    path.basename(f).includes(".claude.json.backup."),
  );

  for (const file of backupFiles) {
    const text = await readTextIfExists(file);
    if (!text) continue;

    const parsed = safeJsonParse(text);
    const projects =
      parsed && typeof parsed === "object" ? parsed.projects : null;
    if (!projects || typeof projects !== "object") continue;

    for (const value of Object.values(projects)) {
      if (!value || typeof value !== "object") continue;
      const sessionId =
        typeof value.lastSessionId === "string" ? value.lastSessionId : null;
      const cost = typeof value.lastCost === "number" ? value.lastCost : null;
      if (!sessionId || cost === null || !Number.isFinite(cost)) continue;

      const current = costBySession.get(sessionId);
      if (current === undefined || cost > current) {
        costBySession.set(sessionId, cost);
      }
    }
  }

  return costBySession;
}

export async function loadSessionProjectLogDetails(sessionId, projectPath) {
  const base = {
    sessionId: typeof sessionId === "string" ? sessionId : "",
    projectPath: typeof projectPath === "string" ? projectPath : "",
    resolvedProjectPath: null,
    logFilesScanned: 0,
    matchedLogFiles: 0,
    matchedLines: 0,
    earliestTimestamp: null,
    latestTimestamp: null,
    userPromptCount: 0,
    assistantMessageCount: 0,
    assistantUsageCount: 0,
    toolUseCount: 0,
    toolResultCount: 0,
    firstPromptPreview: null,
    lastPromptPreview: null,
    firstAssistantPreview: null,
    lastAssistantPreview: null,
    durationMs: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalContextTokens: 0,
    webSearchRequests: 0,
    maxContextTokensInTurn: 0,
    scannedFileLimitHit: false,
    matchedFiles: [],
    models: [],
    modelUsage: [],
    toolCounts: [],
  };

  if (!base.sessionId) {
    return {
      ...base,
      status: "error",
      message: "Session id is required.",
    };
  }

  if (!base.projectPath || base.projectPath === "unknown") {
    return {
      ...base,
      status: "no_project_path",
      message: "Project path is missing for this session.",
    };
  }

  let resolvedProjectPath;
  try {
    resolvedProjectPath = await fs.realpath(base.projectPath);
  } catch {
    return {
      ...base,
      status: "project_not_found",
      message: `Project directory not found: ${base.projectPath}`,
    };
  }

  let projectStat;
  try {
    projectStat = await fs.stat(resolvedProjectPath);
  } catch {
    return {
      ...base,
      status: "project_not_found",
      message: `Project directory not accessible: ${resolvedProjectPath}`,
    };
  }

  if (!projectStat.isDirectory()) {
    return {
      ...base,
      resolvedProjectPath,
      status: "project_not_directory",
      message: `Project path is not a directory: ${resolvedProjectPath}`,
    };
  }

  const claudeProjectsDir = path.join(os.homedir(), ".claude", "projects");
  const candidateDirs = [resolvedProjectPath];
  const candidateKeys = new Set([
    encodeClaudeProjectKey(base.projectPath),
    encodeClaudeProjectKey(resolvedProjectPath),
  ]);

  for (const key of candidateKeys) {
    if (!key) continue;
    const mappedDir = path.join(claudeProjectsDir, key);
    if (mappedDir === resolvedProjectPath) continue;
    if (!(await isDirectory(mappedDir))) continue;
    candidateDirs.push(mappedDir);
  }

  const { files: jsonlFiles, limitHit } =
    await collectProjectJsonlFiles(candidateDirs);
  if (jsonlFiles.length === 0) {
    return {
      ...base,
      resolvedProjectPath,
      scannedFileLimitHit: limitHit,
      status: "no_logs",
      message: `No .jsonl Claude logs found under ${resolvedProjectPath} or ~/.claude/projects/<project>.`,
    };
  }

  const toolCounter = new Map();
  const modelSet = new Set();
  const modelUsageMap = new Map();
  const matchedFiles = new Set();
  let firstPromptPreview = null;
  let lastPromptPreview = null;
  let firstAssistantPreview = null;
  let lastAssistantPreview = null;
  let userPromptCount = 0;
  let assistantMessageCount = 0;
  let assistantUsageCount = 0;
  let toolUseCount = 0;
  let toolResultCount = 0;
  let matchedLines = 0;
  let earliestTimestamp = null;
  let latestTimestamp = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let totalContextTokens = 0;
  let webSearchRequests = 0;
  let maxContextTokensInTurn = 0;

  for (const filePath of jsonlFiles) {
    const text = await readTextIfExists(filePath);
    if (!text) continue;

    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const parsed = safeJsonParse(line);
      if (!parsed || typeof parsed !== "object") continue;
      if (parsed.sessionId !== base.sessionId) continue;

      matchedLines += 1;
      matchedFiles.add(filePath);

      const ts = parseTimestamp(parsed.timestamp);
      if (ts !== null) {
        earliestTimestamp =
          earliestTimestamp === null ? ts : Math.min(earliestTimestamp, ts);
        latestTimestamp =
          latestTimestamp === null ? ts : Math.max(latestTimestamp, ts);
      }

      const recordType = typeof parsed.type === "string" ? parsed.type : "";
      const message =
        parsed.message && typeof parsed.message === "object"
          ? parsed.message
          : null;

      if (recordType === "user" && message && message.role === "user") {
        const content = message.content;
        // Count tool_result items (system-generated, not real user prompts)
        if (Array.isArray(content)) {
          for (const item of content) {
            if (!item || typeof item !== "object") continue;
            if (item.type === "tool_result") {
              toolResultCount += 1;
            }
          }
        }

        // Only count real user prompts — exclude tool_result messages, isMeta, and command entries
        const isToolResultMessage =
          Array.isArray(content) &&
          content.length > 0 &&
          content.every(
            (item) =>
              item && typeof item === "object" && item.type === "tool_result",
          );
        const isMeta = parsed.isMeta === true;
        const textStr = typeof content === "string" ? content : "";
        const isCommandEntry =
          textStr.includes("<command-name>") ||
          textStr.includes("<local-command") ||
          textStr.includes("/clear") ||
          textStr.includes("/exit");

        if (!isToolResultMessage && !isMeta && !isCommandEntry) {
          userPromptCount += 1;
          const textPreview = extractTextFromContent(content).trim();
          if (textPreview) {
            if (!firstPromptPreview) firstPromptPreview = textPreview;
            lastPromptPreview = textPreview;
          }
        }
      }

      if (recordType === "assistant" && message) {
        // Only count completed turns (stop_reason non-null); streaming partials have stop_reason: null
        if (message.stop_reason !== null && message.stop_reason !== undefined) {
          assistantMessageCount += 1;
        }
        if (typeof message.model === "string" && message.model) {
          modelSet.add(message.model);
        }
        const assistantPreview = extractTextFromContent(message.content).trim();
        if (assistantPreview) {
          if (!firstAssistantPreview) firstAssistantPreview = assistantPreview;
          lastAssistantPreview = assistantPreview;
        }

        if (Array.isArray(message.content)) {
          for (const item of message.content) {
            if (!item || typeof item !== "object") continue;
            if (item.type !== "tool_use") continue;
            const toolName =
              typeof item.name === "string" ? item.name : "unknown_tool";
            toolCounter.set(toolName, (toolCounter.get(toolName) ?? 0) + 1);
            toolUseCount += 1;
          }
        }

        if (message.usage && typeof message.usage === "object") {
          const usage = message.usage;
          const input =
            typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
          const output =
            typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
          const cacheRead =
            typeof usage.cache_read_input_tokens === "number"
              ? usage.cache_read_input_tokens
              : 0;
          const cacheCreate =
            typeof usage.cache_creation_input_tokens === "number"
              ? usage.cache_creation_input_tokens
              : 0;
          const webSearch =
            typeof usage.web_search_requests === "number"
              ? usage.web_search_requests
              : 0;
          const context = input + cacheRead + cacheCreate;

          if (
            input > 0 ||
            output > 0 ||
            cacheRead > 0 ||
            cacheCreate > 0 ||
            webSearch > 0
          ) {
            assistantUsageCount += 1;
          }

          inputTokens += input;
          outputTokens += output;
          cacheReadTokens += cacheRead;
          cacheCreationTokens += cacheCreate;
          totalContextTokens += context;
          webSearchRequests += webSearch;
          maxContextTokensInTurn = Math.max(maxContextTokensInTurn, context);

          const modelName =
            typeof message.model === "string" && message.model
              ? message.model
              : "unknown";
          if (!modelUsageMap.has(modelName)) {
            modelUsageMap.set(modelName, {
              model: modelName,
              turns: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheCreationTokens: 0,
              totalContextTokens: 0,
              webSearchRequests: 0,
            });
          }

          const modelUsage = modelUsageMap.get(modelName);
          modelUsage.turns += 1;
          modelUsage.inputTokens += input;
          modelUsage.outputTokens += output;
          modelUsage.cacheReadTokens += cacheRead;
          modelUsage.cacheCreationTokens += cacheCreate;
          modelUsage.totalContextTokens += context;
          modelUsage.webSearchRequests += webSearch;
        }
      }
    }
  }

  if (matchedLines === 0) {
    return {
      ...base,
      resolvedProjectPath,
      logFilesScanned: jsonlFiles.length,
      scannedFileLimitHit: limitHit,
      status: "session_not_found_in_logs",
      message: `Found .jsonl logs in project directory, but none include session ${base.sessionId}.`,
    };
  }

  return {
    ...base,
    resolvedProjectPath,
    logFilesScanned: jsonlFiles.length,
    matchedLogFiles: matchedFiles.size,
    matchedLines,
    earliestTimestamp,
    latestTimestamp,
    userPromptCount,
    assistantMessageCount,
    assistantUsageCount,
    toolUseCount,
    toolResultCount,
    firstPromptPreview,
    lastPromptPreview,
    firstAssistantPreview,
    lastAssistantPreview,
    durationMs:
      earliestTimestamp !== null && latestTimestamp !== null
        ? Math.max(0, latestTimestamp - earliestTimestamp)
        : null,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalContextTokens,
    webSearchRequests,
    maxContextTokensInTurn,
    scannedFileLimitHit: limitHit,
    matchedFiles: Array.from(matchedFiles.values()).sort(),
    models: Array.from(modelSet.values()).sort(),
    modelUsage: Array.from(modelUsageMap.values()).sort(
      (a, b) => b.totalContextTokens - a.totalContextTokens,
    ),
    toolCounts: toSortedNameCountArray(toolCounter),
    status: "ok",
    message: `Loaded project log details from ${matchedFiles.size} file(s)${limitHit ? " (scan limited to first 500 .jsonl files). Score above may be different from the table list." : "."}`,
  };
}

export async function loadClaudeMetrics() {
  const claudeDir =
    process.env.CLAUDE_DIR || path.join(os.homedir(), ".claude");
  const resolvedClaudeDir = await fs.realpath(claudeDir);
  const inventory = await buildInventory(resolvedClaudeDir);

  const sessions = new Map();
  const warnings = [];
  const subagentIds = new Set();
  const allTime = {
    totalSessions: 0,
    subagentSessions: 0,
    uniqueSubagents: 0,
    agentInvocations: 0,
    skillMentions: 0,
    toolInvocations: 0,
    assistantTurns: 0,
    toolBreakdown: [],
    agentBreakdown: [],
    subagentBreakdown: [],
    skillBreakdown: [],
  };
  const toolCounter = new Map();
  const agentCounter = new Map();
  const subagentCounter = new Map();
  const skillCounter = new Map();

  const projectsDir = path.join(resolvedClaudeDir, "projects");
  let projectFiles = [];
  try {
    projectFiles = await walkFiles(projectsDir);
  } catch {
    return {
      sourcePath: resolvedClaudeDir,
      generatedAt: new Date().toISOString(),
      readOnlyMode: true,
      sessions: [],
      cumulative: {
        sessions: 0,
        prompts: 0,
        assistantTurns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalContextTokens: 0,
        knownCostUsd: 0,
        knownCostCoveragePct: 0,
      },
      allTime,
      inventory,
      warnings: ["No projects directory found under ~/.claude."],
    };
  }

  inventory.logFiles += projectFiles.filter(looksLikeLogFile).length;
  inventory.trackedFiles += projectFiles.length;

  const jsonlFiles = projectFiles.filter(
    (file) => file.endsWith(".jsonl") && !file.endsWith(".jsonl.wakatime"),
  );

  for (const filePath of jsonlFiles) {
    const text = await readTextIfExists(filePath);
    if (!text) {
      warnings.push(`Unreadable file: ${filePath}`);
      continue;
    }

    const isSubagent = filePath.includes(`${path.sep}subagents${path.sep}`);
    if (isSubagent) {
      const matched = filePath.match(/subagents[\\/](agent-[^./\\]+)\.jsonl$/);
      if (matched?.[1]) subagentIds.add(matched[1]);
    }

    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;

      const parsed = safeJsonParse(line);
      if (!parsed || typeof parsed !== "object") continue;

      const sessionId =
        typeof parsed.sessionId === "string" ? parsed.sessionId : null;
      if (!sessionId) continue;

      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, initSession(sessionId, filePath, isSubagent));
      }

      const session = sessions.get(sessionId);
      if (!session) continue;
      session.sourceFiles.add(filePath);

      if (typeof parsed.cwd === "string") session.projectPath = parsed.cwd;

      const ts = parseTimestamp(parsed.timestamp);
      if (ts !== null) {
        session.startedAt =
          session.startedAt === null ? ts : Math.min(session.startedAt, ts);
        session.endedAt =
          session.endedAt === null ? ts : Math.max(session.endedAt, ts);
      }

      const recordType = typeof parsed.type === "string" ? parsed.type : "";
      const message =
        parsed.message && typeof parsed.message === "object"
          ? parsed.message
          : null;

      if (recordType === "user" && message && message.role === "user") {
        const content = message.content;
        // Only count real user prompts — exclude tool_result messages, isMeta entries, and command strings
        const isToolResultMessage =
          Array.isArray(content) &&
          content.length > 0 &&
          content.every(
            (item) =>
              item && typeof item === "object" && item.type === "tool_result",
          );
        const isMeta = parsed.isMeta === true;
        const textStr = typeof content === "string" ? content : "";
        const isCommandEntry =
          textStr.includes("<command-name>") ||
          textStr.includes("<local-command") ||
          textStr.includes("/clear") ||
          textStr.includes("/exit");

        if (
          !isToolResultMessage &&
          !isMeta &&
          !isCommandEntry &&
          (typeof content === "string" || Array.isArray(content))
        ) {
          session.promptCount += 1;
        }

        const userText = extractTextFromContent(content).toLowerCase();
        if (
          userText.includes("/skill") ||
          userText.includes("skill.md") ||
          userText.includes("/skills/")
        ) {
          allTime.skillMentions += 1;
          const names = new Set(extractSkillNames(userText));
          for (const name of names) {
            skillCounter.set(name, (skillCounter.get(name) ?? 0) + 1);
          }
        }
      }

      if (
        recordType === "assistant" &&
        message &&
        Array.isArray(message.content)
      ) {
        for (const item of message.content) {
          if (!item || typeof item !== "object") continue;
          if (item.type === "tool_use") {
            allTime.toolInvocations += 1;
            const toolName =
              typeof item.name === "string"
                ? item.name.toLowerCase()
                : "unknown_tool";
            toolCounter.set(toolName, (toolCounter.get(toolName) ?? 0) + 1);
            if (
              toolName.includes("task") ||
              toolName.includes("spawn_agent") ||
              toolName.includes("agent")
            ) {
              allTime.agentInvocations += 1;
              agentCounter.set(toolName, (agentCounter.get(toolName) ?? 0) + 1);
            }
          }
        }
      }

      if (
        recordType === "assistant" &&
        message &&
        typeof message.usage === "object" &&
        message.usage
      ) {
        const usage = message.usage;
        const input =
          typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
        const output =
          typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
        const cacheRead =
          typeof usage.cache_read_input_tokens === "number"
            ? usage.cache_read_input_tokens
            : 0;
        const cacheCreate =
          typeof usage.cache_creation_input_tokens === "number"
            ? usage.cache_creation_input_tokens
            : 0;
        const webSearch =
          typeof usage.web_search_requests === "number"
            ? usage.web_search_requests
            : 0;

        const hasUsage =
          input > 0 || output > 0 || cacheRead > 0 || cacheCreate > 0;
        if (!hasUsage) continue;

        const contextTotal = input + cacheRead + cacheCreate;

        // Only count completed turns — streaming partial entries have stop_reason: null
        const stopReason = message.stop_reason;
        if (stopReason !== null && stopReason !== undefined) {
          session.assistantTurns += 1;
          allTime.assistantTurns += 1;
        }
        session.inputTokens += input;
        session.outputTokens += output;
        session.cacheReadTokens += cacheRead;
        session.cacheCreationTokens += cacheCreate;
        session.totalContextTokens += contextTotal;
        session.webSearchRequests += webSearch;

        const model =
          typeof message.model === "string" ? message.model : "unknown";
        if (!session.modelMap.has(model)) {
          session.modelMap.set(model, {
            model,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            totalContextTokens: 0,
          });
        }

        const modelUsage = session.modelMap.get(model);
        modelUsage.inputTokens += input;
        modelUsage.outputTokens += output;
        modelUsage.cacheReadTokens += cacheRead;
        modelUsage.cacheCreationTokens += cacheCreate;
        modelUsage.totalContextTokens += contextTotal;

        const contextWindow = getContextWindow(model);
        if (contextWindow) {
          const pct = (contextTotal / contextWindow) * 100;
          session.peakContextPct =
            session.peakContextPct === null
              ? pct
              : Math.max(session.peakContextPct, pct);
        }
      }
    }
  }

  await parseHistoryFile(resolvedClaudeDir, sessions);
  const costs = await parseCostBackups(resolvedClaudeDir);

  for (const session of sessions.values()) {
    const knownCost = costs.get(session.sessionId);
    if (knownCost !== undefined) session.knownCostUsd = knownCost;
  }

  const sessionList = Array.from(sessions.values())
    .filter((s) => s.assistantTurns > 0 || s.inputTokens > 0)
    .map((s) => ({
      sessionId: s.sessionId,
      projectPath: s.projectPath,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      promptCount: s.promptCount,
      assistantTurns: s.assistantTurns,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cacheReadTokens: s.cacheReadTokens,
      cacheCreationTokens: s.cacheCreationTokens,
      totalContextTokens: s.totalContextTokens,
      webSearchRequests: s.webSearchRequests,
      knownCostUsd: s.knownCostUsd,
      peakContextPct: s.peakContextPct,
      modelBreakdown: Array.from(s.modelMap.values()).sort(
        (a, b) => b.totalContextTokens - a.totalContextTokens,
      ),
      sourceFiles: s.sourceFiles.size,
      isSubagent: s.isSubagent,
    }))
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));

  allTime.totalSessions = sessionList.length;
  allTime.subagentSessions = sessionList.filter((s) => s.isSubagent).length;
  allTime.uniqueSubagents = subagentIds.size;
  for (const session of sessions.values()) {
    if (!session.isSubagent) continue;
    for (const sourceFile of session.sourceFiles) {
      const matched = sourceFile.match(
        /subagents[\\/](agent-[^./\\]+)\.jsonl$/,
      );
      if (matched?.[1]) {
        subagentCounter.set(
          matched[1],
          (subagentCounter.get(matched[1]) ?? 0) + 1,
        );
        break;
      }
    }
  }
  allTime.toolBreakdown = toBreakdown(toolCounter, allTime.toolInvocations);
  allTime.agentBreakdown = toBreakdown(agentCounter, allTime.agentInvocations);
  allTime.subagentBreakdown = toBreakdown(
    subagentCounter,
    allTime.subagentSessions,
  );
  const skillDetailTotal = Array.from(skillCounter.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  allTime.skillBreakdown = toBreakdown(skillCounter, skillDetailTotal);

  const displaySessions = sessionList.filter((s) => !s.isSubagent);
  const target = displaySessions.length > 0 ? displaySessions : sessionList;

  const cumulative = target.reduce(
    (acc, session) => {
      acc.sessions += 1;
      acc.prompts += session.promptCount;
      acc.assistantTurns += session.assistantTurns;
      acc.inputTokens += session.inputTokens;
      acc.outputTokens += session.outputTokens;
      acc.cacheReadTokens += session.cacheReadTokens;
      acc.cacheCreationTokens += session.cacheCreationTokens;
      acc.totalContextTokens += session.totalContextTokens;
      if (session.knownCostUsd !== null)
        acc.knownCostUsd += session.knownCostUsd;
      return acc;
    },
    {
      sessions: 0,
      prompts: 0,
      assistantTurns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalContextTokens: 0,
      knownCostUsd: 0,
      knownCostCoveragePct: 0,
    },
  );

  if (target.length > 0) {
    const covered = target.filter(
      (session) => session.knownCostUsd !== null,
    ).length;
    cumulative.knownCostCoveragePct = (covered / target.length) * 100;
  }

  if (sessionList.length === 0)
    warnings.push("No parseable session logs found in .claude/projects.");
  if (cumulative.knownCostCoveragePct < 100) {
    warnings.push(
      "Cost is partially known and sourced from .claude/backups/.claude.json.backup.* when available.",
    );
  }

  return {
    sourcePath: resolvedClaudeDir,
    generatedAt: new Date().toISOString(),
    readOnlyMode: true,
    sessions: sessionList,
    cumulative,
    allTime,
    inventory,
    warnings,
  };
}
