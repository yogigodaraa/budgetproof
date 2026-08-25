import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { loadDataset } from "@/lib/data";

// BYOK: the user's Claude API key is passed per-request (stored client-side,
// never synced to the DB). Cheapest good model per request; grounded in the
// user's own aggregates only. Gated by the auth middleware.
export const dynamic = "force-dynamic";
const MODEL = "claude-sonnet-4-6";

export async function POST(req: NextRequest) {
  const { question, apiKey } = await req.json().catch(() => ({}));
  if (!apiKey) return NextResponse.json({ error: "Add your Claude API key first." }, { status: 400 });
  if (!question) return NextResponse.json({ error: "Ask a question." }, { status: 400 });

  const ds = loadDataset();
  const context = {
    period: ds.meta.period,
    currency: "AUD",
    summary: ds.summary,
    spend: ds.spend,
    income: { by_platform: ds.income.by_platform, monthly: ds.income.monthly.map((m) => ({ month: m.month, income: m.income })) },
  };
  const system =
    "You are BudgetProof, a private finance assistant for income, expenses, and tax review. " +
    "Answer ONLY from the JSON data provided below. All amounts are AUD. Be concise and specific, and show the figures. " +
    "If the data doesn't contain the answer, say so plainly — never invent numbers. GST/tax figures are estimates.\n\nDATA:\n" +
    JSON.stringify(context);

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: String(question) }],
    });
    const answer = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    return NextResponse.json({ answer });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    let error = err.message ?? "Something went wrong.";
    if (err.status === 401) error = "Invalid API key.";
    else if (err.status === 429) error = "Rate limited — try again shortly.";
    return NextResponse.json({ error }, { status: 200 });
  }
}
