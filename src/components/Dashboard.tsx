"use client";
import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "@/lib/types";
import { aggregate, insights, categoryTrends, anomalies } from "@/lib/aggregate";
import { useOverrides } from "@/lib/useOverrides";
import { useGstConfig, gstBase, platformLabel } from "@/lib/useGstConfig";
import { aud, monthLabel } from "@/lib/format";
import { Donut, HBars, Cashflow, LineChart, Sparkbars } from "./charts";
import { TransactionTable } from "./TransactionTable";
import { GstPanel } from "./GstPanel";
import { AttentionStrip } from "./AttentionStrip";
import { Card, Panel, PageShell } from "./ui";
import { useFy } from "@/lib/useFy";
import LifetimeView from "./LifetimeView";
import { useDrill } from "./DrillDown";
import { txnPickers } from "@/lib/drill";

export default function Dashboard({ ds: dsAll }: { ds: Dataset }) {
  // Everything below reports on the financial year picked in the header.
  const { ds, isAllYears } = useFy(dsAll);
  const { overrides, setOverride, bulkSet, reset, count: editCount } = useOverrides(ds);
  type Tab = "lifetime" | "overview" | "income" | "spend" | "trends" | "insights" | "tax" | "txns";
  const [tab, setTab] = useState<Tab>("overview");
  // Across all years the career view is the headline; within one year it does
  // not apply, so fall back to Overview rather than showing an empty tab.
  const activeTab: Tab = isAllYears ? tab : tab === "lifetime" ? "overview" : tab;
  // opening "All years" lands on Lifetime, but a tab you pick afterwards sticks
  useEffect(() => { if (isAllYears) setTab((t) => (t === "overview" ? "lifetime" : t)); }, [isAllYears]);

  const a = useMemo(() => aggregate(ds, ds.transactions, overrides), [ds, overrides]);
  const ins = useMemo(() => insights(ds, ds.transactions, overrides), [ds, overrides]);
  const trends = useMemo(() => categoryTrends(ds, ds.transactions, overrides, 8), [ds, overrides]);
  const anoms = useMemo(() => anomalies(ds, ds.transactions, overrides), [ds, overrides]);
  const { open } = useDrill();
  const pick = useMemo(() => txnPickers(ds, overrides), [ds, overrides]);
  const drillCat = (name: string) =>
    open({ title: name, subtitle: "category", txns: pick.byCategory(name) });
  const drillGroup = (name: string) =>
    open({ title: name, subtitle: "spending group", txns: pick.byGroup(name) });
  const drillMonth = (month: string) =>
    open({ title: monthLabel(month), subtitle: "all spending that month", txns: pick.byMonth(month) });

  // The income chart is the platform-statement total; the bank only ever saw the
  // deposits. Uber Eats and Uber X share one UBERBV descriptor, so both open the
  // combined Uber deposits -- the bank cannot tell them apart.
  const INCOME_BANK_CATEGORY: Record<string, string> = {
    uber_eats: "Uber", uber_x: "Uber", didi: "Didi",
    doordash: "DoorDash", sherpa: "Sherpa", wemoney: "WeMoney",
  };
  const drillIncome = (platform: string) => {
    const bankCat = INCOME_BANK_CATEGORY[platform];
    const txns = bankCat ? pick.byIncomeCategory(bankCat) : [];
    const combined = platform === "uber_eats" || platform === "uber_x";
    open({
      title: `${platformLabel(platform)} — deposits received`,
      subtitle: !bankCat
        ? "no bank deposits identified for this source"
        : combined
        ? "all Uber deposits: the bank cannot split Eats from X"
        : "money that actually landed in your accounts",
      txns,
    });
  };

  const { cfg: gstCfg } = useGstConfig();
  const gstNet = useMemo(() => {
    const base = gstBase(ds.income.monthly, gstCfg);
    return Math.round((base / 11 - a.totalClaimable / 11) * 100) / 100;
  }, [ds, gstCfg, a.totalClaimable]);

  const tabs: [Tab, string][] = [
    ...(isAllYears ? ([["lifetime", "Lifetime"]] as [Tab, string][]) : []),
    ["overview", "Overview"],
    ["income", "Income"],
    ["spend", "Spend"],
    ["trends", "Trends"],
    ["insights", "Insights"],
    ["tax", "Tax & GST"],
    ["txns", "Transactions"],
  ];

  return (
    <PageShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{isAllYears ? "Lifetime" : "Dashboard"}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isAllYears
              ? "Every financial year on record — how your earnings have progressed"
              : `${monthLabel(ds.meta.period.from)} – ${monthLabel(ds.meta.period.to)} · ${ds.meta.txn_count.toLocaleString()} transactions`}
          </p>
        </div>
        {editCount > 0 && (
          <button
            onClick={reset}
            className="rounded-md border border-emerald-700 px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-900/20"
          >
            {editCount} edit{editCount > 1 ? "s" : ""} · reset all
          </button>
        )}
      </div>

      {!isAllYears && <AttentionStrip ds={ds} />}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card label="Earned" value={aud(a.totalIncome)} accent="text-emerald-500" sub="platform total" />
        <Card label="Spent" value={aud(a.totalSpend)} accent="text-rose-500" sub="excl. transfers" onClick={() => open({ title: "All spending", subtitle: "excludes transfers and income", txns: pick.allSpend() })} />
        <Card label="Net" value={aud(a.net)} accent={a.net >= 0 ? "text-emerald-500" : "text-rose-500"} sub="earned − spent" />
        <Card label="Claimable" value={aud(a.totalClaimable)} accent="text-amber-500" sub="work expenses" onClick={() => open({ title: "Claimable expenses", subtitle: "all categories", txns: pick.byClaimable(true) })} />
        <div className="col-span-2 sm:col-span-1">
          <Card label="GST payable" value={aud(gstNet)} accent="text-sky-500" sub="configurable · Tax tab" />
        </div>
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              activeTab === t ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:bg-[var(--panel-2)]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === "lifetime" && <LifetimeView ds={ds} />}

      {activeTab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Cashflow by month (income vs spend)"><Cashflow data={a.cashflow} onSelect={drillMonth} /></Panel>
          <Panel title="Spending by group"><Donut data={a.spendByGroup} onSelect={drillGroup} /></Panel>
          <Panel title="Income by platform">
            <Donut
              data={a.incomeByPlatform.map((p) => ({ label: platformLabel(p.label), value: p.value, id: p.label }))}
              onSelect={drillIncome}
            />
          </Panel>
          <Panel title="Top spending categories"><HBars data={a.spendByCategory.slice(0, 10)} onSelect={drillCat} /></Panel>
        </div>
      )}

      {activeTab === "income" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Income by platform">
            <Donut
              data={a.incomeByPlatform.map((p) => ({ label: platformLabel(p.label), value: p.value, id: p.label }))}
              onSelect={drillIncome}
            />
          </Panel>
          <Panel title="Monthly income">
            <HBars data={a.incomeByMonth.map((m) => ({ label: monthLabel(m.month), value: m.value }))} />
          </Panel>
          <Panel title="Bank cross-check">
            <p className="text-sm text-[var(--muted)]">
              Platform deposits landing in your bank total{" "}
              <span className="font-semibold text-[var(--text)]">{aud(ds.summary.bank_platform_income_crosscheck)}</span>.
              Income above is from your platform summary ({aud(a.totalIncome)}); the gap is expected (fees withheld,
              cash, peer transfers).
            </p>
          </Panel>
        </div>
      )}

      {activeTab === "spend" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Spending by group"><Donut data={a.spendByGroup} onSelect={drillGroup} /></Panel>
          <Panel title="Spending by month">
            <HBars
              data={a.spendByMonth.map((m) => ({ label: monthLabel(m.month), value: m.value, id: m.month }))}
              onSelect={drillMonth}
            />
          </Panel>
          <Panel title="All categories"><HBars data={a.spendByCategory} onSelect={drillCat} /></Panel>
          <Panel title="Claimable vs non-claimable">
            <Donut
              data={[
                { label: "Claimable", value: a.totalClaimable },
                { label: "Non-claimable", value: Math.max(a.totalSpend - a.totalClaimable, 0) },
              ]}
              onSelect={(l) =>
                open({
                  title: l === "Claimable" ? "Claimable expenses" : "Non-claimable spending",
                  subtitle: "all categories",
                  txns: pick.byClaimable(l === "Claimable"),
                })
              }
            />
          </Panel>
        </div>
      )}

      {activeTab === "trends" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Spend by month">
            <LineChart points={a.spendByMonth.map((m) => ({ label: monthLabel(m.month), value: m.value }))} />
          </Panel>
          <Panel title="Income by month">
            <LineChart points={a.incomeByMonth.map((m) => ({ label: monthLabel(m.month), value: m.value }))} />
          </Panel>
          <div className="lg:col-span-2">
            <Panel title="Category trends (monthly)">
              <div className="space-y-3">
                {trends.trends.map((t) => (
                  <div
                    key={t.label}
                    onClick={() => drillCat(t.label)}
                    title={`See the payments behind ${t.label}`}
                    className="grid cursor-pointer grid-cols-[8rem_1fr_5rem] items-center gap-3 rounded px-1 text-sm transition hover:bg-[var(--panel-2)]"
                  >
                    <span className="truncate text-[var(--text)]" title={t.label}>{t.label}</span>
                    <Sparkbars data={t.series} />
                    <span className={`text-right tabular-nums ${t.deltaPct > 15 ? "text-rose-500" : t.deltaPct < -15 ? "text-emerald-500" : "text-[var(--muted)]"}`}>
                      {t.deltaPct >= 0 ? "▲" : "▼"}{Math.abs(t.deltaPct)}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-[var(--faint)]">Bars = spend per month. ▲/▼ = latest month vs your average for that category. Click any row to see its payments.</p>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "insights" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {anoms.length > 0 && (
            <div className="lg:col-span-3">
              <Panel title="Heads up — spending spikes">
                <ul className="space-y-1.5 text-sm">
                  {anoms.map((t) => (
                    <li
                      key={t.label}
                      onClick={() => drillCat(t.label)}
                      title={`See the payments behind ${t.label}`}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded px-1 py-0.5 transition hover:bg-[var(--panel-2)]"
                    >
                      <span className="text-[var(--text)]">{t.label} <span className="text-rose-500">▲{t.deltaPct}%</span> vs your average</span>
                      <span className="tabular-nums text-[var(--muted)]">last {aud(t.last)} · avg {aud(t.avg)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          )}
          <Card label="Avg weekly spend" value={aud(ins.avgWeeklySpend)} sub={`${ins.weeks} weeks`} accent="text-rose-500" />
          <Card label="Avg monthly spend" value={aud(ins.avgMonthlySpend)} accent="text-rose-500" />
          <Card label="Avg transaction" value={aud(ins.avgTxn, 2)} />
          <Card label="Avg fuel fill-up" value={aud(ins.avgFuelFill, 2)} accent="text-amber-500" onClick={() => drillCat("Fuel")} />
          <Card label="Avg insurance payment" value={aud(ins.avgInsurance, 2)} accent="text-amber-500" onClick={() => drillCat("Insurance")} />
          <Card label="Biggest single expense" value={aud(ins.biggest.value)} sub={ins.biggest.label} />
          <div className="lg:col-span-3">
            <Panel title="Average spend per transaction, by category">
              <HBars
                data={ins.perCategoryAvg.map((c) => ({ label: `${c.label} (${c.count})`, value: c.avg, id: c.label }))}
                onSelect={drillCat}
              />
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "tax" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <GstPanel ds={ds} claimable={a.totalClaimable} />
          <Panel title="Claimable expenses by category">
            <HBars data={a.spendByCategory.filter((c) => c.claimable)} onSelect={drillCat} />
          </Panel>
          <Panel title="Notes & assumptions">
            <p className="text-sm leading-relaxed text-[var(--muted)]">{ds.meta.notes}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--faint)]">
              <li>GST is a rough estimate at 1/11 of GST-inclusive amounts. Confirm with your accountant.</li>
              <li>Vehicle claims are subject to your business-use percentage (logbook).</li>
              <li>Recategorise any transaction in the Transactions tab — every total updates live.</li>
            </ul>
          </Panel>
        </div>
      )}

      {activeTab === "txns" && (
        <Panel title="All transactions" right={<span className="text-xs text-[var(--faint)]">edit categories · bulk-recategorise · saved in your browser</span>}>
          <TransactionTable ds={ds} txns={ds.transactions} overrides={overrides} setOverride={setOverride} bulkSet={bulkSet} />
        </Panel>
      )}

      <footer className="mt-10 border-t border-[var(--border)] pt-4 text-center text-xs text-[var(--faint)]">
        BudgetProof · data stays private · estimates only, not tax advice
      </footer>
    </PageShell>
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
