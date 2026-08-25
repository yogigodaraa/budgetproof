"use client";
import { useMemo } from "react";
import type { Dataset } from "@/lib/types";
import { usePlanning, newId } from "@/lib/usePlanning";
import { useOverrides } from "@/lib/useOverrides";
import { detectRecurring } from "@/lib/aggregate";
import { monthlyEquivalent, projectCashflow, type Cadence, type FlowItem } from "@/lib/planning";
import { aud, colorFor } from "@/lib/format";
import { Card, Panel, PageShell } from "./ui";
import { LineChart } from "./charts";
import { useFy } from "@/lib/useFy";

const recId = (brand: string) => "rec-" + brand.toLowerCase().replace(/[^a-z0-9]/g, "");
const nextMonthFirst = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10);
};

const CADENCES: Cadence[] = ["weekly", "fortnightly", "monthly", "once"];

function FlowList({
  title,
  kind,
  items,
  accent,
  onChange,
  onRemove,
  onAdd,
}: {
  title: string;
  kind: "incomes" | "expenses";
  items: FlowItem[];
  accent: string;
  onChange: (item: FlowItem) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const monthly = items.reduce((a, i) => a + monthlyEquivalent(i), 0);
  return (
    <Panel title={`${title} · ${aud(monthly)}/mo`} right={<button onClick={onAdd} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">+ Add</button>}>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-[var(--faint)]">None yet — add one.</p>}
        {items.map((it) => (
          <div key={it.id} className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] p-2 sm:grid-cols-[1fr_6rem_7rem_8rem_2rem]">
            <input
              value={it.label}
              onChange={(e) => onChange({ ...it, label: e.target.value })}
              className="col-span-2 rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm sm:col-span-1"
              placeholder="Label"
            />
            <input
              type="number"
              value={it.amount}
              onChange={(e) => onChange({ ...it, amount: Number(e.target.value) })}
              className={`rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm tabular-nums ${accent}`}
            />
            <select value={it.cadence} onChange={(e) => onChange({ ...it, cadence: e.target.value as Cadence })} className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1 py-1 text-sm">
              {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" value={it.anchor} onChange={(e) => onChange({ ...it, anchor: e.target.value })} className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1 py-1 text-sm" />
            <button onClick={() => onRemove(it.id)} className="text-[var(--faint)] hover:text-rose-500" title="Remove">✕</button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function ForecastView({ ds: dsAll }: { ds: Dataset }) {
  // Everything below reports on the financial year picked in the header.
  const { ds } = useFy(dsAll);
  const avgMonthly = ds.summary.total_spend / 12;
  const { data, loaded, upsertItem, removeItem, resetAll } = usePlanning(avgMonthly);
  const { overrides } = useOverrides(ds);
  const recurring = useMemo(() => detectRecurring(ds, ds.transactions, overrides), [ds, overrides]);
  const addedIds = new Set(data.expenses.map((e) => e.id));
  const addRecurring = (brand: string, amount: number) =>
    upsertItem("expenses", { id: recId(brand), label: brand, amount: Math.round(amount), cadence: "monthly", anchor: nextMonthFirst(), note: "detected recurring" });

  const monthlyIncome = useMemo(() => data.incomes.reduce((a, i) => a + monthlyEquivalent(i), 0), [data.incomes]);
  const monthlyExpense = useMemo(() => data.expenses.reduce((a, i) => a + monthlyEquivalent(i), 0), [data.expenses]);
  const projection = useMemo(() => projectCashflow(data, new Date(), 16), [data]);
  const horizonNet = projection.length ? projection[projection.length - 1].cumulative : 0;

  if (!loaded) return <PageShell><p className="text-[var(--muted)]">Loading…</p></PageShell>;

  return (
    <PageShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Forecast</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Recurring income & expenses, projected forward. Everything is editable.</p>
        </div>
        <button onClick={resetAll} className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)]">Reset to defaults</button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="Income / month" value={aud(monthlyIncome)} accent="text-emerald-500" />
        <Card label="Expenses / month" value={aud(monthlyExpense)} accent="text-rose-500" />
        <Card label="Surplus / month" value={aud(monthlyIncome - monthlyExpense)} accent={monthlyIncome - monthlyExpense >= 0 ? "text-emerald-500" : "text-rose-500"} />
        <Card label="Safe to spend / week" value={aud(Math.max(0, (monthlyIncome - monthlyExpense) / 4.33))} accent="text-sky-500" sub="after recurring" />
        <div className="col-span-2 sm:col-span-1">
          <Card label="Net over 16 weeks" value={aud(horizonNet)} accent={horizonNet >= 0 ? "text-emerald-500" : "text-rose-500"} sub="incl. one-offs" />
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <FlowList title="Income" kind="incomes" items={data.incomes} accent="text-emerald-500"
          onChange={(it) => upsertItem("incomes", it)} onRemove={(id) => removeItem("incomes", id)}
          onAdd={() => upsertItem("incomes", { id: newId(), label: "New income", amount: 0, cadence: "weekly", anchor: new Date().toISOString().slice(0, 10) })} />
        <FlowList title="Expenses" kind="expenses" items={data.expenses} accent="text-rose-500"
          onChange={(it) => upsertItem("expenses", it)} onRemove={(id) => removeItem("expenses", id)}
          onAdd={() => upsertItem("expenses", { id: newId(), label: "New expense", amount: 0, cadence: "monthly", anchor: new Date().toISOString().slice(0, 10) })} />
      </div>

      <div className="mb-4">
        <Panel title="Recurring detected from your history" right={<span className="text-xs text-[var(--faint)]">tap Add to include as a monthly expense</span>}>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Repeating charges we found (subscriptions & bills first). Adding these makes your forecast accurate —
            then you can remove the flat “average living expenses” baseline to avoid double-counting.
          </p>
          <div className="flex flex-wrap gap-2">
            {recurring.slice(0, 24).map((r) => {
              const added = addedIds.has(recId(r.brand));
              return (
                <button
                  key={r.brand}
                  onClick={() => (added ? removeItem("expenses", recId(r.brand)) : addRecurring(r.brand, r.avgMonthly))}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                    added ? "border-emerald-600 bg-emerald-600/15 text-emerald-500" : "border-[var(--border)] hover:bg-[var(--panel-2)]"
                  }`}
                  title={`${r.months} months · ${r.chargesPerMonth}/mo`}
                >
                  <span className="h-2 w-2 rounded-sm" style={{ background: colorFor(r.category) }} />
                  <span className="font-medium">{r.brand}</span>
                  <span className="text-[var(--muted)]">{aud(r.avgMonthly)}/mo</span>
                  {r.subscriptionLike && <span className="rounded bg-sky-500/15 px-1 text-[10px] text-sky-500">bill</span>}
                  <span className="text-[var(--faint)]">{added ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <Panel title="Projected running balance (next 16 weeks)">
        <LineChart points={projection.map((b) => ({ label: b.weekStart.slice(5), value: b.cumulative }))} />
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-2)] text-left text-xs uppercase tracking-wide text-[var(--faint)]">
              <tr><th className="px-3 py-2">Week of</th><th className="px-3 py-2 text-right">In</th><th className="px-3 py-2 text-right">Out</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-right">Balance</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {projection.map((b) => (
                <tr key={b.weekStart} className={b.events.some((e) => e.amount >= 1000) ? "bg-[var(--panel-2)]/40" : ""}>
                  <td className="px-3 py-1.5 text-[var(--muted)]">{b.weekStart}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{b.income ? aud(b.income) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-rose-500">{b.expense ? aud(b.expense) : "—"}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${b.net >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{aud(b.net)}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{aud(b.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--faint)]">Monthly recurring expenses are spread to the month’s anchor date. Edit items above to see the projection update live.</p>
      </Panel>
    </PageShell>
  );
}
