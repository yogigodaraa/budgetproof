import type { BudgetProofState, Transaction } from "./types";
import { categoryById, CATEGORIES } from "./taxonomy";

const monthFormatter = new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" });

export function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function preciseMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
  }).format(value);
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function displayMonth(key: string) {
  const date = new Date(`${key}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? key : monthFormatter.format(date);
}

export function totals(transactions: Transaction[]) {
  return transactions.reduce(
    (acc, transaction) => {
      const category = categoryById(transaction.categoryId);
      if (category.group === "Internal") {
        acc.internal += transaction.amount;
        return acc;
      }

      if (transaction.direction === "credit") {
        acc.income += transaction.amount;
      } else {
        acc.spend += transaction.amount;
        acc.claimable += transaction.amount * (category.claimablePercent / 100);
      }

      return acc;
    },
    { income: 0, spend: 0, claimable: 0, internal: 0 },
  );
}

export function categorySpend(transactions: Transaction[]) {
  const rows = CATEGORIES.map((category) => ({
    category,
    amount: transactions
      .filter((transaction) => transaction.direction === "debit" && transaction.categoryId === category.id)
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  })).filter((row) => row.amount > 0 && row.category.group !== "Internal");

  return rows.sort((a, b) => b.amount - a.amount);
}

export function groupSpend(transactions: Transaction[]) {
  const map = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.direction !== "debit") {
      continue;
    }

    const category = categoryById(transaction.categoryId);
    if (category.group === "Internal") {
      continue;
    }

    map.set(category.group, (map.get(category.group) ?? 0) + transaction.amount);
  }

  return Array.from(map, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

export function monthlyTotals(transactions: Transaction[]) {
  const map = new Map<string, { income: number; spend: number }>();

  for (const transaction of transactions) {
    const category = categoryById(transaction.categoryId);
    if (category.group === "Internal") {
      continue;
    }

    const key = monthKey(transaction.date);
    const current = map.get(key) ?? { income: 0, spend: 0 };
    if (transaction.direction === "credit") {
      current.income += transaction.amount;
    } else {
      current.spend += transaction.amount;
    }
    map.set(key, current);
  }

  return Array.from(map, ([month, values]) => ({ month, ...values })).sort((a, b) => a.month.localeCompare(b.month));
}

export function merchantGroups(state: BudgetProofState) {
  const map = new Map<string, { key: string; count: number; amount: number; categoryId: string; descriptions: string[] }>();

  for (const transaction of state.transactions) {
    if (transaction.direction !== "debit") {
      continue;
    }

    const current = map.get(transaction.merchantKey) ?? {
      key: transaction.merchantKey,
      count: 0,
      amount: 0,
      categoryId: transaction.categoryId,
      descriptions: [],
    };

    current.count += 1;
    current.amount += transaction.amount;
    current.descriptions.push(transaction.description);
    map.set(transaction.merchantKey, current);
  }

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}
