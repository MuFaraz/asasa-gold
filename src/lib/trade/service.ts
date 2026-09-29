import { desc, eq } from "drizzle-orm";
import {
  MAX_TRADE_GOLD_MG,
  MAX_TRADE_PKR_PAISA,
  MIN_TRADE_GOLD_MG,
  MIN_TRADE_PKR_PAISA,
  QUOTE_TTL_MS,
  type SourceId,
} from "../config";
import type { Db } from "../db/client";
import { accounts, quotes, trades, type Account, type QuoteRow, type TradeRow } from "../db/schema";
import { AppError } from "../errors";
import { formatGrams, formatPkr, parseGrams, parsePkr } from "../money";
import { getPricingSnapshot, type PricingDeps } from "../pricing/service";
import { deriveCustomerPrices } from "../pricing/select";
import { computeTrade, type InputMode, type Side } from "./calc";

export type Deps = PricingDeps;
const clock = (deps: Deps) => (deps.now ?? (() => new Date()))();

export type QuoteDto = {
  id: string;
  side: Side;
  inputMode: InputMode;
  pkrPaisa: number;
  goldMg: number;
  unitPricePaisa: number;
  marketPaisa: number;
  guardrailApplied: boolean;
  source: SourceId;
  priceFetchedAt: string;
  createdAt: string;
  expiresAt: string;
};

export type TradeDto = {
  id: string;
  quoteId: string;
  receiptNo: string;
  side: Side;
  pkrPaisa: number;
  goldMg: number;
  unitPricePaisa: number;
  source: SourceId;
  priceFetchedAt: string;
  customerPkrAfter: number;
  customerGoldAfter: number;
  inventoryGoldAfter: number;
  createdAt: string;
};

export type BalancesDto = {
  customerPkrPaisa: number;
  customerGoldMg: number;
  inventoryGoldMg: number;
  platformPkrPaisa: number;
};

export const toQuoteDto = (q: QuoteRow): QuoteDto => ({
  id: q.id,
  side: q.side as Side,
  inputMode: q.inputMode as InputMode,
  pkrPaisa: q.pkrPaisa,
  goldMg: q.goldMg,
  unitPricePaisa: q.unitPricePaisa,
  marketPaisa: q.marketPaisa,
  guardrailApplied: q.guardrailApplied,
  source: q.source as SourceId,
  priceFetchedAt: q.priceFetchedAt.toISOString(),
  createdAt: q.createdAt.toISOString(),
  expiresAt: q.expiresAt.toISOString(),
});

export const receiptNo = (seq: number) => `ASA-${String(seq).padStart(6, "0")}`;

export const toTradeDto = (t: TradeRow): TradeDto => ({
  id: t.id,
  quoteId: t.quoteId,
  receiptNo: receiptNo(t.receiptSeq),
  side: t.side as Side,
  pkrPaisa: t.pkrPaisa,
  goldMg: t.goldMg,
  unitPricePaisa: t.unitPricePaisa,
  source: t.source as SourceId,
  priceFetchedAt: t.priceFetchedAt.toISOString(),
  customerPkrAfter: t.customerPkrAfter,
  customerGoldAfter: t.customerGoldAfter,
  inventoryGoldAfter: t.inventoryGoldAfter,
  createdAt: t.createdAt.toISOString(),
});

export const toBalancesDto = (rows: Account[]): BalancesDto => {
  const customer = rows.find((r) => r.id === "customer");
  const platform = rows.find((r) => r.id === "platform");
  if (!customer || !platform) throw new Error("Database is not seeded. Run `npm run db:migrate`.");
  return {
    customerPkrPaisa: customer.pkrPaisa,
    customerGoldMg: customer.goldMg,
    inventoryGoldMg: platform.goldMg,
    platformPkrPaisa: platform.pkrPaisa,
  };
};

export async function getBalances(db: Db): Promise<BalancesDto> {
  return toBalancesDto(await db.select().from(accounts));
}

