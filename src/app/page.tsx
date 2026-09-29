import { TradingApp } from "@/components/TradingApp";
import { getDb } from "@/lib/db/client";
import { loadAppState } from "@/lib/state";

export const dynamic = "force-dynamic";

async function loadInitial() {
  try {
    return await loadAppState(getDb());
  } catch (e) {
    console.error("Failed to load initial state", e);
    return null;
  }
}

export default async function Home() {
  const initial = await loadInitial();
  if (initial) return <TradingApp initial={initial} />;
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-lg font-semibold text-ink">Setup needed</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        The database isn&apos;t reachable or hasn&apos;t been migrated yet. Set <code>DATABASE_URL</code> and run{" "}
        <code>npm run db:migrate</code> (see the README).
      </p>
    </main>
  );
}
