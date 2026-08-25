"use client";
import { useAppState } from "./AppState";

export interface GstConfig {
  registered: Record<string, boolean>; // platform key -> GST-registered?
  startMonth: string;                   // "YYYY-MM": only income from this month on counts
}

// GST registration began 15 Feb 2026, so only supplies from then count.
// Ride-sourcing (Uber X, DiDi) requires registration from the first dollar.
// Once registered, delivery work is a taxable supply too -- hence Uber Eats,
// Pack & Deliver and DoorDash are on, but only from startMonth. WeMoney is
// salary, not a taxable supply, so it is OFF: including it was overstating GST.
export const GST_DEFAULT: GstConfig = {
  registered: {
    uber_x: true, didi: true, uber_eats: true, uber_pnd: true, uber_other: true,
    doordash: true, sherpa: true, wemoney: false,
  },
  startMonth: "2026-02",
};

export function useGstConfig() {
  const { state, loaded, setSlice } = useAppState();
  const cfg = state.gstConfig ?? GST_DEFAULT;

  const toggle = (key: string) =>
    setSlice("gstConfig", { ...cfg, registered: { ...cfg.registered, [key]: !cfg.registered[key] } });
  const setStartMonth = (m: string) => setSlice("gstConfig", { ...cfg, startMonth: m });
  const reset = () => setSlice("gstConfig", GST_DEFAULT);

  return { cfg, loaded, toggle, setStartMonth, reset };
}

const PLATFORM_LABELS: Record<string, string> = {
  uber_x: "Uber X (rideshare)", uber_eats: "Uber Eats", uber_pnd: "Uber Pack & Deliver",
  uber_other: "Uber tips & misc", didi: "DiDi", doordash: "DoorDash",
  sherpa: "Sherpa", wemoney: "WeMoney (salary)", menulog: "Menulog", ecu: "ECU (salary)",
};
export const platformLabel = (k: string) => PLATFORM_LABELS[k] ?? k;

/** GST-applicable income = selected platforms summed over months >= startMonth. */
export function gstBase(
  monthly: { month: string; platforms?: Record<string, number> }[],
  cfg: GstConfig
): number {
  let base = 0;
  for (const m of monthly) {
    if (m.month < cfg.startMonth) continue;
    for (const [k, v] of Object.entries(m.platforms ?? {})) {
      if (cfg.registered[k]) base += Number(v) || 0;
    }
  }
  return Math.round(base * 100) / 100;
}
