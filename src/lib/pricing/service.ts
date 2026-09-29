import { eq, sql } from "drizzle-orm";
import { PRICE_REFRESH_MS, SOURCES, type SourceId } from "../config";
import type { Db } from "../db/client";
import { demoSettings, sourceReadings } from "../db/schema";
import { fetchers as defaultFetchers, type SourceFetcher } from "./sources";
import { selectPricing, type PricingState, type Reading, type Simulation } from "./select";

const REFRESH_LOCK_KEY = 727_001;
const SOURCE_IDS = Object.keys(SOURCES) as SourceId[];

export type PricingDeps = {
  now?: () => Date;
  fetchers?: Record<SourceId, SourceFetcher>;
};

export type PricingSnapshot = {
  pricing: PricingState;
  guardrailPaisa: number;
  simulation: Simulation;
};

async function loadReadings(db: Db): Promise<Reading[]> {
  const rows = await db.select().from(sourceReadings);
  return rows.map((r) => ({
    source: r.source as SourceId,
    pricePaisa: r.pricePaisa,
    sourceUpdatedText: r.sourceUpdatedText,
    lastSuccessAt: r.lastSuccessAt,
    lastAttemptAt: r.lastAttemptAt,
    lastError: r.lastError,
  }));
}

const dueSources = (readings: Reading[], now: Date): SourceId[] =>
  SOURCE_IDS.filter((id) => {
    const at = readings.find((r) => r.source === id)?.lastAttemptAt;
    return !at || now.getTime() - at.getTime() >= PRICE_REFRESH_MS;
  });

/**
 * Refreshes upstream prices, at most once per source per PRICE_REFRESH_MS, across every serverless
 * instance. Failed attempts count too, so an outage never turns into a hammering loop.
 * A transaction-scoped advisory lock means concurrent requests never double-fetch.
 */
export async function refreshPricesIfDue(db: Db, deps: PricingDeps = {}): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  if (dueSources(await loadReadings(db), now).length === 0) return;

  await db.transaction(async (tx) => {
    const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(${REFRESH_LOCK_KEY}) as locked`);
    if (!(lock as unknown as { rows: { locked: boolean }[] }).rows[0].locked) return; // another instance is refreshing

    const due = dueSources(await loadReadings(tx), now); // re-check under the lock
    const fetchers = deps.fetchers ?? defaultFetchers;
    const results = await Promise.all(due.map(async (id) => [id, await fetchers[id]()] as const));

    for (const [id, res] of results) {
      const values = res.ok
        ? {
            pricePaisa: res.pricePaisaPerGram,
            sourceUpdatedText: res.sourceUpdatedText,
            lastSuccessAt: now,
            lastAttemptAt: now,
            lastError: null,
          }
        : { lastAttemptAt: now, lastError: res.error };
      await tx
        .insert(sourceReadings)
        .values({ source: id, ...values })
        .onConflictDoUpdate({ target: sourceReadings.source, set: values });
    }
  });
}

export async function getSettings(db: Db) {
  const [row] = await db.select().from(demoSettings).where(eq(demoSettings.id, 1));
  if (!row) throw new Error("Database is not seeded. Run `npm run db:migrate`.");
  return row;
}

/** The one entry point the rest of the app uses to learn "what can we trade at right now?" */
export async function getPricingSnapshot(db: Db, deps: PricingDeps = {}): Promise<PricingSnapshot> {
  const now = (deps.now ?? (() => new Date()))();
  try {
    await refreshPricesIfDue(db, deps);
  } catch (e) {
    // A refresh problem must never take the app down; we fall back to whatever is stored (and its age).
    console.error("price refresh failed", e);
  }
  const [readings, settings] = await Promise.all([loadReadings(db), getSettings(db)]);
  const simulation: Simulation = { pakgold: settings.simPakgoldDown, goldprice: settings.simGoldpriceDown };
  return {
    pricing: selectPricing(readings, simulation, now),
    guardrailPaisa: settings.guardrailPaisa,
    simulation,
  };
}
