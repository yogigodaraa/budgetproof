// Selectors that turn a clicked chart label back into the transactions behind it.
import type { Dataset, Txn } from "./types";
import { SPEND_GROUPS, catGroup, effCat } from "./aggregate";

export function txnPickers(ds: Dataset, overrides: Record<string, string>) {
  const cg = catGroup(ds.meta.taxonomy);
  const cat = (t: Txn) => effCat(t, overrides);
  const group = (t: Txn) => cg[cat(t)] ?? "Other";
  /** Spend excludes transfers and income, matching every total in the app. */
  const isSpend = (t: Txn) => t.dir === "debit" && SPEND_GROUPS.has(group(t));
  const claimable = (t: Txn) => !!ds.meta.taxonomy.group_claimable[group(t)];

  return {
    byCategory: (name: string) => ds.transactions.filter((t) => isSpend(t) && cat(t) === name),
    byGroup: (name: string) => ds.transactions.filter((t) => isSpend(t) && group(t) === name),
    byMonth: (month: string) => ds.transactions.filter((t) => isSpend(t) && t.date.startsWith(month)),
    byBrand: (brand: string) =>
      ds.transactions.filter((t) => isSpend(t) && (t.brand || t.merchant) === brand),
    byClaimable: (want: boolean) => ds.transactions.filter((t) => isSpend(t) && claimable(t) === want),
    allSpend: () => ds.transactions.filter(isSpend),
    /** Bank deposits identified as coming from one income source. */
    byIncomeCategory: (name: string) =>
      ds.transactions.filter((t) => t.dir === "credit" && group(t) === "Income" && cat(t) === name),
  };
}
