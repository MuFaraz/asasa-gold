import { beforeEach, describe, expect, it } from "vitest";
import { computeTrade } from "@/lib/trade/calc";
import { confirmQuote, createQuote, getBalances } from "@/lib/trade/service";
import { expireQuote, resetDemo, setBalances, setGuardrail, setSimulatedOutage } from "@/lib/demo";
import { parseGrams, parsePkr } from "@/lib/money";
import { AppError } from "@/lib/errors";
import type { Db } from "@/lib/db/client";
import { clock, fakeFetchers, makeTestDb, pkrPerGram } from "./helpers";

let db: Db;
let c: ReturnType<typeof clock>;
let deps: { now: () => Date; fetchers: ReturnType<typeof fakeFetchers>["fetchers"] };

// Market 37,000 PKR/g => customer buys at 40,700, sells at 33,300 (default guardrail 40,000 is not binding).
beforeEach(async () => {
  db = await makeTestDb();
  c = clock();
  deps = { now: c.now, fetchers: fakeFetchers({ pakgold: 37_000, goldprice: 36_900 }).fetchers };
});

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "NO_ERROR";
};

const totals = async () => {
  const b = await getBalances(db);
  return { pkr: b.customerPkrPaisa + b.platformPkrPaisa, gold: b.customerGoldMg + b.inventoryGoldMg };
};

describe("amount parsing", () => {
  it("parses exactly and rejects excess precision", () => {
    expect(parsePkr("12,500.5")).toBe(1_250_050);
    expect(parseGrams("1.25")).toBe(1250);
    expect(() => parsePkr("1.234")).toThrow(AppError);
    expect(() => parseGrams("1.2345")).toThrow(AppError);
    expect(() => parsePkr("-5")).toThrow(AppError);
    expect(() => parsePkr("1e5")).toThrow(AppError);
    expect(() => parsePkr("")).toThrow(AppError);
  });
});

describe("trade maths", () => {
  const price = pkrPerGram(40_700);
  it("buy by PKR never charges more than entered", () => {
    const t = computeTrade("buy", "pkr", 100_000_00, price);
    expect(t.pkrPaisa).toBeLessThanOrEqual(100_000_00);
    expect(t.goldMg).toBe(Math.floor((100_000_00 * 1000) / price));
  });
  it("sell by PKR pays exactly the entered amount", () => {
    const t = computeTrade("sell", "pkr", 50_000_00, pkrPerGram(33_300));
    expect(t.pkrPaisa).toBe(50_000_00);
    expect((t.goldMg * pkrPerGram(33_300)) / 1000).toBeGreaterThanOrEqual(50_000_00);
  });
  it("gold-entered orders round in the platform's favour", () => {
    expect(computeTrade("buy", "gold", 1, 3).pkrPaisa).toBe(1); // ceil
    expect(computeTrade("sell", "gold", 1, 3).pkrPaisa).toBe(0); // floor
  });
});

describe("happy path", () => {
  it("buy: quote locks price, confirm settles all three balances consistently", async () => {
    const before = await totals();
    const q = await createQuote(db, { side: "buy", mode: "pkr", amount: "407000" }, deps);
    expect(q.unitPricePaisa).toBe(pkrPerGram(40_700));
    expect(q.goldMg).toBe(10_000); // 10 g
    expect(new Date(q.expiresAt).getTime() - new Date(q.createdAt).getTime()).toBe(75_000);

    const r = await confirmQuote(db, q.id, deps);
    expect(r.replayed).toBe(false);
    expect(r.trade.receiptNo).toBe("ASA-000001");
    expect(r.balances.customerPkrPaisa).toBe(5_000_000_00 - q.pkrPaisa);
    expect(r.balances.customerGoldMg).toBe(50_000 + 10_000);
    expect(r.balances.inventoryGoldMg).toBe(1_000_000 - 10_000);
    expect(await getBalances(db)).toEqual(r.balances);
    expect(await totals()).toEqual(before); // nothing created or destroyed
  });

  it("sell: gold leaves the customer, returns to inventory, cash comes back", async () => {
    const before = await totals();
    const q = await createQuote(db, { side: "sell", mode: "gold", amount: "5" }, deps);
    expect(q.unitPricePaisa).toBe(pkrPerGram(33_300));
    expect(q.pkrPaisa).toBe(pkrPerGram(33_300) * 5);
    const r = await confirmQuote(db, q.id, deps);
    expect(r.balances.customerGoldMg).toBe(45_000);
    expect(r.balances.inventoryGoldMg).toBe(1_005_000);
    expect(r.balances.customerPkrPaisa).toBe(5_000_000_00 + q.pkrPaisa);
    expect(await totals()).toEqual(before);
  });
});

describe("guardrail", () => {
  it("floors the buy price and marks the quote", async () => {
    await setGuardrail(db, "45000");
    const q = await createQuote(db, { side: "buy", mode: "gold", amount: "1" }, deps);
    expect(q.unitPricePaisa).toBe(pkrPerGram(45_000));
    expect(q.guardrailApplied).toBe(true);
  });
});

describe("pricing unavailable", () => {
  it("refuses to quote when neither source can be trusted", async () => {
    await setSimulatedOutage(db, "pakgold", true);
    await setSimulatedOutage(db, "goldprice", true);
    expect(await codeOf(createQuote(db, { side: "buy", mode: "pkr", amount: "1000" }, deps))).toBe("PRICING_UNAVAILABLE");
  });
  it("blocks confirming while paused, then allows it once pricing is back", async () => {
    const q = await createQuote(db, { side: "buy", mode: "pkr", amount: "5000" }, deps);
    await setSimulatedOutage(db, "pakgold", true);
    await setSimulatedOutage(db, "goldprice", true);
    expect(await codeOf(confirmQuote(db, q.id, deps))).toBe("PRICING_UNAVAILABLE");
    await setSimulatedOutage(db, "pakgold", false);
    expect((await confirmQuote(db, q.id, deps)).replayed).toBe(false);
  });
  it("uses the fallback source and reports it on the quote", async () => {
    await setSimulatedOutage(db, "pakgold", true);
    const q = await createQuote(db, { side: "buy", mode: "gold", amount: "1" }, deps);
    expect(q.source).toBe("goldprice");
  });
});

