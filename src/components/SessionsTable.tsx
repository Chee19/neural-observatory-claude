import { useMemo, useRef, useState } from "react";
import { SessionDetailsModal } from "./SessionDetailsModal";
import type { SessionMetrics, SessionProjectLogDetails } from "../types";
import { computeEfficiencyScore, gradeToDeltaType } from "../lib/efficiency";
import { BadgeDelta } from "./ui/badge-delta";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Filter range definitions ──────────────────────────────────────────────────

interface RangeOption {
  label: string;
  min?: number;
  max?: number;
  nullOnly?: boolean;    // match rows where the value is null
  includeNull?: boolean; // "Any" — pass through regardless
}

const PROMPT_RANGES: RangeOption[] = [
  { label: "Any", includeNull: true },
  { label: "1–5", min: 1, max: 5 },
  { label: "6–15", min: 6, max: 15 },
  { label: "16–50", min: 16, max: 50 },
  { label: "51+", min: 51 },
];

const PEAK_CTX_RANGES: RangeOption[] = [
  { label: "Any", includeNull: true },
  { label: "No data", nullOnly: true },
  { label: "0–10%", min: 0, max: 10 },
  { label: "10–30%", min: 10, max: 30 },
  { label: "30–60%", min: 30, max: 60 },
  { label: "60%+", min: 60 },
];

const CONTEXT_RANGES: RangeOption[] = [
  { label: "Any", includeNull: true },
  { label: "<10K", min: 0, max: 10_000 },
  { label: "10K–100K", min: 10_000, max: 100_000 },
  { label: "100K–500K", min: 100_000, max: 500_000 },
  { label: "500K+", min: 500_000 },
];

const COST_RANGES: RangeOption[] = [
  { label: "Any", includeNull: true },
  { label: "No data", nullOnly: true },
  { label: "<$0.10", min: 0, max: 0.1 },
  { label: "$0.10–$1", min: 0.1, max: 1 },
  { label: "$1–$5", min: 1, max: 5 },
  { label: "$5+", min: 5 },
];

const SCORE_RANGES: RangeOption[] = [
  { label: "Any", includeNull: true },
  { label: "A  90+", min: 90 },
  { label: "B  80–89", min: 80, max: 89 },
  { label: "C  70–79", min: 70, max: 79 },
  { label: "D  50–69", min: 50, max: 69 },
  { label: "F  <50", min: 0, max: 49 },
];

