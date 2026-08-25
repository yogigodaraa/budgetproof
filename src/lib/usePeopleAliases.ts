"use client";
import { useCallback } from "react";
import { useAppState } from "./AppState";

// Maps a raw counterparty name -> canonical (merged) name. Cloud-synced.
export function usePeopleAliases() {
  const { state, setSlice } = useAppState();
  const aliases = state.peopleAliases;

  const mergeInto = useCallback((names: string[], target: string) => {
    const next = { ...aliases };
    for (const n of names) {
      if (n === target) continue;
      next[n] = target;
      for (const k of Object.keys(next)) if (next[k] === n) next[k] = target;
    }
    setSlice("peopleAliases", next);
  }, [aliases, setSlice]);

  const unmerge = useCallback((name: string) => {
    const next = { ...aliases };
    for (const k of Object.keys(next)) if (k === name || next[k] === name) delete next[k];
    setSlice("peopleAliases", next);
  }, [aliases, setSlice]);

  const reset = useCallback(() => setSlice("peopleAliases", {}), [setSlice]);

  return { aliases, mergeInto, unmerge, reset, count: Object.keys(aliases).length };
}
