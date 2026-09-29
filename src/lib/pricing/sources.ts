import {
  FETCH_TIMEOUT_MS,
  PAISA_PER_PKR,
  SANE_MAX_PKR_PER_GRAM,
  SANE_MIN_PKR_PER_GRAM,
  SOURCES,
  TOLA_GRAMS,
  TROY_OUNCE_GRAMS,
  type SourceId,
} from "../config";

export type FetchLike = typeof fetch;

export type SourceResult =
  | { ok: true; pricePaisaPerGram: number; sourceUpdatedText: string | null }
  | { ok: false; error: string };

export type SourceFetcher = (fetchImpl?: FetchLike) => Promise<SourceResult>;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

/** Converts a PKR/gram float into integer paisa, rejecting anything outside a sane band. */
function toValidPaisa(pkrPerGram: number): SourceResult {
  if (!Number.isFinite(pkrPerGram) || pkrPerGram < SANE_MIN_PKR_PER_GRAM || pkrPerGram > SANE_MAX_PKR_PER_GRAM) {
    return { ok: false, error: `Rejected implausible rate: ${pkrPerGram}` };
  }
  return { ok: true, pricePaisaPerGram: Math.round(pkrPerGram * PAISA_PER_PKR), sourceUpdatedText: null };
}

const num = (v: unknown) => (typeof v === "string" ? Number(v.replace(/,/g, "")) : typeof v === "number" ? v : NaN);

/** PakGold publishes 24K "Rawa" (Rawalpindi/Islamabad sarafa) sell rate per tola. */
export function parsePakGold(json: unknown): SourceResult {
  const body = json as { rawaSell?: unknown; rateUpdateTime?: unknown; result?: unknown } | null;
  if (!body || typeof body !== "object") return { ok: false, error: "Malformed PakGold response" };
  const perTola = num(body.rawaSell);
  const res = toValidPaisa(perTola / TOLA_GRAMS);
  if (!res.ok) return res;
  return { ...res, sourceUpdatedText: typeof body.rateUpdateTime === "string" ? body.rateUpdateTime : null };
}

/** GoldPrice.org returns XAU (troy ounce) priced in PKR. */
export function parseGoldPrice(json: unknown): SourceResult {
  const body = json as { items?: { curr?: string; xauPrice?: unknown }[]; date?: unknown } | null;
  const item = body?.items?.find((i) => i?.curr === "PKR");
  if (!item) return { ok: false, error: "Malformed GoldPrice.org response" };
  const res = toValidPaisa(num(item.xauPrice) / TROY_OUNCE_GRAMS);
  if (!res.ok) return res;
  return { ...res, sourceUpdatedText: typeof body?.date === "string" ? body.date : null };
}

async function getJson(url: string, extraHeaders: Record<string, string>, fetchImpl: FetchLike): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: { ...BROWSER_HEADERS, ...extraHeaders },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function wrap(url: string, headers: Record<string, string>, parse: (j: unknown) => SourceResult): SourceFetcher {
  return async (fetchImpl = fetch) => {
    try {
      return parse(await getJson(url, headers, fetchImpl));
    } catch (e) {
      const name = e instanceof Error ? e.name : "Error";
      return { ok: false, error: name === "TimeoutError" ? "Timed out" : e instanceof Error ? e.message : "Request failed" };
    }
  };
}

export const fetchers: Record<SourceId, SourceFetcher> = {
  pakgold: wrap(SOURCES.pakgold.url, { Referer: "https://www.pakgold.net/" }, parsePakGold),
  goldprice: wrap(SOURCES.goldprice.url, { Referer: "https://goldprice.org/", Origin: "https://goldprice.org" }, parseGoldPrice),
};
