/**
 * Applies SQL migrations and seeds starting balances. Idempotent, so it is safe on every deploy
 * (`vercel-build` runs it before `next build`). Skips quietly when DATABASE_URL is absent.
 */
import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "../src/lib/db/client";
import { seedIfEmpty } from "../src/lib/db/seed";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("[migrate] DATABASE_URL not set; skipping migrations.");
    return;
  }
  const db = getDb();
  // The concrete driver is node-postgres here; the shared Db type hides `migrate`'s exact param.
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  await seedIfEmpty(db);
  console.log("[migrate] schema up to date and seeded.");
  await globalThis.__pgPool?.end();
}

main().catch((e) => {
  console.error("[migrate] failed", e);
  process.exit(1);
});
