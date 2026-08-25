"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Planning } from "./planning";
import type { GstConfig } from "./useGstConfig";
import type { TaxConfig, LogEntry } from "./tax";
import type { Goal, Asset } from "./money";
import type { FyChoice } from "./fy";

export interface AppState {
  overrides: Record<string, string>;
  planning: Planning | null;
  gstConfig: GstConfig | null;
  peopleAliases: Record<string, string>;
  taxConfig: TaxConfig | null;
  logbook: LogEntry[];
  budgets: Record<string, number>; // category -> monthly cap
  goals: Goal[];
  assets: Asset[];
  /** Financial year the whole site is filtered to; null = not chosen yet. */
  fy: FyChoice | null;
  /** People squared up in full — hidden from the balances list, history kept. */
  settledPeople: string[];
}

const EMPTY: AppState = {
  overrides: {}, planning: null, gstConfig: null, peopleAliases: {},
  taxConfig: null, logbook: [], budgets: {}, goals: [], assets: [], fy: null,
  settledPeople: [],
};
const LS_KEY = "budgetproof.state.v1";

const Ctx = createContext<{
  state: AppState;
  loaded: boolean;
  dbOk: boolean;
  saving: boolean;
  setSlice: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
} | null>(null);

function readLocal(): AppState {
  const g = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const combined = g(LS_KEY);
  if (combined) return { ...EMPTY, ...combined };
  // migrate legacy per-feature keys (first run after upgrade)
  return {
    ...EMPTY,
    overrides: g("budgetproof.overrides.v1") || {},
    planning: g("budgetproof.planning.v1"),
    gstConfig: g("budgetproof.gstconfig.v1"),
    peopleAliases: g("budgetproof.peopleAlias.v1") || {},
  };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [dbOk, setDbOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (s: AppState) => {
    setSaving(true);
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
    try {
      const res = await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
      const json = await res.json();
      setDbOk(!!json.db);
    } catch {}
    setSaving(false);
  };

  // initial load: localStorage first (instant), then cloud (authoritative if present)
  useEffect(() => {
    const local = readLocal();
    setState(local);
    (async () => {
      try {
        const res = await fetch("/api/state");
        const json = await res.json();
        if (json.db) setDbOk(true);
        if (json.data) {
          const merged = { ...EMPTY, ...json.data };
          setState(merged);
          try { localStorage.setItem(LS_KEY, JSON.stringify(merged)); } catch {}
        } else if (json.db) {
          // DB present but empty -> seed it with whatever we have locally
          void save(local);
        }
      } catch {}
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSlice = <K extends keyof AppState>(key: K, value: AppState[K]) => {
    setState((prev) => {
      const next = { ...prev, [key]: value };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(next), 600);
      return next;
    });
  };

  return <Ctx.Provider value={{ state, loaded, dbOk, saving, setSlice }}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
