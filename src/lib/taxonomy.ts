import type { Category, TransactionDirection } from "./types";

export const CATEGORIES: Category[] = [
  { id: "income-gig", name: "Gig Income", group: "Income", claimablePercent: 0 },
  { id: "income-salary", name: "Salary & Wages", group: "Income", claimablePercent: 0 },
  { id: "income-other", name: "Other Income", group: "Income", claimablePercent: 0 },
  { id: "groceries", name: "Groceries", group: "Living", claimablePercent: 0 },
  { id: "food", name: "Food & Dining", group: "Living", claimablePercent: 0 },
  { id: "rent", name: "Rent & Housing", group: "Living", claimablePercent: 0 },
  { id: "utilities", name: "Utilities", group: "Living", claimablePercent: 0 },
  { id: "health", name: "Health & Insurance", group: "Living", claimablePercent: 0 },
  { id: "shopping", name: "Shopping", group: "Living", claimablePercent: 0 },
  { id: "travel", name: "Travel & Accommodation", group: "Vehicle & Travel", claimablePercent: 0 },
  { id: "rideshare", name: "Rideshare & Taxi", group: "Vehicle & Travel", claimablePercent: 0 },
  { id: "fuel", name: "Fuel", group: "Vehicle & Travel", claimablePercent: 75 },
  { id: "parking-tolls", name: "Parking & Tolls", group: "Vehicle & Travel", claimablePercent: 75 },
  { id: "vehicle-maintenance", name: "Vehicle Maintenance", group: "Vehicle & Travel", claimablePercent: 75 },
  { id: "office", name: "Office & Supplies", group: "Work Expenses", claimablePercent: 100 },
  { id: "software", name: "Software & Subscriptions", group: "Work Expenses", claimablePercent: 100 },
  { id: "phone-internet", name: "Phone & Internet", group: "Work Expenses", claimablePercent: 60 },
  { id: "education", name: "Education", group: "Work Expenses", claimablePercent: 100 },
  { id: "bank-fees", name: "Bank Fees", group: "Financial", claimablePercent: 100 },
  { id: "loan-credit", name: "Loans & Credit Cards", group: "Financial", claimablePercent: 0 },
  { id: "tax", name: "Tax & Government", group: "Tax & Government", claimablePercent: 0 },
  { id: "internal-transfer", name: "Internal Transfer", group: "Internal", claimablePercent: 0 },
  { id: "uncategorised", name: "Uncategorised", group: "Living", claimablePercent: 0 },
];

const RULES: Array<{ categoryId: string; terms: string[]; direction?: TransactionDirection }> = [
  { categoryId: "income-gig", direction: "credit", terms: ["uber", "doordash", "door dash", "menulog", "deliveroo", "stripe", "square"] },
  { categoryId: "income-salary", direction: "credit", terms: ["payroll", "salary", "wages", "payrun"] },
  { categoryId: "groceries", terms: ["woolworths", "coles", "aldi", "costco", "iga", "grocer", "supermarket"] },
  { categoryId: "food", terms: ["restaurant", "cafe", "mcdonald", "kfc", "subway", "pizza", "ubereats", "uber eats", "doordash"] },
  { categoryId: "rent", terms: ["rent", "real estate", "property management"] },
  { categoryId: "utilities", terms: ["electric", "water", "gas bill", "energy", "utility"] },
  { categoryId: "health", terms: ["chemist", "pharmacy", "doctor", "medical", "health", "insurance", "bupa", "medibank"] },
  { categoryId: "travel", terms: ["airbnb", "hotel", "booking.com", "qantas", "virgin australia", "flight", "travel"] },
  { categoryId: "rideshare", terms: ["uber trip", "didi", "ola cabs", "taxi"] },
  { categoryId: "fuel", terms: ["ampol", "bp ", "caltex", "shell", "7-eleven", "petrol", "fuel"] },
  { categoryId: "parking-tolls", terms: ["parking", "wilson", "secure parking", "linkt", "toll"] },
  { categoryId: "vehicle-maintenance", terms: ["tyre", "mechanic", "automotive", "repco", "supercheap auto", "service centre"] },
  { categoryId: "office", terms: ["officeworks", "stationery", "printing"] },
  { categoryId: "software", terms: ["google workspace", "microsoft", "adobe", "notion", "openai", "anthropic", "github", "aws"] },
  { categoryId: "phone-internet", terms: ["telstra", "optus", "vodafone", "internet", "mobile"] },
  { categoryId: "education", terms: ["course", "university", "training", "exam", "certification"] },
  { categoryId: "bank-fees", terms: ["account fee", "bank fee", "monthly fee", "foreign fee"] },
  { categoryId: "loan-credit", terms: ["loan repayment", "credit card", "afterpay", "zip pay"] },
  { categoryId: "tax", terms: ["ato", "tax office", "revenue", "government"] },
  { categoryId: "internal-transfer", terms: ["transfer", "to savings", "from savings", "own account"] },
];

export function categoryById(categoryId: string) {
  return CATEGORIES.find((category) => category.id === categoryId) ?? CATEGORIES.at(-1)!;
}

export function categoryName(categoryId: string) {
  return categoryById(categoryId).name;
}

export function suggestCategory(description: string, direction: TransactionDirection) {
  const text = description.toLowerCase();
  const rule = RULES.find((candidate) => {
    if (candidate.direction && candidate.direction !== direction) {
      return false;
    }
    return candidate.terms.some((term) => text.includes(term));
  });

  if (rule) {
    return rule.categoryId;
  }

  return direction === "credit" ? "income-other" : "uncategorised";
}

export function merchantKey(description: string) {
  return description
    .toLowerCase()
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ") || "unknown";
}
