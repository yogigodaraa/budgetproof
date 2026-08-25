"use client";
import { useMemo, useState } from "react";
import type { Dataset, Txn } from "@/lib/types";
import { aud, colorFor } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = {
  commbank: "CommBank",
  afterpay: "Afterpay",
  steppay: "StepPay",
};

function CategorySelect({
  ds,
  value,
  edited,
  onChange,
}: {
  ds: Dataset;
  value: string;
  edited?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border bg-[var(--panel-2)] px-1.5 py-0.5 text-xs ${
        edited ? "border-emerald-600 text-emerald-500" : "border-[var(--border)] text-[var(--text)]"
      }`}
    >
      {Object.entries(ds.meta.taxonomy.groups).map(([g, cs]) => (
        <optgroup key={g} label={g}>
          {cs.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function TransactionTable({
  ds,
  txns,
  overrides,
  setOverride,
  bulkSet,
}: {
  ds: Dataset;
  txns: Txn[];
  overrides: Record<string, string>;
  setOverride: (id: string, cat: string) => void;
  bulkSet: (ids: string[], cat: string) => void;
}) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("All");
  const [dir, setDir] = useState<"all" | "debit" | "credit">("all");
  const [limit, setLimit] = useState(100);
  const [bulkCat, setBulkCat] = useState(Object.values(ds.meta.taxonomy.groups).flat()[0]);

  const catGroup = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [g, cs] of Object.entries(ds.meta.taxonomy.groups)) for (const c of cs) m[c] = g;
    return m;
  }, [ds]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txns
      .filter((t) => {
        const cat = overrides[t.id] ?? t.category;
        if (group !== "All" && catGroup[cat] !== group) return false;
        if (dir !== "all" && t.dir !== dir) return false;
        if (needle && !t.description.toLowerCase().includes(needle) && !cat.toLowerCase().includes(needle))
          return false;
        return true;
      })
      .slice()
      .reverse();
  }, [txns, q, group, dir, overrides, catGroup]);

  const applyBulk = () => {
    if (filtered.length && confirm(`Set all ${filtered.length} matching transactions to “${bulkCat}”?`)) {
      bulkSet(filtered.map((t) => t.id), bulkCat);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search description or category…"
          className="min-w-[14rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm outline-none focus:border-emerald-600"
        />
        <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm">
          <option>All</option>
          {Object.keys(ds.meta.taxonomy.groups).map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select value={dir} onChange={(e) => setDir(e.target.value as typeof dir)} className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm">
          <option value="all">In &amp; Out</option>
          <option value="debit">Out</option>
          <option value="credit">In</option>
        </select>
        <span className="text-xs text-[var(--faint)]">{filtered.length} txns</span>
      </div>

      {/* bulk categorise bar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm">
        <span className="text-[var(--muted)]">Bulk: set all {filtered.length} filtered →</span>
        <CategorySelect ds={ds} value={bulkCat} onChange={setBulkCat} />
        <button onClick={applyBulk} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500">
          Apply
        </button>
        <span className="text-xs text-[var(--faint)]">Tip: search e.g. “remitly”, then bulk-set.</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel-2)] text-left text-xs uppercase tracking-wide text-[var(--faint)]">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filtered.slice(0, limit).map((t) => {
              const cat = overrides[t.id] ?? t.category;
              const edited = overrides[t.id] != null;
              return (
                <tr key={t.id} className="hover:bg-[var(--panel-2)]">
                  <td className="whitespace-nowrap px-3 py-1.5 text-[var(--faint)]">{t.date}</td>
                  <td className="max-w-[22rem] truncate px-3 py-1.5" title={t.description}>{t.description}</td>
                  <td className="px-3 py-1.5 text-[var(--faint)]">{SOURCE_LABEL[t.source]}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm" style={{ background: colorFor(cat) }} />
                      <CategorySelect ds={ds} value={cat} edited={edited} onChange={(v) => setOverride(t.id, v)} />
                    </span>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${t.dir === "credit" ? "text-emerald-500" : ""}`}>
                    {t.dir === "credit" ? "+" : "−"}
                    {aud(t.amount, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <button onClick={() => setLimit((l) => l + 200)} className="mt-3 rounded-md border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--panel-2)]">
          Show more ({filtered.length - limit} hidden)
        </button>
      )}
    </div>
  );
}
