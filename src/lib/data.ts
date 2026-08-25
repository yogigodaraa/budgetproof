// Server loader: reads the unified dataset at build time so it is baked into
// the static output. Only imported by Server Components, so node:fs is safe.
import fs from "node:fs";
import path from "node:path";
import type { Dataset } from "./types";

const EMPTY: Dataset = {
  meta: {
    app: "BudgetProof",
    currency: "AUD",
    period: { from: "2025-07", to: "2026-06" },
    txn_count: 0,
    uncategorised: 0,
    taxonomy: { groups: {}, group_claimable: {} },
    notes: "No dataset found — run `python3 scripts/build_dataset.py` to generate data/dataset.json.",
  },
  summary: {
    total_income: 0, total_spend: 0, net: 0, total_claimable: 0,
    bank_platform_income_crosscheck: 0,
    gst: { rideshare_income_base: 0, gst_on_income: 0, gst_credits_on_expenses: 0, net_gst_payable: 0, note: "" },
  },
  income: { by_platform: {}, monthly: [] },
  spend: { by_group: {}, by_category: {}, by_month: {}, claimable_by_category: {} },
  transactions: [],
};

export function loadDataset(): Dataset {
  const file = path.join(process.cwd(), "data", "dataset.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Dataset;
  } catch {
    // missing/unreadable dataset -> render an empty dashboard instead of failing the build
    return EMPTY;
  }
}
