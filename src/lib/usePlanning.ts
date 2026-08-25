"use client";
import { useEffect } from "react";
import type { Planning, FlowItem, Debt } from "./planning";
import { useAppState } from "./AppState";

function seed(avgMonthlySpend: number): Planning {
  return {
    incomes: [
      { id: "ecu", label: "ECU — permanent job", amount: 2988, cadence: "fortnightly", anchor: "2026-07-01", note: "Fortnightly, Wednesdays" },
      { id: "gig", label: "UberEats + Zomato (weekend, gross)", amount: 550, cadence: "weekly", anchor: "2026-07-03", note: "Fri/Sat/Sun nights" },
      { id: "contract", label: "Contract project (net of $1k costs)", amount: 5000, cadence: "once", anchor: "2026-08-15", note: "Expected end Jul–mid Aug" },
    ],
    expenses: [
      { id: "avg", label: "Average living expenses (from history)", amount: Math.round(avgMonthlySpend) || 3000, cadence: "monthly", anchor: "2026-07-01", note: "Editable baseline" },
    ],
    debts: [],
  };
}

export function usePlanning(avgMonthlySpend = 0) {
  const { state, loaded, setSlice } = useAppState();
  const data: Planning = state.planning ?? { incomes: [], expenses: [], debts: [] };

  // seed defaults once, after load, if nothing stored yet
  useEffect(() => {
    if (loaded && state.planning == null) setSlice("planning", seed(avgMonthlySpend));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, state.planning]);

  const update = (next: Planning) => setSlice("planning", next);

  const upsertItem = (kind: "incomes" | "expenses", item: FlowItem) =>
    update({ ...data, [kind]: replaceOrAdd(data[kind], item) });
  const removeItem = (kind: "incomes" | "expenses", id: string) =>
    update({ ...data, [kind]: data[kind].filter((x) => x.id !== id) });
  const upsertDebt = (d: Debt) => update({ ...data, debts: replaceOrAdd(data.debts, d) });
  const removeDebt = (id: string) => update({ ...data, debts: data.debts.filter((x) => x.id !== id) });
  const resetAll = () => update(seed(avgMonthlySpend));

  return { data, loaded: loaded && state.planning != null, upsertItem, removeItem, upsertDebt, removeDebt, resetAll };
}

function replaceOrAdd<T extends { id: string }>(arr: T[], item: T): T[] {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i === -1) return [...arr, item];
  const next = arr.slice();
  next[i] = item;
  return next;
}

export const newId = () => Math.random().toString(36).slice(2, 9);
