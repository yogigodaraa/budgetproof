"use client";
import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/types";
import { merchants } from "@/lib/aggregate";
import { useOverrides } from "@/lib/useOverrides";
import { aud, colorFor } from "@/lib/format";
import { Card, Panel, PageShell } from "./ui";
import { useFy } from "@/lib/useFy";
import { useDrill } from "./DrillDown";

export default function MerchantsView({ ds: dsAll }: { ds: Dataset }) {
  // Everything below reports on the financial year picked in the header.
  const { ds } = useFy(dsAll);
  const { overrides } = useOverrides(ds);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const { open } = useDrill();

  const all = useMemo(() => merchants(ds, ds.transactions, overrides), [ds, overrides]);
  const categories = useMemo(() => {
    const s = new Set(all.map((m) => m.category));
    return ["All", ...Array.from(s).sort()];
  }, [all]);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((m) => (cat === "All" || m.category === cat) && (!n || m.brand.toLowerCase().includes(n)));
  }, [all, q, cat]);

  const totalShown = rows.reduce((a, m) => a + m.total, 0);
  const max = Math.max(...rows.map((m) => m.total), 1);

  const txnsFor = (brand: string) =>
    ds.transactions.filter((t) => (t.brand || t.merchant) === brand && t.dir === "debit");

  return (
    <PageShell>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Merchants &amp; brands</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Where your money goes, rolled up by brand — all your BP fuel, Woolworths grocery runs, etc. in one line.
        Click any brand to see every payment you made to it.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Brands shown" value={rows.length.toString()} />
        <Card label="Total (filtered)" value={aud(totalShown)} accent="text-rose-500" />
        <Card label="Top brand" value={rows[0]?.brand ?? "—"} sub={rows[0] ? aud(rows[0].total) : ""} />
        <Card label="Categories" value={(categories.length - 1).toString()} />
      </div>

      <Panel
        title="Brand breakdown"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search brand…"
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm outline-none focus:border-emerald-600"
            />
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm">
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        }
      >
        <ul className="space-y-1.5">
          {rows.slice(0, 80).map((m) => (
            <li key={m.brand}>
              <div
                className="grid cursor-pointer grid-cols-[11rem_1fr_5rem_2.5rem] items-center gap-3 rounded px-1 py-1 text-sm hover:bg-[var(--panel-2)]"
                onClick={() => open({ title: m.brand, subtitle: m.category, txns: txnsFor(m.brand) })}
                title={`See every payment to ${m.brand}`}
              >
                <span className="truncate" title={m.brand}>
                  {m.brand}
                  <span className="ml-1.5 text-[10px] text-[var(--faint)]">{m.category}</span>
                </span>
                <div className="h-4 rounded bg-[var(--panel-2)]">
                  <div className="h-4 rounded" style={{ width: `${(m.total / max) * 100}%`, background: colorFor(m.category) }} />
                </div>
                <span className="text-right tabular-nums text-[var(--muted)]">{aud(m.total)}</span>
                <span className="text-right text-xs text-[var(--faint)]">{m.count}×</span>
              </div>
            </li>
          ))}
        </ul>
        {rows.length > 80 && <p className="mt-3 text-xs text-[var(--faint)]">Showing top 80 of {rows.length} brands — search to narrow.</p>}
      </Panel>
    </PageShell>
  );
}
