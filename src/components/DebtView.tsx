"use client";
import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/types";
import { usePlanning, newId } from "@/lib/usePlanning";
import { people } from "@/lib/aggregate";
import { monthlyEquivalent, debtPlan, type Debt } from "@/lib/planning";
import { aud } from "@/lib/format";
import { Card, Panel, PageShell } from "./ui";
import { useFy } from "@/lib/useFy";

export default function DebtView({ ds: dsAll }: { ds: Dataset }) {
  // Everything below reports on the financial year picked in the header.
  const { ds } = useFy(dsAll);
  const avgMonthly = ds.summary.total_spend / 12;
  const { data, loaded, upsertDebt, removeDebt } = usePlanning(avgMonthly);
  const [strategy, setStrategy] = useState<"snowball" | "avalanche">("snowball");

  const surplus = useMemo(() => {
    const inc = data.incomes.reduce((a, i) => a + monthlyEquivalent(i), 0);
    const exp = data.expenses.reduce((a, i) => a + monthlyEquivalent(i), 0);
    return Math.max(0, Math.round(inc - exp));
  }, [data]);
  const [budget, setBudget] = useState<number | null>(null);
  const effBudget = budget ?? surplus;

  const plan = useMemo(() => debtPlan(data.debts, effBudget, strategy), [data.debts, effBudget, strategy]);

  // people you appear to owe (received more than you sent)
  const owedSuggestions = useMemo(() => {
    const existing = new Set(data.debts.map((d) => d.creditor.toLowerCase()));
    return people(ds.transactions)
      .filter((p) => p.net < -50 && p.name !== "Remitly" && !existing.has(p.name.toLowerCase()))
      .map((p) => ({ name: p.name, amount: Math.round(-p.net) }));
  }, [ds, data.debts]);

  const addDebt = (creditor = "New debt", amount = 0) =>
    upsertDebt({ id: newId(), creditor, amount });

  if (!loaded) return <PageShell><p className="text-[var(--muted)]">Loading…</p></PageShell>;

  const freeDate = plan.feasible && plan.monthsToFree > 0
    ? new Date(new Date().setMonth(new Date().getMonth() + plan.monthsToFree)).toLocaleString("en-AU", { month: "long", year: "numeric" })
    : "—";

  return (
    <PageShell>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Debt payoff plan</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Enter who you owe, then get a plan to clear it using your forecast surplus. Editable & private.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Total owed" value={aud(plan.totalDebt)} accent="text-rose-500" />
        <Card label="Toward debt / mo" value={aud(effBudget)} sub={budget == null ? "from forecast surplus" : "custom"} accent="text-sky-500" />
        <Card label="Debt-free in" value={plan.feasible ? `${plan.monthsToFree} mo` : "—"} sub={freeDate} accent="text-emerald-500" />
        <Card label="Interest (est.)" value={aud(plan.totalInterest)} accent="text-amber-500" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Your debts" right={<button onClick={() => addDebt()} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">+ Add</button>}>
          <div className="space-y-2">
            {data.debts.length === 0 && <p className="text-sm text-[var(--faint)]">No debts entered. Add one, or import from People below.</p>}
            {data.debts.map((d) => (
              <div key={d.id} className="grid grid-cols-2 gap-2 rounded-lg border border-[var(--border)] p-2 sm:grid-cols-[1fr_6rem_5rem_6rem_2rem]">
                <input value={d.creditor} onChange={(e) => upsertDebt({ ...d, creditor: e.target.value })} placeholder="Who" className="col-span-2 rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm sm:col-span-1" />
                <input type="number" value={d.amount} onChange={(e) => upsertDebt({ ...d, amount: Number(e.target.value) })} placeholder="Owed" className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm tabular-nums text-rose-500" />
                <input type="number" value={d.apr ?? ""} onChange={(e) => upsertDebt({ ...d, apr: e.target.value ? Number(e.target.value) : undefined })} placeholder="APR%" className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm tabular-nums" title="Interest %/yr (optional)" />
                <input type="number" value={d.minPayment ?? ""} onChange={(e) => upsertDebt({ ...d, minPayment: e.target.value ? Number(e.target.value) : undefined })} placeholder="Min/mo" className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm tabular-nums" title="Minimum monthly payment (optional)" />
                <button onClick={() => removeDebt(d.id)} className="text-[var(--faint)] hover:text-rose-500" title="Remove">✕</button>
              </div>
            ))}
          </div>
          {owedSuggestions.length > 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-3">
              <p className="mb-2 text-xs text-[var(--muted)]">From People — you received more than you sent (you may owe these):</p>
              <div className="flex flex-wrap gap-2">
                {owedSuggestions.map((s) => (
                  <button key={s.name} onClick={() => addDebt(s.name, s.amount)} className="rounded-full border border-[var(--border)] px-3 py-1 text-xs hover:bg-[var(--panel-2)]">
                    + {s.name} · {aud(s.amount)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Strategy" right={
          <div className="flex items-center gap-2">
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)} className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm">
              <option value="snowball">Snowball (smallest first)</option>
              <option value="avalanche">Avalanche (highest APR)</option>
            </select>
          </div>
        }>
          <label className="mb-3 block text-sm">
            <span className="text-[var(--muted)]">Pay toward debt each month</span>
            <input type="number" value={effBudget} onChange={(e) => setBudget(Number(e.target.value))} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm tabular-nums" />
            <span className="text-xs text-[var(--faint)]">Defaults to your forecast surplus ({aud(surplus)}/mo). Edit to model faster payoff.</span>
          </label>

          {data.debts.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">Add debts to generate a plan.</p>
          ) : !plan.feasible ? (
            <p className="text-sm text-rose-500">Increase the monthly amount — it must cover at least the minimum payments.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-[var(--muted)]">
                Pay in this order: {plan.order.map((o, i) => <span key={o}><b className="text-[var(--text)]">{o}</b>{i < plan.order.length - 1 ? " → " : ""}</span>)}.
                Debt-free in <b className="text-emerald-500">{plan.monthsToFree} months</b> ({freeDate}).
              </p>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border)]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--panel-2)] text-left uppercase tracking-wide text-[var(--faint)]">
                    <tr><th className="px-2 py-1.5">Month</th>{data.debts.map((d) => <th key={d.id} className="px-2 py-1.5 text-right">{d.creditor.slice(0, 8)}</th>)}<th className="px-2 py-1.5 text-right">Left</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {plan.schedule.map((row) => (
                      <tr key={row.month}>
                        <td className="px-2 py-1 text-[var(--muted)]">{row.label}</td>
                        {data.debts.map((d) => {
                          const pay = row.payments.find((p) => p.creditor === d.creditor);
                          return <td key={d.id} className="px-2 py-1 text-right tabular-nums">{pay ? aud(pay.balance) : "—"}</td>;
                        })}
                        <td className="px-2 py-1 text-right font-medium tabular-nums">{aud(row.totalRemaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
