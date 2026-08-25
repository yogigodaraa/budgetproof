"use client";
import { useMemo } from "react";
import type { Dataset } from "@/lib/types";
import { useAppState } from "@/lib/AppState";
import { useOverrides } from "@/lib/useOverrides";
import { useGstConfig, gstBase } from "@/lib/useGstConfig";
import { aggregate } from "@/lib/aggregate";
import { newId } from "@/lib/usePlanning";
import { incomeTax, medicareLevy, logbookDeduction, basQuarter, KM_RATE_DEFAULT, KM_CAP, MEDICARE_RATE, TAX_DEFAULT, VEHICLE_GROUP, r2, type TaxConfig, type LogEntry } from "@/lib/tax";
import { aud } from "@/lib/format";
import { Card, Panel, PageShell } from "./ui";
import { GstPanel } from "./GstPanel";
import { useFy } from "@/lib/useFy";

export default function TaxCentreView({ ds: dsAll }: { ds: Dataset }) {
  // Everything below reports on the financial year picked in the header.
  const { ds } = useFy(dsAll);
  const { state, setSlice } = useAppState();
  const { overrides } = useOverrides(ds);
  const { cfg: gstCfg } = useGstConfig();

  const tax: TaxConfig = { ...TAX_DEFAULT, ...(state.taxConfig ?? {}) };
  const logbook: LogEntry[] = state.logbook ?? [];
  const setTax = (t: TaxConfig) => setSlice("taxConfig", t);
  const setLog = (l: LogEntry[]) => setSlice("logbook", l);

  const a = useMemo(() => aggregate(ds, ds.transactions, overrides), [ds, overrides]);

  // platform commission for the selected year (used by the GST credit line too)
  const platformFeesFor = (d: Dataset) =>
    r2(d.income.monthly.reduce((s, m) => s + (m.fees ?? 0), 0));

  const calc = useMemo(() => {
    // Salary is the GROSS figure from the ATO income statement, not what
    // landed in the bank -- the difference is PAYG already withheld.
    const salary = tax.salaryIncome ?? (ds.income.by_platform.ecu ?? 0);
    const paygFromData = r2(ds.income.monthly.reduce((s, m) => s + (m.payg_withheld ?? 0), 0));
    const payg = tax.paygWithheld || paygFromData;
    const totalIncome = ds.summary.total_income;
    const businessGross = r2(totalIncome - salary);
    const gstCollected = r2(gstBase(ds.income.monthly, gstCfg) / 11);
    // GST credits follow the expenses actually claimed, plus the platform fees
    const gstCredits = r2((tax.vehicleMethod === "km"
      ? Math.max(0, a.totalClaimable - (a.spendByGroup.find((g) => g.label === VEHICLE_GROUP)?.value ?? 0))
      : a.totalClaimable) / 11 + platformFeesFor(ds) / 11);
    const gstNet = r2(gstCollected - gstCredits);
    const businessAssessable = r2(businessGross - gstCollected); // income is GST-exclusive
    // Platform commission: Uber and DiDi take their fee BEFORE paying out, so
    // it never appears as a bank debit. Income is recorded gross, so the fee is
    // a deductible business expense -- without it, tax is charged on money that
    // was never received.
    const platformFees = r2(ds.income.monthly.reduce((s, m) => s + (m.fees ?? 0), 0));

    // Business km, taken from the platform tax documents (on-trip distance) and
    // topped up by any manual logbook entries.
    const docKm = ds.income.monthly.reduce((s, m) => {
      const act = m.activity ?? {};
      return s + (act.uber_km ?? 0) + (act.uber_pnd_km ?? 0) + (act.didi_km ?? 0);
    }, 0);
    const loggedKm = logbook.reduce((s, e) => s + (Number(e.km) || 0), 0);
    const totalKm = Math.round(docKm + loggedKm);
    const kmDeduction = logbookDeduction(totalKm, tax.kmRate || KM_RATE_DEFAULT);

    // One vehicle method only -- see TaxConfig.vehicleMethod
    const vehicleActual = r2(a.spendByGroup.find((g) => g.label === VEHICLE_GROUP)?.value ?? 0);
    const usingKm = tax.vehicleMethod === "km";
    const usePct = Math.min(100, Math.max(0, tax.businessUsePct ?? 100)) / 100;
    const vehicleActualClaim = r2((vehicleActual / 1.1) * usePct);
    const vehicleDeduction = usingKm ? kmDeduction : vehicleActualClaim;
    // other claimable expenses, with vehicle costs taken out so the two methods
    // can never both be counted
    const otherClaimable = r2(Math.max(0, a.totalClaimable - vehicleActual));
    const expenseDeduction = r2(otherClaimable / 1.1); // GST-exclusive
    const deductions = r2(expenseDeduction + vehicleDeduction + platformFees);
    const taxable = r2(Math.max(0, salary + businessAssessable - deductions));
    const tax0 = incomeTax(taxable);
    const medicare = medicareLevy(taxable, tax.medicareExempt);
    // what the levy WOULD have been -- shown so the exemption's value is visible
    const medicareSaved = r2(medicareLevy(taxable, false));
    const totalTax = r2(tax0 + medicare);
    const netTaxPayable = r2(totalTax - payg);
    const totalToGov = r2(Math.max(0, netTaxPayable) + Math.max(0, gstNet));
    const setAsidePct = businessGross > 0 ? Math.round((totalToGov / businessGross) * 100) : 0;
    return { salary, businessGross, gstCollected, gstCredits, gstNet, businessAssessable,
             totalKm, docKm, kmDeduction, vehicleActual, vehicleActualClaim, vehicleDeduction, usingKm, usePct,
             platformFees, otherClaimable, expenseDeduction, deductions, taxable, tax0,
             medicare, medicareSaved, totalTax, payg, paygFromData, netTaxPayable, totalToGov, setAsidePct };
  }, [tax, logbook, ds, gstCfg, a.totalClaimable]);

  // GST-applicable income grouped by BAS quarter
  const basRows = useMemo(() => {
    const q: Record<string, number> = {};
    for (const m of ds.income.monthly) {
      if (m.month < gstCfg.startMonth) continue;
      let base = 0;
      for (const [k, v] of Object.entries(m.platforms ?? {})) if (gstCfg.registered[k]) base += Number(v) || 0;
      if (base) q[basQuarter(m.month)] = (q[basQuarter(m.month)] ?? 0) + base;
    }
    return Object.entries(q).map(([quarter, income]) => ({ quarter, income: r2(income), gst: r2(income / 11) }));
  }, [ds, gstCfg]);

  const exportCsv = () => {
    const rows: string[][] = [
      ["BudgetProof tax summary (estimate)"],
      ["Period", `${ds.meta.period.from} to ${ds.meta.period.to}`],
      [],
      ["Income"],
      ["TFN salary", String(calc.salary)],
      ["Business income (GST-excl.)", String(calc.businessAssessable)],
      ["Deductions (expenses + logbook)", String(calc.deductions)],
      ["Taxable income", String(calc.taxable)],
      ["Income tax", String(calc.tax0)],
      [tax.medicareExempt ? "Medicare levy (exempt)" : "Medicare levy", String(calc.medicare)],
      ["PAYG withheld", String(calc.payg)],
      [calc.netTaxPayable >= 0 ? "Income tax payable" : "Estimated refund", String(Math.abs(calc.netTaxPayable))],
      [],
      ["GST by BAS quarter", "GST income", "GST"],
      ...basRows.map((r) => [r.quarter, String(r.income), String(r.gst)]),
      ["Net GST payable", "", String(calc.gstNet)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "budgetproof-tax-summary.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const addLog = () => setLog([...logbook, { id: newId(), date: new Date().toISOString().slice(0, 10), km: 0, purpose: "" }]);
  const updLog = (e: LogEntry) => setLog(logbook.map((x) => (x.id === e.id ? e : x)));
  const delLog = (id: string) => setLog(logbook.filter((x) => x.id !== id));

  return (
    <PageShell>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">Tax Centre</h1>
        <button onClick={exportCsv} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)]">↓ Export summary (CSV)</button>
      </div>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Estimate of income tax + GST and how much to set aside. ABN (sole trader) business income plus TFN salary,
        minus deductions. Editable — <span className="italic">estimate only, not tax advice.</span>
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Taxable income" value={aud(calc.taxable)} sub="after deductions" />
        <Card
          label={tax.medicareExempt ? "Income tax (levy exempt)" : "Income tax + Medicare"}
          value={aud(calc.totalTax)}
          accent="text-rose-500"
        />
        <Card label={calc.netTaxPayable >= 0 ? "Income tax to pay" : "Estimated refund"} value={aud(Math.abs(calc.netTaxPayable))} accent={calc.netTaxPayable >= 0 ? "text-rose-500" : "text-emerald-500"} sub="after PAYG withheld" />
        <Card label="Set aside from gig $" value={`${calc.setAsidePct}%`} sub={`${aud(calc.totalToGov)} tax+GST`} accent="text-sky-500" />
      </div>

      <Panel title="Vehicle claim — pick the method that pays more">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["km", "actual"] as const).map((m) => {
            const chosen = tax.vehicleMethod === m;
            const value = m === "km" ? calc.kmDeduction : calc.vehicleActualClaim;
            const better = value >= (m === "km" ? calc.vehicleActualClaim : calc.kmDeduction);
            return (
              <button
                key={m}
                onClick={() => setTax({ ...tax, vehicleMethod: m })}
                className={`rounded-xl border p-4 text-left transition ${
                  chosen ? "border-emerald-600 bg-emerald-900/10" : "border-[var(--border)] hover:bg-[var(--panel-2)]"
                }`}
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--faint)]">
                  {m === "km" ? "Cents per km" : "Actual running costs"}
                  {better && <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">better</span>}
                  {chosen && <span className="ml-auto text-emerald-500">✓ using</span>}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-500">{aud(value)}</div>
                <div className="mt-0.5 text-xs text-[var(--faint)]">
                  {m === "km"
                    ? `${calc.totalKm.toLocaleString()} business km · capped at ${KM_CAP.toLocaleString()} km × $${(tax.kmRate || KM_RATE_DEFAULT).toFixed(2)}`
                    : `fuel, servicing, insurance, rego — ${aud(calc.vehicleActual)} incl. GST × ${Math.round(calc.usePct * 100)}% business use`}
                </div>
              </button>
            );
          })}
        </div>
        {tax.vehicleMethod === "actual" && (
          <label className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
            Business use of the car
            <input
              type="number" min={0} max={100}
              value={tax.businessUsePct}
              onChange={(e) => setTax({ ...tax, businessUsePct: Number(e.target.value) })}
              className="w-20 rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-right text-sm tabular-nums"
            />
            %
            <span className="text-xs text-[var(--faint)]">
              needs a 12-week logbook to substantiate — private trips are not claimable
            </span>
          </label>
        )}
        <p className="mt-3 text-xs text-[var(--faint)]">
          The ATO allows one method, not both — choosing cents per km removes actual car costs from your
          deductions, and vice versa. Business km come from the Uber and DiDi tax documents
          ({calc.docKm.toLocaleString()} km on trip){calc.totalKm > calc.docKm ? ", plus your logbook entries" : ""}.
          Only km driven for work count, so trips between jobs and to and from home are excluded from
          the platform figures already.
        </p>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Income tax breakdown">
          <dl className="space-y-2 text-sm">
            <EditRow label="TFN salary (PAYG)" value={tax.salaryIncome ?? calc.salary} onChange={(v) => setTax({ ...tax, salaryIncome: v })} />
            <Row k="Business income (gig, GST-excl.)" v={aud(calc.businessAssessable)} />
            <Row k="− Platform commission (Uber, DiDi)" v={aud(calc.platformFees)} accent="text-emerald-500" />
            <Row k="− Other expenses (GST-excl.)" v={aud(calc.expenseDeduction)} accent="text-emerald-500" />
            <Row
              k={`− Vehicle · ${calc.usingKm ? "cents per km" : "actual running costs"}`}
              v={aud(calc.vehicleDeduction)}
              accent="text-emerald-500"
            />
            <div className="my-1 border-t border-[var(--border)]" />
            <Row k="Taxable income" v={aud(calc.taxable)} big />
            <Row k="Income tax" v={aud(calc.tax0)} accent="text-rose-500" />
            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={tax.medicareExempt}
                  onChange={(e) => setTax({ ...tax, medicareExempt: e.target.checked })}
                  className="accent-emerald-600"
                />
                Medicare levy ({Math.round(MEDICARE_RATE * 100)}%)
                {tax.medicareExempt && <span className="text-emerald-500">— exempt</span>}
              </label>
              <dd className={`tabular-nums ${tax.medicareExempt ? "text-emerald-500" : "text-rose-500"}`}>
                {tax.medicareExempt ? `${aud(0)} · saves ${aud(calc.medicareSaved)}` : aud(calc.medicare)}
              </dd>
            </div>
            {tax.medicareExempt && (
              <p className="-mt-0.5 text-xs text-[var(--faint)]">
                Levy withheld through PAYG on salary is refundable on assessment.
              </p>
            )}
            <EditRow label="− PAYG already withheld" value={calc.payg} onChange={(v) => setTax({ ...tax, paygWithheld: v })} />
            {calc.paygFromData > 0 && !tax.paygWithheld && (
              <p className="-mt-0.5 text-xs text-[var(--faint)]">
                From your ATO income statement ({aud(calc.paygFromData)} withheld on {aud(calc.salary)} gross salary).
              </p>
            )}
            <div className="my-1 border-t border-[var(--border)]" />
            <Row k={calc.netTaxPayable >= 0 ? "Income tax payable" : "Estimated refund"} v={aud(Math.abs(calc.netTaxPayable))} accent={calc.netTaxPayable >= 0 ? "text-rose-500" : "text-emerald-500"} big />
          </dl>
        </Panel>

        <Panel title="GST by BAS quarter">
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--panel-2)] text-left text-xs uppercase tracking-wide text-[var(--faint)]">
                <tr><th className="px-3 py-2">Quarter</th><th className="px-3 py-2 text-right">GST income</th><th className="px-3 py-2 text-right">GST (1/11)</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {basRows.map((r) => (
                  <tr key={r.quarter}><td className="px-3 py-1.5 text-[var(--muted)]">{r.quarter}</td><td className="px-3 py-1.5 text-right tabular-nums">{aud(r.income)}</td><td className="px-3 py-1.5 text-right tabular-nums text-rose-500">{aud(r.gst)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row k="GST collected on income" v={aud(calc.gstCollected)} accent="text-rose-500" />
            <Row k="GST credits on expenses" v={aud(calc.gstCredits)} accent="text-emerald-500" />
            <Row k="Net GST payable" v={aud(calc.gstNet)} accent="text-sky-500" big />
          </dl>
          <p className="mt-2 text-xs text-[var(--faint)]">Configure which income is GST-registered on the Dashboard → Tax tab.</p>
        </Panel>

        <Panel title="Vehicle logbook (cents-per-km)" right={<button onClick={addLog} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">+ Trip</button>}>
          <label className="mb-3 flex items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Rate per km</span>
            <input type="number" step="0.01" value={tax.kmRate} onChange={(e) => setTax({ ...tax, kmRate: Number(e.target.value) })} className="w-20 rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm tabular-nums" />
            <span className="text-xs text-[var(--faint)]">ATO ~$0.88/km, capped {KM_CAP.toLocaleString()} business km/yr</span>
          </label>
          <div className="space-y-2">
            {logbook.length === 0 && <p className="text-sm text-[var(--faint)]">No trips yet. Add business km to claim the deduction.</p>}
            {logbook.map((e) => (
              <div key={e.id} className="grid grid-cols-[8rem_5rem_1fr_2rem] items-center gap-2">
                <input type="date" value={e.date} onChange={(ev) => updLog({ ...e, date: ev.target.value })} className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1 py-1 text-sm" />
                <input type="number" value={e.km} onChange={(ev) => updLog({ ...e, km: Number(ev.target.value) })} placeholder="km" className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm tabular-nums" />
                <input value={e.purpose} onChange={(ev) => updLog({ ...e, purpose: ev.target.value })} placeholder="purpose" className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm" />
                <button onClick={() => delLog(e.id)} className="text-[var(--faint)] hover:text-rose-500">✕</button>
              </div>
            ))}
          </div>
          <dl className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3 text-sm">
            <Row k="Total business km" v={`${calc.totalKm.toLocaleString()} km`} />
            <Row k="Logbook deduction" v={aud(calc.kmDeduction)} accent="text-emerald-500" big />
          </dl>
        </Panel>

        <GstPanel ds={ds} claimable={a.totalClaimable} />

        <Panel title="How much to set aside">
          <p className="text-sm text-[var(--muted)]">
            To cover income tax + GST, set aside about{" "}
            <span className="text-lg font-semibold text-sky-500">{calc.setAsidePct}%</span> of every gig payment —
            roughly <span className="font-semibold text-[var(--text)]">{aud(calc.totalToGov)}</span> across the year.
            Park it in a separate account so BAS/tax time is stress-free.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-[var(--faint)]">
            <li>Ride-sourcing needs an ABN + GST from $1; food delivery income isn’t GST-applicable.</li>
            <li>Vehicle claims need a valid logbook / business-use record.</li>
            <li>This is an estimate — confirm with a registered tax agent.</li>
          </ul>
        </Panel>
      </div>
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
function EditRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-28 rounded border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-right text-sm tabular-nums" />
    </div>
  );
}
