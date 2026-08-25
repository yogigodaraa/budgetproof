"use client";
import { useEffect, useState } from "react";
import { Panel, PageShell } from "./ui";

const KEY_LS = "budgetproof.claudeKey.v1";
const SUGGESTIONS = [
  "How much did I spend on fuel this year?",
  "Which month did I earn the most?",
  "What are my top spending categories?",
  "How much GST should I set aside?",
  "Am I spending more on food or groceries?",
];

export default function AskView() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try { setApiKey(localStorage.getItem(KEY_LS) ?? ""); } catch {}
  }, []);
  const saveKey = (k: string) => {
    setApiKey(k);
    try { localStorage.setItem(KEY_LS, k); } catch {}
  };

  const ask = async (question: string) => {
    if (!question.trim()) return;
    setLoading(true); setError(""); setAnswer("");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, apiKey }),
      });
      const json = await res.json();
      if (json.error) setError(json.error);
      else setAnswer(json.answer);
    } catch {
      setError("Request failed.");
    }
    setLoading(false);
  };

  return (
    <PageShell>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Ask BudgetProof</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Ask questions about your own money in plain English. Answers are grounded only in your data. Private — your key
        and data stay yours.
      </p>

      {!apiKey && (
        <Panel title="Connect your Claude API key">
          <p className="mb-3 text-sm text-[var(--muted)]">
            Bring your own key (from console.anthropic.com). It’s stored only in this browser — never sent to our
            database, only to Anthropic to answer your question.
          </p>
          <input
            type="password"
            placeholder="sk-ant-…"
            onChange={(e) => saveKey(e.target.value.trim())}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
        </Panel>
      )}

      {apiKey && (
        <div className="space-y-4">
          <Panel
            title="Your question"
            right={
              <button onClick={() => setShowKey((s) => !s)} className="text-xs text-[var(--faint)] hover:underline">
                {showKey ? "hide key" : "change key"}
              </button>
            }
          >
            {showKey && (
              <input
                type="password"
                value={apiKey}
                onChange={(e) => saveKey(e.target.value.trim())}
                className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-emerald-600"
              />
            )}
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(q); }}
              rows={3}
              placeholder="e.g. How much did I spend on fuel last quarter?"
              className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-emerald-600"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => ask(q)}
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? "Thinking…" : "Ask"}
              </button>
              <span className="text-xs text-[var(--faint)]">⌘/Ctrl + Enter</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => { setQ(s); ask(s); }} className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)]">
                  {s}
                </button>
              ))}
            </div>
          </Panel>

          {error && <Panel title="Error"><p className="text-sm text-rose-500">{error}</p></Panel>}
          {answer && (
            <Panel title="Answer">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
            </Panel>
          )}
        </div>
      )}
    </PageShell>
  );
}
