import type { BudgetProofState, ImportResult, Transaction, TransactionDirection } from "./types";
import { merchantKey, suggestCategory } from "./taxonomy";

const descriptionHeaders = ["description", "details", "merchant", "payee", "narration", "transaction description"];
const dateHeaders = ["date", "transaction date", "posted date", "effective date"];
const amountHeaders = ["amount", "value", "transaction amount"];
const debitHeaders = ["debit", "withdrawal", "money out", "out"];
const creditHeaders = ["credit", "deposit", "money in", "in"];
const directionHeaders = ["direction", "type", "debit/credit", "dr/cr"];

export function parseImportFile(name: string, content: string): ImportResult | BudgetProofState {
  if (name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(content) as BudgetProofState | { transactions?: Transaction[] };
    if ("version" in parsed && parsed.version === 1 && Array.isArray(parsed.transactions)) {
      return parsed as BudgetProofState;
    }
    if (Array.isArray(parsed.transactions)) {
      return {
        version: 1,
        profile: { displayName: "", currency: "AUD" },
        transactions: parsed.transactions,
        updatedAt: new Date().toISOString(),
      };
    }
    throw new Error("JSON file is not a BudgetProof backup.");
  }

  return parseCsv(content, name);
}

export function parseCsv(content: string, source: string): ImportResult {
  const rows = splitCsv(content);
  if (rows.length < 2) {
    return { transactions: [], skipped: 0, errors: ["CSV has no transaction rows."] };
  }

  const headers = rows[0].map(normalizeHeader);
  const importedAt = new Date().toISOString();
  const transactions: Transaction[] = [];
  const errors: string[] = [];
  let skipped = 0;

  rows.slice(1).forEach((row, index) => {
    const read = (names: string[]) => {
      const headerIndex = headers.findIndex((header) => names.includes(header));
      return headerIndex >= 0 ? row[headerIndex]?.trim() ?? "" : "";
    };

    const date = parseDate(read(dateHeaders));
    const description = read(descriptionHeaders);
    const amountDetails = parseAmountDetails({
      amount: read(amountHeaders),
      debit: read(debitHeaders),
      credit: read(creditHeaders),
      direction: read(directionHeaders),
    });

    if (!date || !description || !amountDetails) {
      skipped += 1;
      if (errors.length < 6) {
        errors.push(`Skipped row ${index + 2}: missing date, description, or amount.`);
      }
      return;
    }

    const key = merchantKey(description);
    transactions.push({
      id: createId(source, index, date, description, amountDetails.amount, amountDetails.direction),
      date,
      description,
      amount: amountDetails.amount,
      direction: amountDetails.direction,
      categoryId: suggestCategory(description, amountDetails.direction),
      source,
      merchantKey: key,
      importedAt,
    });
  });

  return { transactions, skipped, errors };
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function parseDate(value: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    return "";
  }

  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const slashMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${slashMatch[2].padStart(2, "0")}-${slashMatch[1].padStart(2, "0")}`;
  }

  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function parseAmountDetails(values: {
  amount: string;
  debit: string;
  credit: string;
  direction: string;
}): { amount: number; direction: TransactionDirection } | null {
  const debit = parseMoney(values.debit);
  const credit = parseMoney(values.credit);

  if (debit > 0) {
    return { amount: debit, direction: "debit" };
  }
  if (credit > 0) {
    return { amount: credit, direction: "credit" };
  }

  const amount = parseMoney(values.amount);
  if (amount === 0) {
    return null;
  }

  const directionText = values.direction.toLowerCase();
  if (directionText.includes("debit") || directionText === "dr" || directionText.includes("withdrawal")) {
    return { amount: Math.abs(amount), direction: "debit" };
  }
  if (directionText.includes("credit") || directionText === "cr" || directionText.includes("deposit")) {
    return { amount: Math.abs(amount), direction: "credit" };
  }

  return amount < 0 ? { amount: Math.abs(amount), direction: "debit" } : { amount, direction: "credit" };
}

function parseMoney(value: string) {
  const normal = value.replace(/[$,\s]/g, "").replace(/[()]/g, "-");
  const parsed = Number.parseFloat(normal);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createId(source: string, index: number, date: string, description: string, amount: number, direction: TransactionDirection) {
  const key = `${source}-${index}-${date}-${description}-${amount}-${direction}`;
  let hash = 0;

  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }

  return `tx-${hash.toString(36)}-${index}`;
}
