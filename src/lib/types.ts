export type TransactionDirection = "debit" | "credit";

export type CategoryGroup =
  | "Income"
  | "Living"
  | "Vehicle & Travel"
  | "Work Expenses"
  | "Financial"
  | "Tax & Government"
  | "Internal";

export type Category = {
  id: string;
  name: string;
  group: CategoryGroup;
  claimablePercent: number;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: TransactionDirection;
  categoryId: string;
  source: string;
  merchantKey: string;
  notes?: string;
  importedAt: string;
};

export type BudgetProofState = {
  version: 1;
  profile: {
    displayName: string;
    currency: "AUD" | "USD" | "CAD" | "GBP" | "NZD";
  };
  transactions: Transaction[];
  updatedAt: string;
};

export type ImportResult = {
  transactions: Transaction[];
  skipped: number;
  errors: string[];
};
