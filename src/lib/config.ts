/** Single place for every business constant, so reviewers can audit the rules quickly. */

export const PRICE_REFRESH_MS = 5 * 60_000; // upstream is hit at most once per source per 5 min
export const PRICE_MAX_AGE_MS = 15 * 60_000; // older than this => source is "stale", not trusted
export const QUOTE_TTL_MS = 75_000; // locked quote lifetime
export const FETCH_TIMEOUT_MS = 4_000;

/** Customer buys at market x 1.10 (never below guardrail); sells at market x 0.90. */
export const BUY_MARKUP_BPS = 11_000;
export const SELL_MARKDOWN_BPS = 9_000;
export const BPS = 10_000;

/** If both sources are healthy but differ more than this, neither is trusted. */
export const MAX_SOURCE_DEVIATION_BPS = 500; // 5%

/** Sanity band for a 24K PKR/gram rate (in PKR). Anything outside is treated as garbage data. */
export const SANE_MIN_PKR_PER_GRAM = 1_000;
export const SANE_MAX_PKR_PER_GRAM = 500_000;

export const TROY_OUNCE_GRAMS = 31.1034768;
export const TOLA_GRAMS = 11.6638038;

/** Units: PKR is stored in paisa (1/100), gold in milligrams (1/1000 g). No floats touch money. */
export const PAISA_PER_PKR = 100;
export const MG_PER_GRAM = 1_000;

export const MIN_TRADE_PKR_PAISA = 500 * PAISA_PER_PKR; // PKR 500
export const MIN_TRADE_GOLD_MG = 100; // 0.1 g
export const MAX_TRADE_PKR_PAISA = 100_000_000 * PAISA_PER_PKR; // PKR 100M
export const MAX_TRADE_GOLD_MG = 10_000 * MG_PER_GRAM; // 10 kg

export const DEFAULT_GUARDRAIL_PAISA = 40_000 * PAISA_PER_PKR;

export const SEED = {
  customer: { pkrPaisa: 5_000_000 * PAISA_PER_PKR, goldMg: 50 * MG_PER_GRAM },
  platform: { pkrPaisa: 50_000_000 * PAISA_PER_PKR, goldMg: 1_000 * MG_PER_GRAM },
} as const;

export const SOURCES = {
  pakgold: { label: "PakGold", url: "https://www.pakgold.net/webapi/pgr/GoldRate" },
  goldprice: { label: "GoldPrice.org", url: "https://data-asg.goldprice.org/dbXRates/PKR" },
} as const;
export type SourceId = keyof typeof SOURCES;
export const PRIMARY_SOURCE: SourceId = "pakgold";
export const FALLBACK_SOURCE: SourceId = "goldprice";
