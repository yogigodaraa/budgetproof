"use client";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("budgetproof.theme", next ? "dark" : "light");
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-sm hover:bg-[var(--panel-2)]"
    >
      {dark ? "🌙" : "☀️"}
    </button>
  );
}
