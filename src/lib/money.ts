// Types + helpers for Budgets, Goals and Net Worth.

export interface Goal { id: string; label: string; target: number; saved: number; note?: string; }
export interface Asset { id: string; label: string; amount: number; }

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Net worth = total assets − total debts. */
export function netWorth(assets: Asset[], debtTotal: number): number {
  const a = assets.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return round2(a - debtTotal);
}

/** Goal progress 0..1. */
export const goalProgress = (g: Goal) => (g.target > 0 ? Math.min(1, g.saved / g.target) : 0);
