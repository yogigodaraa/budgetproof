"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { SyncStatus } from "./SyncStatus";
import { FyPicker } from "./FyPicker";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/forecast", label: "Forecast" },
  { href: "/budget", label: "Budget" },
  { href: "/tax", label: "Tax" },
  { href: "/debt", label: "Debt" },
  { href: "/people", label: "People" },
  { href: "/merchants", label: "Merchants" },
  { href: "/categorise", label: "Categorise" },
  { href: "/ask", label: "Ask" },
];

export function TopNav({ years = [], fallbackFy = null }: { years?: number[]; fallbackFy?: number | null }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-600 text-xs font-bold text-white">T</span>
            <span className="text-lg font-semibold tracking-tight">BudgetProof</span>
          </Link>
          {/* desktop links */}
          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${active(l.href) ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:bg-[var(--panel-2)]"}`}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <FyPicker years={years} fallback={fallbackFy} />
            <SyncStatus />
            <ThemeToggle />
          </div>
        </div>
        {/* mobile links: scrollable row */}
        <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto pb-0.5 sm:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${active(l.href) ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:bg-[var(--panel-2)]"}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