export async function getRecentTrades(db: Db, limit = 5): Promise<TradeDto[]> {
  const rows = await db.select().from(trades).orderBy(desc(trades.receiptSeq)).limit(limit);
  return rows.map(toTradeDto);
}

/** Throws the specific reason a trade cannot settle: customer cash/gold *and* platform inventory/cash all count. */
export function assertCanSettle(customer: Account, platform: Account, side: Side, pkrPaisa: number, goldMg: number) {
  if (side === "buy") {
    if (customer.pkrPaisa < pkrPaisa) {
      throw new AppError(
        "INSUFFICIENT_FUNDS",
        `You need ${formatPkr(pkrPaisa)} but your wallet has ${formatPkr(customer.pkrPaisa)}.`,
      );
    }
    if (platform.goldMg < goldMg) {
      throw new AppError(
        "INSUFFICIENT_INVENTORY",
        `Only ${formatGrams(platform.goldMg)} of gold is available in platform inventory; this order needs ${formatGrams(goldMg)}.`,
      );
    }
  } else {
    if (customer.goldMg < goldMg) {
      throw new AppError(
        "INSUFFICIENT_GOLD",
        `You need ${formatGrams(goldMg)} of gold but you hold ${formatGrams(customer.goldMg)}.`,
      );
    }
    if (platform.pkrPaisa < pkrPaisa) {
      throw new AppError(
        "INSUFFICIENT_PLATFORM_CASH",
        `The platform cannot pay out ${formatPkr(pkrPaisa)} right now (it holds ${formatPkr(platform.pkrPaisa)}).`,
      );
    }
  }
}

export type CreateQuoteInput = { side: Side; mode: InputMode; amount: string };

export async function createQuote(db: Db, input: CreateQuoteInput, deps: Deps = {}): Promise<QuoteDto> {
  const { side, mode } = input;
  const amountUnits = mode === "pkr" ? parsePkr(input.amount) : parseGrams(input.amount);

  const [min, max, fmt] =
    mode === "pkr"
      ? [MIN_TRADE_PKR_PAISA, MAX_TRADE_PKR_PAISA, formatPkr]
      : [MIN_TRADE_GOLD_MG, MAX_TRADE_GOLD_MG, formatGrams];
  if (amountUnits < min) throw new AppError("AMOUNT_TOO_SMALL", `The minimum order is ${fmt(min)}.`);
  if (amountUnits > max) throw new AppError("AMOUNT_TOO_LARGE", `The maximum order is ${fmt(max)}.`);

  const { pricing, guardrailPaisa } = await getPricingSnapshot(db, deps);
  if (pricing.status === "paused") throw new AppError("PRICING_UNAVAILABLE", pricing.reason);

  const prices = deriveCustomerPrices(pricing.marketPaisa, guardrailPaisa);
  const unitPricePaisa = side === "buy" ? prices.buyPaisa : prices.sellPaisa;
  const { pkrPaisa, goldMg } = computeTrade(side, mode, amountUnits, unitPricePaisa);
  if (pkrPaisa <= 0 || goldMg <= 0) throw new AppError("AMOUNT_TOO_SMALL", "That amount is too small to trade.");

  // Early feedback. Balances are re-checked under lock at confirmation.
  const rows = await db.select().from(accounts);
  const customer = rows.find((r) => r.id === "customer")!;
  const platform = rows.find((r) => r.id === "platform")!;
  assertCanSettle(customer, platform, side, pkrPaisa, goldMg);

  const now = clock(deps);
  const [row] = await db
    .insert(quotes)
    .values({
      side,
      inputMode: mode,
      pkrPaisa,
      goldMg,
      unitPricePaisa,
      marketPaisa: pricing.marketPaisa,
      guardrailApplied: side === "buy" && prices.guardrailApplied,
      source: pricing.source,
      priceFetchedAt: new Date(pricing.fetchedAt),
      createdAt: now,
      expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
    })
    .returning();
  return toQuoteDto(row);
}

