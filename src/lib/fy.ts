// Australian financial year: 1 July YYYY -> 30 June YYYY+1.
// An FY is identified by the calendar year it ENDS in, so FY 2026 runs
// 2025-07-01 -> 2026-06-30 and is labelled "FY 2025-26".
import type { Dataset, Txn } from "./types";
import { SPEND_GROUPS, catGroup, effCat } from "./aggregate";

export const ALL_YEARS = "all" as const;
export type FyChoice = number | typeof ALL_YEARS;

/** FY that a "YYYY-MM" month belongs to. Jul..Dec -> next year, Jan..Jun -> same. */
export function fyOfMonth(month: string): number {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m >= 7 ? y + 1 : y;
}

export const fyOfDate = (date: string) => fyOfMonth(date.slice(0, 7));

/** Inclusive month bounds, e.g. 2026 -> { from: "2025-07", to: "2026-06" }. */
export const fyMonthRange = (fy: number) => ({ from: `${fy - 1}-07`, to: `${fy}-06` });

/** Inclusive date bounds, e.g. 2026 -> 2025-07-01 .. 2026-06-30. */
export const fyDateRange = (fy: number) => ({ from: `${fy - 1}-07-01`, to: `${fy}-06-30` });

export const fyLabel = (fy: number) => `FY ${fy - 1}–${String(fy).slice(2)}`;

export const fyLongLabel = (fy: number) => `1 Jul ${fy - 1} – 30 Jun ${fy}`;

/**
 * Financial years to offer in the picker: every FY the data touches, plus the
 * FY we are living in now, so the current year is selectable before any of its
 * transactions have landed. Ascending.
 */
/**
 * The financial year to open on.
 *
 * Prefers the latest year with INCOME, not merely the latest with any
 * transaction: a BNPL export can run weeks past the end of the last year
 * actually worked, and opening on that year shows an almost empty dashboard.
 * Falls back to transactions only when there is no income at all.
 */
export function latestFyWithData(ds: Dataset, today = new Date()): number | null {
  const withIncome = [...new Set(
    ds.income.monthly.filter((m) => m.income).map((m) => fyOfMonth(m.month))
  )].sort((a, b) => b - a);

  if (withIncome.length) {
    // Prefer the most recent COMPLETED year: that is the one you file a return
    // for, and the year in progress is always partial -- a couple of months of
    // salary with no expenses yet reads as broken rather than as current.
    const currentFy = fyOfMonth(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
    );
    const completed = withIncome.find((y) => y < currentFy);
    return completed ?? withIncome[0];
  }

  const withTxns = new Set<number>();
  for (const t of ds.transactions) withTxns.add(fyOfDate(t.date));
  return withTxns.size ? Math.max(...withTxns) : null;
}

export function availableFys(ds: Dataset, today = new Date()): number[] {
  const years = new Set<number>();
  for (const t of ds.transactions) years.add(fyOfDate(t.date));
  for (const m of ds.income.monthly) years.add(fyOfMonth(m.month));
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  years.add(fyOfMonth(iso));
  return [...years].sort((a, b) => a - b);
}

/**
 * Narrow a dataset to one financial year, recomputing every derived total so
 * the whole app reports on that year alone. Passing ALL_YEARS returns the
 * dataset untouched.
 *
 * Spend is recomputed here with the same SPEND_GROUPS rule `aggregate()` uses,
 * so the summary tiles and the charts can never disagree. Income comes from the
 * platform table (`income.monthly`), not the bank feed, which is why it is
 * sliced by month rather than by transaction.
 */
export function sliceDataset(
  ds: Dataset,
  fy: FyChoice,
  overrides: Record<string, string> = {}
): Dataset {
  if (fy === ALL_YEARS) return ds;

  const { from, to } = fyDateRange(fy);
  const months = fyMonthRange(fy);
  const transactions = ds.transactions.filter((t) => t.date >= from && t.date <= to);
  const monthly = ds.income.monthly.filter((m) => m.month >= months.from && m.month <= months.to);

  // income: sum the platform columns of the months in range
  const byPlatform: Record<string, number> = {};
  for (const m of monthly) {
    for (const [k, v] of Object.entries(m.platforms ?? {})) {
      byPlatform[k] = (byPlatform[k] ?? 0) + (Number(v) || 0);
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const k of Object.keys(byPlatform)) byPlatform[k] = r2(byPlatform[k]);
  const totalIncome = r2(monthly.reduce((s, m) => s + (Number(m.income) || 0), 0));

  // spend: same classification as aggregate(), including live category overrides
  const cg = catGroup(ds.meta.taxonomy);
  const claimableGroup = ds.meta.taxonomy.group_claimable;
  const byGroup: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const claimableByCategory: Record<string, number> = {};
  let totalClaimable = 0;
  let bankIncome = 0;
  for (const t of transactions) {
    if (t.dir === "credit") {
      if ((cg[effCat(t, overrides)] ?? "") === "Income") bankIncome += t.amount;
      continue;
    }
    const cat = effCat(t, overrides);
    const group = cg[cat] ?? "Other";
    if (!SPEND_GROUPS.has(group)) continue;
    byGroup[group] = (byGroup[group] ?? 0) + t.amount;
    byCategory[cat] = (byCategory[cat] ?? 0) + t.amount;
    byMonth[t.date.slice(0, 7)] = (byMonth[t.date.slice(0, 7)] ?? 0) + t.amount;
    if (claimableGroup[group]) {
      claimableByCategory[cat] = (claimableByCategory[cat] ?? 0) + t.amount;
      totalClaimable += t.amount;
    }
  }
  const round = (o: Record<string, number>) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));
  const totalSpend = r2(Object.values(byCategory).reduce((a, b) => a + b, 0));
  const claimable = r2(totalClaimable);

  // GST: keep the dataset-level treatment (WeMoney and salary are not rideshare)
  const NON_GST = new Set(["wemoney", "ecu"]);
  const rideshareBase = r2(
    Object.entries(byPlatform).reduce((s, [k, v]) => (NON_GST.has(k) ? s : s + v), 0)
  );
  const gstOnIncome = r2(rideshareBase / 11);
  const gstCredits = r2(claimable / 11);

  return {
    ...ds,
    meta: {
      ...ds.meta,
      period: { from: months.from, to: months.to },
      txn_count: transactions.length,
      uncategorised: transactions.filter((t) => t.dir === "debit" && !t.category).length,
    },
    summary: {
      total_income: totalIncome,
      total_spend: totalSpend,
      net: r2(totalIncome - totalSpend),
      total_claimable: claimable,
      bank_platform_income_crosscheck: r2(bankIncome),
      gst: {
        ...ds.summary.gst,
        rideshare_income_base: rideshareBase,
        gst_on_income: gstOnIncome,
        gst_credits_on_expenses: gstCredits,
        net_gst_payable: r2(gstOnIncome - gstCredits),
      },
    },
    income: { by_platform: byPlatform, monthly },
    spend: {
      by_group: round(byGroup),
      by_category: round(byCategory),
      by_month: round(byMonth),
      claimable_by_category: round(claimableByCategory),
    },
    transactions: transactions as Txn[],
  };
}
