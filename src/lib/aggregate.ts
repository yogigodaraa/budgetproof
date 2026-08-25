// Pure aggregation helpers. Run on the client so category overrides recompute
// every chart/total live. Income stays sourced from the platform table.
import type { Dataset, Txn, Taxonomy } from "./types";

export const SPEND_GROUPS = new Set(["Vehicle & Travel", "Work Expenses", "Living", "BNPL"]);

export function catGroup(tax: Taxonomy): Record<string, string> {
  const m: Record<string, string> = {};
  for (const [g, cats] of Object.entries(tax.groups)) for (const c of cats) m[c] = g;
  return m;
}

export interface Aggregates {
  totalIncome: number;
  totalSpend: number;
  net: number;
  totalClaimable: number;
  spendByGroup: { label: string; value: number }[];
  spendByCategory: { label: string; value: number; group: string; claimable: boolean }[];
  spendByMonth: { month: string; value: number }[];
  incomeByPlatform: { label: string; value: number }[];
  incomeByMonth: { month: string; value: number }[];
  cashflow: { month: string; income: number; spend: number }[];
  gst: Dataset["summary"]["gst"];
  claimable: number;
}

// effective category for a txn given overrides
export const effCat = (t: Txn, ov: Record<string, string>) => ov[t.id] ?? t.category;

