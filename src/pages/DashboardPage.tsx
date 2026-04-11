import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { MetricCard } from "../components/MetricCard";
import { MetricDetailsModal } from "../components/MetricDetailsModal";
import { SessionsTable } from "../components/SessionsTable";
import { TrendsPanel } from "../components/TrendsPanel";
import type {
  IApiMetricsResponse,
  IMetricBreakdownItem,
  ISessionMetrics,
} from "../types";
import { SparklesCore } from "@/components/ui/sparkles";
import { LeftNavigationDock } from "@/components/ui/navigation-dock";

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatCurrency(value: number | null): string {
  if (value === null) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}

dayjs.extend(utc);

function formatDate(value: number | null): string {
  if (value === null) return "Unknown";
  return dayjs(value).utc().format("YYYY-MM-DD HH:mm:ss UTC");
}

function formatCompactKM(value: number): string {
  if (value >= 1_000_000)
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000)
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return formatNumber(value);
}

function shortProject(value: string): string {
  if (!value || value === "unknown") return "unknown";
  const parts = value.split("/").filter(Boolean);
  return parts.slice(-2).join("/");
}

function splitBySessionType(
  sessions: ISessionMetrics[],
  getValue: (session: ISessionMetrics) => number,
): IMetricBreakdownItem[] {
  const regularTotal = sessions
    .filter((s) => !s.isSubagent)
    .reduce((acc, session) => acc + getValue(session), 0);
  const subagentTotal = sessions
    .filter((s) => s.isSubagent)
    .reduce((acc, session) => acc + getValue(session), 0);
  const total = regularTotal + subagentTotal;

  if (total <= 0) return [];

  return [
    {
      name: "Main Sessions",
      count: regularTotal,
      pct: (regularTotal / total) * 100,
    },
    {
      name: "Subagent Sessions",
      count: subagentTotal,
      pct: (subagentTotal / total) * 100,
    },
  ];
}

type TAllTimeCardKey =
  | "sessions"
  | "prompts"
  | "assistantTurns"
  | "context"
  | "input"
  | "output"
  | "cost"
  | "tools"
  | "agentInvocations"
  | "skills"
  | "subagentSessions"
  | "uniqueSubagents";

