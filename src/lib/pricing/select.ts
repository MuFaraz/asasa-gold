import {
  BPS,
  BUY_MARKUP_BPS,
  FALLBACK_SOURCE,
  MAX_SOURCE_DEVIATION_BPS,
  PRICE_MAX_AGE_MS,
  PRIMARY_SOURCE,
  SELL_MARKDOWN_BPS,
  type SourceId,
} from "../config";

export type Reading = {
  source: SourceId;
  pricePaisa: number | null;
  sourceUpdatedText: string | null;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
};

export type SourceHealth = "ok" | "stale" | "error" | "simulated" | "unknown";

export type SourceStatus = {
  source: SourceId;
  health: SourceHealth;
  pricePaisa: number | null;
  lastSuccessAt: string | null;
  detail: string | null;
};

export type PricingState =
  | {
      status: "live" | "fallback";
      source: SourceId;
      marketPaisa: number;
      fetchedAt: string;
      sourceUpdatedText: string | null;
      sources: SourceStatus[];
    }
  | { status: "paused"; reason: string; sources: SourceStatus[] };

export type Simulation = Record<SourceId, boolean>;

function health(r: Reading, simulated: boolean, now: Date): SourceStatus {
  const base = {
    source: r.source,
    pricePaisa: r.pricePaisa,
    lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
  };
  if (simulated) return { ...base, health: "simulated", detail: "Simulated outage (demo control)" };
  if (!r.lastSuccessAt || r.pricePaisa == null) {
    return { ...base, health: r.lastAttemptAt ? "error" : "unknown", detail: r.lastError ?? "No data yet" };
  }
  if (now.getTime() - r.lastSuccessAt.getTime() > PRICE_MAX_AGE_MS) {
    return { ...base, health: "stale", detail: r.lastError ?? "Data is too old to trust" };
  }
  return { ...base, health: "ok", detail: null };
}

/**
 * Pure decision function: given the last stored readings, which price (if any) is safe to trade on?
 * Primary wins when healthy; fallback is used only when the primary is unusable; if both are
 * healthy but disagree wildly we trust neither.
 */
export function selectPricing(readings: Reading[], simulation: Simulation, now: Date): PricingState {
  const bySource = new Map(readings.map((r) => [r.source, r]));
  const empty = (source: SourceId): Reading => ({
    source, pricePaisa: null, sourceUpdatedText: null, lastSuccessAt: null, lastAttemptAt: null, lastError: null,
  });
  const primary = bySource.get(PRIMARY_SOURCE) ?? empty(PRIMARY_SOURCE);
  const fallback = bySource.get(FALLBACK_SOURCE) ?? empty(FALLBACK_SOURCE);
  const statuses = [
    health(primary, simulation[PRIMARY_SOURCE], now),
    health(fallback, simulation[FALLBACK_SOURCE], now),
  ];
  const [pStat, fStat] = statuses;

  if (pStat.health === "ok" && fStat.health === "ok") {
    const a = pStat.pricePaisa!;
    const b = fStat.pricePaisa!;
    if ((Math.abs(a - b) * BPS) / Math.min(a, b) > MAX_SOURCE_DEVIATION_BPS) {
      return {
        status: "paused",
        reason: "The two price sources disagree by more than 5%, so neither can be trusted right now.",
        sources: statuses,
      };
    }
  }

  const pick = (r: Reading, s: SourceStatus, status: "live" | "fallback"): PricingState => ({
    status,
    source: r.source,
    marketPaisa: s.pricePaisa!,
    fetchedAt: s.lastSuccessAt!,
    sourceUpdatedText: r.sourceUpdatedText,
    sources: statuses,
  });

  if (pStat.health === "ok") return pick(primary, pStat, "live");
  if (fStat.health === "ok") return pick(fallback, fStat, "fallback");
  return {
    status: "paused",
    reason: "Live gold prices are unavailable from both sources. Trading is paused until a trusted rate returns.",
    sources: statuses,
  };
}

export type CustomerPrices = { buyPaisa: number; sellPaisa: number; guardrailApplied: boolean };

/** Integer-only pricing. Rounding always favours the platform (buy up, sell down). */
export function deriveCustomerPrices(marketPaisa: number, guardrailPaisa: number): CustomerPrices {
  const markedUp = Math.ceil((marketPaisa * BUY_MARKUP_BPS) / BPS);
  return {
    buyPaisa: Math.max(markedUp, guardrailPaisa),
    sellPaisa: Math.floor((marketPaisa * SELL_MARKDOWN_BPS) / BPS),
    guardrailApplied: guardrailPaisa > markedUp,
  };
}
