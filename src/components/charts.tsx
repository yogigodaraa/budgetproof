"use client";
import { aud, monthLabel, colorFor } from "@/lib/format";

/** A chart datum. `id` is what gets handed to onSelect when the visible label
 *  is a formatted string (e.g. "Jul 2025") rather than the underlying key. */
export interface Datum {
  label: string;
  value: number;
  id?: string;
  claimable?: boolean;
}

/** Rows become clickable only when a handler is supplied, so charts used for
 *  things with no underlying transactions (income) stay inert. */
const clickable = (on?: (id: string) => void) =>
  on ? "cursor-pointer hover:bg-[var(--panel-2)] rounded transition" : "";

/* Donut chart with legend */
export function Donut({
  data,
  size = 180,
  thickness = 28,
  onSelect,
}: {
  data: Datum[];
  size?: number;
  thickness?: number;
  onSelect?: (id: string) => void;
}) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  // precompute each segment's dash + cumulative offset (no post-render mutation)
  const segs = data.map((d, i) => {
    const before = data.slice(0, i).reduce((s, x) => s + x.value, 0);
    return { label: d.label, dash: (d.value / total) * c, offset: (before / total) * c };
  });
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segs.map((s) => (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={colorFor(s.label)}
              strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={-s.offset}
            />
          ))}
        </g>
        <text x="50%" y="47%" textAnchor="middle" className="fill-[var(--faint)] text-[10px]">
          total
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="fill-[var(--text)] text-sm font-semibold">
          {aud(total)}
        </text>
      </svg>
      <ul className="w-full space-y-1 text-sm sm:w-auto">
        {data.map((d) => (
          <li
            key={d.label}
            className={`flex items-center gap-2 px-1 ${clickable(onSelect)}`}
            onClick={onSelect ? () => onSelect(d.id ?? d.label) : undefined}
            title={onSelect ? `See the payments behind ${d.label}` : undefined}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(d.label) }} />
            <span className="text-[var(--text)]">{d.label}</span>
            <span className="ml-auto tabular-nums text-[var(--muted)]">{aud(d.value)}</span>
            <span className="w-10 text-right tabular-nums text-[var(--faint)]">
              {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Horizontal bars */
export function HBars({ data, onSelect }: { data: Datum[]; onSelect?: (id: string) => void }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li
          key={d.label}
          className={`grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 px-1 text-sm sm:grid-cols-[9rem_1fr_5rem] sm:gap-3 ${clickable(onSelect)}`}
          onClick={onSelect ? () => onSelect(d.id ?? d.label) : undefined}
          title={onSelect ? `See the payments behind ${d.label}` : undefined}
        >
          <span className="truncate text-[var(--text)]" title={d.label}>
            {d.label}
            {d.claimable && <span className="ml-1 text-emerald-500" title="Claimable">✓</span>}
          </span>
          <div className="h-5 rounded bg-[var(--panel-2)]">
            <div
              className="h-5 rounded"
              style={{ width: `${(d.value / max) * 100}%`, background: colorFor(d.label) }}
            />
          </div>
          <span className="text-right tabular-nums text-[var(--muted)]">{aud(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/* Tiny monthly sparkbars */
export function Sparkbars({ data }: { data: { month: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-8 items-end gap-0.5">
      {data.map((d) => (
        <div key={d.month} className="flex-1 rounded-sm bg-[var(--muted)]" style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }} title={`${d.month}: ${aud(d.value)}`} />
      ))}
    </div>
  );
}

/* Simple line/area chart for a running balance projection */
export function LineChart({ points }: { points: { label: string; value: number }[] }) {
  const w = 600, h = 200, pad = 8;
  if (points.length < 2) return <p className="text-sm text-[var(--faint)]">Not enough data.</p>;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;
  const zeroY = y(0);
  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ height: 200 }}>
        <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="var(--border)" strokeDasharray="4 4" />
        <path d={area} fill="#10b98122" />
        <path d={line} fill="none" stroke="#10b981" strokeWidth={2} />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--faint)]">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

/* Grouped income-vs-spend bars by month */
export function Cashflow({
  data,
  onSelect,
}: {
  data: { month: string; income: number; spend: number }[];
  onSelect?: (month: string) => void;
}) {
  const max = Math.max(...data.flatMap((d) => [d.income, d.spend]), 1);
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: 200 }}>
        {data.map((d) => (
          <div
            key={d.month}
            className={`flex flex-1 flex-col items-center justify-end gap-1 ${clickable(onSelect)}`}
            onClick={onSelect ? () => onSelect(d.month) : undefined}
            title={onSelect ? `See ${monthLabel(d.month)} spending` : undefined}
          >
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 170 }}>
              <div
                className="w-1/2 rounded-t bg-emerald-500"
                style={{ height: `${(d.income / max) * 100}%` }}
                title={`Income ${aud(d.income)}`}
              />
              <div
                className="w-1/2 rounded-t bg-rose-500"
                style={{ height: `${(d.spend / max) * 100}%` }}
                title={`Spend ${aud(d.spend)}`}
              />
            </div>
            <span className="text-[10px] text-[var(--faint)]">{monthLabel(d.month).split(" ")[0]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" /> Spend
        </span>
      </div>
    </div>
  );
}
