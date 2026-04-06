import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import type { SessionMetrics, SessionProjectLogDetails } from '../types';
import { computeEfficiencyScore, gradeClasses, bandClasses, gradeToDeltaType } from '../lib/efficiency';
import type { MetricScore } from '../lib/efficiency';
import { BadgeDelta } from './ui/badge-delta';

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return 'N/A';
  if (durationMs < 1000) return `${durationMs}ms`;
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

type SessionDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  selectedSessionId: string | null;
  selectedSession: SessionMetrics | null;
  projectLogDetails: SessionProjectLogDetails | null;
  formatNumber: (value: number) => string;
  formatCurrency: (value: number | null) => string;
  formatDate: (value: number | null) => string;
};

function MetricTile({ metric }: { metric: MetricScore }) {
  const { dot, scoreText } = bandClasses(metric.band);
  return (
    <div className="rounded-lg bg-gray-900/70 p-2.5" title={metric.description}>
      <div className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${metric.available ? dot : 'bg-gray-600'}`}
        />
        <span className="truncate text-xs text-gray-400">{metric.label}</span>
        {metric.requiresLogData && !metric.available ? (
          <span className="ml-auto text-xs text-gray-600">🔒</span>
        ) : null}
      </div>
      {metric.available ? (
        <>
          <div className={`mt-1 text-sm font-bold ${scoreText}`}>{metric.score}%</div>
          <div className="text-xs text-gray-500">{metric.rawDisplay}</div>
        </>
      ) : (
        <div className="mt-1 text-xs text-gray-600">Needs log data</div>
      )}
    </div>
  );
}

function EfficiencyPanel({
  session,
  logDetails,
}: {
  session: SessionMetrics;
  logDetails: SessionProjectLogDetails | null;
}) {
  const eff = computeEfficiencyScore(session, logDetails);
  const gc = gradeClasses(eff.grade);

  return (
    <div className={`rounded-xl border p-4 ${gc.border} ${gc.bg}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Score header */}
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Efficiency Score</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold ${gc.text}`}>{eff.total}%</span>
            <BadgeDelta
              variant="solidOutline"
              deltaType={gradeToDeltaType(eff.grade)}
              iconStyle="line"
              value={eff.grade}
            />
            <span className="text-sm text-gray-400">{eff.label}</span>
          </div>
          {eff.isSubagent ? (
            <span className="mt-1 inline-block text-xs text-gray-500">Subagent session</span>
          ) : null}
        </div>
        {/* Progress bar */}
        <div className="min-w-[140px] flex-1 sm:max-w-[200px]">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className={`h-2 rounded-full transition-all ${gc.bar}`}
              style={{ width: `${eff.total}%` }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-xs text-gray-600">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
      </div>

      {/* Per-metric tiles */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {eff.metrics.map((m) => (
          <MetricTile key={m.key} metric={m} />
        ))}
      </div>

      {!eff.hasLogData ? (
        <p className="mt-2 text-xs text-gray-500">
          4 extended metrics (🔒) unlock when JSONL log data is available for this session.
        </p>
      ) : null}
    </div>
  );
}

export function SessionDetailsModal({
  isOpen,
  onClose,
  loading,
  error,
  selectedSessionId,
  selectedSession,
  projectLogDetails,
  formatNumber,
  formatCurrency,
  formatDate,
}: SessionDetailsModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4"
          role="presentation"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <motion.div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-gray-700 bg-gray-900 p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Session details"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-100">Session Details</h3>
                <p className="mt-1 text-sm text-gray-400">
                  {selectedSessionId ? `Session ${selectedSessionId.slice(0, 12)}...` : 'Selected session'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-100"
                onClick={onClose}
              >
                Close
              </button>
            </div>

            {loading ? (
              <div className="mt-4 rounded-xl border border-gray-700 bg-gray-800 p-5">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-300/30 border-t-emerald-300" />
                  <p className="text-sm text-gray-300">Loading session details...</p>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-xl border border-orange-500/40 bg-orange-500/10 p-4">
                <p className="text-sm text-orange-200">{error}</p>
              </div>
            ) : null}

            {!loading && !error && selectedSession ? (
              <div className="mt-4 space-y-4">
                <EfficiencyPanel session={selectedSession} logDetails={projectLogDetails} />

                {projectLogDetails ? (
                  <div
                    className={
                      projectLogDetails.status === 'ok'
                        ? 'rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3'
                        : 'rounded-xl border border-orange-500/40 bg-orange-500/10 p-3'
                    }
                  >
                    <div className="text-xs uppercase tracking-wide text-gray-300">Project Log Scan</div>
                    <p className="mt-1 text-sm text-gray-200">{projectLogDetails.message}</p>
                    {projectLogDetails.scannedFileLimitHit ? (
                      <p className="mt-1 text-xs text-gray-400">Scan reached the file limit (500 `.jsonl` files).</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Session ID</div>
                    <div className="mt-1 break-all text-sm text-gray-100">{selectedSession.sessionId}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Project Path</div>
                    <div className="mt-1 break-all text-sm text-gray-100">{selectedSession.projectPath}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Started</div>
                    <div className="mt-1 text-sm text-gray-100">{formatDate(selectedSession.startedAt)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Ended</div>
                    <div className="mt-1 text-sm text-gray-100">{formatDate(selectedSession.endedAt)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Session Type</div>
                    <div className="mt-1 text-sm text-gray-100">{selectedSession.isSubagent ? 'Subagent' : 'Main session'}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Source Files</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.sourceFiles)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Prompts</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.promptCount)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Assistant Turns</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.assistantTurns)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Web Searches</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.webSearchRequests)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Known Cost</div>
                    <div className="mt-1 text-sm text-gray-100">{formatCurrency(selectedSession.knownCostUsd)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Input Tokens</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.inputTokens)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Output Tokens</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.outputTokens)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Total Context</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.totalContextTokens)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Cache Read</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.cacheReadTokens)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Cache Creation</div>
                    <div className="mt-1 text-sm text-gray-100">{formatNumber(selectedSession.cacheCreationTokens)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Peak Context</div>
                    <div className="mt-1 text-sm text-gray-100">
                      {selectedSession.peakContextPct === null ? 'N/A' : `${selectedSession.peakContextPct.toFixed(1)}%`}
                    </div>
                  </div>
                </div>

                {projectLogDetails?.status === 'ok' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">JSONL Files Scanned</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.logFilesScanned)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Matched Files</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.matchedLogFiles)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Matched Log Lines</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.matchedLines)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Session Duration (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatDuration(projectLogDetails.durationMs)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">User Prompts (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.userPromptCount)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Assistant Messages (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.assistantMessageCount)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Tool Uses (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.toolUseCount)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Tool Results (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.toolResultCount)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Input (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.inputTokens)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Output (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.outputTokens)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Context (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.totalContextTokens)}</div>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Peak Turn Context (Logs)</div>
                        <div className="mt-1 text-sm text-gray-100">{formatNumber(projectLogDetails.maxContextTokensInTurn)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">First Prompt (Logs)</div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-100">
                          {projectLogDetails.firstPromptPreview ?? 'N/A'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Last Prompt (Logs)</div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-100">
                          {projectLogDetails.lastPromptPreview ?? 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">First Assistant Text (Logs)</div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-100">
                          {projectLogDetails.firstAssistantPreview ?? 'N/A'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Last Assistant Text (Logs)</div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-100">
                          {projectLogDetails.lastAssistantPreview ?? 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="mb-2 text-xs uppercase tracking-wide text-gray-400">Detected Models (Logs)</div>
                        {projectLogDetails.models.length === 0 ? (
                          <p className="text-sm text-gray-400">No models detected.</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {projectLogDetails.models.map((model) => (
                              <span key={model} className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200">
                                {model}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                        <div className="mb-2 text-xs uppercase tracking-wide text-gray-400">Tool Uses (Logs)</div>
                        {projectLogDetails.toolCounts.length === 0 ? (
                          <p className="text-sm text-gray-400">No tool usage found.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-full border-collapse text-sm">
                              <thead>
                                <tr>
                                  <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Tool</th>
                                  <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Count</th>
                                </tr>
                              </thead>
                              <tbody>
                                {projectLogDetails.toolCounts.map((tool) => (
                                  <tr key={tool.name}>
                                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{tool.name}</td>
                                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(tool.count)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                      <div className="mb-2 text-xs uppercase tracking-wide text-gray-400">Model Usage (Logs)</div>
                      {projectLogDetails.modelUsage.length === 0 ? (
                        <p className="text-sm text-gray-400">No model usage details found.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-full border-collapse text-sm">
                            <thead>
                              <tr>
                                <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Model</th>
                                <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Turns</th>
                                <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Input</th>
                                <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Output</th>
                                <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Context</th>
                                <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Web Search</th>
                              </tr>
                            </thead>
                            <tbody>
                              {projectLogDetails.modelUsage.map((model) => (
                                <tr key={model.model}>
                                  <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{model.model}</td>
                                  <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.turns)}</td>
                                  <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.inputTokens)}</td>
                                  <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.outputTokens)}</td>
                                  <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.totalContextTokens)}</td>
                                  <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.webSearchRequests)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                      <div className="mb-2 text-xs uppercase tracking-wide text-gray-400">Matched Log Files</div>
                      {projectLogDetails.matchedFiles.length === 0 ? (
                        <p className="text-sm text-gray-400">No matched files available.</p>
                      ) : (
                        <div className="space-y-1">
                          {projectLogDetails.matchedFiles.slice(0, 8).map((filePath) => (
                            <p key={filePath} className="break-all text-xs text-gray-300">{filePath}</p>
                          ))}
                          {projectLogDetails.matchedFiles.length > 8 ? (
                            <p className="text-xs text-gray-400">+{projectLogDetails.matchedFiles.length - 8} more files</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}

                <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                  <div className="mb-2 text-xs uppercase tracking-wide text-gray-400">Model Breakdown</div>
                  {selectedSession.modelBreakdown.length === 0 ? (
                    <p className="text-sm text-gray-400">No model breakdown available.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-full border-collapse text-sm">
                        <thead>
                          <tr>
                            <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Model</th>
                            <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Input</th>
                            <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Output</th>
                            <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Cache Read</th>
                            <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Cache Creation</th>
                            <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Context</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedSession.modelBreakdown.map((model) => (
                            <tr key={model.model}>
                              <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{model.model}</td>
                              <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.inputTokens)}</td>
                              <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.outputTokens)}</td>
                              <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.cacheReadTokens)}</td>
                              <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.cacheCreationTokens)}</td>
                              <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{formatNumber(model.totalContextTokens)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
