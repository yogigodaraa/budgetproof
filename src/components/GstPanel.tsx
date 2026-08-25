"use client";
import { useMemo } from "react";
import type { Dataset } from "@/lib/types";
import { useGstConfig, gstBase, platformLabel } from "@/lib/useGstConfig";
import { aud } from "@/lib/format";
import { Panel } from "./ui";

export function GstPanel({ ds, claimable }: { ds: Dataset; claimable: number }) {
  const { cfg, toggle, setStartMonth, reset } = useGstConfig();
  const base = useMemo(() => gstBase(ds.income.monthly, cfg), [ds, cfg]);
  const collected = Math.round((base / 11) * 100) / 100;
  const credits = Math.round((claimable / 11) * 100) / 100;
  const net = Math.round((collected - credits) * 100) / 100;
  const platforms = Object.keys(ds.income.by_platform);

  return (
    <Panel title="GST (configurable)" right={<button onClick={reset} className="text-xs text-[var(--faint)] hover:underline">reset</button>}>
      <div className="mb-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-[var(--faint)]">Which income is GST-registered?</p>
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => toggle(p)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                cfg.registered[p]
                  ? "border-emerald-600 bg-emerald-600/15 text-emerald-500"
                  : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-2)]"
              }`}
            >
              {cfg.registered[p] ? "✓ " : ""}{platformLabel(p)}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">GST registered from</span>
          <input type="month" value={cfg.startMonth} onChange={(e) => setStartMonth(e.target.value)} className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm" />
          <span className="text-xs text-[var(--faint)]">income before this is excluded</span>
        </label>
      </div>

      <dl className="space-y-2 border-t border-[var(--border)] pt-3 text-sm">
        <Row k="GST-applicable income" v={aud(base)} />
        <Row k="GST collected (1/11)" v={aud(collected)} accent="text-rose-500" />
        <Row k="GST credits on expenses (1/11)" v={aud(credits)} accent="text-emerald-500" />
        <div className="my-1 border-t border-[var(--border)]" />
        <Row k="Net GST payable" v={aud(net)} accent="text-sky-500" big />
      </dl>
      <p className="mt-3 text-xs text-[var(--faint)]">
        Base = selected sources summed from {cfg.startMonth} onward. Monthly granularity (partial first month not pro-rated). Estimate only.
      </p>
    </Panel>
  );
}

function Row({ k, v, accent = "text-[var(--text)]", big = false }: { k: string; v: string; accent?: string; big?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd className={`tabular-nums ${accent} ${big ? "text-lg font-semibold" : ""}`}>{v}</dd>
    </div>
  );
}
