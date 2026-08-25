import type { BudgetProofState } from "./types";

const DB_NAME = "budgetproof.local.v1";
const STORE_NAME = "state";
const STATE_KEY = "current";
const LOCAL_KEY = "budgetproof.fallback.state";

export async function loadState(): Promise<BudgetProofState | null> {
  if (!hasIndexedDb()) {
    return loadFallback();
  }

  try {
    const database = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve((request.result as BudgetProofState | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return loadFallback();
  }
}

export async function saveState(state: BudgetProofState): Promise<void> {
  const nextState = { ...state, updatedAt: new Date().toISOString() };

  if (!hasIndexedDb()) {
    saveFallback(nextState);
    return;
  }

  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(nextState, STATE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    saveFallback(nextState);
  }
}

export async function clearState(): Promise<void> {
  if (hasIndexedDb()) {
    try {
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(STATE_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      localStorage.removeItem(LOCAL_KEY);
    }
  }

  localStorage.removeItem(LOCAL_KEY);
}

function hasIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadFallback() {
  if (typeof localStorage === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(LOCAL_KEY);
  return raw ? (JSON.parse(raw) as BudgetProofState) : null;
}

function saveFallback(state: BudgetProofState) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}
