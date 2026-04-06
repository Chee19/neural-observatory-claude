export interface ModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalContextTokens: number;
}

export interface SessionMetrics {
  sessionId: string;
  projectPath: string;
  startedAt: number | null;
  endedAt: number | null;
  promptCount: number;
  assistantTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalContextTokens: number;
  webSearchRequests: number;
  knownCostUsd: number | null;
  peakContextPct: number | null;
  modelBreakdown: ModelBreakdown[];
  sourceFiles: number;
  isSubagent: boolean;
}

export interface SessionDetailToolCount {
  name: string;
  count: number;
}

export interface SessionDetailModelUsage {
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalContextTokens: number;
  webSearchRequests: number;
}

export interface SessionProjectLogDetails {
  status:
    | 'ok'
    | 'no_project_path'
    | 'project_not_found'
    | 'project_not_directory'
    | 'no_logs'
    | 'session_not_found_in_logs'
    | 'error';
  message: string;
  sessionId: string;
  projectPath: string;
  resolvedProjectPath: string | null;
  logFilesScanned: number;
  matchedLogFiles: number;
  matchedLines: number;
  earliestTimestamp: number | null;
  latestTimestamp: number | null;
  userPromptCount: number;
  assistantMessageCount: number;
  assistantUsageCount: number;
  toolUseCount: number;
  toolResultCount: number;
  firstPromptPreview: string | null;
  lastPromptPreview: string | null;
  firstAssistantPreview: string | null;
  lastAssistantPreview: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalContextTokens: number;
  webSearchRequests: number;
  maxContextTokensInTurn: number;
  scannedFileLimitHit: boolean;
  matchedFiles: string[];
  models: string[];
  modelUsage: SessionDetailModelUsage[];
  toolCounts: SessionDetailToolCount[];
}

export interface CumulativeMetrics {
  sessions: number;
  prompts: number;
  assistantTurns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalContextTokens: number;
  knownCostUsd: number;
  knownCostCoveragePct: number;
}

export interface ParseResult {
  sessions: SessionMetrics[];
  cumulative: CumulativeMetrics;
  warnings: string[];
}

export interface AllTimeInsights {
  totalSessions: number;
  subagentSessions: number;
  uniqueSubagents: number;
  agentInvocations: number;
  skillMentions: number;
  toolInvocations: number;
  assistantTurns: number;
  toolBreakdown: MetricBreakdownItem[];
  agentBreakdown: MetricBreakdownItem[];
  subagentBreakdown: MetricBreakdownItem[];
  skillBreakdown: MetricBreakdownItem[];
}

export interface MetricBreakdownItem {
  name: string;
  count: number;
  pct: number;
}

export interface ClaudeInventory {
  agents: number;
  skills: number;
  plugins: number;
  memoryFiles: number;
  logFiles: number;
  trackedFiles: number;
}

export interface ApiMetricsResponse extends ParseResult {
  sourcePath: string;
  generatedAt: string;
  readOnlyMode: true;
  allTime: AllTimeInsights;
  inventory: ClaudeInventory;
}
