"use client";
import { useMemo } from "react";
import { useAppState } from "./AppState";
import { ALL_YEARS, availableFys, latestFyWithData, sliceDataset, type FyChoice } from "./fy";
import type { Dataset } from "./types";

/**
 * The site-wide financial-year filter. Every page runs its numbers through
 * this, so the picker in the header changes the whole dashboard at once.
 *
 * Until the user picks a year we default to the most recent FY that actually
 * HAS data, not simply the newest year offered: the current FY is always
 * selectable, but on 1 July it is empty, and opening the site to a blank
 * dashboard would look broken rather than accurate.
 */
export function useFy(ds: Dataset) {
  const { state, setSlice, loaded } = useAppState();
  const years = useMemo(() => availableFys(ds), [ds]);
  const fallback = useMemo(() => latestFyWithData(ds), [ds]);
  const fy: FyChoice = state.fy ?? fallback ?? years[years.length - 1] ?? ALL_YEARS;
  const view = useMemo(() => sliceDataset(ds, fy, state.overrides), [ds, fy, state.overrides]);
  return {
    fy,
    isAllYears: fy === ALL_YEARS,
    years,
    loaded,
    setFy: (next: FyChoice) => setSlice("fy", next),
    /** dataset narrowed to the selected year -- use this everywhere */
    ds: view,
    hasData: view.transactions.length > 0 || view.income.monthly.length > 0,
  };
}
