import { useRef, useState } from "react";
import { SessionDetailsModal } from "./SessionDetailsModal";
import type { SessionMetrics, SessionProjectLogDetails } from "../types";
import { computeEfficiencyScore, gradeToDeltaType } from "../lib/efficiency";
import { BadgeDelta } from "./ui/badge-delta";

export interface SessionsTableProps {
  sessions: SessionMetrics[];
  page: number;
  totalPages: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onPrev: () => void;
  onNext: () => void;
  formatNumber: (value: number) => string;
  formatCurrency: (value: number | null) => string;
  formatDate: (value: number | null) => string;
  shortProject: (path: string) => string;
}

export function SessionsTable({
  sessions,
  page,
  totalPages,
  pageSize,
  onPageSizeChange,
  onPrev,
  onNext,
  formatNumber,
  formatCurrency,
  formatDate,
  shortProject,
}: SessionsTableProps) {
  const MIN_DETAILS_LOADING_MS = 2000;
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [selectedSession, setSelectedSession] = useState<SessionMetrics | null>(
    null,
  );
  const [projectLogDetails, setProjectLogDetails] =
    useState<SessionProjectLogDetails | null>(null);
  const detailsRequestIdRef = useRef(0);

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
          const payload = (await response.json()) as {
            error?: string;
            detail?: string;
          };
          throw new Error(
            payload.detail ||
              payload.error ||
              `Session details API error: ${response.status}`,
          );
        }
        const text = await response.text();
        throw new Error(
          `Session details API error: ${response.status}. ${text.slice(0, 120)}`,
        );
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
        message:
          error instanceof Error
            ? error.message
            : "Unable to inspect project logs.",
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
      const found =
        sessions.find((session) => session.sessionId === sessionId) ?? null;
      if (!found) throw new Error("Session not found in latest metrics.");
      setSelectedSession(found);

      const projectLogPromise = fetchProjectLogDetails(found);
      const minDelayPromise = new Promise<void>((resolve) => {
        window.setTimeout(resolve, MIN_DETAILS_LOADING_MS);
      });

      const [projectDetails] = await Promise.all([
        projectLogPromise,
        minDelayPromise,
      ]);

      if (requestId !== detailsRequestIdRef.current) return;
      setProjectLogDetails(projectDetails);
    } catch (error) {
      if (requestId !== detailsRequestIdRef.current) return;
      setDetailsError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingDetails(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-gray-700 bg-gray-800 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-100">Sessions</h2>
        <span className="text-sm text-gray-400">
          {formatNumber(sessions.length)} rows
        </span>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-gray-400">
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
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
            onClick={onPrev}
            disabled={page <= 1}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-xs text-gray-400">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={page >= totalPages}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                When
              </th>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                Project
              </th>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                Prompts
              </th>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                Input
              </th>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                Output
              </th>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                Context
              </th>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                Peak Ctx
              </th>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                Known Cost
              </th>
              <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const eff = computeEfficiencyScore(session);
              console.log("eff", eff);
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
                      ? "N/A"
                      : `${session.peakContextPct.toFixed(1)}%`}
                  </td>
                  <td className="border-b border-gray-700 px-2 py-2 text-gray-100">
                    {formatCurrency(session.knownCostUsd)}
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
            })}
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
