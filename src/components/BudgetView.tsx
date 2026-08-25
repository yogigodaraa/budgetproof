"use client";
import { useMemo } from "react";
import type { Dataset } from "@/lib/types";
import { useAppState } from "@/lib/AppState";
import { useOverrides } from "@/lib/useOverrides";
import { usePlanning, newId } from "@/lib/usePlanning";
import { aggregate } from "@/lib/aggregate";
import { netWorth, goalProgress, type Goal, type Asset } from "@/lib/money";
import { aud, colorFor } from "@/lib/format";
import { Card, Panel, PageShell } from "./ui";
import { useFy } from "@/lib/useFy";
import { useDrill } from "./DrillDown";
import { txnPickers } from "@/lib/drill";

export default function BudgetView({ ds: dsAll }: { ds: Dataset }) {
  // Everything below reports on the financial year picked in the header.
  const { ds } = useFy(dsAll);
  const { state, setSlice } = useAppState();
  const { overrides } = useOverrides(ds);
  const { data: planning } = usePlanning(ds.summary.total_spend / 12);

  const budgets = state.budgets ?? {};
  const goals = state.goals ?? [];
  const assets = state.assets ?? [];

  const months = Math.max(1, ds.income.monthly.length);
  const a = useMemo(() => aggregate(ds, ds.transactions, overrides), [ds, overrides]);
  const cats = useMemo(
    () => a.spendByCategory.map((c) => ({ label: c.label, avg: Math.round(c.value / months) })),
    [a, months]
  );

  const { open } = useDrill();
  const pick = useMemo(() => txnPickers(ds, overrides), [ds, overrides]);

  const setBudget = (cat: string, cap: number) => setSlice("budgets", { ...budgets, [cat]: cap });
  const setGoals = (g: Goal[]) => setSlice("goals", g);
  const setAssets = (as: Asset[]) => setSlice("assets", as);

  const debtTotal = (planning.debts ?? []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const nw = netWorth(assets, debtTotal);
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalActual = cats.reduce((s, c) => s + c.avg, 0);

  return (
    <PageShell>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Budget, goals &amp; net worth</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">Set monthly caps per category, track savings goals, and see your net worth. Editable &amp; synced.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Budgeted / month" value={aud(totalBudget)} accent="text-sky-500" />
        <Card label="Avg actual / month" value={aud(totalActual)} accent={totalActual > totalBudget && totalBudget > 0 ? "text-rose-500" : "text-emerald-500"} />
        <Card label="Net worth" value={aud(nw)} accent={nw >= 0 ? "text-emerald-500" : "text-rose-500"} sub="assets − debts" />
        <Card label="Debts" value={aud(debtTotal)} accent="text-rose-500" sub="from Debt page" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Monthly budgets" right={<span className="text-xs text-[var(--faint)]">cap vs your avg actual</span>}>
          <ul className="space-y-2.5">
            {cats.map((c) => {
              const cap = budgets[c.label] ?? 0;
              const over = cap > 0 && c.avg > cap;
              const pct = cap > 0 ? Math.min(100, (c.avg / cap) * 100) : 0;
              return (
                <li key={c.label} className="grid grid-cols-[7rem_1fr_5rem] items-center gap-2 text-sm sm:grid-cols-[9rem_1fr_6rem]">
                  <span
                    className="flex cursor-pointer items-center gap-1.5 truncate rounded transition hover:bg-[var(--panel-2)]"
                    title={`See the payments behind ${c.label}`}
                    onClick={() => open({ title: c.label, subtitle: "category", txns: pick.byCategory(c.label) })}
                  >
                    <span className="h-2 w-2 rounded-sm" style={{ background: colorFor(c.label) }} />
                    {c.label}
                  </span>
                  <div className="h-4 rounded bg-[var(--panel-2)]">
                    {cap > 0 && <div className={`h-4 rounded ${over ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />}
                  </div>
                  <input type="number" value={cap || ""} placeholder={String(c.avg)} onChange={(e) => setBudget(c.label, Number(e.target.value))}
                    className={`w-full rounded border bg-[var(--panel-2)] px-2 py-1 text-right text-sm tabular-nums ${over ? "border-rose-600 text-rose-500" : "border-[var(--border)]"}`} />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-[var(--faint)]">Placeholder shows your historical average — set a cap to track against it. Red = over budget.</p>
        </Panel>

        <div className="space-y-4">
          <Panel title="Savings goals" right={<button onClick={() => setGoals([...goals, { id: newId(), label: "New goal", target: 1000, saved: 0 }])} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">+ Add</button>}>
            <div className="space-y-3">
              {goals.length === 0 && <p className="text-sm text-[var(--faint)]">No goals yet — add an emergency fund or a tax jar.</p>}
              {goals.map((g) => (
                <div key={g.id} className="rounded-lg border border-[var(--border)] p-2">
                  <div className="grid grid-cols-[1fr_5rem_5rem_2rem] items-center gap-2">
                    <input value={g.label} onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, label: e.target.value } : x))} className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm" />
                    <input type="number" value={g.saved} onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, saved: Number(e.target.value) } : x))} placeholder="saved" title="Saved" className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm tabular-nums text-emerald-500" />
                    <input type="number" value={g.target} onChange={(e) => setGoals(goals.map((x) => x.id === g.id ? { ...x, target: Number(e.target.value) } : x))} placeholder="target" title="Target" className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm tabular-nums" />
                    <button onClick={() => setGoals(goals.filter((x) => x.id !== g.id))} className="text-[var(--faint)] hover:text-rose-500">✕</button>
                  </div>
                  <div className="mt-1.5 h-2 rounded bg-[var(--panel-2)]"><div className="h-2 rounded bg-emerald-500" style={{ width: `${goalProgress(g) * 100}%` }} /></div>
                  <div className="mt-0.5 text-right text-xs text-[var(--faint)]">{Math.round(goalProgress(g) * 100)}% · {aud(Math.max(0, g.target - g.saved))} to go</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Net worth" right={<button onClick={() => setAssets([...assets, { id: newId(), label: "New asset", amount: 0 }])} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">+ Asset</button>}>
            <div className="space-y-2">
              {assets.map((as) => (
                <div key={as.id} className="grid grid-cols-[1fr_7rem_2rem] items-center gap-2">
                  <input value={as.label} onChange={(e) => setAssets(assets.map((x) => x.id === as.id ? { ...x, label: e.target.value } : x))} placeholder="e.g. car, savings" className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm" />
                  <input type="number" value={as.amount} onChange={(e) => setAssets(assets.map((x) => x.id === as.id ? { ...x, amount: Number(e.target.value) } : x))} className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-right text-sm tabular-nums text-emerald-500" />
                  <button onClick={() => setAssets(assets.filter((x) => x.id !== as.id))} className="text-[var(--faint)] hover:text-rose-500">✕</button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-sm">
                <span className="text-[var(--muted)]">− Debts (from Debt page)</span>
                <span className="tabular-nums text-rose-500">{aud(debtTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Net worth</span>
                <span className={`text-lg font-semibold tabular-nums ${nw >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{aud(nw)}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
