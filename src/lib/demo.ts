import type { BudgetProofState, Transaction } from "./types";
import { merchantKey, suggestCategory } from "./taxonomy";

const demoRows: Array<Omit<Transaction, "id" | "categoryId" | "merchantKey" | "importedAt">> = [
  { date: "2026-07-01", description: "Uber Partner Payment", amount: 1260.44, direction: "credit", source: "Demo" },
  { date: "2026-07-02", description: "DoorDash Weekly Payout", amount: 682.18, direction: "credit", source: "Demo" },
  { date: "2026-07-03", description: "Ampol Fuel Cannington", amount: 92.35, direction: "debit", source: "Demo" },
  { date: "2026-07-04", description: "Linkt Toll Payment", amount: 18.6, direction: "debit", source: "Demo" },
  { date: "2026-07-06", description: "Coles Supermarket", amount: 126.2, direction: "debit", source: "Demo" },
  { date: "2026-07-08", description: "Telstra Mobile", amount: 69, direction: "debit", source: "Demo" },
  { date: "2026-07-11", description: "Repco Auto Parts", amount: 244.9, direction: "debit", source: "Demo" },
  { date: "2026-07-13", description: "Officeworks Supplies", amount: 58.4, direction: "debit", source: "Demo" },
  { date: "2026-07-15", description: "Airbnb Sydney", amount: 412.2, direction: "debit", source: "Demo" },
  { date: "2026-07-18", description: "ATO Payment", amount: 880, direction: "debit", source: "Demo" },
  { date: "2026-08-01", description: "Uber Partner Payment", amount: 1378.73, direction: "credit", source: "Demo" },
  { date: "2026-08-04", description: "Shell Fuel", amount: 84.15, direction: "debit", source: "Demo" },
  { date: "2026-08-05", description: "Woolworths", amount: 96.82, direction: "debit", source: "Demo" },
  { date: "2026-08-07", description: "Google Workspace", amount: 18.99, direction: "debit", source: "Demo" },
  { date: "2026-08-12", description: "Mechanic Service Centre", amount: 618, direction: "debit", source: "Demo" },
  { date: "2026-08-14", description: "Transfer to Savings", amount: 500, direction: "debit", source: "Demo" },
];

export function createDemoState(): BudgetProofState {
  const importedAt = new Date().toISOString();
  const transactions = demoRows.map((row, index) => ({
    ...row,
    id: `demo-${index + 1}`,
    categoryId: suggestCategory(row.description, row.direction),
    merchantKey: merchantKey(row.description),
    importedAt,
  }));

  return {
    version: 1,
    profile: {
      displayName: "Demo user",
      currency: "AUD",
    },
    transactions,
    updatedAt: importedAt,
  };
}

export function emptyState(): BudgetProofState {
  return {
    version: 1,
    profile: {
      displayName: "",
      currency: "AUD",
    },
    transactions: [],
    updatedAt: new Date().toISOString(),
  };
}
