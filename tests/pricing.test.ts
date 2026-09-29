import { describe, expect, it } from "vitest";
import { parseGoldPrice, parsePakGold } from "@/lib/pricing/sources";
import { deriveCustomerPrices, selectPricing, type Reading } from "@/lib/pricing/select";
import { refreshPricesIfDue, getPricingSnapshot } from "@/lib/pricing/service";
import { setSimulatedOutage } from "@/lib/demo";
import { clock, fakeFetchers, makeTestDb, pkrPerGram } from "./helpers";

describe("source parsers", () => {
  it("converts PakGold rawaSell (per tola) to PKR per gram in paisa", () => {
    const r = parsePakGold({ rawaSell: "436,424", rateUpdateTime: "29-09-2026 11:10 PM" });
    expect(r).toMatchObject({ ok: true, sourceUpdatedText: "29-09-2026 11:10 PM" });
    if (r.ok) expect(r.pricePaisaPerGram / 100).toBeCloseTo(37416.8, 0);
  });

  it("converts GoldPrice.org XAU/oz in PKR to PKR per gram", () => {
    const r = parseGoldPrice({ items: [{ curr: "PKR", xauPrice: 1154493.2633 }], date: "x" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.pricePaisaPerGram / 100).toBeCloseTo(37117.7, 0);
  });

  it("rejects garbage and implausible values instead of trading on them", () => {
    expect(parsePakGold({ rawaSell: "0" }).ok).toBe(false);
    expect(parsePakGold({ rawaSell: "abc" }).ok).toBe(false);
    expect(parsePakGold(null).ok).toBe(false);
    expect(parseGoldPrice({ items: [] }).ok).toBe(false);
    expect(parseGoldPrice({ items: [{ curr: "PKR", xauPrice: 5 }] }).ok).toBe(false);
  });
});

describe("customer prices", () => {
  const market = pkrPerGram(37_000);
  it("buys at market +10% and sells at market -10%", () => {
    const p = deriveCustomerPrices(market, pkrPerGram(1));
    expect(p.buyPaisa).toBe(pkrPerGram(40_700));
    expect(p.sellPaisa).toBe(pkrPerGram(33_300));
    expect(p.guardrailApplied).toBe(false);
  });
  it("never sells below the guardrail, and flags when it kicks in", () => {
    const p = deriveCustomerPrices(market, pkrPerGram(45_000));
    expect(p.buyPaisa).toBe(pkrPerGram(45_000));
    expect(p.guardrailApplied).toBe(true);
    expect(p.sellPaisa).toBe(pkrPerGram(33_300)); // guardrail only floors the buy price
  });
});

describe("source selection", () => {
  const now = new Date("2026-09-29T10:00:00Z");
  const reading = (source: "pakgold" | "goldprice", price: number | null, ageMs: number): Reading => ({
    source,
    pricePaisa: price == null ? null : pkrPerGram(price),
    sourceUpdatedText: null,
    lastSuccessAt: price == null ? null : new Date(now.getTime() - ageMs),
    lastAttemptAt: new Date(now.getTime() - 1000),
    lastError: price == null ? "HTTP 500" : null,
  });
  const sim = { pakgold: false, goldprice: false };

  it("uses the primary when healthy", () => {
    const s = selectPricing([reading("pakgold", 37_400, 1000), reading("goldprice", 37_100, 1000)], sim, now);
    expect(s).toMatchObject({ status: "live", source: "pakgold" });
  });
  it("falls back when the primary is down", () => {
    const s = selectPricing([reading("pakgold", null, 0), reading("goldprice", 37_100, 1000)], sim, now);
    expect(s).toMatchObject({ status: "fallback", source: "goldprice" });
  });
  it("treats old data as untrusted", () => {
    const s = selectPricing([reading("pakgold", 37_400, 20 * 60_000), reading("goldprice", 37_100, 20 * 60_000)], sim, now);
    expect(s.status).toBe("paused");
  });
  it("pauses when both sources fail or are simulated down", () => {
    expect(selectPricing([reading("pakgold", null, 0), reading("goldprice", null, 0)], sim, now).status).toBe("paused");
    const both = { pakgold: true, goldprice: true };
    expect(selectPricing([reading("pakgold", 37_400, 0), reading("goldprice", 37_100, 0)], both, now).status).toBe("paused");
  });
  it("pauses when healthy sources disagree by more than 5%", () => {
    const s = selectPricing([reading("pakgold", 37_400, 0), reading("goldprice", 30_000, 0)], sim, now);
    expect(s).toMatchObject({ status: "paused" });
  });
});

describe("refresh throttling (db)", () => {
  it("hits each upstream at most once per five minutes, even across many requests", async () => {
    const db = await makeTestDb();
    const c = clock();
    const { fetchers, calls } = fakeFetchers({ pakgold: 37_400, goldprice: 37_100 });
    const deps = { now: c.now, fetchers };
    await Promise.all([getPricingSnapshot(db, deps), getPricingSnapshot(db, deps), getPricingSnapshot(db, deps)]);
    c.advance(4 * 60_000);
    await getPricingSnapshot(db, deps);
    expect(calls).toEqual({ pakgold: 1, goldprice: 1 });
    c.advance(61_000);
    await getPricingSnapshot(db, deps);
    expect(calls).toEqual({ pakgold: 2, goldprice: 2 });
  });

  it("does not retry a failing source before the window ends", async () => {
    const db = await makeTestDb();
    const c = clock();
    const { fetchers, calls } = fakeFetchers({ pakgold: "down", goldprice: "down" });
    const deps = { now: c.now, fetchers };
    const snap = await getPricingSnapshot(db, deps);
    await refreshPricesIfDue(db, deps);
    expect(snap.pricing.status).toBe("paused");
    expect(calls).toEqual({ pakgold: 1, goldprice: 1 });
  });

  it("simulated outage switches source without extra upstream calls", async () => {
    const db = await makeTestDb();
    const c = clock();
    const { fetchers, calls } = fakeFetchers({ pakgold: 37_400, goldprice: 37_100 });
    const deps = { now: c.now, fetchers };
    expect((await getPricingSnapshot(db, deps)).pricing).toMatchObject({ status: "live", source: "pakgold" });
    await setSimulatedOutage(db, "pakgold", true);
    expect((await getPricingSnapshot(db, deps)).pricing).toMatchObject({ status: "fallback", source: "goldprice" });
    await setSimulatedOutage(db, "goldprice", true);
    expect((await getPricingSnapshot(db, deps)).pricing.status).toBe("paused");
    expect(calls).toEqual({ pakgold: 1, goldprice: 1 });
  });
});
