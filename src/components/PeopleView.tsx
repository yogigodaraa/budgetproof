"use client";
import { useMemo, useState } from "react";
import type { Dataset } from "@/lib/types";
import { people } from "@/lib/aggregate";
import { usePeopleAliases } from "@/lib/usePeopleAliases";
import { aud, colorFor } from "@/lib/format";
import { Card, Panel, PageShell } from "./ui";
import { useFy } from "@/lib/useFy";
import { useDrill } from "./DrillDown";
import { useSettled } from "@/lib/useSettled";

export default function PeopleView({ ds: dsAll }: { ds: Dataset }) {
  // Everything below reports on the financial year picked in the header.
  const { ds } = useFy(dsAll);
  const { aliases, mergeInto, reset, count: mergeCount } = usePeopleAliases();
  const { open } = useDrill();
  const { isSettled, toggle: toggleSettled, clear: clearSettled, count: settledCount } = useSettled();
  const [showSettled, setShowSettled] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");

  const rows = useMemo(() => people(ds.transactions, aliases), [ds, aliases]);
  const totals = useMemo(() => {
    const sent = rows.reduce((a, p) => a + p.sent, 0);
    const recv = rows.reduce((a, p) => a + p.received, 0);
    const remitly = rows.filter((p) => p.name.startsWith("Remitly")).reduce((a, p) => a + p.sent, 0);
    // outstanding excludes anyone marked settled -- that is the point of settling
    const outstanding = rows
      .filter((p) => !isSettled(p.name) && !p.name.startsWith("Remitly") && !p.name.startsWith("Self"))
      .reduce((a, p) => a + p.net, 0);
    return { sent, recv, net: sent - recv, remitly, outstanding };
  }, [rows, isSettled]);

  const openRows = rows.filter((p) => !isSettled(p.name));
  const visible = showSettled ? rows : openRows;
  const peopleOnly = openRows.filter((p) => !p.name.startsWith("Remitly"));
  const maxNet = Math.max(...peopleOnly.map((p) => Math.abs(p.net)), 1);

  const txnsFor = (name: string) =>
    ds.transactions
      .filter((t) => t.counterparty && (aliases[t.counterparty] ?? t.counterparty) === name)
      ;

  const toggle = (name: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });

  const doMerge = () => {
    const names = Array.from(sel);
    if (names.length < 1) return;
    const dest = (target.trim() || names[0]);
    mergeInto(names, dest);
    setSel(new Set());
    setTarget("");
  };

  return (
    <PageShell>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">People &amp; transfers</h1>
        {mergeCount > 0 && (
          <button onClick={reset} className="rounded-md border border-emerald-700 px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-900/20">
            {mergeCount} merge{mergeCount > 1 ? "s" : ""} · reset
          </button>
        )}
      </div>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Money sent to and received from people — track who owes whom and what you’ve repaid. Tick people and
        merge duplicates into one (e.g. two spellings of the same name). Peer transfers are excluded from
        income and spend totals.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Sent to people" value={aud(totals.sent)} accent="text-rose-500" />
        <Card label="Received from people" value={aud(totals.recv)} accent="text-emerald-500" />
        <Card
          label="Outstanding"
          value={aud(Math.abs(totals.outstanding))}
          sub={settledCount ? `${settledCount} settled & hidden` : "nobody settled yet"}
          accent={totals.outstanding >= 0 ? "text-emerald-500" : "text-rose-500"}
        />
        <Card label="Sent via Remitly" value={aud(totals.remitly)} sub="overseas remittance" accent="text-sky-500" />
      </div>

      {/* merge toolbar */}
      {sel.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-900/10 px-3 py-2 text-sm">
          <span className="text-[var(--muted)]">{sel.size} selected — merge into:</span>
          <input
            list="people-names"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={Array.from(sel)[0]}
            className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1 text-sm outline-none focus:border-emerald-600"
          />
          <datalist id="people-names">
            {rows.map((p) => <option key={p.name} value={p.name} />)}
          </datalist>
          <button onClick={doMerge} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500">Merge</button>
          <button onClick={() => setSel(new Set())} className="text-xs text-[var(--faint)] hover:underline">clear</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Net balance per person">
          <ul className="space-y-2.5">
            {peopleOnly.map((p) => (
              <li key={p.name} className="grid grid-cols-[8rem_1fr_6rem] items-center gap-3 text-sm">
                <span className="truncate text-[var(--text)]" title={p.name}>{p.name}</span>
                <div className="relative h-5 rounded bg-[var(--panel-2)]">
                  <div className="absolute top-0 h-5 rounded" style={{
                    width: `${(Math.abs(p.net) / maxNet) * 50}%`,
                    left: p.net >= 0 ? "50%" : undefined,
                    right: p.net < 0 ? "50%" : undefined,
                    background: p.net >= 0 ? "#10b981" : "#ef4444",
                  }} />
                  <div className="absolute left-1/2 top-0 h-5 w-px bg-[var(--border)]" />
                </div>
                <span className={`text-right tabular-nums ${p.net >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {p.net >= 0 ? "+" : "−"}{aud(Math.abs(p.net))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--faint)]">Green = you sent more than you received. Red = you received more than you sent.</p>
        </Panel>

        <Panel
          title="Breakdown"
          right={
            <div className="flex items-center gap-3">
              {settledCount > 0 && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={showSettled}
                    onChange={(e) => setShowSettled(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  show {settledCount} settled
                </label>
              )}
              {settledCount > 0 && (
                <button onClick={clearSettled} className="text-xs text-[var(--faint)] hover:underline">
                  unsettle all
                </button>
              )}
              <span className="text-xs text-[var(--faint)]">tick to merge · click name to expand</span>
            </div>
          }
        >
          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--panel-2)] text-left text-xs uppercase tracking-wide text-[var(--faint)]">
                <tr>
                  <th className="px-2 py-2"></th>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 text-right font-medium">Sent</th>
                  <th className="px-3 py-2 text-right font-medium">Received</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-right font-medium">#</th>
                  <th className="px-3 py-2 text-right font-medium">Settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {visible.map((p) => (
                    <tr key={p.name} className={`hover:bg-[var(--panel-2)] ${isSettled(p.name) ? "opacity-45" : ""}`}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={sel.has(p.name)} onChange={() => toggle(p.name)} />
                      </td>
                      <td
                        className="cursor-pointer px-3 py-1.5"
                        title={`See every transfer with ${p.name}`}
                        onClick={() =>
                          open({
                            title: p.name,
                            subtitle: "transfers with this person",
                            txns: txnsFor(p.name),
                            showDirection: true,
                          })
                        }
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-sm" style={{ background: colorFor(p.name) }} />
                          {p.name}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-rose-500">{aud(p.sent)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-emerald-500">{aud(p.received)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${p.net >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {p.net >= 0 ? "+" : "−"}{aud(Math.abs(p.net))}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[var(--faint)]">{p.count}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => toggleSettled(p.name)}
                          title={isSettled(p.name)
                            ? `Bring ${p.name} back into the list`
                            : `Mark ${p.name} settled — nothing owed either way`}
                          className={`rounded-md border px-2 py-0.5 text-xs transition ${
                            isSettled(p.name)
                              ? "border-emerald-700 text-emerald-400 hover:bg-emerald-900/20"
                              : "border-[var(--border)] text-[var(--faint)] hover:bg-[var(--panel-2)]"
                          }`}
                        >
                          {isSettled(p.name) ? "✓ settled" : "settle"}
                        </button>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