describe("insufficient balances", () => {
  it("cash", async () => {
    expect(await codeOf(createQuote(db, { side: "buy", mode: "pkr", amount: "9000000" }, deps))).toBe("INSUFFICIENT_FUNDS");
  });
  it("gold", async () => {
    expect(await codeOf(createQuote(db, { side: "sell", mode: "gold", amount: "51" }, deps))).toBe("INSUFFICIENT_GOLD");
  });
  it("platform inventory", async () => {
    await setBalances(db, { customerPkr: "900000000", customerGold: "50", inventoryGold: "2" });
    expect(await codeOf(createQuote(db, { side: "buy", mode: "gold", amount: "3" }, deps))).toBe("INSUFFICIENT_INVENTORY");
  });
  it("re-checks under lock: balance changed after the quote was issued", async () => {
    const q = await createQuote(db, { side: "buy", mode: "gold", amount: "10" }, deps);
    await setBalances(db, { customerPkr: "100", customerGold: "50", inventoryGold: "1000" });
    expect(await codeOf(confirmQuote(db, q.id, deps))).toBe("INSUFFICIENT_FUNDS");
    expect((await getBalances(db)).customerGoldMg).toBe(50_000); // nothing moved
  });
  it("rejects too-small and malformed input", async () => {
    expect(await codeOf(createQuote(db, { side: "buy", mode: "pkr", amount: "10" }, deps))).toBe("AMOUNT_TOO_SMALL");
    expect(await codeOf(createQuote(db, { side: "buy", mode: "pkr", amount: "abc" }, deps))).toBe("INVALID_INPUT");
  });
});

describe("expiry", () => {
  it("rejects confirmation after 75 seconds and moves no money", async () => {
    const q = await createQuote(db, { side: "buy", mode: "pkr", amount: "100000" }, deps);
    c.advance(80_000);
    expect(await codeOf(confirmQuote(db, q.id, deps))).toBe("QUOTE_EXPIRED");
    expect((await getBalances(db)).customerPkrPaisa).toBe(5_000_000_00);
  });
  it("is still valid at 74s and expired at 75s", async () => {
    const q1 = await createQuote(db, { side: "buy", mode: "pkr", amount: "100000" }, deps);
    c.advance(74_999);
    expect((await confirmQuote(db, q1.id, deps)).replayed).toBe(false);
    const q2 = await createQuote(db, { side: "buy", mode: "pkr", amount: "100000" }, deps);
    c.advance(75_000);
    expect(await codeOf(confirmQuote(db, q2.id, deps))).toBe("QUOTE_EXPIRED");
  });
  it("demo 'expire now' control expires immediately", async () => {
    const q = await createQuote(db, { side: "buy", mode: "pkr", amount: "100000" }, deps);
    await expireQuote(db, q.id, c.now());
    expect(await codeOf(confirmQuote(db, q.id, deps))).toBe("QUOTE_EXPIRED");
  });
  it("unknown quote id", async () => {
    expect(await codeOf(confirmQuote(db, "00000000-0000-4000-8000-000000000000", deps))).toBe("QUOTE_NOT_FOUND");
  });
});

describe("idempotent confirmation", () => {
  it("confirming twice sequentially yields one trade and the same receipt", async () => {
    const q = await createQuote(db, { side: "buy", mode: "pkr", amount: "100000" }, deps);
    const a = await confirmQuote(db, q.id, deps);
    const b = await confirmQuote(db, q.id, deps);
    expect(b.replayed).toBe(true);
    expect(b.trade.id).toBe(a.trade.id);
    expect(b.balances).toEqual(a.balances);
  });

  it("a replay still works after the quote's window has passed", async () => {
    const q = await createQuote(db, { side: "buy", mode: "pkr", amount: "100000" }, deps);
    const a = await confirmQuote(db, q.id, deps);
    c.advance(10 * 60_000);
    expect((await confirmQuote(db, q.id, deps)).trade.id).toBe(a.trade.id);
  });

  it("many concurrent confirms create exactly one trade", async () => {
    const before = await totals();
    const q = await createQuote(db, { side: "buy", mode: "pkr", amount: "100000" }, deps);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => confirmQuote(db, q.id, deps)));
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof confirmQuote>>>).value);
    expect(ok.length).toBe(8);
    expect(new Set(ok.map((r) => r.trade.id)).size).toBe(1);
    expect(ok.filter((r) => !r.replayed).length).toBe(1);
    expect(await totals()).toEqual(before);
    const b = await getBalances(db);
    expect(b.customerPkrPaisa).toBe(5_000_000_00 - q.pkrPaisa); // charged once
  });
});

describe("reset", () => {
  it("restores seed balances and clears history", async () => {
    const q = await createQuote(db, { side: "buy", mode: "pkr", amount: "100000" }, deps);
    await confirmQuote(db, q.id, deps);
    await resetDemo(db);
    expect(await getBalances(db)).toEqual({
      customerPkrPaisa: 5_000_000_00,
      customerGoldMg: 50_000,
      inventoryGoldMg: 1_000_000,
      platformPkrPaisa: 50_000_000_00,
    });
  });
});
