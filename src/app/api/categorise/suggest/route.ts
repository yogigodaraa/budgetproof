import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { loadDataset } from "@/lib/data";

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_MERCHANTS = 24;
const MAX_TXNS_PER_MERCHANT = 8;

interface MerchantRequest {
  key: string;
  label: string;
  total: number;
  txns: {
    date: string;
    description: string;
    amount: number;
    source: string;
  }[];
}

interface RawSuggestion {
  key?: unknown;
  category?: unknown;
  confidence?: unknown;
  reason?: unknown;
}

function asMerchant(x: unknown): MerchantRequest | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const txns = Array.isArray(r.txns) ? r.txns : [];
  if (typeof r.key !== "string" || typeof r.label !== "string") return null;
  return {
    key: r.key.slice(0, 120),
    label: r.label.slice(0, 160),
    total: typeof r.total === "number" && Number.isFinite(r.total) ? r.total : 0,
    txns: txns.slice(0, MAX_TXNS_PER_MERCHANT).flatMap((t) => {
      if (!t || typeof t !== "object") return [];
      const row = t as Record<string, unknown>;
      return [{
        date: typeof row.date === "string" ? row.date.slice(0, 10) : "",
        description: typeof row.description === "string" ? row.description.slice(0, 220) : "",
        amount: typeof row.amount === "number" && Number.isFinite(row.amount) ? row.amount : 0,
        source: typeof row.source === "string" ? row.source.slice(0, 40) : "",
      }];
    }),
  };
}

function extractJsonArray(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {}
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const merchants = Array.isArray(body.merchants)
    ? body.merchants.slice(0, MAX_MERCHANTS).flatMap((m: unknown) => {
        const merchant = asMerchant(m);
        return merchant ? [merchant] : [];
      })
    : [];

  if (!apiKey) return NextResponse.json({ error: "Add your Claude API key first." }, { status: 400 });
  if (merchants.length === 0) return NextResponse.json({ error: "No merchants to predict." }, { status: 400 });

  const taxonomy = loadDataset().meta.taxonomy;
  const categories = Object.values(taxonomy.groups).flat();
  const categorySet = new Set(categories);
  const system =
    "You classify debit card and bank transactions for an Australian rideshare/delivery driver's finance dashboard. " +
    "Choose exactly one category from the taxonomy. Prefer tax-claimable Vehicle & Travel or Work Expenses only when the merchant evidence supports it. " +
    "Return JSON only: an array of objects with key, category, confidence from 0 to 1, and a short reason.\n\n" +
    `TAXONOMY:\n${JSON.stringify(taxonomy)}`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1400,
      temperature: 0,
      system,
      messages: [{
        role: "user",
        content: "Predict categories for these merchant groups:\n" + JSON.stringify(merchants),
      }],
    });
    const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = extractJsonArray(text);
    if (!Array.isArray(parsed)) return NextResponse.json({ error: "AI returned an unreadable response." }, { status: 200 });

    const suggestions = parsed.flatMap((raw: unknown) => {
      if (!raw || typeof raw !== "object") return [];
      const suggestion = raw as RawSuggestion;
      const key = typeof suggestion.key === "string" ? suggestion.key : "";
      const category = typeof suggestion.category === "string" ? suggestion.category : "";
      if (!key || !categorySet.has(category)) return [];
      const confidence = typeof suggestion.confidence === "number" && Number.isFinite(suggestion.confidence)
        ? Math.min(1, Math.max(0, suggestion.confidence))
        : 0.5;
      const reason = typeof suggestion.reason === "string" ? suggestion.reason.slice(0, 160) : "";
      return [{ key, category, confidence, reason }];
    });

    return NextResponse.json({ suggestions });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    let error = err.message ?? "Something went wrong.";
    if (err.status === 401) error = "Invalid API key.";
    else if (err.status === 429) error = "Rate limited - try again shortly.";
    return NextResponse.json({ error }, { status: 200 });
  }
}