function matchesRange(value: number | null, opt: RangeOption): boolean {
  if (opt.includeNull) return true;
  if (opt.nullOnly) return value === null;
  if (value === null) return false;
  const lo = opt.min ?? -Infinity;
  const hi = opt.max ?? Infinity;
  return value >= lo && value <= hi;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterKey = "prompts" | "peakCtx" | "context" | "cost" | "score";

const FILTER_CONFIG: { key: FilterKey; label: string; ranges: RangeOption[] }[] =
  [
    { key: "prompts", label: "Prompts", ranges: PROMPT_RANGES },
    { key: "peakCtx", label: "Peak Ctx", ranges: PEAK_CTX_RANGES },
    { key: "context", label: "Context", ranges: CONTEXT_RANGES },
    { key: "cost", label: "Known Cost", ranges: COST_RANGES },
    { key: "score", label: "Score", ranges: SCORE_RANGES },
  ];

export interface SessionsTableProps {
  sessions: SessionMetrics[];
  formatNumber: (value: number) => string;
  formatCurrency: (value: number | null) => string;
  formatDate: (value: number | null) => string;
  shortProject: (path: string) => string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SessionsTable({
  sessions,
  formatNumber,
  formatCurrency,
  formatDate,
  shortProject,
}: SessionsTableProps) {
  const MIN_DETAILS_LOADING_MS = 2000;
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionMetrics | null>(null);
  const [projectLogDetails, setProjectLogDetails] = useState<SessionProjectLogDetails | null>(null);
  const detailsRequestIdRef = useRef(0);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [activeFilters, setActiveFilters] = useState<Record<FilterKey, number>>({
    prompts: 0,
    peakCtx: 0,
    context: 0,
    cost: 0,
    score: 0,
  });

  // Pre-compute scores once so the filter memo can reference them
  const sessionScores = useMemo(
    () => new Map(sessions.map((s) => [s.sessionId, computeEfficiencyScore(s).total])),
    [sessions],
  );

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (!matchesRange(s.promptCount, PROMPT_RANGES[activeFilters.prompts])) return false;
      if (!matchesRange(s.peakContextPct, PEAK_CTX_RANGES[activeFilters.peakCtx])) return false;
      if (!matchesRange(s.totalContextTokens, CONTEXT_RANGES[activeFilters.context])) return false;
      if (!matchesRange(s.knownCostUsd, COST_RANGES[activeFilters.cost])) return false;
      const score = sessionScores.get(s.sessionId) ?? null;
      if (!matchesRange(score, SCORE_RANGES[activeFilters.score])) return false;
      return true;
    });
  }, [sessions, activeFilters, sessionScores]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pagedSessions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredSessions.slice(start, start + pageSize);
  }, [currentPage, pageSize, filteredSessions]);

  function setFilter(key: FilterKey, idx: number) {
    setActiveFilters((prev) => ({ ...prev, [key]: idx }));
    setPage(1);
  }

  function resetFilters() {
    setActiveFilters({ prompts: 0, peakCtx: 0, context: 0, cost: 0, score: 0 });
    setPage(1);
  }

  const hasActiveFilters = Object.values(activeFilters).some((v) => v !== 0);

  // ─── Session detail fetch ──────────────────────────────────────────────────

  async function fetchProjectLogDetails(
    session: SessionMetrics,
  ): Promise<SessionProjectLogDetails> {
    try {
      const query = new URLSearchParams({
        sessionId: session.sessionId,
        projectPath: session.projectPath,
      });
      const response = await fetch(`/api/session-details?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as { error?: string; detail?: string };
          throw new Error(
            payload.detail || payload.error || `Session details API error: ${response.status}`,
          );
        }
        const text = await response.text();
        throw new Error(`Session details API error: ${response.status}. ${text.slice(0, 120)}`);
      }

      if (!contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          [
            "Session details endpoint returned non-JSON content.",
            "This usually means the API server is not running or the route was not matched.",
            `Preview: ${text.slice(0, 120)}`,
          ].join(" "),
        );
      }

      return (await response.json()) as SessionProjectLogDetails;
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unable to inspect project logs.",
        sessionId: session.sessionId,
        projectPath: session.projectPath,
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
    }
  }

  async function openSessionDetails(sessionId: string) {
    const requestId = detailsRequestIdRef.current + 1;
    detailsRequestIdRef.current = requestId;
    setIsDetailsOpen(true);
    setSelectedSessionId(sessionId);
    setSelectedSession(null);
    setProjectLogDetails(null);
    setDetailsError(null);
    setLoadingDetails(true);

    try {
      const found = sessions.find((s) => s.sessionId === sessionId) ?? null;
      if (!found) throw new Error("Session not found in latest metrics.");
      setSelectedSession(found);

      const projectLogPromise = fetchProjectLogDetails(found);
      const minDelayPromise = new Promise<void>((resolve) => {
        window.setTimeout(resolve, MIN_DETAILS_LOADING_MS);
      });

      const [projectDetails] = await Promise.all([projectLogPromise, minDelayPromise]);

      if (requestId !== detailsRequestIdRef.current) return;
      setProjectLogDetails(projectDetails);
    } catch (error) {
      if (requestId !== detailsRequestIdRef.current) return;
      setDetailsError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDetails(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="mt-4 rounded-xl border border-gray-700 bg-gray-800 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-100">Sessions</h2>
        <span className="text-sm text-gray-400">
          {hasActiveFilters
            ? `${formatNumber(filteredSessions.length)} of ${formatNumber(sessions.length)} rows`
            : `${formatNumber(sessions.length)} rows`}
        </span>
      </div>

      {/* ── Filter dropdowns ─────────────────────────────────────────────── */}
      <div className="mb-3 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Filters
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-gray-400 underline underline-offset-2 transition-colors hover:text-gray-200"
            >
              Reset all
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {FILTER_CONFIG.map(({ key, label, ranges }) => (
            <div key={key} className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">{label}</span>
              <Select
                value={String(activeFilters[key])}
                onValueChange={(val) => setFilter(key, Number(val))}
              >
                <SelectTrigger
                  className={
                    activeFilters[key] !== 0
                      ? "h-8 w-36 border-green-400/60 bg-green-400/10 text-xs text-green-300 focus:ring-green-500 focus:ring-offset-gray-900"
                      : "h-8 w-36 border-gray-700 bg-gray-900 text-xs text-gray-300 focus:ring-gray-500 focus:ring-offset-gray-900"
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-gray-700 bg-gray-900 text-gray-100">
                  {ranges.map((opt, idx) => (
                    <SelectItem
                      key={opt.label}
                      value={String(idx)}
                      className="text-xs text-gray-100 focus:bg-gray-700 focus:text-gray-100"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pagination controls ───────────────────────────────────────────── */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-gray-400">
          Rows
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-gray-100"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>

        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs text-gray-400">
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-full border-collapse text-sm">
          <thead>
            <tr>
              {["When", "Project", "Prompts", "Input", "Output", "Context", "Peak Ctx", "Known Cost", "Score"].map(
                (h) => (
                  <th
                    key={h}
                    className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {pagedSessions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-sm text-gray-500">
                  No sessions match the current filters.
                </td>
              </tr>
            ) : (
              pagedSessions.map((session) => {
                const eff = computeEfficiencyScore(session);
                return (
                  <tr
                    key={session.sessionId}
                    className="cursor-pointer transition hover:bg-green-200 hover:bg-opacity-10"
                    onClick={() => void openSessionDetails(session.sessionId)}
                  >
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">
                      {formatDate(session.endedAt)}
                    </td>
                    <td
                      className="border-b border-gray-700 px-2 py-2 text-gray-100"
                      title={session.projectPath}
                    >
                      {shortProject(session.projectPath)}
                    </td>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">
                      {formatNumber(session.promptCount)}
                    </td>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">
                      {formatNumber(session.inputTokens)}
                    </td>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">
                      {formatNumber(session.outputTokens)}
                    </td>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">
                      {formatNumber(session.totalContextTokens)}
                    </td>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">
                      {session.peakContextPct === null
                        ? "-"
                        : `${session.peakContextPct.toFixed(1)}%`}
                    </td>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">
                      {formatCurrency(session.knownCostUsd) === "N/A"
                        ? "-"
                        : formatCurrency(session.knownCostUsd)}
                    </td>
                    <td className="border-b border-gray-700 px-2 py-2">
                      {eff.metrics.some((m) => m.available) ? (
                        <BadgeDelta
                          variant="solidOutline"
                          deltaType={gradeToDeltaType(eff.grade)}
                          value={`${eff.total}% ${eff.grade}`}
                          title={`${eff.label} — core metrics only (open for full score)`}
                        />
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SessionDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        loading={loadingDetails}
        error={detailsError}
        selectedSessionId={selectedSessionId}
        selectedSession={selectedSession}
        projectLogDetails={projectLogDetails}
        formatNumber={formatNumber}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
      />
    </section>
  );
}
