"use client";
import { useCallback } from "react";
import type { Dataset } from "./types";
import { useAppState } from "./AppState";

// Category overrides, now backed by the cloud-synced AppState (was localStorage).
export function useOverrides(ds: Dataset) {
  const { state, setSlice } = useAppState();
  const overrides = state.overrides;

  const origCat = useCallback(
    (id: string) => ds.transactions.find((t) => t.id === id)?.category,
    [ds]
  );

  const setOverride = useCallback((id: string, cat: string) => {
    const next = { ...overrides };
    if (cat === origCat(id)) delete next[id]; else next[id] = cat;
    setSlice("overrides", next);
  }, [overrides, origCat, setSlice]);

  const bulkSet = useCallback((ids: string[], cat: string) => {
    const next = { ...overrides };
    for (const id of ids) { if (cat === origCat(id)) delete next[id]; else next[id] = cat; }
    setSlice("overrides", next);
  }, [overrides, origCat, setSlice]);

  const reset = useCallback(() => setSlice("overrides", {}), [setSlice]);

  return { overrides, setOverride, bulkSet, reset, count: Object.keys(overrides).length };
}
