export interface IModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalContextTokens: number;
}

export interface ISessionMetrics {
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
  modelBreakdown: IModelBreakdown[];
  sourceFiles: number;
  isSubagent: boolean;
}

export interface ISessionDetailToolCount {
  name: string;
  count: number;
}

export interface ISessionDetailModelUsage {
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalContextTokens: number;
  webSearchRequests: number;
}

export interface ISessionProjectLogDetails {
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
  modelUsage: ISessionDetailModelUsage[];
  toolCounts: ISessionDetailToolCount[];
}

export interface ICumulativeMetrics {
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

export interface IParseResult {
  sessions: ISessionMetrics[];
  cumulative: ICumulativeMetrics;
  warnings: string[];
}

export interface IAllTimeInsights {
  totalSessions: number;
  subagentSessions: number;
  uniqueSubagents: number;
  agentInvocations: number;
  skillMentions: number;
  toolInvocations: number;
  assistantTurns: number;
  toolBreakdown: IMetricBreakdownItem[];
  agentBreakdown: IMetricBreakdownItem[];
  subagentBreakdown: IMetricBreakdownItem[];
  skillBreakdown: IMetricBreakdownItem[];
}

export interface IMetricBreakdownItem {
  name: string;
  count: number;
  pct: number;
}

export interface IClaudeInventory {
  agents: number;
  skills: number;
  plugins: number;
  memoryFiles: number;
  logFiles: number;
  trackedFiles: number;
}

export interface IApiMetricsResponse extends IParseResult {
  sourcePath: string;
  generatedAt: string;
  readOnlyMode: true;
  allTime: IAllTimeInsights;
  inventory: IClaudeInventory;
}
