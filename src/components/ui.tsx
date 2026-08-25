"use client";
import type { ReactNode } from "react";

export function Card({
  label,
  value,
  sub,
  accent = "text-[var(--text)]",
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  /** Supplying this makes the whole tile a button into the drill-down panel. */
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      title={onClick ? `See the payments behind ${label.toLowerCase()}` : undefined}
      className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 ${
        onClick ? "cursor-pointer transition hover:border-[var(--muted)] hover:bg-[var(--panel-2)]" : ""
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-[var(--faint)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--faint)]">{sub}</div>}
    </div>
  );
}

export function Panel({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-7xl px-3 py-5 sm:px-5 sm:py-6">{children}</main>;
}
