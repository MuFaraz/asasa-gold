import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { SourceId } from "@/lib/config";
import type { Db } from "@/lib/db/client";
import { seedIfEmpty } from "@/lib/db/seed";
import * as schema from "@/lib/db/schema";
import type { SourceFetcher, SourceResult } from "@/lib/pricing/sources";

let shared: Db | undefined;

/**
 * A real Postgres (WASM), migrated with the same SQL production runs. One instance per test file
 * (booting WASM is slow); every call wipes and reseeds it so tests stay independent.
 */
export async function makeTestDb(): Promise<Db> {
  if (!shared) {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    shared = db as unknown as Db;
  }
  await shared.execute(sql`truncate table trades, quotes, source_readings, accounts, demo_settings restart identity`);
  await seedIfEmpty(shared);
  return shared;
}

export const pkrPerGram = (n: number) => Math.round(n * 100);

export function fakeFetchers(prices: Partial<Record<SourceId, number | "down">>) {
  const calls: Record<SourceId, number> = { pakgold: 0, goldprice: 0 };
  const make = (id: SourceId): SourceFetcher => async () => {
    calls[id]++;
    const p = prices[id];
    const res: SourceResult =
      typeof p === "number"
        ? { ok: true, pricePaisaPerGram: pkrPerGram(p), sourceUpdatedText: "test" }
        : { ok: false, error: "HTTP 503" };
    return res;
  };
  return { fetchers: { pakgold: make("pakgold"), goldprice: make("goldprice") }, calls };
}

export function clock(start = new Date("2026-09-29T10:00:00Z")) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}
