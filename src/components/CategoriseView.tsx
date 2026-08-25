"use client";
import { useEffect, useMemo, useState } from "react";
import type { Dataset, Txn } from "@/lib/types";
import { useOverrides } from "@/lib/useOverrides";
import { effCat } from "@/lib/aggregate";
import { useFy } from "@/lib/useFy";
import { useDrill } from "./DrillDown";
import { aud, colorFor } from "@/lib/format";
import { Card, Panel, PageShell } from "./ui";

const KEY_LS = "budgetproof.claudeKey.v1";
const MAX_AI_MERCHANTS = 24;

interface Suggestion {
  category: string;
  confidence: number;
  reason: string;
}

/**
 * Work through uncategorised spending merchant by merchant.
 *
 * Grouping by merchant rather than listing transactions is the point: one
 * decision on "Starchart Holdings" categorises 44 rows at once, so the backlog
 * clears in a handful of choices instead of hundreds.
 */
export default function CategoriseView({ ds: dsAll }: { ds: Dataset }) {
  const { ds, isAllYears } = useFy(dsAll);
  const { overrides, setOverride, bulkSet, reset, count } = useOverrides(ds);
  const { open } = useDrill();
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [splitKey, setSplitKey] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiError, setAiError] = useState("");
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setApiKey(localStorage.getItem(KEY_LS) ?? ""); } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const saveKey = (k: string) => {
    setApiKey(k);
    try { localStorage.setItem(KEY_LS, k); } catch {}
  };

  const cats = useMemo(
    () => Object.entries(ds.meta.taxonomy.groups) as [string, string[]][],
    [ds]
  );

  // uncategorised spend, rolled up by merchant
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; txns: Txn[]; total: number }>();
    for (const t of ds.transactions) {
      if (t.dir !== "debit") continue;
      const cat = effCat(t, overrides);
      if (cat && cat !== "Uncategorised") continue;
      const key = (t.brand || t.merchant || t.description.slice(0, 24)).trim() || "(no merchant)";
      const g = m.get(key) ?? { key, label: key, txns: [], total: 0 };
      g.txns.push(t);
      g.total += t.amount;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [ds, overrides]);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? groups.filter((g) => g.label.toLowerCase().includes(n)) : groups;
  }, [groups, q]);

  const remaining = groups.reduce((s, g) => s + g.total, 0);
  const remainingTxns = groups.reduce((s, g) => s + g.txns.length, 0);
  const splitGroup = splitKey ? groups.find((g) => g.key === splitKey) : null;

  const suggestVisible = async () => {
    const merchants = rows.slice(0, MAX_AI_MERCHANTS).map((g) => ({
      key: g.key,
      label: g.label,
      total: g.total,
      txns: g.txns.slice(0, 8).map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        source: t.source,
      })),
    }));
    if (!merchants.length) return;
    setSuggesting(true);
    setAiError("");
    try {
      const res = await fetch("/api/categorise/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, merchants }),
      });
      const json = await res.json();
      if (json.error) {
        setAiError(json.error);
      } else {
        const next: Record<string, Suggestion> = {};
        for (const s of json.suggestions ?? []) {
          if (s?.key && s?.category) next[s.key] = s;
        }
        setSuggestions((prev) => ({ ...prev, ...next }));
      }
    } catch {
      setAiError("Prediction request failed.");
    }
    setSuggesting(false);
  };

  return (
    <PageShell>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight">Categorise</h1>
        {count > 0 && (
          <button onClick={reset} className="rounded-md border border-emerald-700 px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-900/20">
            {count} edit{count > 1 ? "s" : ""} · reset all
          </button>
        )}
      </div>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Uncategorised spending, grouped by merchant — one choice categorises every transaction for that
        merchant at once. Anything left uncategorised is missing from your claimable expenses.
        {!isAllYears && " Showing the selected financial year; switch to All years to clear the whole backlog."}
      </p>

      {!apiKey && (
        <div className="mb-6">
          <Panel title="AI category help">
            <p className="mb-3 text-sm text-[var(--muted)]">
              Use the same Claude API key as Ask BudgetProof. It stays in this browser and is sent only with prediction requests.
            </p>
            <input
              type="password"
              placeholder="sk-ant-…"
              onChange={(e) => saveKey(e.target.value.trim())}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-emerald-600"
            />
          </Panel>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Merchants to review" value={String(groups.length)} accent={groups.length ? "text-amber-500" : "text-emerald-500"} />
        <Card label="Transactions" value={remainingTxns.toLocaleString()} />
        <Card label="Value uncategorised" value={aud(remaining)} accent="text-rose-500" sub="may include claimable expenses" />
        <Card label="Your edits" value={String(count)} accent="text-emerald-500" sub="saved & synced" />
      </div>

      <Panel
        title="Uncategorised merchants"
        right={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {apiKey && (
              <button onClick={() => setShowKey((s) => !s)} className="text-xs text-[var(--faint)] hover:underline">
                {showKey ? "hide key" : "change key"}
              </button>
            )}
            <button
              onClick={suggestVisible}
              disabled={!apiKey || suggesting || rows.length === 0}
              className="rounded-md border border-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-900/20 disabled:cursor-not-allowed disabled:opacity-50"
              title={`Predict the first ${Math.min(rows.length, MAX_AI_MERCHANTS)} visible merchants`}
            >
              {suggesting ? "Predicting…" : "AI predict visible"}
            </button>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search merchant…"
              className="rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-sm outline-none focus:border-emerald-600"
            />
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-emerald-600" />
              show cleared
            </label>
          </div>
        }
      >
        {showKey && (
          <input
            type="password"
            value={apiKey}
            onChange={(e) => saveKey(e.target.value.trim())}
            className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
        )}
        {aiError && <p className="mb-3 text-sm text-rose-500">{aiError}</p>}
        {splitGroup && (
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">{splitGroup.label}</h3>
                <p className="text-xs text-[var(--faint)]">
                  Move individual transactions out of this merchant group by giving them their own category.
                </p>
              </div>
              <button onClick={() => setSplitKey(null)} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--panel)]">
                Close
              </button>
            </div>
            <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto">
              {splitGroup.txns.map((t) => {
                const cat = effCat(t, overrides) || "Uncategorised";
                return (
                  <li key={t.id} className="grid gap-2 py-2 text-sm sm:grid-cols-[5.5rem_1fr_auto_auto] sm:items-center">
                    <span className="text-xs tabular-nums text-[var(--faint)]">{t.date}</span>
                    <span className="min-w-0 truncate" title={t.description}>{t.description}</span>
                    <span className="tabular-nums text-rose-500 sm:text-right">{aud(t.amount, 2)}</span>
                    <select
                      value={cat}
                      onChange={(e) => setOverride(t.id, e.target.value)}
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-sm"
                    >
                      <option value="Uncategorised">Uncategorised</option>
                      {cats.map(([group, list]) => (
                        <optgroup key={group} label={group}>
                          {list.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            {groups.length === 0 ? "Nothing left to categorise for this year. 🎉" : "No merchant matches that search."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((g) => {
              const suggestion = suggestions[g.key];
              const confidence = suggestion ? Math.round(suggestion.confidence * 100) : 0;
              return (
                <li key={g.key} className="flex flex-wrap items-center gap-3 py-2.5">
                  <button
                    onClick={() => open({ title: g.label, subtitle: "uncategorised", txns: g.txns })}
                    title="See these transactions"
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium hover:underline">{g.label}</span>
                    <span className="text-xs text-[var(--faint)]">
                      {g.txns.length} txn{g.txns.length > 1 ? "s" : ""} · {g.txns[g.txns.length - 1].date} → {g.txns[0].date}
                    </span>
                  </button>
                  <span className="shrink-0 tabular-nums text-rose-500">{aud(g.total)}</span>
                  <button
                    onClick={() => setSplitKey((key) => key === g.key ? null : g.key)}
                    className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)]"
                    title="Move individual transactions out of this group"
                  >
                    Split
                  </button>
                  {suggestion && (
                    <button
                      onClick={() => bulkSet(g.txns.map((t) => t.id), suggestion.category)}
                      title={suggestion.reason || "Apply AI category"}
                      className="shrink-0 rounded-md border border-emerald-700 bg-emerald-900/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-900/25"
                    >
                      AI: {suggestion.category} · {confidence}%
                    </button>
                  )}
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) bulkSet(g.txns.map((t) => t.id), e.target.value);
                    }}
                    className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--panel-2)] px-2 py-1.5 text-sm"
                  >
                    <option value="" disabled>Categorise {g.txns.length}…</option>
                    {cats.map(([group, list]) => (
                      <optgroup key={group} label={group}>
                        {list.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {suggestion?.reason && (
                    <span className="basis-full truncate text-xs text-[var(--faint)] sm:pl-1">
                      {suggestion.reason}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {showDone && (
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--faint)]">
            Cleared merchants drop off this list automatically — reset above to bring them back.
          </p>
        )}
      </Panel>

      <Panel title="Where your categorised spend sits">
        <ul className="mt-1 space-y-2 text-sm">
          {cats.map(([group, list]) => {
            const total = ds.transactions
              .filter((t) => t.dir === "debit" && list.includes(effCat(t, overrides)))
              .reduce((s, t) => s + t.amount, 0);
            if (!total) return null;
            return (
              <li key={group} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorFor(group) }} />
                <span>{group}</span>
                <span className="ml-auto tabular-nums text-[var(--muted)]">{aud(total)}</span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </PageShell>
  );
}