export type ConfirmResult = { trade: TradeDto; balances: BalancesDto; replayed: boolean };

/**
 * Settles a quote exactly once.
 *  - The quote row is locked (FOR UPDATE), so a second concurrent confirm waits, then sees the trade and replays it.
 *  - trades.quote_id is UNIQUE as a backstop, and account CHECK constraints stop any negative balance.
 *  - The price is always the one locked in the quote; we never re-price at confirmation.
 */
export async function confirmQuote(db: Db, quoteId: string, deps: Deps = {}): Promise<ConfirmResult> {
  const replay = async (q: Pick<QuoteRow, "id">) => {
    const [t] = await db.select().from(trades).where(eq(trades.quoteId, q.id));
    return t ? { trade: toTradeDto(t), balances: await getBalances(db), replayed: true } : null;
  };

  // Cheap pre-checks outside the transaction (also keeps price fetching out of the locked section).
  const [pre] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!pre) throw new AppError("QUOTE_NOT_FOUND", "We couldn't find that quote. Please request a new one.");
  const already = await replay(pre);
  if (already) return already;
  if (clock(deps) >= pre.expiresAt) {
    throw new AppError("QUOTE_EXPIRED", "This quote has expired. Get a new quote to continue.");
  }
  const { pricing } = await getPricingSnapshot(db, deps);
  if (pricing.status === "paused") throw new AppError("PRICING_UNAVAILABLE", pricing.reason);

  return db.transaction(async (tx) => {
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
    const [existing] = await tx.select().from(trades).where(eq(trades.quoteId, quoteId));
    if (existing) {
      return { trade: toTradeDto(existing), balances: toBalancesDto(await tx.select().from(accounts)), replayed: true };
    }

    const now = clock(deps);
    if (now >= q.expiresAt) {
      throw new AppError("QUOTE_EXPIRED", "This quote has expired. Get a new quote to continue.");
    }

    // Fixed lock order (by id) so concurrent settlements can never deadlock.
    const locked = await tx.select().from(accounts).orderBy(accounts.id).for("update");
    const customer = locked.find((r) => r.id === "customer")!;
    const platform = locked.find((r) => r.id === "platform")!;
    const side = q.side as Side;
    assertCanSettle(customer, platform, side, q.pkrPaisa, q.goldMg);

    const sign = side === "buy" ? 1 : -1;
    const after = {
      customerPkr: customer.pkrPaisa - sign * q.pkrPaisa,
      customerGold: customer.goldMg + sign * q.goldMg,
      platformPkr: platform.pkrPaisa + sign * q.pkrPaisa,
      platformGold: platform.goldMg - sign * q.goldMg,
    };
    await tx.update(accounts).set({ pkrPaisa: after.customerPkr, goldMg: after.customerGold }).where(eq(accounts.id, "customer"));
    await tx.update(accounts).set({ pkrPaisa: after.platformPkr, goldMg: after.platformGold }).where(eq(accounts.id, "platform"));

    const [trade] = await tx
      .insert(trades)
      .values({
        quoteId: q.id,
        side,
        pkrPaisa: q.pkrPaisa,
        goldMg: q.goldMg,
        unitPricePaisa: q.unitPricePaisa,
        source: q.source,
        priceFetchedAt: q.priceFetchedAt,
        customerPkrAfter: after.customerPkr,
        customerGoldAfter: after.customerGold,
        inventoryGoldAfter: after.platformGold,
        createdAt: now,
      })
      .returning();

    return {
      trade: toTradeDto(trade),
      balances: {
        customerPkrPaisa: after.customerPkr,
        customerGoldMg: after.customerGold,
        inventoryGoldMg: after.platformGold,
        platformPkrPaisa: after.platformPkr,
      },
      replayed: false,
    };
  });
}

export async function getTrade(db: Db, id: string): Promise<TradeDto> {
  const [t] = await db.select().from(trades).where(eq(trades.id, id));
  if (!t) throw new AppError("NOT_FOUND", "Receipt not found.");
  return toTradeDto(t);
}
