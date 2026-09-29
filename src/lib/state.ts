import type { Db } from "./db/client";
import { PRICE_REFRESH_MS, QUOTE_TTL_MS } from "./config";
import { getPricingSnapshot, type PricingDeps } from "./pricing/service";
import { deriveCustomerPrices, type CustomerPrices, type PricingState, type Simulation } from "./pricing/select";
import { getBalances, getRecentTrades, type BalancesDto, type TradeDto } from "./trade/service";

export type AppState = {
  serverNow: string;
  pricing: PricingState;
  /** Customer-facing prices; null when trading is paused. */
  customerPrices: CustomerPrices | null;
  guardrailPaisa: number;
  simulation: Simulation;
  balances: BalancesDto;
  recentTrades: TradeDto[];
  config: { quoteTtlMs: number; priceRefreshMs: number };
};

export async function loadAppState(db: Db, deps: PricingDeps = {}): Promise<AppState> {
  const [{ pricing, guardrailPaisa, simulation }, balances, recentTrades] = await Promise.all([
    getPricingSnapshot(db, deps),
    getBalances(db),
    getRecentTrades(db),
  ]);
  return {
    serverNow: new Date().toISOString(),
    pricing,
    customerPrices: pricing.status === "paused" ? null : deriveCustomerPrices(pricing.marketPaisa, guardrailPaisa),
    guardrailPaisa,
    simulation,
    balances,
    recentTrades,
    config: { quoteTtlMs: QUOTE_TTL_MS, priceRefreshMs: PRICE_REFRESH_MS },
  };
}
