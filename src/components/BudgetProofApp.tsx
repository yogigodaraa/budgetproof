"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { categorySpend, displayMonth, groupSpend, merchantGroups, money, monthlyTotals, preciseMoney, totals } from "@/lib/aggregate";
import { parseImportFile } from "@/lib/csv";
import { createDemoState, emptyState } from "@/lib/demo";
import { CATEGORIES, categoryName, merchantKey, suggestCategory } from "@/lib/taxonomy";
import { clearState, loadState, saveState } from "@/lib/storage";
import type { BudgetProofState, Transaction } from "@/lib/types";

type Tab = "dashboard" | "import" | "transactions" | "categorise" | "settings";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "import", label: "Import" },
  { id: "transactions", label: "Transactions" },
  { id: "categorise", label: "Categorise" },
  { id: "settings", label: "Settings" },
];

export default function BudgetProofApp() {
  const [state, setState] = useState<BudgetProofState>(() => emptyState());
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [status, setStatus] = useState("Data stays in this browser until you export, import, or clear it.");
  const [search, setSearch] = useState("");
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    loadState().then((stored) => {
      if (!mounted) {
        return;
      }
      if (stored) {
        setState(stored);
        setStatus(`Loaded ${stored.transactions.length} saved transactions from this browser.`);
      }
      setLoaded(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }

    saveTimer.current = window.setTimeout(() => {
      saveState(state);
    }, 250);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [loaded, state]);

  const summary = useMemo(() => totals(state.transactions), [state.transactions]);
  const categoryRows = useMemo(() => categorySpend(state.transactions), [state.transactions]);
  const groupRows = useMemo(() => groupSpend(state.transactions), [state.transactions]);
  const monthRows = useMemo(() => monthlyTotals(state.transactions), [state.transactions]);
  const merchantRows = useMemo(() => merchantGroups(state), [state]);
  const filteredTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return state.transactions.slice().sort(sortNewestFirst);
    }
    return state.transactions
      .filter((transaction) => {
        const category = categoryName(transaction.categoryId).toLowerCase();
        return `${transaction.date} ${transaction.description} ${category} ${transaction.source}`.toLowerCase().includes(term);
      })
      .sort(sortNewestFirst);
  }, [search, state.transactions]);

  const currency = state.profile.currency;

  function updateTransaction(transactionId: string, patch: Partial<Transaction>) {
    setState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.id === transactionId
          ? {
              ...transaction,
              ...patch,
              merchantKey: patch.description ? merchantKey(patch.description) : transaction.merchantKey,
            }
          : transaction,
      ),
    }));
  }

  function categoriseMerchant(key: string, categoryId: string) {
    setState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.merchantKey === key ? { ...transaction, categoryId } : transaction,
      ),
    }));
  }

  function recategoriseUncategorised() {
    setState((current) => ({
      ...current,
      transactions: current.transactions.map((transaction) =>
        transaction.categoryId === "uncategorised"
          ? { ...transaction, categoryId: suggestCategory(transaction.description, transaction.direction) }
          : transaction,
      ),
    }));
    setStatus("Re-ran the starter rule engine on uncategorised transactions.");
  }

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    let nextState = state;

    for (const file of files) {
      try {
        const content = await file.text();
        const result = parseImportFile(file.name, content);
        if ("transactions" in result && "profile" in result) {
          nextState = result;
          imported = result.transactions.length;
        } else {
          imported += result.transactions.length;
          skipped += result.skipped;
          errors.push(...result.errors);
          nextState = mergeTransactions(nextState, result.transactions);
        }
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "import failed"}`);
      }
    }

    setState(nextState);
    setStatus(`Imported ${imported} transactions${skipped ? `, skipped ${skipped}` : ""}.${errors.length ? ` ${errors[0]}` : ""}`);
    event.target.value = "";
  }

  function addManualTransaction(formData: FormData) {
    const direction = formData.get("direction") === "credit" ? "credit" : "debit";
    const description = String(formData.get("description") ?? "").trim();
    const amount = Number(formData.get("amount"));
    const date = String(formData.get("date") ?? "");

    if (!date || !description || !Number.isFinite(amount) || amount <= 0) {
      setStatus("Manual transaction needs a date, description, and positive amount.");
      return;
    }

    const categoryId = String(formData.get("categoryId") ?? suggestCategory(description, direction));
    const importedAt = new Date().toISOString();
    const transaction: Transaction = {
      id: crypto.randomUUID(),
      date,
      description,
      amount,
      direction,
      categoryId,
      source: "Manual",
      merchantKey: merchantKey(description),
      importedAt,
    };

    setState((current) => ({ ...current, transactions: [...current.transactions, transaction] }));
    setStatus("Added manual transaction.");
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `budgetproof-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function resetLocalData() {
    await clearState();
    setState(emptyState());
    setStatus("Cleared local browser data for this app.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">BP</div>
            <div>
              <h1>BudgetProof</h1>
              <p>Private budget, income, and expense tracking</p>
            </div>
          </div>
          <div className="top-actions">
            <button className="btn secondary" type="button" onClick={() => setState(createDemoState())}>
              Load demo
            </button>
            <button className="btn primary" type="button" onClick={exportBackup} disabled={state.transactions.length === 0}>
              Export backup
            </button>
          </div>
        </div>
      </header>

      <div className="container">
        <section className="notice">
          <div>
            <strong>Local-first MVP</strong>
            <span>No server database is used in this version. Imports are stored in IndexedDB on this device.</span>
          </div>
          <span>{loaded ? "Browser storage ready" : "Loading storage..."}</span>
        </section>

        <nav className="tabs" aria-label="BudgetProof sections">
          {tabs.map((tab) => (
            <button
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "dashboard" ? (
          <Dashboard
            categoryRows={categoryRows}
            currency={currency}
            groupRows={groupRows}
            monthRows={monthRows}
            summary={summary}
            transactionCount={state.transactions.length}
          />
        ) : null}

        {activeTab === "import" ? (
          <ImportView addManualTransaction={addManualTransaction} currency={currency} importFiles={importFiles} />
        ) : null}

        {activeTab === "transactions" ? (
          <TransactionsView
            currency={currency}
            search={search}
            setSearch={setSearch}
            transactions={filteredTransactions}
            updateTransaction={updateTransaction}
          />
        ) : null}

        {activeTab === "categorise" ? (
          <CategoriseView
            categoriseMerchant={categoriseMerchant}
            currency={currency}
            merchantRows={merchantRows}
            recategoriseUncategorised={recategoriseUncategorised}
            transactions={state.transactions}
            updateTransaction={updateTransaction}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SettingsView
            resetLocalData={resetLocalData}
            setState={setState}
            state={state}
          />
        ) : null}

        <p className="status-line">{status}</p>
      </div>
    </main>
  );
}

function Dashboard({
  categoryRows,
  currency,
  groupRows,
  monthRows,
  summary,
  transactionCount,
}: {
  categoryRows: ReturnType<typeof categorySpend>;
  currency: string;
  groupRows: ReturnType<typeof groupSpend>;
  monthRows: ReturnType<typeof monthlyTotals>;
  summary: ReturnType<typeof totals>;
  transactionCount: number;
}) {
  const maxCategory = Math.max(...categoryRows.map((row) => row.amount), 1);
  const maxMonth = Math.max(...monthRows.map((row) => Math.max(row.income, row.spend)), 1);

  return (
    <div className="grid">
      <section className="grid stats">
        <Stat label="Income" value={money(summary.income, currency)} detail={`${transactionCount} transactions`} />
        <Stat label="Spend" value={money(summary.spend, currency)} detail="Excludes internal transfers" />
        <Stat label="Net" value={money(summary.income - summary.spend, currency)} detail="Income minus spend" />
        <Stat label="Claimable estimate" value={money(summary.claimable, currency)} detail="Based on starter category rates" />
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Spend by Category</h2>
              <p>Highest debit categories from imported data.</p>
            </div>
          </div>
          <BarList rows={categoryRows.map((row) => ({ label: row.category.name, amount: row.amount }))} max={maxCategory} currency={currency} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Monthly Flow</h2>
              <p>Income and spend by month.</p>
            </div>
          </div>
          <div className="bar-list">
            {monthRows.length === 0 ? <p className="muted">Import data or load the demo to see monthly totals.</p> : null}
            {monthRows.map((row) => (
              <div className="bar-row" key={row.month}>
                <div className="bar-top">
                  <strong>{displayMonth(row.month)}</strong>
                  <span>{money(row.income - row.spend, currency)} net</span>
                </div>
                <div className="bar-track" aria-label={`${displayMonth(row.month)} income`}>
                  <div className="bar-fill" style={{ width: `${Math.max(4, (row.income / maxMonth) * 100)}%` }} />
                </div>
                <div className="bar-track" aria-label={`${displayMonth(row.month)} spend`}>
                  <div className="bar-fill" style={{ width: `${Math.max(4, (row.spend / maxMonth) * 100)}%`, background: "#b45f06" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Spend by Group</h2>
            <p>Broad buckets for tax and budget review.</p>
          </div>
        </div>
        <BarList rows={groupRows} max={Math.max(...groupRows.map((row) => row.amount), 1)} currency={currency} />
      </section>
    </div>
  );
}

function ImportView({
  addManualTransaction,
  currency,
  importFiles,
}: {
  addManualTransaction: (formData: FormData) => void;
  currency: string;
  importFiles: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid two">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Import Statements</h2>
            <p>CSV bank exports and BudgetProof JSON backups work now. PDF extraction is the next engine layer.</p>
          </div>
        </div>
        <label className="drop-zone">
          <strong>Select CSV or JSON files</strong>
          <span className="muted">CSV should include date, description, and either amount or debit/credit columns.</span>
          <input accept=".csv,.json,text/csv,application/json" multiple type="file" onChange={importFiles} />
        </label>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Add Transaction</h2>
            <p>Useful for invoices, cash expenses, or manual corrections.</p>
          </div>
        </div>
        <form action={addManualTransaction} className="grid">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="date">Date</label>
              <input id="date" name="date" type="date" required />
            </div>
            <div className="field">
              <label htmlFor="amount">Amount</label>
              <input id="amount" min="0.01" name="amount" step="0.01" type="number" required />
            </div>
            <div className="field">
              <label htmlFor="direction">Type</label>
              <select id="direction" name="direction">
                <option value="debit">Spend</option>
                <option value="credit">Income</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="categoryId">Category</label>
              <select id="categoryId" name="categoryId">
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <input id="description" name="description" placeholder={`Example: ${currency} bank statement row`} required />
          </div>
          <button className="btn primary" type="submit">Add transaction</button>
        </form>
      </section>
    </div>
  );
}

function TransactionsView({
  currency,
  search,
  setSearch,
  transactions,
  updateTransaction,
}: {
  currency: string;
  search: string;
  setSearch: (value: string) => void;
  transactions: Transaction[];
  updateTransaction: (transactionId: string, patch: Partial<Transaction>) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Transactions</h2>
          <p>Edit individual rows when imports or merchant grouping need cleanup.</p>
        </div>
        <div className="field">
          <label htmlFor="search">Search</label>
          <input id="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Merchant, category, source" />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Source</th>
              <th className="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>
                  <input
                    aria-label="Transaction date"
                    type="date"
                    value={transaction.date}
                    onChange={(event) => updateTransaction(transaction.id, { date: event.target.value })}
                  />
                </td>
                <td>
                  <input
                    aria-label="Transaction description"
                    value={transaction.description}
                    onChange={(event) => updateTransaction(transaction.id, { description: event.target.value })}
                  />
                </td>
                <td>
                  <select
                    aria-label="Transaction category"
                    value={transaction.categoryId}
                    onChange={(event) => updateTransaction(transaction.id, { categoryId: event.target.value })}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{transaction.source}</td>
                <td className={`amount ${transaction.direction}`}>{transaction.direction === "credit" ? "+" : "-"}{preciseMoney(transaction.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoriseView({
  categoriseMerchant,
  currency,
  merchantRows,
  recategoriseUncategorised,
  transactions,
  updateTransaction,
}: {
  categoriseMerchant: (key: string, categoryId: string) => void;
  currency: string;
  merchantRows: ReturnType<typeof merchantGroups>;
  recategoriseUncategorised: () => void;
  transactions: Transaction[];
  updateTransaction: (transactionId: string, patch: Partial<Transaction>) => void;
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Categorise Merchants</h2>
          <p>Bulk-categorise merchant groups, then open a group to move individual rows out.</p>
        </div>
        <button className="btn secondary" type="button" onClick={recategoriseUncategorised}>Run rules</button>
      </div>
      <div className="merchant-list">
        {merchantRows.length === 0 ? <p className="muted">No debit transactions yet.</p> : null}
        {merchantRows.map((row) => {
          const children = transactions.filter((transaction) => transaction.merchantKey === row.key);
          return (
            <div className="transaction-row" key={row.key}>
              <div>
                <strong>{row.key}</strong>
                <span className="muted">{row.count} rows · {row.descriptions[0]}</span>
                {expandedKey === row.key ? (
                  <div className="grid" style={{ marginTop: 12 }}>
                    {children.map((transaction) => (
                      <div className="form-grid" key={transaction.id}>
                        <div className="field">
                          <label>Date</label>
                          <input type="date" value={transaction.date} onChange={(event) => updateTransaction(transaction.id, { date: event.target.value })} />
                        </div>
                        <div className="field">
                          <label>Description</label>
                          <input value={transaction.description} onChange={(event) => updateTransaction(transaction.id, { description: event.target.value })} />
                        </div>
                        <div className="field">
                          <label>Category</label>
                          <select value={transaction.categoryId} onChange={(event) => updateTransaction(transaction.id, { categoryId: event.target.value })}>
                            {CATEGORIES.map((category) => (
                              <option key={category.id} value={category.id}>{category.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Amount</label>
                          <input readOnly value={preciseMoney(transaction.amount, currency)} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <strong className="amount">{money(row.amount, currency)}</strong>
              <div className="button-row">
                <select value={row.categoryId} onChange={(event) => categoriseMerchant(row.key, event.target.value)}>
                  {CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <button className="btn secondary" type="button" onClick={() => setExpandedKey(expandedKey === row.key ? null : row.key)}>
                  {expandedKey === row.key ? "Close" : "Split"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SettingsView({
  resetLocalData,
  setState,
  state,
}: {
  resetLocalData: () => void;
  setState: React.Dispatch<React.SetStateAction<BudgetProofState>>;
  state: BudgetProofState;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Settings</h2>
          <p>Profile settings are stored with the local backup.</p>
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            value={state.profile.displayName}
            onChange={(event) =>
              setState((current) => ({ ...current, profile: { ...current.profile, displayName: event.target.value } }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="currency">Currency</label>
          <select
            id="currency"
            value={state.profile.currency}
            onChange={(event) =>
              setState((current) => ({
                ...current,
                profile: { ...current.profile, currency: event.target.value as BudgetProofState["profile"]["currency"] },
              }))
            }
          >
            <option value="AUD">AUD</option>
            <option value="USD">USD</option>
            <option value="CAD">CAD</option>
            <option value="GBP">GBP</option>
            <option value="NZD">NZD</option>
          </select>
        </div>
      </div>
      <div className="button-row" style={{ marginTop: 18 }}>
        <button className="btn danger" type="button" onClick={resetLocalData}>Clear browser data</button>
      </div>
    </section>
  );
}

function Stat({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function BarList({ rows, max, currency }: { rows: Array<{ label?: string; name?: string; amount: number }>; max: number; currency: string }) {
  return (
    <div className="bar-list">
      {rows.length === 0 ? <p className="muted">Import data or load the demo to see this chart.</p> : null}
      {rows.map((row) => (
        <div className="bar-row" key={row.label ?? row.name}>
          <div className="bar-top">
            <strong>{row.label ?? row.name}</strong>
            <span>{money(row.amount, currency)}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(4, (row.amount / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function mergeTransactions(state: BudgetProofState, transactions: Transaction[]): BudgetProofState {
  const seen = new Set(state.transactions.map((transaction) => transaction.id));
  const next = transactions.filter((transaction) => !seen.has(transaction.id));

  return {
    ...state,
    transactions: [...state.transactions, ...next],
    updatedAt: new Date().toISOString(),
  };
}

function sortNewestFirst(a: Transaction, b: Transaction) {
  return b.date.localeCompare(a.date);
}
