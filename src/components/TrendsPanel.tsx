import { useMemo, useRef, useState } from 'react';
import type { SessionMetrics } from '../types';

export interface TrendsPanelProps {
  sessions: SessionMetrics[];
  formatNumber: (value: number) => string;
  formatCompactKM: (value: number) => string;
}

type TrendMode = 'sessions_24' | 'hours_24' | 'days_7';
type TrendPoint = {
  key: string;
  value: number;
  label: string;
  tooltipTitle: string;
  tooltipMeta: string;
};

function formatTime24(value: number): string {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function TrendsPanel({ sessions, formatNumber, formatCompactKM }: TrendsPanelProps) {
  const [mode, setMode] = useState<TrendMode>('sessions_24');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const plotWidth = 480;
  const plotHeight = 120;

  function updateHoverIndex(clientX: number) {
    if (!chartRef.current || points.length < 2) return;
    const rect = chartRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = (clientX - rect.left) / rect.width;
    const clamped = Math.max(0, Math.min(1, ratio));
    const index = Math.round(clamped * (points.length - 1));
    setHoverIndex(index);
  }

  const points = useMemo<TrendPoint[]>(() => {
    if (mode === 'sessions_24') {
      const sliced = sessions.slice(0, 24).reverse();
      return sliced.map((s, idx) => ({
        key: `session-${s.sessionId}-${idx}`,
        value: s.totalContextTokens,
        label: s.endedAt === null ? `S${idx + 1}` : formatTime24(s.endedAt),
        tooltipTitle: `Session #${idx + 1}`,
        tooltipMeta: s.endedAt === null
          ? 'Unknown time'
          : new Date(s.endedAt).toLocaleString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            day: '2-digit',
            month: 'short',
          }),
      }));
    }

    if (mode === 'hours_24') {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const start = now.getTime() - (23 * 60 * 60 * 1000);
      const buckets = Array.from({ length: 24 }, (_, i) => {
        const ts = start + (i * 60 * 60 * 1000);
        return {
          key: `h-${ts}`,
          value: 0,
          label: formatTime24(ts),
          tooltipTitle: `Hour ${formatTime24(ts)}`,
          tooltipMeta: new Date(ts).toLocaleDateString([], {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
        };
      });

      for (const s of sessions) {
        if (s.endedAt === null) continue;
        if (s.endedAt < start || s.endedAt > now.getTime() + (60 * 60 * 1000)) continue;
        const hourStart = new Date(s.endedAt);
        hourStart.setMinutes(0, 0, 0);
        const index = Math.floor((hourStart.getTime() - start) / (60 * 60 * 1000));
        if (index >= 0 && index < buckets.length) buckets[index].value += s.totalContextTokens;
      }

      return buckets;
    }

    const buckets: TrendPoint[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.push({
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        value: 0,
        tooltipTitle: d.toLocaleDateString(undefined, { weekday: 'long' }),
        tooltipMeta: d.toLocaleDateString(undefined, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      });
    }

    for (const s of sessions) {
      if (s.endedAt === null) continue;
      const d = new Date(s.endedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) bucket.value += s.totalContextTokens;
    }

    return buckets;
  }, [mode, sessions]);

  const xAxisTicks = useMemo(() => {
    if (points.length === 0) return [];
    const targetTickCount = Math.min(6, points.length);
    const lastIndex = points.length - 1;
    const used = new Set<number>();
    const ticks: Array<{ index: number; label: string }> = [];

    for (let i = 0; i < targetTickCount; i += 1) {
      const index = Math.round((i / Math.max(targetTickCount - 1, 1)) * lastIndex);
      if (used.has(index)) continue;
      used.add(index);
      ticks.push({ index, label: points[index]?.label ?? '' });
    }

    return ticks;
  }, [points]);

  const days = useMemo(() => {
    const buckets: Array<{ label: string; key: string; total: number }> = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({
        key,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        total: 0,
      });
    }

    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const s of sessions) {
      if (s.endedAt === null) continue;
      const key = new Date(s.endedAt).toISOString().slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.total += s.totalContextTokens;
    }

    return buckets;
  }, [sessions]);

  const values = points.map((p) => p.value);
  const max = Math.max(...values, 1);
  const normalizer = useMemo(() => {
    const nonZero = values.filter((v) => v > 0);
    const minNonZero = nonZero.length > 0 ? Math.min(...nonZero) : 0;
    const skewRatio = minNonZero > 0 ? max / minNonZero : max;
    const usePowerScale = skewRatio >= 30 && max >= 1_000;
    const exponent = usePowerScale ? 0.68 : 1;

    const toScale = (value: number) => (value <= 0 ? 0 : value ** exponent);
    const fromScale = (value: number) => (
      exponent === 1
        ? Math.max(0, Math.round(value))
        : Math.max(0, Math.round(value ** (1 / exponent)))
    );
    const transformedMax = Math.max(...values.map((v) => toScale(v)), 1);
    const yTicks = Array.from({ length: 5 }, (_, idx) => {
      const fraction = idx / 4;
      const scaled = fraction * transformedMax;
      const raw = fromScale(scaled);
      const y = plotHeight - fraction * plotHeight;
      return {
        raw,
        label: formatCompactKM(raw),
        y,
      };
    });

    return {
      usePowerScale,
      transformedMax,
      toScale,
      yTicks,
    };
  }, [formatCompactKM, max, plotHeight, values]);
  const dailyMax = Math.max(...days.map((d) => d.total), 1);

  const polyline = points.length > 1
    ? points
      .map((s, idx) => {
        const x = (idx / (points.length - 1)) * plotWidth;
        const y = plotHeight - ((normalizer.toScale(s.value) / normalizer.transformedMax) * plotHeight);
        return `${x},${y}`;
      })
      .join(' ')
    : '';
  const safeHoverIndex = hoverIndex !== null ? Math.max(0, Math.min(points.length - 1, hoverIndex)) : null;
  const hoveredPoint = safeHoverIndex !== null ? points[safeHoverIndex] : null;
  const hoverX = safeHoverIndex !== null && points.length > 1
    ? (safeHoverIndex / (points.length - 1)) * plotWidth
    : null;
  const hoverY = safeHoverIndex !== null
    ? plotHeight - ((normalizer.toScale(points[safeHoverIndex]?.value ?? 0) / normalizer.transformedMax) * plotHeight)
    : null;

  const modeTitle = mode === 'sessions_24'
    ? `Context tokens trend (last ${points.length} sessions)`
    : mode === 'hours_24'
      ? 'Context tokens trend (last 24 hours)'
      : 'Context tokens trend (last 7 days)';
  const xAxisLabel = mode === 'sessions_24'
    ? 'X-axis: session end time (24h)'
    : mode === 'hours_24'
      ? 'X-axis: hour of day (24h)'
      : 'X-axis: day of week';
  return (
    <section className="mt-4 rounded-xl border border-gray-700 bg-gray-800 p-4">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wide text-gray-300">{modeTitle}</div>
          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 p-1">
            <button
              type="button"
              onClick={() => setMode('sessions_24')}
              className={`rounded px-2 py-1 text-xs ${mode === 'sessions_24' ? 'bg-green-500/20 text-green-200' : 'text-gray-300'}`}
            >
              24 sessions
            </button>
            <button
              type="button"
              onClick={() => setMode('hours_24')}
              className={`rounded px-2 py-1 text-xs ${mode === 'hours_24' ? 'bg-green-500/20 text-green-200' : 'text-gray-300'}`}
            >
              24 hr
            </button>
            <button
              type="button"
              onClick={() => setMode('days_7')}
              className={`rounded px-2 py-1 text-xs ${mode === 'days_7' ? 'bg-green-500/20 text-green-200' : 'text-gray-300'}`}
            >
              7 days
            </button>
          </div>
        </div>
        {points.length < 2 ? (
          <div className="text-sm text-gray-400">Not enough sessions yet</div>
        ) : (
          <>
            <div
              ref={chartRef}
              className="flex items-stretch gap-3 py-1"
              onMouseMove={(event) => updateHoverIndex(event.clientX)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <div className="relative h-32 w-16 shrink-0">
                {normalizer.yTicks.map((tick) => (
                  <div
                    key={`ytick-${tick.y}-${tick.raw}`}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-gray-300"
                    style={{ top: `${(tick.y / plotHeight) * 100}%` }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>

              <div className="relative min-w-0 flex-1">
                <svg viewBox={`0 0 ${plotWidth} ${plotHeight}`} className="h-32 w-full rounded-lg border border-gray-700 bg-gray-700" preserveAspectRatio="none" role="img" aria-label="Context tokens trend">
                  {normalizer.yTicks.map((tick) => (
                    <line
                      key={`grid-${tick.y}-${tick.raw}`}
                      x1={0}
                      y1={tick.y}
                      x2={plotWidth}
                      y2={tick.y}
                      stroke="#4b5563"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                  ))}
                  <polyline points={polyline} fill="none" stroke="#b9ca3f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {hoveredPoint !== null && hoverX !== null && hoverY !== null ? (
                    <>
                      <line x1={hoverX} y1={0} x2={hoverX} y2={plotHeight} stroke="#9ca3af" strokeDasharray="4 4" strokeWidth="1" />
                      <circle cx={hoverX} cy={hoverY} r="4" fill="#b9ca3f" stroke="#111827" strokeWidth="1.5" />
                    </>
                  ) : null}
                </svg>
                {hoveredPoint !== null && hoverX !== null ? (
                  <div
                    className="pointer-events-none absolute top-2 z-20 max-w-[220px] -translate-x-1/2 rounded-md border border-gray-600 bg-gray-900/95 px-2 py-1.5 text-xs shadow-lg"
                    style={{
                      left: `${(hoverX / plotWidth) * 100}%`,
                    }}
                  >
                    <div className="font-semibold text-gray-100">{hoveredPoint.tooltipTitle}</div>
                    <div className="text-gray-300">{hoveredPoint.tooltipMeta}</div>
                    <div className="mt-1 text-green-300">{formatNumber(hoveredPoint.value)} tokens</div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
              {xAxisTicks.map((tick) => (
                <div key={`${tick.index}-${tick.label}`} className="truncate text-center" title={`Session ${tick.index + 1}`}>
                  {tick.label}
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-400">{xAxisLabel}</div>
          </>
        )}
      </div>

      <div className="mt-6">
        <div className="text-xs uppercase tracking-wide text-gray-300">Usage per day (last 7 days)</div>
        <div className="mt-2 grid grid-cols-7 gap-2">
          {days.map((d) => (
            <div key={d.key} className="text-center" title={`${d.label}: ${formatNumber(d.total)} tokens`}>
              <div className="flex h-24 items-end justify-center rounded-lg border border-gray-700 bg-gray-700 p-1">
                <div
                  className="min-h-px w-full rounded-md bg-gradient-to-b from-green-400 to-green-500"
                  style={{ height: `${(d.total / dailyMax) * 100}%` }}
                />
              </div>
              <div className="mt-1.5 text-xs text-gray-200">{d.label}</div>
              <div className="text-xs text-gray-400">{formatCompactKM(d.total)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