/* ---- People / counterparties (debt tracking) ---- */
export interface Person {
  name: string;
  sent: number;       // you -> them (debits)
  received: number;   // them -> you (credits)
  net: number;        // sent - received (>0 you sent more)
  count: number;
}
export function people(txns: Txn[], aliases: Record<string, string> = {}): Person[] {
  const m: Record<string, Person> = {};
  for (const t of txns) {
    const raw = t.counterparty;
    if (!raw || raw.startsWith("Self")) continue;
    const n = aliases[raw] ?? raw;
    (m[n] ??= { name: n, sent: 0, received: 0, net: 0, count: 0 });
    if (t.dir === "debit") m[n].sent += t.amount;
    else m[n].received += t.amount;
    m[n].count++;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return Object.values(m)
    .map((p) => ({ ...p, sent: r2(p.sent), received: r2(p.received), net: r2(p.sent - p.received) }))
    .sort((a, b) => b.sent + b.received - (a.sent + a.received));
}

/* ---- Merchants / brands ---- */
export interface MerchantRow {
  brand: string;
  total: number;
  count: number;
  category: string;
  group: string;
}
export function merchants(
  ds: Dataset,
  txns: Txn[],
  overrides: Record<string, string>
): MerchantRow[] {
  const cg = catGroup(ds.meta.taxonomy);
  const m: Record<string, MerchantRow & { catCount: Record<string, number> }> = {};
  for (const t of txns) {
    if (t.dir !== "debit") continue;
    const cat = effCat(t, overrides);
    const group = cg[cat] ?? "Other";
    if (!SPEND_GROUPS.has(group)) continue;
    const key = t.brand || t.merchant;
    (m[key] ??= { brand: key, total: 0, count: 0, category: cat, group, catCount: {} });
    m[key].total += t.amount;
    m[key].count++;
    m[key].catCount[cat] = (m[key].catCount[cat] ?? 0) + 1;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return Object.values(m)
    .map((x) => {
      const topCat = Object.entries(x.catCount).sort((a, b) => b[1] - a[1])[0][0];
      return { brand: x.brand, total: r2(x.total), count: x.count, category: topCat, group: cg[topCat] ?? x.group };
    })
    .sort((a, b) => b.total - a.total);
}

/* ---- Recurring expense detection (subscriptions / bills) ---- */
export interface Recurring {
  brand: string;
  category: string;
  months: number;        // distinct months seen
  avgMonthly: number;    // average total spent per active month
  perCharge: number;
  chargesPerMonth: number;
  subscriptionLike: boolean; // ~1/month, consistent amount (Apple, Medibank, Spotify…)
}
export function detectRecurring(ds: Dataset, txns: Txn[], overrides: Record<string, string>): Recurring[] {
  const cg = catGroup(ds.meta.taxonomy);
  const by: Record<string, { months: Record<string, { sum: number; n: number }>; cats: Record<string, number> }> = {};
  for (const t of txns) {
    if (t.dir !== "debit") continue;
    const cat = effCat(t, overrides);
    if (!SPEND_GROUPS.has(cg[cat] ?? "")) continue;
    const brand = t.brand || t.merchant;
    const b = (by[brand] ??= { months: {}, cats: {} });
    const m = t.date.slice(0, 7);
    (b.months[m] ??= { sum: 0, n: 0 });
    b.months[m].sum += t.amount;
    b.months[m].n += 1;
    b.cats[cat] = (b.cats[cat] ?? 0) + 1;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const out: Recurring[] = [];
  for (const [brand, b] of Object.entries(by)) {
    const totals = Object.values(b.months).map((x) => x.sum);
    const nMonths = totals.length;
    if (nMonths < 3) continue;
    const charges = Object.values(b.months).reduce((a, x) => a + x.n, 0);
    const avgMonthly = totals.reduce((a, x) => a + x, 0) / nMonths;
    const mean = avgMonthly;
    const variance = totals.reduce((a, x) => a + (x - mean) ** 2, 0) / nMonths;
    const cv = mean ? Math.sqrt(variance) / mean : 1;
    const chargesPerMonth = charges / nMonths;
    const category = Object.entries(b.cats).sort((a, c) => c[1] - a[1])[0][0];
    out.push({
      brand, category, months: nMonths,
      avgMonthly: r2(avgMonthly), perCharge: r2(mean / Math.max(1, chargesPerMonth)),
      chargesPerMonth: Math.round(chargesPerMonth * 10) / 10,
      subscriptionLike: chargesPerMonth <= 1.6 && cv < 0.4,
    });
  }
  // bills first, then biggest monthly spend; drop trivial (<$2/mo) noise
  return out
    .filter((r) => r.avgMonthly >= 2)
    .sort((a, b) => Number(b.subscriptionLike) - Number(a.subscriptionLike) || b.avgMonthly - a.avgMonthly);
}

/* ---- Trends over time + anomalies ---- */
export interface CatTrend {
  label: string;
  series: { month: string; value: number }[];
  total: number;
  avg: number;        // avg over active months
  last: number;       // most recent active month
  deltaPct: number;   // last vs avg, %
}
export function categoryTrends(
  ds: Dataset,
  txns: Txn[],
  overrides: Record<string, string>,
  topN = 6
): { months: string[]; trends: CatTrend[] } {
  const cg = catGroup(ds.meta.taxonomy);
  const monthsSet = new Set<string>();
  const byCat: Record<string, Record<string, number>> = {};
  for (const t of txns) {
    if (t.dir !== "debit") continue;
    const cat = effCat(t, overrides);
    if (!SPEND_GROUPS.has(cg[cat] ?? "")) continue;
    const m = t.date.slice(0, 7);
    monthsSet.add(m);
    (byCat[cat] ??= {})[m] = (byCat[cat]?.[m] ?? 0) + t.amount;
  }
  const months = Array.from(monthsSet).sort();
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const trends: CatTrend[] = Object.entries(byCat).map(([label, mm]) => {
    const series = months.map((m) => ({ month: m, value: r2(mm[m] ?? 0) }));
    const active = Object.values(mm);
    const total = active.reduce((a, b) => a + b, 0);
    const avg = active.length ? total / active.length : 0;
    const last = mm[months[months.length - 1]] ?? 0;
    return { label, series, total: r2(total), avg: r2(avg), last: r2(last), deltaPct: avg ? Math.round(((last - avg) / avg) * 100) : 0 };
  });
  trends.sort((a, b) => b.total - a.total);
  return { months, trends: trends.slice(0, topN) };
}

// Categories whose latest month is well above their own average.
export function anomalies(ds: Dataset, txns: Txn[], overrides: Record<string, string>): CatTrend[] {
  return categoryTrends(ds, txns, overrides, 100).trends.filter((t) => t.avg >= 30 && t.last >= 50 && t.deltaPct >= 40);
}

/* ---- Insights ---- */
export interface Insights {
  weeks: number;
  avgWeeklySpend: number;
  avgMonthlySpend: number;
  avgTxn: number;
  biggest: { label: string; value: number };
  topBrand: { label: string; value: number };
  topCategory: { label: string; value: number };
  avgInsurance: number;
  avgFuelFill: number;
  perCategoryAvg: { label: string; avg: number; count: number }[];
}
export function insights(
  ds: Dataset,
  txns: Txn[],
  overrides: Record<string, string>
): Insights {
  const cg = catGroup(ds.meta.taxonomy);
  const spend = txns.filter((t) => t.dir === "debit" && SPEND_GROUPS.has(cg[effCat(t, overrides)] ?? "Other"));
  const total = spend.reduce((a, t) => a + t.amount, 0);
  const from = new Date(ds.meta.period.from + "-01");
  const to = new Date(ds.meta.period.to + "-28");
  const weeks = Math.max(1, (to.getTime() - from.getTime()) / (1000 * 3600 * 24 * 7));
  const months = Math.max(1, ds.income.monthly.length);

  const byCat: Record<string, { sum: number; n: number }> = {};
  const byBrand: Record<string, number> = {};
  let biggest = { label: "", value: 0 };
  for (const t of spend) {
    const c = effCat(t, overrides);
    (byCat[c] ??= { sum: 0, n: 0 });
    byCat[c].sum += t.amount;
    byCat[c].n++;
    byBrand[t.brand || t.merchant] = (byBrand[t.brand || t.merchant] ?? 0) + t.amount;
    if (t.amount > biggest.value) biggest = { label: t.brand || t.merchant, value: t.amount };
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const topBrandE = Object.entries(byBrand).sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
  const topCatE = Object.entries(byCat).sort((a, b) => b[1].sum - a[1].sum)[0];
  const ins = byCat["Insurance"];
  const fuel = byCat["Fuel"];
  return {
    weeks: Math.round(weeks),
    avgWeeklySpend: r2(total / weeks),
    avgMonthlySpend: r2(total / months),
    avgTxn: r2(total / Math.max(1, spend.length)),
    biggest: { label: biggest.label, value: r2(biggest.value) },
    topBrand: { label: topBrandE[0], value: r2(topBrandE[1] as number) },
    topCategory: { label: topCatE?.[0] ?? "—", value: r2(topCatE?.[1].sum ?? 0) },
    avgInsurance: ins ? r2(ins.sum / ins.n) : 0,
    avgFuelFill: fuel ? r2(fuel.sum / fuel.n) : 0,
    perCategoryAvg: Object.entries(byCat)
      .map(([label, v]) => ({ label, avg: r2(v.sum / v.n), count: v.n }))
      .sort((a, b) => b.avg - a.avg),
  };
}

export function aggregate(
  ds: Dataset,
  txns: Txn[],
  overrides: Record<string, string>
): Aggregates {
  const cg = catGroup(ds.meta.taxonomy);
  const claimableGroup = ds.meta.taxonomy.group_claimable;

  const byGroup: Record<string, number> = {};
  const byCat: Record<string, number> = {};
  const byMonth: Record<string, number> = {};
  const catMeta: Record<string, { group: string; claimable: boolean }> = {};
  let totalClaimable = 0;

  for (const t of txns) {
    if (t.dir !== "debit") continue;
    const cat = effCat(t, overrides);
    const group = cg[cat] ?? "Other";
    if (!SPEND_GROUPS.has(group)) continue; // exclude transfers/income
    byGroup[group] = (byGroup[group] ?? 0) + t.amount;
    byCat[cat] = (byCat[cat] ?? 0) + t.amount;
    byMonth[t.date.slice(0, 7)] = (byMonth[t.date.slice(0, 7)] ?? 0) + t.amount;
    const claimable = !!claimableGroup[group];
    catMeta[cat] = { group, claimable };
    if (claimable) totalClaimable += t.amount;
  }

  const totalSpend = Object.values(byCat).reduce((a, b) => a + b, 0);
  const totalIncome = ds.summary.total_income;

  const incomeByMonth = ds.income.monthly.map((m) => ({ month: m.month, value: m.income }));
  const months = Array.from(
    new Set([...incomeByMonth.map((m) => m.month), ...Object.keys(byMonth)])
  ).sort();

  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    totalIncome: r2(totalIncome),
    totalSpend: r2(totalSpend),
    net: r2(totalIncome - totalSpend),
    totalClaimable: r2(totalClaimable),
    spendByGroup: Object.entries(byGroup)
      .map(([label, value]) => ({ label, value: r2(value) }))
      .sort((a, b) => b.value - a.value),
    spendByCategory: Object.entries(byCat)
      .map(([label, value]) => ({
        label,
        value: r2(value),
        group: catMeta[label]?.group ?? "Other",
        claimable: catMeta[label]?.claimable ?? false,
      }))
      .sort((a, b) => b.value - a.value),
    spendByMonth: months.map((m) => ({ month: m, value: r2(byMonth[m] ?? 0) })),
    incomeByPlatform: Object.entries(ds.income.by_platform)
      .map(([label, value]) => ({ label, value: r2(value as number) }))
      .sort((a, b) => b.value - a.value),
    incomeByMonth,
    cashflow: months.map((m) => ({
      month: m,
      income: r2(incomeByMonth.find((x) => x.month === m)?.value ?? 0),
      spend: r2(byMonth[m] ?? 0),
    })),
    gst: ds.summary.gst,
    claimable: r2(totalClaimable),
  };
}
