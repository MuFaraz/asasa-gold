import { DEFAULT_GUARDRAIL_PAISA, SEED } from "../config";
import type { Db } from "./client";
import { accounts, demoSettings } from "./schema";

/** Idempotent: safe to run on every deploy. Never overwrites existing balances. */
export async function seedIfEmpty(db: Db) {
  await db
    .insert(accounts)
    .values([
      { id: "customer", ...SEED.customer },
      { id: "platform", ...SEED.platform },
    ])
    .onConflictDoNothing();
  await db.insert(demoSettings).values({ id: 1, guardrailPaisa: DEFAULT_GUARDRAIL_PAISA }).onConflictDoNothing();
}
