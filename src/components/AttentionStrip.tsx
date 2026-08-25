"use client";
import { useMemo } from "react";
import Link from "next/link";
import type { Dataset } from "@/lib/types";
import { useAppState } from "@/lib/AppState";
import { useOverrides } from "@/lib/useOverrides";
import { useGstConfig, gstBase } from "@/lib/useGstConfig";
import { usePlanning } from "@/lib/usePlanning";
import { aggregate, effCat } from "@/lib/aggregate";
import { occurrences } from "@/lib/planning";
import { aud } from "@/lib/format";

const REVIEW_CATS = new Set(["Uncategorised", "Afterpay Purchase", "StepPay Purchase"]);

interface Item { tone: "rose" | "amber" | "sky" | "emerald"; icon: string; text: string; href: string; }

export function AttentionStrip({ ds }: { ds: Dataset }) {
  const { state } = useAppState();
  const { overrides } = useOverrides(ds);
  const { cfg: gstCfg } = useGstConfig();
  const { data: planning } = usePlanning(ds.summary.total_spend / 12);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    // 1. bills due in next 7 days (from forecast recurring expenses)
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 864e5);
    let dueCount = 0, dueSum = 0;
    for (const e of planning.expenses ?? []) {
      for (const d of occurrences(e, now, end)) { dueCount++; dueSum += e.amount; void d; }
    }
    if (dueCount) out.push({ tone: "amber", icon: "📅", text: `${dueCount} bill${dueCount > 1 ? "s" : ""} due in 7 days · ${aud(dueSum)}`, href: "/forecast" });

    // 2. net GST payable to set aside
    const gstNet = gstBase(ds.income.monthly, gstCfg) / 11 - ds.summary.total_claimable / 11;
    if (gstNet > 0) out.push({ tone: "sky", icon: "🧾", text: `Set aside ${aud(gstNet)} for GST`, href: "/tax" });

    // 3. transactions to review (uncategorised / generic BNPL)
    const review = ds.transactions.filter((t) => t.dir === "debit" && REVIEW_CATS.has(effCat(t, overrides))).length;
    if (review) out.push({ tone: "amber", icon: "🏷️", text: `${review} transactions to categorise`, href: "/" });

    // 4. over-budget categories
    const a = aggregate(ds, ds.transactions, overrides);
    const months = Math.max(1, ds.income.monthly.length);
    const budgets = state.budgets ?? {};
    const over = a.spendByCategory.filter((c) => (budgets[c.label] ?? 0) > 0 && c.value / months > budgets[c.label]);
    if (over.length) out.push({ tone: "rose", icon: "⚠️", text: `${over.length} categor${over.length > 1 ? "ies" : "y"} over budget`, href: "/budget" });

    // 5. net position (positive = good)
    const net = ds.summary.net;
    out.push({ tone: net >= 0 ? "emerald" : "rose", icon: net >= 0 ? "✅" : "🔻", text: `Net ${aud(net)} for the year`, href: "/" });

    return out;
  }, [ds, overrides, gstCfg, planning, state.budgets]);

  const toneCls: Record<Item["tone"], string> = {
    rose: "border-rose-600/30 bg-rose-500/5",
    amber: "border-amber-600/30 bg-amber-500/5",
    sky: "border-sky-600/30 bg-sky-500/5",
    emerald: "border-emerald-600/30 bg-emerald-500/5",
  };
  const dotCls: Record<Item["tone"], string> = {
    rose: "bg-rose-500", amber: "bg-amber-500", sky: "bg-sky-500", emerald: "bg-emerald-500",
  };

  return (
    <div className="mb-5">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--faint)]">Needs your attention</div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((it, i) => (
          <Link key={i} href={it.href} className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toneCls[it.tone]} hover:bg-[var(--panel-2)]`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls[it.tone]}`} />
            <span className="whitespace-nowrap font-medium text-[var(--text)]">{it.text}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
