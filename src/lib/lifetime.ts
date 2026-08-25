// Career-level rollups: one row per financial year rather than per month.
import type { Dataset } from "./types";
import { fyOfMonth, fyOfDate, fyLabel } from "./fy";
import { SPEND_GROUPS, catGroup, effCat } from "./aggregate";

export interface YearRow {
  fy: number;
  label: string;
  income: number;
  fees: number;          // platform service fees (deductible)
  spend: number;         // only for years with bank statements loaded
  net: number;
  km: number;
  trips: number;
  months: number;        // months with any income -- the months actually worked
  platforms: Record<string, number>;
  growthPct: number | null;   // vs the previous year, null for the first
  hasSpend: boolean;
}

export interface PlatformEfficiency {
  key: string;
  income: number;
  fees: number;
  net: number;
  km: number;
  trips: number;
  perKm: number;
  perTrip: number;
  feePct: number;      // what the platform keeps, as a % of gross
}

export interface AccountFlow {
  account: string;
  inflow: number;
  outflow: number;
  txns: number;
  first: string;
  last: string;
}

export interface Lifetime {
  years: YearRow[];
  totalIncome: number;
  totalFees: number;
  totalKm: number;
  totalTrips: number;
  activeMonths: number;
  best: { year: YearRow | null; month: { month: string; income: number } | null };
  perMonth: number;      // averaged over months actually worked, not calendar months
  perWeek: number;
  perDay: number;
  perKm: number;
  perTrip: number;
  monthly: { month: string; income: number }[];
  platforms: PlatformEfficiency[];
  accounts: AccountFlow[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const sumActivity = (a: Record<string, number> | undefined, keys: string[]) =>
  keys.reduce((s, k) => s + (a?.[k] ?? 0), 0);

export function lifetime(ds: Dataset, overrides: Record<string, string> = {}): Lifetime {
  const cg = catGroup(ds.meta.taxonomy);

  // spend per financial year, using the same rule as every other total
  const spendByFy: Record<number, number> = {};
  for (const t of ds.transactions) {
    if (t.dir !== "debit") continue;
    const group = cg[effCat(t, overrides)] ?? "Other";
    if (!SPEND_GROUPS.has(group)) continue;
    const fy = fyOfDate(t.date);
    spendByFy[fy] = (spendByFy[fy] ?? 0) + t.amount;
  }

  const byFy: Record<number, YearRow> = {};
  for (const m of ds.income.monthly) {
    const fy = fyOfMonth(m.month);
    const row = (byFy[fy] ??= {
      fy, label: fyLabel(fy), income: 0, fees: 0, spend: 0, net: 0,
      km: 0, trips: 0, months: 0, platforms: {}, growthPct: null, hasSpend: false,
    });
    row.income += m.income;
    row.fees += m.fees ?? 0;
    row.km += sumActivity(m.activity, ["uber_km", "uber_pnd_km", "didi_km"]);
    row.trips += sumActivity(m.activity, ["uber_trips", "uber_pnd_trips"]);
    if (m.income > 0) row.months += 1;
    for (const [k, v] of Object.entries(m.platforms ?? {})) {
      if (v) row.platforms[k] = (row.platforms[k] ?? 0) + v;
    }
  }

  const years = Object.values(byFy).sort((a, b) => a.fy - b.fy);
  years.forEach((y, i) => {
    y.income = r2(y.income);
    y.fees = r2(y.fees);
    y.spend = r2(spendByFy[y.fy] ?? 0);
    y.hasSpend = y.spend > 0;
    y.net = r2(y.income - y.spend);
    const prev = years[i - 1];
    y.growthPct = prev && prev.income > 0
      ? Math.round(((y.income - prev.income) / prev.income) * 100)
      : null;
  });

  const monthly = ds.income.monthly
    .filter((m) => m.income > 0)
    .map((m) => ({ month: m.month, income: r2(m.income) }));

  const totalIncome = r2(years.reduce((s, y) => s + y.income, 0));
  const activeMonths = years.reduce((s, y) => s + y.months, 0);
  const bestMonth = monthly.reduce<{ month: string; income: number } | null>(
    (b, m) => (!b || m.income > b.income ? m : b), null);
  const bestYear = years.reduce<YearRow | null>(
    (b, y) => (!b || y.income > b.income ? y : b), null);
  const totalKm = r2(years.reduce((s, y) => s + y.km, 0));
  const totalTrips = years.reduce((s, y) => s + y.trips, 0);
  const perMonth = activeMonths ? r2(totalIncome / activeMonths) : 0;

  // Per-platform efficiency. Uber X and Uber Eats are kept apart because the
  // commission differs sharply -- rideshare pays a fee, delivery does not --
  // which is the whole point of comparing them.
  const km = { uber_x: 0, uber_eats: 0, uber_pnd: 0, didi: 0 };
  const trips = { uber_x: 0, uber_eats: 0, uber_pnd: 0, didi: 0 };
  const income: Record<string, number> = {};
  for (const m of ds.income.monthly) {
    const a = m.activity ?? {};
    // Uber reports one on-trip distance covering both services; split it by
    // that month's income share rather than pretending it is all rideshare.
    const ux = m.platforms?.uber_x ?? 0;
    const ue = m.platforms?.uber_eats ?? 0;
    const share = ux + ue;
    if (share > 0) {
      km.uber_x += (a.uber_km ?? 0) * (ux / share);
      km.uber_eats += (a.uber_km ?? 0) * (ue / share);
      trips.uber_x += (a.uber_trips ?? 0) * (ux / share);
      trips.uber_eats += (a.uber_trips ?? 0) * (ue / share);
    }
    km.uber_pnd += a.uber_pnd_km ?? 0;
    trips.uber_pnd += a.uber_pnd_trips ?? 0;
    km.didi += a.didi_km ?? 0;
    for (const [k, v] of Object.entries(m.platforms ?? {})) income[k] = (income[k] ?? 0) + v;
  }
  const platformFeeTotal = ds.income.monthly.reduce((s, m) => s + ((m as { fees?: number }).fees ?? 0), 0);

  const platforms: PlatformEfficiency[] = Object.entries(income)
    .filter(([, v]) => v > 0)
    .map(([key, v]) => {
      const k = km[key as keyof typeof km] ?? 0;
      const tr = trips[key as keyof typeof trips] ?? 0;
      // commission is only levied on the ride-sourcing platforms
      const fee = key === "uber_x" || key === "didi"
        ? r2(platformFeeTotal * (v / ((income.uber_x ?? 0) + (income.didi ?? 0) || 1)))
        : 0;
      return {
        key, income: r2(v), fees: fee, net: r2(v - fee),
        km: Math.round(k), trips: Math.round(tr),
        perKm: k ? r2(v / k) : 0,
        perTrip: tr ? r2(v / tr) : 0,
        feePct: v ? Math.round((fee / v) * 100) : 0,
      };
    })
    .sort((a, b) => b.income - a.income);

  // Money in and out per bank account -- shows which account actually carries
  // the income, and makes an account with no statements obvious.
  const accMap: Record<string, AccountFlow> = {};
  for (const t of ds.transactions) {
    const acct = t.account;
    if (!acct) continue;
    const f = (accMap[acct] ??= { account: acct, inflow: 0, outflow: 0, txns: 0, first: t.date, last: t.date });
    if (t.dir === "credit") f.inflow += t.amount; else f.outflow += t.amount;
    f.txns += 1;
    if (t.date < f.first) f.first = t.date;
    if (t.date > f.last) f.last = t.date;
  }
  const accounts = Object.values(accMap)
    .map((f) => ({ ...f, inflow: r2(f.inflow), outflow: r2(f.outflow) }))
    .sort((a, b) => b.inflow - a.inflow);

  return {
    years, totalIncome, platforms, accounts,
    totalFees: r2(years.reduce((s, y) => s + y.fees, 0)),
    totalKm, totalTrips, activeMonths,
    best: { year: bestYear, month: bestMonth },
    perMonth,
    perWeek: r2(perMonth * 12 / 52),
    perDay: r2(perMonth * 12 / 365),
    perKm: totalKm ? r2(totalIncome / totalKm) : 0,
    perTrip: totalTrips ? r2(totalIncome / totalTrips) : 0,
    monthly,
  };
}
