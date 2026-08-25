// Postgres-backed state store. One JSONB document per user — currently a single
// "owner" (password-gated), but keyed by user_id so multi-tenant auth drops in
// later without a schema change. Safe before the DB is provisioned: callers
// check dbConfigured() and fall back to localStorage.
import { sql } from "@vercel/postgres";

export const dbConfigured = () => !!process.env.POSTGRES_URL;

let ensured = false;
async function ensure() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS app_state (
    user_id text PRIMARY KEY,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  ensured = true;
}

export async function getState(userId = "owner"): Promise<unknown | null> {
  await ensure();
  const { rows } = await sql`SELECT data FROM app_state WHERE user_id = ${userId}`;
  return rows[0]?.data ?? null;
}

export async function setState(data: unknown, userId = "owner"): Promise<void> {
  await ensure();
  await sql`
    INSERT INTO app_state (user_id, data, updated_at)
    VALUES (${userId}, ${JSON.stringify(data)}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
}
