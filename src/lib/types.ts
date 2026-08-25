// Shared types for the BudgetProof dashboard dataset (data/dataset.json).

export type Direction = "debit" | "credit";

export interface Txn {
  id: string;
  date: string;            // ISO YYYY-MM-DD
  description: string;
  amount: number;          // positive AUD
  dir: Direction;
  source: "commbank" | "afterpay" | "steppay";
  category: string;        // L2 category
  group: string;           // L1 group
  claimable: boolean;
  merchant: string;        // cleaned merchant label
  brand: string;           // brand roll-up (e.g. all BP -> "BP")
  counterparty: string | null; // person/Remitly for peer transfers
  account?: string | null;     // Bank account label, e.g. "xx1234"
}

export interface Taxonomy {
  groups: Record<string, string[]>;        // L1 -> [L2...]
  group_claimable: Record<string, boolean>;
}

export interface Dataset {
  meta: {
    app: string;
    currency: string;
    period: { from: string; to: string };
    txn_count: number;
    uncategorised: number;
    taxonomy: Taxonomy;
    notes: string;
  };
  summary: {
    total_income: number;
    total_spend: number;
    net: number;
    total_claimable: number;
    bank_platform_income_crosscheck: number;
    gst: {
      rideshare_income_base: number;
      gst_on_income: number;
      gst_credits_on_expenses: number;
      net_gst_payable: number;
      note: string;
    };
  };
  income: {
    by_platform: Record<string, number>;
    monthly: {
      month: string;
      income: number;
      platforms?: Record<string, number>;
      fees?: number;
      /** PAYG tax withheld by an employer in that month (salary only) */
      payg_withheld?: number;
      activity?: Record<string, number>;
    }[];
  };
  spend: {
    by_group: Record<string, number>;
    by_category: Record<string, number>;
    by_month: Record<string, number>;
    claimable_by_category: Record<string, number>;
  };
  transactions: Txn[];
}
