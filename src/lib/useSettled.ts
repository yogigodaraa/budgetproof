"use client";
import { useCallback } from "react";
import { useAppState } from "./AppState";

/**
 * People who are squared up: nothing owed either way.
 *
 * They are hidden from the balances list rather than deleted, because their
 * transactions are still real money that belongs in every other total. This
 * only changes who you are asked to look at.
 */
export function useSettled() {
  const { state, setSlice } = useAppState();
  const settled = state.settledPeople ?? [];
  const isSettled = useCallback((name: string) => settled.includes(name), [settled]);

  const toggle = useCallback((name: string) => {
    setSlice("settledPeople",
      settled.includes(name) ? settled.filter((n) => n !== name) : [...settled, name]);
  }, [settled, setSlice]);

  const clear = useCallback(() => setSlice("settledPeople", []), [setSlice]);

  return { settled, isSettled, toggle, clear, count: settled.length };
}
