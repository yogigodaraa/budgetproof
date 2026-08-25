"use client";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/lib/AppState";
import { ALL_YEARS, fyLabel, fyLongLabel, fyOfMonth, type FyChoice } from "@/lib/fy";

/**
 * Site-wide financial-year selector. Lives in the header so the choice is
 * visible on every page -- the numbers below it are always for the year shown.
 *
 * Deliberately not a native <select>: macOS renders that popup over the trigger
 * so it opens upward whenever a lower item is selected, covering the nav. This
 * menu always drops downward.
 */
export function FyPicker({ years, fallback }: { years: number[]; fallback?: number | null }) {
  const { state, setSlice } = useAppState();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const now = new Date();
  const thisFy = fyOfMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const list = years.length ? years : [thisFy];
  const current: FyChoice = state.fy ?? fallback ?? list[list.length - 1] ?? ALL_YEARS;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (v: FyChoice) => { setSlice("fy", v); setOpen(false); };
  const label = (v: FyChoice) => (v === ALL_YEARS ? "All years" : fyLabel(v as number));
  const options: FyChoice[] = [...[...list].reverse(), ALL_YEARS];

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current === ALL_YEARS ? "All financial years" : fyLongLabel(current as number)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--panel)] focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
      >
        {label(current)}
        <span aria-hidden className={`text-[10px] text-[var(--faint)] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <ul
          role="listbox"
          // top-full pins the menu below the trigger, so it always drops down
          className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1 shadow-xl"
        >
          {options.map((v) => {
            const active = String(v) === String(current);
            return (
              <li key={String(v)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(v)}
                  title={v === ALL_YEARS ? "All financial years" : fyLongLabel(v as number)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition ${
                    active ? "bg-emerald-600 text-white" : "text-[var(--text)] hover:bg-[var(--panel-2)]"
                  }`}
                >
                  <span aria-hidden className="w-3 shrink-0 text-xs">{active ? "✓" : ""}</span>
                  <span>{label(v)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
