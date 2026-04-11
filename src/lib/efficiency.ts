import type { ISessionMetrics, ISessionProjectLogDetails } from "../types";

export type TScoreBand = "excellent" | "good" | "fair" | "poor";

export interface IMetricScore {
  key: string;
  label: string;
  description: string;
  rawValue: number | null;
  rawDisplay: string;
  score: number; // 0–100
  weight: number; // nominal weight before redistribution
  band: TScoreBand;
  available: boolean;
  requiresLogData: boolean;
}

export interface IEfficiencyScore {
  total: number; // 0–100 weighted average
  grade: string; // A+, A, B+, B, C+, C, D, F
  label: string; // Exceptional, Excellent, ...
  metrics: IMetricScore[];
  hasLogData: boolean;
  isSubagent: boolean;
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Piecewise linear interpolation across [x, y] breakpoints (sorted ascending by x).
 * Returns a score clamped to 0–100.
 */
function piecewise(value: number, pts: [number, number][]): number {
  if (pts.length === 0) return 0;
  if (value <= pts[0][0]) return pts[0][1];
  if (value >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (value >= x0 && value <= x1) {
      const t = (value - x0) / (x1 - x0);
      return Math.min(100, Math.max(0, Math.round(y0 + t * (y1 - y0))));
    }
  }
  return 0;
}

function toBand(score: number): TScoreBand {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

function toGrade(total: number): { grade: string; label: string } {
  if (total >= 95) return { grade: "A+", label: "Exceptional" };
  if (total >= 90) return { grade: "A", label: "Excellent" };
  if (total >= 85) return { grade: "B+", label: "Strong" };
  if (total >= 80) return { grade: "B", label: "Good" };
  if (total >= 75) return { grade: "C+", label: "Above Average" };
  if (total >= 70) return { grade: "C", label: "Average" };
  if (total >= 50) return { grade: "D", label: "Below Average" };
  return { grade: "F", label: "Inefficient" };
}

// ─── Core metrics (always available from SessionMetrics) ─────────────────────

function scoreCacheHit(s: ISessionMetrics): IMetricScore {
  // Denominator is only (directInput + cacheRead) — cacheWrite is excluded per algorithm
  const denom = s.inputTokens + s.cacheReadTokens;
  const avail = denom > 0;
  const raw = avail ? (s.cacheReadTokens / denom) * 100 : null;
  const score = avail
    ? piecewise(raw!, [
        [0, 10],
        [30, 10],
        [50, 35],
        [70, 65],
        [85, 88],
        [100, 100],
      ])
    : 0;
  return {
    key: "cacheHit",
    label: "Cache Utilisation",
    description:
      "cacheReadTokens / (inputTokens + cacheReadTokens) — context reuse efficiency",
    rawValue: raw,
    rawDisplay: raw !== null ? `${raw.toFixed(1)}%` : "N/A",
    score,
    weight: 0.2,
    band: toBand(score),
    available: avail,
    requiresLogData: false,
  };
}

function scoreOutputLeverage(s: ISessionMetrics): IMetricScore {
  // Denominator is totalNewContext = directInput + cacheWrite (not directInput alone)
  const newContext = s.inputTokens + s.cacheCreationTokens;
  const avail = newContext > 0;
  const raw = avail ? (s.outputTokens / newContext) * 100 : null;
  const score = avail
    ? piecewise(raw!, [
        [0, 15],
        [5, 40],
        [15, 80],
        [40, 80],
        [70, 100],
        [100, 80],
        [150, 45],
      ])
    : 0;
  return {
    key: "outputLeverage",
    label: "Output Density",
    description:
      "outputTokens / (inputTokens + cacheCreationTokens) × 100 — value generated per new context token",
    rawValue: raw,
    rawDisplay: raw !== null ? `${raw.toFixed(1)}%` : "N/A",
    score,
    weight: 0.18,
    band: toBand(score),
    available: avail,
    requiresLogData: false,
  };
}

function scoreContextEfficiency(s: ISessionMetrics): IMetricScore {
  const avail = s.peakContextPct !== null;
  const raw = s.peakContextPct;
  const score = avail
    ? piecewise(raw!, [
        [0, 35],
        [5, 35],
        [10, 65],
        [35, 100],
        [37, 70],
        [55, 70],
        [57, 35],
        [75, 35],
        [100, 10],
      ])
    : 0;
  return {
    key: "contextEfficiency",
    label: "Context Efficiency",
    description:
      "Peak context window % used — penalises both bloat and underuse",
    rawValue: raw,
    rawDisplay: raw !== null ? `${raw.toFixed(1)}%` : "N/A",
    score,
    weight: 0.15,
    band: toBand(score),
    available: avail,
    requiresLogData: false,
  };
}

function scoreTurnsRatio(s: ISessionMetrics): IMetricScore {
  const avail = s.promptCount > 0;
  const raw = avail ? s.assistantTurns / s.promptCount : null;
  const score = avail
    ? piecewise(raw!, [
        [0, 10],
        [1.5, 30],
        [2.0, 70],
        [2.5, 100],
        [4.0, 100],
        [6.0, 70],
        [7.0, 20],
      ])
    : 0;
  return {
    key: "turnsRatio",
    label: "Turns Ratio",
    description: "completedAssistantTurns / realUserPrompts — optimal range is 2.5–4× (tool-use cycles per prompt)",
    rawValue: raw,
    rawDisplay: raw !== null ? `${raw.toFixed(2)}×` : "N/A",
    score,
    weight: 0.12,
    band: toBand(score),
    available: avail,
    requiresLogData: false,
  };
}

function scorePromptDepth(s: ISessionMetrics): IMetricScore {
  // Use totalNewContext per prompt (directInput + cacheWrite), not directInput alone
  const avail = s.promptCount > 0;
  const raw = avail ? (s.inputTokens + s.cacheCreationTokens) / s.promptCount : null;
  const score = avail
    ? piecewise(raw!, [
        [0, 15],
        [50, 15],
        [200, 50],
        [800, 85],
        [2500, 100],
        [5000, 70],
        [8000, 40],
      ])
    : 0;
  return {
    key: "promptDepth",
    label: "Prompt Depth",
    description:
      "(inputTokens + cacheCreationTokens) / promptCount — avg new context per user prompt",
    rawValue: raw,
    rawDisplay: raw !== null ? `${raw.toFixed(0)} tok/msg` : "N/A",
    score,
    weight: 0.10,
    band: toBand(score),
    available: avail,
    requiresLogData: false,
  };
}

// ─── Extended metrics (require ProjectLogDetails status === 'ok') ─────────────

function scoreToolDensity(
  log: ISessionProjectLogDetails | null | undefined,
): IMetricScore {
  const logOk = log?.status === "ok";
  const avail = logOk && (log?.assistantMessageCount ?? 0) > 0;
  const raw = avail ? log!.toolUseCount / log!.assistantMessageCount : null;
  const score = avail
    ? piecewise(raw!, [
        [0, 25],
        [0.3, 25],
        [0.5, 55],
        [0.7, 100],
        [2.0, 100],
        [4.0, 75],
        [5.0, 40],
      ])
    : 0;
  return {
    key: "toolDensity",
    label: "Tool Density",
    description:
      "toolUseCount / completedAssistantTurns — action-orientation per turn",
    rawValue: raw,
    rawDisplay: raw !== null ? `${raw.toFixed(2)}/turn` : "N/A",
    score,
    weight: 0.10,
    band: toBand(score),
    available: avail,
    requiresLogData: true,
  };
}

function scoreActionRatio(
  log: ISessionProjectLogDetails | null | undefined,
): IMetricScore {
  const logOk = log?.status === "ok";
  const hasCounts = logOk && (log?.toolCounts?.length ?? 0) > 0;

  const stub = (
    rawValue: number | null,
    rawDisplay: string,
    score: number,
    avail: boolean,
  ): IMetricScore => ({
    key: "actionRatio",
    label: "Action Ratio",
    description:
      "(Edit + Write + MultiEdit) / total tool uses — write-to-read balance",
    rawValue,
    rawDisplay,
    score,
    weight: 0.08,
    band: toBand(score),
    available: avail,
    requiresLogData: true,
  });

  if (!hasCounts) return stub(null, "N/A", 0, false);

  const writingTools = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
  const writeCount = log!.toolCounts
    .filter((t) => writingTools.has(t.name))
    .reduce((acc, t) => acc + t.count, 0);
  const totalTools = log!.toolCounts.reduce((acc, t) => acc + t.count, 0);

  if (totalTools === 0) return stub(0, "0%", 0, true);

  const raw = (writeCount / totalTools) * 100;
  const score = piecewise(raw, [
    [0, 5],
    [10, 35],
    [25, 100],
    [50, 100],
    [70, 85],
    [100, 55],
  ]);
  return stub(raw, `${raw.toFixed(1)}%`, score, true);
}

function scoreToolCompletion(
  log: ISessionProjectLogDetails | null | undefined,
): IMetricScore {
  const logOk = log?.status === "ok";
  const avail = logOk && (log?.toolUseCount ?? 0) > 0;
  const raw = avail
    ? Math.min((log!.toolResultCount / log!.toolUseCount) * 100, 100)
    : null;
  // Near 100% = healthy. Below 80% = significant abandoned/failed tool calls.
  const score = avail
    ? piecewise(raw!, [
        [0, 0],
        [50, 20],
        [70, 40],
        [80, 60],
        [90, 80],
        [95, 95],
        [100, 100],
      ])
    : 0;
  return {
    key: "toolCompletion",
    label: "Tool Completion",
    description:
      "toolResultCount / toolUseCount — fraction of tool calls that completed",
    rawValue: raw,
    rawDisplay: raw !== null ? `${raw.toFixed(1)}%` : "N/A",
    score,
    weight: 0.04,
    band: toBand(score),
    available: avail,
    requiresLogData: true,
  };
}

function scoreVerificationFlag(
  log: ISessionProjectLogDetails | null | undefined,
): IMetricScore {
  const logOk = log?.status === "ok";
  const hasCounts = logOk && (log?.toolCounts?.length ?? 0) > 0;

  const stub = (
    rawValue: number | null,
    rawDisplay: string,
    score: number,
    avail: boolean,
  ): IMetricScore => ({
    key: "verificationFlag",
    label: "Verified",
    description:
      "Bash present after Edit/Write — output was run after being written",
    rawValue,
    rawDisplay,
    score,
    weight: 0.03,
    band: toBand(score),
    available: avail,
    requiresLogData: true,
  });

  if (!hasCounts) return stub(null, "N/A", 0, false);

  const writingTools = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
  const hasWrites = log!.toolCounts.some(
    (t) => writingTools.has(t.name) && t.count > 0,
  );
  const hasBash = log!.toolCounts.some((t) => t.name === "Bash" && t.count > 0);

  // Read-only session: exempt — score 100 so it doesn't penalise read-only exploration
  if (!hasWrites) return stub(null, "Exempt", 100, true);

  const verified = hasBash;
  return stub(
    verified ? 1 : 0,
    verified ? "Yes" : "No",
    verified ? 100 : 0,
    true,
  );
}

// ─── Main API ─────────────────────────────────────────────────────────────────

export function computeEfficiencyScore(
  session: ISessionMetrics,
  logDetails?: ISessionProjectLogDetails | null,
): IEfficiencyScore {
  const hasLogData = logDetails?.status === "ok";
  const log = hasLogData ? logDetails : null;

  const metrics: IMetricScore[] = [
    // Core (always)
    scoreCacheHit(session),
    scoreOutputLeverage(session),
    scoreContextEfficiency(session),
    scoreTurnsRatio(session),
    scorePromptDepth(session),
    // Extended (log data required)
    scoreToolDensity(log),
    scoreActionRatio(log),
    scoreToolCompletion(log),
    scoreVerificationFlag(log),
  ];

  // Redistribute weight proportionally across available metrics only
  const available = metrics.filter((m) => m.available);
  const totalWeight = available.reduce((sum, m) => sum + m.weight, 0);
  const total =
    totalWeight > 0
      ? Math.round(
          available.reduce(
            (sum, m) => sum + m.score * (m.weight / totalWeight),
            0,
          ),
        )
      : 0;

  const { grade, label } = toGrade(total);
  return {
    total,
    grade,
    label,
    metrics,
    hasLogData,
    isSubagent: session.isSubagent,
  };
}

// ─── UI colour helpers (full Tailwind classes — no dynamic construction) ──────

export function gradeClasses(grade: string): {
  bg: string;
  text: string;
  border: string;
  bar: string;
} {
  if (grade === "A+" || grade === "A")
    return {
      bg: "bg-gray-800",
      text: "text-emerald-400",
      border: "border-emerald-400/60",
      bar: "bg-emerald-400",
    };
  if (grade === "B+" || grade === "B")
    return {
      bg: "bg-gray-800",
      text: "text-green-400",
      border: "border-green-400/60",
      bar: "bg-green-400",
    };
  if (grade === "C+" || grade === "C")
    return {
      bg: "bg-gray-800",
      text: "text-yellow-400",
      border: "border-yellow-400/60",
      bar: "bg-yellow-400",
    };
  if (grade === "D")
    return {
      bg: "bg-gray-800",
      text: "text-orange-400",
      border: "border-orange-500/60",
      bar: "bg-orange-400",
    };
  return {
    bg: "bg-gray-800",
    text: "text-red-400",
    border: "border-red-500/60",
    bar: "bg-red-500",
  };
}

export function gradeToDeltaType(
  grade: string,
): "increase" | "neutral" | "decrease" {
  if (["A+", "A", "B+", "B"].includes(grade)) return "increase";
  else if (["C+", "C"].includes(grade)) return "neutral";
  else return "decrease";
}

export function bandClasses(band: TScoreBand): {
  dot: string;
  scoreText: string;
} {
  if (band === "excellent")
    return { dot: "bg-emerald-400", scoreText: "text-emerald-300" };
  if (band === "good")
    return { dot: "bg-green-400", scoreText: "text-green-300" };
  if (band === "fair")
    return { dot: "bg-yellow-400", scoreText: "text-yellow-300" };
  return { dot: "bg-red-500", scoreText: "text-red-400" };
}
