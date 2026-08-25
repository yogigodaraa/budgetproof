export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from = "/" } = await searchParams;
  return (
    <main className="flex min-h-[80vh] items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-lg font-bold text-white">T</div>
        <h1 className="text-2xl font-semibold tracking-tight">BudgetProof</h1>
        <p className="mt-1 mb-6 text-sm text-[var(--muted)]">Private — enter your password to continue.</p>
        <form action="/api/login" method="POST" className="space-y-3">
          <input type="hidden" name="from" value={from} />
          <input
            type="password"
            name="password"
            autoFocus
            placeholder="Password"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
          />
          {error && <p className="text-xs text-rose-500">Incorrect password — try again.</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
