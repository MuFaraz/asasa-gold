import { eq, sql } from "drizzle-orm";
import { DEFAULT_GUARDRAIL_PAISA, MAX_TRADE_PKR_PAISA, SEED, type SourceId } from "./config";
import type { Db } from "./db/client";
import { seedIfEmpty } from "./db/seed";
import { accounts, demoSettings, quotes, trades } from "./db/schema";
import { AppError } from "./errors";
import { parseGrams, parsePkr } from "./money";

/**
 * Demo-only controls. There is deliberately no auth in this project (out of scope), so these exist
 * to let a reviewer exercise every edge case in the deployed app without touching code.
 */

export async function setGuardrail(db: Db, pkrPerGram: string) {
  const paisa = parsePkr(pkrPerGram);
  if (paisa > MAX_TRADE_PKR_PAISA) throw new AppError("INVALID_INPUT", "Guardrail is unrealistically high.");
  await db.update(demoSettings).set({ guardrailPaisa: paisa }).where(eq(demoSettings.id, 1));
}

export async function setSimulatedOutage(db: Db, source: SourceId, down: boolean) {
  await db
    .update(demoSettings)
    .set(source === "pakgold" ? { simPakgoldDown: down } : { simGoldpriceDown: down })
    .where(eq(demoSettings.id, 1));
}

export async function setBalances(db: Db, input: { customerPkr: string; customerGold: string; inventoryGold: string }) {
  const customerPkr = parsePkr(input.customerPkr);
  const customerGold = parseGrams(input.customerGold);
  const inventoryGold = parseGrams(input.inventoryGold);
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ pkrPaisa: customerPkr, goldMg: customerGold }).where(eq(accounts.id, "customer"));
    await tx.update(accounts).set({ goldMg: inventoryGold }).where(eq(accounts.id, "platform"));
  });
}

/** Makes an open quote expire immediately so the expiry flow can be tried without waiting 75s. */
export async function expireQuote(db: Db, quoteId: string, now = new Date()) {
  const res = await db
    .update(quotes)
    .set({ expiresAt: now })
    .where(eq(quotes.id, quoteId))
    .returning({ id: quotes.id });
  if (res.length === 0) throw new AppError("QUOTE_NOT_FOUND", "No such quote.");
}

export async function resetDemo(db: Db) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`truncate table ${trades}, ${quotes} restart identity`);
    await tx.update(accounts).set(SEED.customer).where(eq(accounts.id, "customer"));
    await tx.update(accounts).set(SEED.platform).where(eq(accounts.id, "platform"));
    await tx
      .update(demoSettings)
      .set({ guardrailPaisa: DEFAULT_GUARDRAIL_PAISA, simPakgoldDown: false, simGoldpriceDown: false })
      .where(eq(demoSettings.id, 1));
  });
  await seedIfEmpty(db);
}
