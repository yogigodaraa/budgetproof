"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Txn } from "@/lib/types";
import { aud, monthLabel } from "@/lib/format";

export interface DrillRequest {
  title: string;
  subtitle?: string;
  txns: Txn[];
  /** "sent"/"received" split is only meaningful for a person */
  showDirection?: boolean;
}

const Ctx = createContext<{ open: (r: DrillRequest) => void } | null>(null);

/**
 * One shared detail view for "what actually made up this number?".
 *
 * Every chart segment, category row, merchant, person and insight in the app
 * funnels into this, so a click anywhere answers the same question the same
 * way instead of each page inventing its own inline expander.
 */
export function DrillProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DrillRequest | null>(null);
  const open = useCallback((r: DrillRequest) => setReq(r), []);
  const close = useCallback(() => setReq(null), []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    // don't let the page behind scroll while the panel is up
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [req, close]);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {req && <DrillPanel req={req} onClose={close} />}
    </Ctx.Provider>
  );
}

export function useDrill() {
  const ctx = useContext(Ctx);
  // Rendering outside the provider shouldn't crash a page -- just do nothing.
  return ctx ?? { open: () => {} };
}

function DrillPanel({ req, onClose }: { req: DrillRequest; onClose: () => void }) {
  const [limit, setLimit] = useState(60);
  const rows = useMemo(
    () => [...req.txns].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [req.txns]
  );

  const stats = useMemo(() => {
    let out = 0, inn = 0;
    for (const t of rows) {
      if (t.dir === "debit") out += t.amount;
      else inn += t.amount;
    }
    const months = new Set(rows.map((t) => t.date.slice(0, 7)));
    const amounts = rows.map((t) => t.amount);
    return {
      out, inn, net: out - inn,
      count: rows.length,
      months: months.size,
      avg: rows.length ? (out + inn) / rows.length : 0,
      biggest: amounts.length ? Math.max(...amounts) : 0,
      first: rows.length ? rows[rows.length - 1].date : "",
      last: rows.length ? rows[0].date : "",
    };
  }, [rows]);

  // month subtotals, newest first -- shows the shape of the spend over time
  const byMonth = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of rows) {
      const k = t.date.slice(0, 7);
      m[k] = (m[k] ?? 0) + (t.dir === "debit" ? t.amount : -t.amount);
    }
    return Object.entries(m).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);
  const maxMonth = Math.max(...byMonth.map(([, v]) => Math.abs(v)), 1);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={req.title}>
      <button className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} aria-label="Close" />
      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl">
        <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold" title={req.title}>{req.title}</h2>
            <p className="mt-0.5 text-xs text-[var(--faint)]">
              {req.subtitle ? `${req.subtitle} · ` : ""}
              {stats.count} payment{stats.count === 1 ? "" : "s"}
              {stats.first && ` · ${stats.first} → ${stats.last}`}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)]">
            Close
          </button>
        </header>

        <div className="grid grid-cols-3 gap-px border-b border-[var(--border)] bg-[var(--border)]">
          {req.showDirection ? (
            <>
              <Stat label="Sent" value={aud(stats.out)} accent="text-rose-500" />
              <Stat label="Received" value={aud(stats.inn)} accent="text-emerald-500" />
              <Stat label="Net" value={aud(Math.abs(stats.net))} sub={stats.net >= 0 ? "you sent more" : "you received more"} accent={stats.net >= 0 ? "text-rose-500" : "text-emerald-500"} />
            </>
          ) : (
            <>
              <Stat label="Total" value={aud(stats.out || stats.inn)} accent={stats.out ? "text-rose-500" : "text-emerald-500"} />
              <Stat label="Average" value={aud(stats.avg, 2)} sub={`over ${stats.months} month${stats.months === 1 ? "" : "s"}`} />
              <Stat label="Biggest" value={aud(stats.biggest, 2)} />
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {byMonth.length > 1 && (
            <div className="mb-5">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--faint)]">By month</h3>
              <ul className="space-y-1">
                {byMonth.map(([m, v]) => (
                  <li key={m} className="grid grid-cols-[5rem_1fr_5rem] items-center gap-2 text-xs">
                    <span className="text-[var(--muted)]">{monthLabel(m)}</span>
                    <div className="h-3 rounded bg-[var(--panel-2)]">
                      <div className={`h-3 rounded ${v >= 0 ? "bg-rose-500/70" : "bg-emerald-500/70"}`} style={{ width: `${(Math.abs(v) / maxMonth) * 100}%` }} />
                    </div>
                    <span className="text-right tabular-nums text-[var(--muted)]">{aud(Math.abs(v))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--faint)]">Payments</h3>
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">No transactions in the selected financial year.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {rows.slice(0, limit).map((t) => (
                <li key={t.id} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="w-[5.5rem] shrink-0 text-xs tabular-nums text-[var(--faint)]">{t.date}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" title={t.description}>{t.description}</span>
                    <span className="text-[10px] text-[var(--faint)]">{t.category || "Uncategorised"}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${t.dir === "credit" ? "text-emerald-500" : ""}`}>
                    {t.dir === "credit" ? "+" : "−"}{aud(t.amount, 2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {rows.length > limit && (
            <button onClick={() => setLimit((l) => l + 200)} className="mt-3 w-full rounded-md border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--panel-2)]">
              Show more ({rows.length - limit} hidden)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent = "text-[var(--text)]" }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-[var(--panel)] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--faint)]">{sub}</div>}
    </div>
  );
}
