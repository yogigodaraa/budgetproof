"use client";
import { useMemo } from "react";
import type { Dataset } from "@/lib/types";
import { lifetime, type YearRow } from "@/lib/lifetime";
import { useOverrides } from "@/lib/useOverrides";
import { platformLabel } from "@/lib/useGstConfig";
import { aud, monthLabel, colorFor } from "@/lib/format";
import { Card, Panel } from "./ui";
import { HBars } from "./charts";

/** The "All years" view: career progression by financial year, not by month. */
export default function LifetimeView({ ds }: { ds: Dataset }) {
  const { overrides } = useOverrides(ds);
  const lt = useMemo(() => lifetime(ds, overrides), [ds, overrides]);
  const maxYear = Math.max(...lt.years.map((y) => y.income), 1);

  // best earning month of the calendar year, across every year worked
  const seasonal = useMemo(() => {
    const m: Record<number, number> = {};
    for (const x of lt.monthly) m[Number(x.month.slice(5, 7))] = (m[Number(x.month.slice(5, 7))] ?? 0) + x.income;
    return Array.from({ length: 12 }, (_, i) => ({
      label: monthLabel(`2000-${String(i + 1).padStart(2, "0")}`).split(" ")[0],
      value: Math.round(m[i + 1] ?? 0),
    }));
  }, [lt.monthly]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="Earned to date" value={aud(lt.totalIncome)} accent="text-emerald-500" sub={`${lt.years.length} financial years`} />
        <Card label="Best year" value={lt.best.year ? aud(lt.best.year.income) : "—"} sub={lt.best.year?.label} />
        <Card label="Best month" value={lt.best.month ? aud(lt.best.month.income) : "—"} sub={lt.best.month ? monthLabel(lt.best.month.month) : ""} />
        <Card label="Months worked" value={String(lt.activeMonths)} sub="months with income" />
        <Card label="Distance driven" value={`${lt.totalKm.toLocaleString()} km`} sub={`${lt.totalTrips.toLocaleString()} trips`} />
        <Card label="Platform fees" value={aud(lt.totalFees)} accent="text-amber-500" sub="deductible" />
      </div>

      <Panel title="Income by financial year">
        <ul className="space-y-3">
          {lt.years.map((y) => (
            <li key={y.fy} className="grid grid-cols-[5.5rem_1fr_6rem_4rem] items-center gap-3 text-sm">
              <span className="font-medium">{y.label}</span>
              <div className="h-6 rounded bg-[var(--panel-2)]">
                <div className="h-6 rounded bg-emerald-500/80" style={{ width: `${(y.income / maxYear) * 100}%` }} />
              </div>
              <span className="text-right tabular-nums">{aud(y.income)}</span>
              <span className={`text-right text-xs tabular-nums ${
                y.growthPct === null ? "text-[var(--faint)]"
                  : y.growthPct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {y.growthPct === null ? "—" : `${y.growthPct >= 0 ? "▲" : "▼"}${Math.abs(y.growthPct)}%`}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Your average earnings">
          <dl className="space-y-2 text-sm">
            <Rate k="Per year" v={aud(lt.years.length ? lt.totalIncome / lt.years.length : 0)} note={`${lt.years.length} years`} />
            <Rate k="Per month worked" v={aud(lt.perMonth)} note={`${lt.activeMonths} active months`} />
            <Rate k="Per week" v={aud(lt.perWeek)} note="from the monthly rate" />
            <Rate k="Per day" v={aud(lt.perDay)} note="calendar days" />
            <div className="my-1 border-t border-[var(--border)]" />
            <Rate k="Per kilometre" v={aud(lt.perKm, 2)} note={`${lt.totalKm.toLocaleString()} km on trip`} />
            <Rate k="Per trip" v={aud(lt.perTrip, 2)} note={`${lt.totalTrips.toLocaleString()} trips`} />
          </dl>
          <p className="mt-3 rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-xs text-[var(--faint)]">
            <span className="font-medium text-[var(--muted)]">No hourly rate yet.</span> Neither Uber nor
            DoorDash reports hours worked in their tax documents, so it cannot be calculated from them.
            Because you drove for both at the same time, hours would also have to be merged rather than
            added — export online hours per platform with dates and it can be worked out properly.
          </p>
        </Panel>

        <Panel title="Which months you earn most">
          <HBars data={seasonal} />
          <p className="mt-3 text-xs text-[var(--faint)]">Every year combined, by month of the year.</p>
        </Panel>
      </div>

      <Panel title="Year by year">
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-2)] text-left text-xs uppercase tracking-wide text-[var(--faint)]">
              <tr>
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2 text-right">Income</th>
                <th className="px-3 py-2 text-right">Fees</th>
                <th className="px-3 py-2 text-right">Spend</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">km</th>
                <th className="px-3 py-2 text-right">Trips</th>
                <th className="px-3 py-2 text-right">Months</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {lt.years.map((y) => (
                <tr key={y.fy} className="hover:bg-[var(--panel-2)]">
                  <td className="px-3 py-1.5 font-medium">{y.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{aud(y.income)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-500">{y.fees ? aud(y.fees) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-rose-500">{y.hasSpend ? aud(y.spend) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{y.hasSpend ? aud(y.net) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--muted)]">{y.km ? y.km.toLocaleString() : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--muted)]">{y.trips ? y.trips.toLocaleString() : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--faint)]">{y.months}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--faint)]">
          Spend and net are blank for years with no bank statements loaded yet — income for those years
          comes from the platform tax documents.
        </p>
      </Panel>

      <Panel title="Which platform pays best">
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-2)] text-left text-xs uppercase tracking-wide text-[var(--faint)]">
              <tr>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2 text-right">You keep</th>
                <th className="px-3 py-2 text-right">$/km</th>
                <th className="px-3 py-2 text-right">$/trip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {lt.platforms.map((p) => (
                <tr key={p.key} className="hover:bg-[var(--panel-2)]">
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ background: colorFor(p.key) }} />
                      {platformLabel(p.key)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{aud(p.income)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-500">
                    {p.fees ? `${aud(p.fees)} · ${p.feePct}%` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{aud(p.net)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--muted)]">{p.perKm ? aud(p.perKm, 2) : "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--muted)]">{p.perTrip ? aud(p.perTrip, 2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--faint)]">
          Commission is charged on ride-sourcing only. Uber reports one on-trip distance covering both
          services, so it is split between Uber X and Uber Eats by each month&apos;s income share rather than
          assumed to be all rideshare. Salary and delivery platforms have no distance reported.
        </p>
      </Panel>

      <Panel title="Bank accounts">
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel-2)] text-left text-xs uppercase tracking-wide text-[var(--faint)]">
              <tr>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2 text-right">In</th>
                <th className="px-3 py-2 text-right">Out</th>
                <th className="px-3 py-2 text-right">Txns</th>
                <th className="px-3 py-2">Covered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {lt.accounts.map((f) => (
                <tr key={f.account} className="hover:bg-[var(--panel-2)]">
                  <td className="px-3 py-1.5 font-medium">{f.account}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{aud(f.inflow)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-rose-500">{aud(f.outflow)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--faint)]">{f.txns.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-xs text-[var(--muted)]">{f.first} → {f.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--faint)]">
          Only accounts with a loaded statement appear. Money moving to an account that is not listed
          cannot be tracked — that is how the missing Uber X payouts were found.
        </p>
      </Panel>

      <Panel title="Platform mix by year">
        <div className="space-y-4">
          {lt.years.map((y) => <PlatformBar key={y.fy} year={y} />)}
        </div>
      </Panel>
    </div>
  );
}

function Rate({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--muted)]">{k}{note && <span className="ml-1.5 text-xs text-[var(--faint)]">{note}</span>}</dt>
      <dd className="tabular-nums font-medium">{v}</dd>
    </div>
  );
}

function PlatformBar({ year }: { year: YearRow }) {
  const entries = Object.entries(year.platforms).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{year.label}</span>
        <span className="tabular-nums text-[var(--muted)]">{aud(year.income)}</span>
      </div>
      <div className="flex h-5 overflow-hidden rounded bg-[var(--panel-2)]">
        {entries.map(([k, v]) => (
          <div key={k} style={{ width: `${(v / total) * 100}%`, background: colorFor(k) }}
               title={`${platformLabel(k)} ${aud(v)}`} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--faint)]">
        {entries.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: colorFor(k) }} />
            {platformLabel(k)} {aud(v)}
          </span>
        ))}
      </div>
    </div>
  );
}
