import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis, Bar, BarChart } from 'recharts';
import type { ISessionMetrics } from '../types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type TChartConfig,
} from '@/components/ui/chart';

export interface ITrendsPanelProps {
  sessions: ISessionMetrics[];
  formatNumber: (value: number) => string;
  formatCompactKM: (value: number) => string;
}

type TTrendMode = 'sessions_24' | 'hours_24' | 'days_7';

function formatTime24(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const lineChartConfig = {
  context: {
    label: 'Context Tokens',
    color: '#34d399',
  },
} satisfies TChartConfig;

const barChartConfig = {
  total: {
    label: 'Context Tokens',
    color: '#34d399',
  },
} satisfies TChartConfig;

export function TrendsPanel({ sessions, formatNumber, formatCompactKM }: ITrendsPanelProps) {
  const [mode, setMode] = useState<TTrendMode>('sessions_24');

  const points = useMemo(() => {
    if (mode === 'sessions_24') {
      return sessions.slice(0, 24).reverse().map((s, idx) => ({
        key: `session-${s.sessionId}-${idx}`,
        date: s.endedAt === null ? `S${idx + 1}` : s.endedAt.toString(),
        label: s.sessionId.slice(0, 7),
        context: s.totalContextTokens,
        tooltipDate: s.endedAt === null
          ? `Session ${idx + 1}`
          : new Date(s.endedAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            }),
      }));
    }

    if (mode === 'hours_24') {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const start = now.getTime() - 23 * 60 * 60 * 1000;
      const buckets = Array.from({ length: 24 }, (_, i) => {
        const ts = start + i * 60 * 60 * 1000;
        return {
          key: `h-${ts}`,
          date: ts.toString(),
          label: formatTime24(ts),
          context: 0,
          tooltipDate: new Date(ts).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          }),
        };
      });
      for (const s of sessions) {
        if (s.endedAt === null) continue;
        if (s.endedAt < start || s.endedAt > now.getTime() + 60 * 60 * 1000) continue;
        const hourStart = new Date(s.endedAt);
        hourStart.setMinutes(0, 0, 0);
        const index = Math.floor((hourStart.getTime() - start) / (60 * 60 * 1000));
        if (index >= 0 && index < buckets.length) buckets[index].context += s.totalContextTokens;
      }
      return buckets;
    }

    // days_7
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return {
        key: d.toISOString().slice(0, 10),
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        context: 0,
        tooltipDate: d.toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric',
        }),
      };
    });
    for (const s of sessions) {
      if (s.endedAt === null) continue;
      const d = new Date(s.endedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.context += s.totalContextTokens;
    }
    return buckets;
  }, [mode, sessions]);

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return {
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        total: 0,
      };
    });
    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const s of sessions) {
      if (s.endedAt === null) continue;
      const key = new Date(s.endedAt).toISOString().slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.total += s.totalContextTokens;
    }
    return buckets;
  }, [sessions]);

  const totalContext = useMemo(
    () => points.reduce((acc, p) => acc + p.context, 0),
    [points],
  );

  const modeLabels: Record<TTrendMode, { title: string; description: string }> = {
    sessions_24: {
      title: 'Last 24 Sessions',
      description: 'Context tokens per session',
    },
    hours_24: {
      title: 'Last 24 Hours',
      description: 'Context tokens by hour',
    },
    days_7: {
      title: 'Last 7 Days',
      description: 'Context tokens by day',
    },
  };

  return (
    <section className="mt-4 space-y-4">
      {/* ── Interactive line chart ─────────────────────────────────────────── */}
      <Card className="py-4 sm:py-0">
        <CardHeader className="flex flex-col items-stretch border-b border-gray-700 p-0! sm:flex-row">
          <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 pt-4 sm:pb-4">
            <CardTitle className="text-base text-gray-100">Context Token Trend</CardTitle>
            <CardDescription>{modeLabels[mode].description}</CardDescription>
          </div>
          <div className="flex">
            {(['sessions_24', 'hours_24', 'days_7'] as TTrendMode[]).map((key) => (
              <button
                key={key}
                type="button"
                data-active={mode === key}
                className="flex flex-1 flex-col justify-center gap-1 border-t border-gray-700 px-5 py-3 text-left even:border-l even:border-gray-700 data-[active=true]:bg-gray-700/50 sm:border-t-0 sm:border-l sm:px-6 sm:py-4"
                onClick={() => setMode(key)}
              >
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {modeLabels[key].title}
                </span>
                <span className="text-sm font-bold text-gray-100 sm:text-lg leading-none">
                  {mode === key ? formatCompactKM(totalContext) : '—'}
                </span>
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="px-2 pt-4 sm:p-6">
          {points.length < 2 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-gray-500">
              Not enough data for this view
            </div>
          ) : (
            <ChartContainer config={lineChartConfig} className="aspect-auto h-[220px] w-full">
              <LineChart data={points} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} stroke="#374151" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  width={52}
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  tickFormatter={formatCompactKM}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      className="w-[170px]"
                      nameKey="context"
                      labelFormatter={(_value, payload) => {
                        const item = payload?.[0]?.payload as Record<string, unknown> | undefined;
                        return (item?.tooltipDate as string | undefined) ?? '';
                      }}
                      formatter={(value) => (
                        <span className="font-mono text-green-300">
                          {formatNumber(value as number)} tokens
                        </span>
                      )}
                    />
                  }
                />
                <Line
                  dataKey="context"
                  type="monotone"
                  stroke="var(--color-context)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#34d399', stroke: '#111827', strokeWidth: 2 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Daily bar chart ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-gray-100">Daily Usage</CardTitle>
          <CardDescription>Context tokens over the last 7 days</CardDescription>
        </CardHeader>
        <CardContent className="px-2 pb-4 sm:px-6">
          <ChartContainer config={barChartConfig} className="aspect-auto h-[160px] w-full">
            <BarChart data={days} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#374151" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={52}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={formatCompactKM}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[160px]"
                    nameKey="total"
                    labelFormatter={(_value, payload) => {
                      const item = payload?.[0]?.payload as Record<string, unknown> | undefined;
                      return (item?.label as string | undefined) ?? '';
                    }}
                    formatter={(value) => (
                      <span className="font-mono text-green-300">
                        {formatNumber(value as number)} tokens
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey="total"
                fill="var(--color-total)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </section>
  );
}