function allTimeModalData(
  key: TAllTimeCardKey,
  result: IApiMetricsResponse,
): {
  title: string;
  subtitle: string;
  totalLabel: string;
  totalValue: string;
  items: IMetricBreakdownItem[];
} {
  const { allTime, cumulative, sessions } = result;

  switch (key) {
    case "sessions":
      return {
        title: "Sessions",
        subtitle: "Main versus subagent sessions parsed from ~/.claude logs.",
        totalLabel: "Total Sessions",
        totalValue: formatNumber(allTime.totalSessions),
        items: [
          {
            name: "Main Sessions",
            count: allTime.totalSessions - allTime.subagentSessions,
            pct:
              allTime.totalSessions > 0
                ? ((allTime.totalSessions - allTime.subagentSessions) /
                    allTime.totalSessions) *
                  100
                : 0,
          },
          {
            name: "Subagent Sessions",
            count: allTime.subagentSessions,
            pct:
              allTime.totalSessions > 0
                ? (allTime.subagentSessions / allTime.totalSessions) * 100
                : 0,
          },
        ],
      };
    case "prompts":
      return {
        title: "User Prompts",
        subtitle: "Prompts are user message turns parsed from session logs.",
        totalLabel: "Total Prompts",
        totalValue: formatNumber(cumulative.prompts),
        items: splitBySessionType(sessions, (s) => s.promptCount),
      };
    case "assistantTurns":
      return {
        title: "Assistant Turns",
        subtitle:
          "Assistant turns are model responses where usage tokens were recorded.",
        totalLabel: "Total Assistant Turns",
        totalValue: formatNumber(allTime.assistantTurns),
        items: splitBySessionType(sessions, (s) => s.assistantTurns),
      };
    case "context":
      return {
        title: "Total Context Tokens",
        subtitle: "Context equals input + cache read + cache creation tokens.",
        totalLabel: "Total Context Tokens",
        totalValue: formatNumber(cumulative.totalContextTokens),
        items: splitBySessionType(sessions, (s) => s.totalContextTokens),
      };
    case "input":
      return {
        title: "Input Tokens",
        subtitle: "Tokens sent to the model, excluding output tokens.",
        totalLabel: "Total Input Tokens",
        totalValue: formatNumber(cumulative.inputTokens),
        items: splitBySessionType(sessions, (s) => s.inputTokens),
      };
    case "output":
      return {
        title: "Output Tokens",
        subtitle: "Tokens generated by the model across parsed sessions.",
        totalLabel: "Total Output Tokens",
        totalValue: formatNumber(cumulative.outputTokens),
        items: splitBySessionType(sessions, (s) => s.outputTokens),
      };
    case "cost": {
      const coveredSessions = sessions.filter(
        (session) => session.knownCostUsd !== null,
      ).length;
      const total = sessions.length || 1;
      return {
        title: "Known Cost",
        subtitle:
          "Cost values come from available backup snapshots and may be partial.",
        totalLabel: "Known Cost (USD)",
        totalValue: formatCurrency(cumulative.knownCostUsd),
        items: [
          {
            name: "Cost-Covered Sessions",
            count: coveredSessions,
            pct: (coveredSessions / total) * 100,
          },
          {
            name: "No Cost Data",
            count: total - coveredSessions,
            pct: ((total - coveredSessions) / total) * 100,
          },
        ],
      };
    }
    case "tools":
      return {
        title: "Tool Invocations",
        subtitle: "Assistant tool calls grouped by tool name.",
        totalLabel: "Total Tool Invocations",
        totalValue: formatNumber(allTime.toolInvocations),
        items: allTime.toolBreakdown,
      };
    case "agentInvocations":
      return {
        title: "Agent Invocations",
        subtitle: "Agent orchestration calls detected from tool-use records.",
        totalLabel: "Total Agent Invocations",
        totalValue: formatNumber(allTime.agentInvocations),
        items: allTime.agentBreakdown,
      };
    case "skills":
      return {
        title: "Skill Mentions",
        subtitle: "Skill references found in user prompts and log content.",
        totalLabel: "Total Skill Mentions",
        totalValue: formatNumber(allTime.skillMentions),
        items: allTime.skillBreakdown,
      };
    case "subagentSessions":
      return {
        title: "Subagent Sessions",
        subtitle: "Subagent session distribution by subagent id.",
        totalLabel: "Total Subagent Sessions",
        totalValue: formatNumber(allTime.subagentSessions),
        items: allTime.subagentBreakdown,
      };
    case "uniqueSubagents":
      return {
        title: "Unique Subagents",
        subtitle: "Distinct subagent identifiers discovered in subagent logs.",
        totalLabel: "Unique Subagents",
        totalValue: formatNumber(allTime.uniqueSubagents),
        items: allTime.subagentBreakdown,
      };
    default:
      return {
        title: "Metric",
        subtitle: "Detailed breakdown is not available for this metric.",
        totalLabel: "Value",
        totalValue: "N/A",
        items: [],
      };
  }
}

function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-gray-100">{title}</h2>
      {right}
    </div>
  );
}

function MetricsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IApiMetricsResponse | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<TAllTimeCardKey | null>(
    null,
  );
  const [inventoryExpanded, setInventoryExpanded] = useState(true);

  const sessions = useMemo(() => result?.sessions ?? [], [result]);
  const viewSessions = useMemo(
    () => sessions.filter((s) => !s.isSubagent),
    [sessions],
  );
  const tableSessions = viewSessions.length ? viewSessions : sessions;
  const latestSession = tableSessions[0] ?? null;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/metrics", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json() as Promise<IApiMetricsResponse>;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  const modalData =
    selectedMetric && result ? allTimeModalData(selectedMetric, result) : null;

  return (
    <main className="relative isolate min-h-screen w-full overflow-hidden bg-gray-900 text-gray-100">
      <LeftNavigationDock />
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1800&q=80')",
          }}
        />
        <SparklesCore
          id="dashboard-sparkles"
          background="transparent"
          minSize={0.45}
          maxSize={1.8}
          particleDensity={170}
          className="h-full w-full"
          particleColor="#a7f3d0"
          speed={1.1}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/60 via-gray-900/80 to-gray-900" />
      </div>
      <div className="mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-4 sm:pt-6 md:pl-40 md:pr-6 lg:pl-40 lg:pr-8">
        <section
          id="home"
          className="flex scroll-mt-4 flex-col items-start justify-between gap-5 rounded-2xl border border-gray-700 bg-gray-800 p-5 md:flex-row"
        >
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-green-400">
              Claude Usage Inspector
            </p>
            <h1 className="mb-2 mt-2 text-2xl md:text-3xl font-semibold leading-tight">
              Neural Observatory for LLM
            </h1>
            <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
              This app auto-loads from <code>~/.claude</code> through a local
              read-only API. No edit, write, or create operations are exposed.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            disabled={loading}
            className="w-full rounded-xl border border-emerald-400/30 bg-gradient-to-b from-emerald-500/20 to-gray-900/80 px-4 py-3 font-semibold text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.12)] transition hover:-translate-y-px hover:border-emerald-300/50 hover:from-emerald-400/25 hover:to-gray-900/70 disabled:cursor-wait disabled:opacity-70 md:w-auto"
            type="button"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </section>

        {result ? (
          <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
            Read-only mode: {String(result.readOnlyMode)} • Last updated:{" "}
            {dayjs(result.generatedAt).utc().format("YYYY-MM-DD HH:mm:ss UTC")}
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-lg border border-orange-400 bg-orange-500 px-3 py-2 text-sm text-orange-200">
            {error}
          </div>
        ) : null}

        {result ? (
          <>
            <section
              id="claude-inventory"
              className="mt-4 scroll-mt-4 rounded-xl border border-gray-700 bg-gray-800 p-4"
            >
              <SectionHeader
                title="Claude Inventory"
                right={
                  <button
                    type="button"
                    className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-100"
                    onClick={() => setInventoryExpanded((v) => !v)}
                    aria-expanded={inventoryExpanded}
                  >
                    {inventoryExpanded ? "Collapse" : "Expand"}
                  </button>
                }
              />

              {inventoryExpanded ? (
                <MetricsGrid>
                  <MetricCard
                    label="Agent Files"
                    value={formatNumber(result.inventory.agents)}
                    hint="Files under ~/.claude/agents"
                  />
                  <MetricCard
                    label="Skill Files"
                    value={formatNumber(result.inventory.skills)}
                    hint="Files under ~/.claude/skills"
                  />
                  <MetricCard
                    label="Plugin Files"
                    value={formatNumber(result.inventory.plugins)}
                    hint="Files under ~/.claude/plugins"
                  />
                  <MetricCard
                    label="Memory Files"
                    value={formatNumber(result.inventory.memoryFiles)}
                    hint="From memory folder and matching filenames"
                  />
                  <MetricCard
                    label="Log Files"
                    value={formatNumber(result.inventory.logFiles)}
                    hint="Detected by .log/.jsonl/.ndjson or name"
                  />
                  <MetricCard
                    label="Tracked Files"
                    value={formatNumber(result.inventory.trackedFiles)}
                    hint="Total files scanned for inventory"
                  />
                </MetricsGrid>
              ) : null}
            </section>

            <section
              id="all-time-metrics"
              className="mt-4 scroll-mt-4 rounded-xl border border-gray-700 bg-gray-800 p-4"
            >
              <SectionHeader title="All-Time Metrics" />

              <div className="mt-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                Usage Volume
              </div>
              <MetricsGrid>
                <MetricCard
                  label="Sessions"
                  value={formatNumber(result.cumulative.sessions)}
                  hint="Non-subagent sessions"
                  onClick={() => setSelectedMetric("sessions")}
                />
                <MetricCard
                  label="User Prompts"
                  value={formatNumber(result.cumulative.prompts)}
                  onClick={() => setSelectedMetric("prompts")}
                />
                <MetricCard
                  label="Assistant Turns"
                  value={formatNumber(result.allTime.assistantTurns)}
                  hint="Model responses with usage tokens"
                  onClick={() => setSelectedMetric("assistantTurns")}
                />
                <MetricCard
                  label="Total Context Tokens"
                  value={formatNumber(result.cumulative.totalContextTokens)}
                  onClick={() => setSelectedMetric("context")}
                />
                <MetricCard
                  label="Input Tokens"
                  value={formatNumber(result.cumulative.inputTokens)}
                  onClick={() => setSelectedMetric("input")}
                />
                <MetricCard
                  label="Output Tokens"
                  value={formatNumber(result.cumulative.outputTokens)}
                  onClick={() => setSelectedMetric("output")}
                />
              </MetricsGrid>

              <div className="mt-4 text-xs font-bold uppercase tracking-wider text-gray-400">
                Agents, Tools and Skills
              </div>
              <MetricsGrid>
                <MetricCard
                  label="Known Cost"
                  value={formatCurrency(result.cumulative.knownCostUsd)}
                  hint={`${result.cumulative.knownCostCoveragePct.toFixed(1)}% session coverage`}
                  onClick={() => setSelectedMetric("cost")}
                />
                <MetricCard
                  label="Tool Invocations"
                  value={formatNumber(result.allTime.toolInvocations)}
                  onClick={() => setSelectedMetric("tools")}
                />
                <MetricCard
                  label="Agent Invocations"
                  value={formatNumber(result.allTime.agentInvocations)}
                  hint="Detected in tool calls"
                  onClick={() => setSelectedMetric("agentInvocations")}
                />
                <MetricCard
                  label="Skill Mentions"
                  value={formatNumber(result.allTime.skillMentions)}
                  hint="Detected in prompts/log content"
                  onClick={() => setSelectedMetric("skills")}
                />
                <MetricCard
                  label="Subagent Sessions"
                  value={formatNumber(result.allTime.subagentSessions)}
                  onClick={() => setSelectedMetric("subagentSessions")}
                />
                <MetricCard
                  label="Unique Subagents"
                  value={formatNumber(result.allTime.uniqueSubagents)}
                  onClick={() => setSelectedMetric("uniqueSubagents")}
                />
              </MetricsGrid>
            </section>

            {latestSession ? (
              <section className="mt-4 rounded-xl border border-gray-700 bg-gray-800 p-4">
                <SectionHeader
                  title="Previous Session"
                  right={
                    <span className="text-sm text-gray-400">
                      {formatDate(latestSession.endedAt)}
                    </span>
                  }
                />
                <MetricsGrid>
                  <MetricCard
                    label="Session ID"
                    value={latestSession.sessionId.slice(0, 8)}
                    hint={shortProject(latestSession.projectPath)}
                  />
                  <MetricCard
                    label="Prompts"
                    value={formatNumber(latestSession.promptCount)}
                  />
                  <MetricCard
                    label="Assistant Turns"
                    value={formatNumber(latestSession.assistantTurns)}
                    hint="Assistant replies with usage"
                  />
                  <MetricCard
                    label="Context Tokens"
                    value={formatNumber(latestSession.totalContextTokens)}
                  />
                  <MetricCard
                    label="Peak Context"
                    value={
                      latestSession.peakContextPct === null
                        ? "N/A"
                        : `${latestSession.peakContextPct.toFixed(1)}%`
                    }
                    hint="Estimated from model context window"
                  />
                  <MetricCard
                    label="Known Cost"
                    value={formatCurrency(latestSession.knownCostUsd)}
                  />
                </MetricsGrid>
              </section>
            ) : null}

            <div id="context-usage" className="scroll-mt-4">
              <TrendsPanel
                sessions={tableSessions}
                formatNumber={formatNumber}
                formatCompactKM={formatCompactKM}
              />
            </div>

            {/* {result.warnings.length > 0 ? (
            <section className="mt-4 rounded-xl border border-gray-700 bg-gray-800 p-4">
              <h3 className="text-base font-semibold text-gray-100">Notes</h3>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-400">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null} */}

            <div id="sessions-list" className="scroll-mt-4">
              <SessionsTable
                sessions={tableSessions}
                formatNumber={formatNumber}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
                shortProject={shortProject}
              />
            </div>

            {modalData ? (
              <MetricDetailsModal
                isOpen
                title={modalData.title}
                subtitle={modalData.subtitle}
                totalLabel={modalData.totalLabel}
                totalValue={modalData.totalValue}
                items={modalData.items}
                onClose={() => setSelectedMetric(null)}
              />
            ) : null}
          </>
        ) : (
          <section className="mt-4 rounded-xl border border-gray-700 bg-gray-800 p-4">
            <h2 className="text-base font-semibold text-gray-100">Loading</h2>
            <p className="text-sm text-gray-400">
              Reading <code>~/.claude</code> from the local read-only API...
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
