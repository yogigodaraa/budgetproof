"use client";
import { useAppState } from "@/lib/AppState";

export function SyncStatus() {
  const { saving, dbOk, loaded } = useAppState();
  if (!loaded) return null;
  const [dot, label] = saving
    ? ["bg-amber-500 animate-pulse", "Saving…"]
    : dbOk
    ? ["bg-emerald-500", "Synced"]
    : ["bg-[var(--faint)]", "Local"];
  return (
    <span className="hidden items-center gap-1.5 text-xs text-[var(--faint)] sm:flex" title={dbOk ? "Saved to your account (syncs across devices)" : "Saved on this device only"}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
