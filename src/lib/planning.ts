// Types + pure helpers for the Forecast and Debt pages.

export type Cadence = "weekly" | "fortnightly" | "monthly" | "once";

export interface FlowItem {
  id: string;
  label: string;
  amount: number;        // positive AUD
  cadence: Cadence;
  anchor: string;        // ISO date: first/next occurrence (or the date for "once")
  note?: string;
}

export interface Debt {
  id: string;
  creditor: string;
  amount: number;        // current balance owed
  apr?: number;          // annual % (optional)
  minPayment?: number;   // per month (optional)
  note?: string;
}

export interface Planning {
  incomes: FlowItem[];
  expenses: FlowItem[];
  debts: Debt[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** All occurrence dates of an item within [start, end]. */
export function occurrences(item: FlowItem, start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const anchor = new Date(item.anchor + "T00:00:00");
  if (item.cadence === "once") {
    if (anchor >= start && anchor <= end) out.push(anchor);
    return out;
  }
  const step = item.cadence === "weekly" ? 7 : item.cadence === "fortnightly" ? 14 : 0;
  if (step) {
    // wind back/forward to the first occurrence >= start
    let d = new Date(anchor);
    while (d < start) d = addDays(d, step);
    while (d > start && addDays(d, -step) >= start) d = addDays(d, -step);
    for (; d <= end; d = addDays(d, step)) if (d >= start) out.push(new Date(d));
    return out;
  }
  // monthly: same day-of-month
  const day = anchor.getDate();
  const d = new Date(start.getFullYear(), start.getMonth(), day);
  for (let x = new Date(d); x <= end; x = new Date(x.getFullYear(), x.getMonth() + 1, day)) {
    if (x >= start && x >= anchor) out.push(new Date(x));
  }
  return out;
}

/** approximate amount-per-month of a recurring item (for budgeting). */
export function monthlyEquivalent(item: FlowItem): number {
  switch (item.cadence) {
    case "weekly": return item.amount * 52 / 12;
    case "fortnightly": return item.amount * 26 / 12;
    case "monthly": return item.amount;
    case "once": return 0;
  }
}

export interface WeekBucket {
  weekStart: string;
  income: number;
  expense: number;
  net: number;
  cumulative: number;
  events: { label: string; amount: number; type: "income" | "expense" }[];
}

/** Weekly cash-flow projection for `weeks` weeks from `from`. */
export function projectCashflow(p: Planning, from: Date, weeks: number, opening = 0): WeekBucket[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = addDays(start, weeks * 7);
  const buckets: WeekBucket[] = [];
  let cumulative = opening;
  for (let w = 0; w < weeks; w++) {
    const ws = addDays(start, w * 7);
    const we = addDays(ws, 6);
    let income = 0, expense = 0;
    const events: WeekBucket["events"] = [];
    for (const it of p.incomes)
      for (const d of occurrences(it, ws, we)) { income += it.amount; events.push({ label: it.label, amount: it.amount, type: "income" }); void d; }
    for (const it of p.expenses)
      for (const d of occurrences(it, ws, we)) { expense += it.amount; events.push({ label: it.label, amount: it.amount, type: "expense" }); void d; }
    const net = income - expense;
    cumulative += net;
    buckets.push({ weekStart: iso(ws), income: r2(income), expense: r2(expense), net: r2(net), cumulative: r2(cumulative), events });
  }
  void end;
  return buckets;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---- Debt payoff planning ---- */
export interface PayoffStep { month: number; creditor: string; paid: number; remaining: number; }
export interface DebtPlan {
  totalDebt: number;
  order: string[];
  monthsToFree: number;
  totalInterest: number;
  schedule: { month: number; label: string; payments: { creditor: string; paid: number; balance: number }[]; totalRemaining: number }[];
  feasible: boolean;
}

export function debtPlan(debts: Debt[], monthlyBudget: number, strategy: "snowball" | "avalanche"): DebtPlan {
  const total = r2(debts.reduce((a, d) => a + d.amount, 0));
  const live = debts
    .map((d) => ({ ...d, bal: d.amount }))
    .filter((d) => d.bal > 0);
  // priority order
  live.sort((a, b) =>
    strategy === "snowball" ? a.bal - b.bal : (b.apr ?? 0) - (a.apr ?? 0) || a.bal - b.bal
  );
  const order = live.map((d) => d.creditor);
  const schedule: DebtPlan["schedule"] = [];
  let totalInterest = 0;
  let month = 0;
  const maxMonths = 600;
  const minSum = live.reduce((a, d) => a + (d.minPayment ?? 0), 0);
  const feasible = monthlyBudget >= Math.max(minSum, 1) && monthlyBudget > 0;

  while (live.some((d) => d.bal > 0.01) && month < maxMonths && feasible) {
    month++;
    // accrue interest
    for (const d of live) if (d.bal > 0 && d.apr) { const i = (d.bal * (d.apr / 100)) / 12; d.bal += i; totalInterest += i; }
    let budget = monthlyBudget;
    // pay minimums first
    for (const d of live) if (d.bal > 0 && d.minPayment) { const p = Math.min(d.minPayment, d.bal, budget); d.bal -= p; budget -= p; }
    // throw the rest at the top-priority debt
    for (const d of live) { if (budget <= 0) break; if (d.bal > 0) { const p = Math.min(budget, d.bal); d.bal -= p; budget -= p; } }
    schedule.push({
      month,
      label: monthName(month),
      payments: live.map((d) => ({ creditor: d.creditor, paid: 0, balance: r2(Math.max(d.bal, 0)) })),
      totalRemaining: r2(live.reduce((a, d) => a + Math.max(d.bal, 0), 0)),
    });
  }
  return { totalDebt: total, order, monthsToFree: month, totalInterest: r2(totalInterest), schedule, feasible };
}

function monthName(monthsFromNow: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsFromNow);
  return d.toLocaleString("en-AU", { month: "short", year: "2-digit" });
}
