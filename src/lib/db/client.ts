import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/** Driver-agnostic handle: node-postgres in production, PGlite in tests. Transactions satisfy it too. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

declare global {
  var __pgPool: Pool | undefined;
}

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Reuse the pool across hot reloads / warm serverless invocations.
  globalThis.__pgPool ??= new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
  return drizzle(globalThis.__pgPool, { schema }) as unknown as Db;
}
