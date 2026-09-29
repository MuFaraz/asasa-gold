import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const money = (name: string) => bigint(name, { mode: "number" });

/** 'customer' and 'platform'. CHECK constraints make a negative balance impossible even if app code is wrong. */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    pkrPaisa: money("pkr_paisa").notNull(),
    goldMg: money("gold_mg").notNull(),
  },
  (t) => [
    check("accounts_pkr_nonneg", sql`${t.pkrPaisa} >= 0`),
    check("accounts_gold_nonneg", sql`${t.goldMg} >= 0`),
  ],
);

/** Last reading per upstream source. `lastSuccessAt` drives freshness; `lastAttemptAt` drives the 5-min throttle. */
export const sourceReadings = pgTable("source_readings", {
  source: text("source").primaryKey(),
  pricePaisa: money("price_paisa_per_gram"),
  sourceUpdatedText: text("source_updated_text"),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastError: text("last_error"),
});

/** Single-row table of demo-only knobs so reviewers can exercise edge cases without redeploying. */
export const demoSettings = pgTable(
  "demo_settings",
  {
    id: integer("id").primaryKey().default(1),
    guardrailPaisa: money("guardrail_paisa").notNull(),
    simPakgoldDown: boolean("sim_pakgold_down").notNull().default(false),
    simGoldpriceDown: boolean("sim_goldprice_down").notNull().default(false),
  },
  (t) => [check("demo_settings_single_row", sql`${t.id} = 1`)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    side: text("side").notNull(), // 'buy' | 'sell' (from the customer's point of view)
    inputMode: text("input_mode").notNull(), // 'pkr' | 'gold'
    pkrPaisa: money("pkr_paisa").notNull(),
    goldMg: money("gold_mg").notNull(),
    unitPricePaisa: money("unit_price_paisa_per_gram").notNull(),
    marketPaisa: money("market_paisa_per_gram").notNull(),
    guardrailApplied: boolean("guardrail_applied").notNull().default(false),
    source: text("source").notNull(),
    priceFetchedAt: timestamp("price_fetched_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("quotes_side", sql`${t.side} in ('buy','sell')`),
    check("quotes_positive", sql`${t.pkrPaisa} > 0 and ${t.goldMg} > 0`),
  ],
);

export const trades = pgTable("trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  // UNIQUE is the last line of defence: one quote can only ever settle once.
  quoteId: uuid("quote_id")
    .notNull()
    .unique()
    .references(() => quotes.id),
  receiptSeq: bigserial("receipt_seq", { mode: "number" }).notNull().unique(),
  side: text("side").notNull(),
  pkrPaisa: money("pkr_paisa").notNull(),
  goldMg: money("gold_mg").notNull(),
  unitPricePaisa: money("unit_price_paisa_per_gram").notNull(),
  source: text("source").notNull(),
  priceFetchedAt: timestamp("price_fetched_at", { withTimezone: true }).notNull(),
  customerPkrAfter: money("customer_pkr_after").notNull(),
  customerGoldAfter: money("customer_gold_after").notNull(),
  inventoryGoldAfter: money("inventory_gold_after").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type QuoteRow = typeof quotes.$inferSelect;
export type TradeRow = typeof trades.$inferSelect;
