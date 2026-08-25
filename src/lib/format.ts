export const aud = (n: number, dp = 0) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(n);

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-AU", { month: "short" }) + " " + String(y).slice(2);
};

// Stable-ish colour per category/group label. Curated, cohesive palette —
// greens/blues/ambers/slate, no purple or hot-pink.
const PALETTE = [
  "#059669", "#0ea5e9", "#d97706", "#dc2626", "#0d9488", "#2563eb",
  "#ea580c", "#0891b2", "#65a30d", "#e11d48", "#475569", "#ca8a04",
  "#16a34a", "#0284c7", "#f59e0b", "#64748b", "#14b8a6", "#3b82f6",
];
export function colorFor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
