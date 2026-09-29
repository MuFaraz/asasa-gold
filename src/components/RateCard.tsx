"use client";

import { formatPkr } from "@/lib/money";
import type { AppState } from "./api-client";
import { cx, clockTime, Notice, SOURCE_LABEL, timeAgo, useNow } from "./ui";

const HEALTH_LABEL = {
  ok: "Healthy",
  stale: "Stale",
  error: "Unavailable",
  simulated: "Simulated outage",
  unknown: "No data yet",
} as const;

export function RateCard({ state }: { state: AppState }) {
  const now = useNow(5000);
  const { pricing, customerPrices } = state;
  const paused = pricing.status === "paused";
  const fetchedMs = pricing.status === "paused" ? null : new Date(pricing.fetchedAt).getTime();

  const pill = paused
    ? { text: "Trading paused", cls: "bg-[#ff8f7e]/15 text-[#ffb4a8]", dot: "bg-[#ff8f7e]" }
    : pricing.status === "fallback"
      ? { text: "Backup source", cls: "bg-[#f3cf7a]/15 text-[#f3cf7a]", dot: "bg-[#f3cf7a]" }
      : { text: "Live", cls: "bg-accent/15 text-accent", dot: "bg-accent animate-pulse" };

  return (
    <section aria-label="Live gold rate" className="overflow-hidden rounded-2xl bg-brand text-white">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/60">24K gold · PKR per gram</p>
            {!paused && (
              <p className="mt-1 text-sm text-white/70">
                Market reference {formatPkr(pricing.marketPaisa)}
              </p>
            )}
          </div>
          <span className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", pill.cls)}>
            <span className={cx("size-1.5 rounded-full", pill.dot)} />
            {pill.text}
          </span>
        </div>

        {customerPrices && !paused ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/8 p-4">
              <p className="text-xs text-white/60">You buy at · PKR/g</p>
              <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{formatPkr(customerPrices.buyPaisa).replace("PKR ", "")}</p>
              <p className="mt-0.5 text-xs text-white/55">{customerPrices.guardrailApplied ? "Guardrail floor" : "Market + 10%"}</p>
            </div>
            <div className="rounded-xl bg-white/8 p-4">
              <p className="text-xs text-white/60">You sell at · PKR/g</p>
              <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{formatPkr(customerPrices.sellPaisa).replace("PKR ", "")}</p>
              <p className="mt-0.5 text-xs text-white/55">Market − 10%</p>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-white/8 p-4 text-sm leading-relaxed text-white/85">
            {pricing.status === "paused" && pricing.reason}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70">
          {!paused && (
            <>
              <span>
                Source: <strong className="font-semibold text-white">{SOURCE_LABEL[pricing.source]}</strong>
                {pricing.status === "fallback" && " (fallback)"}
              </span>
              <span aria-hidden>·</span>
              <span>
                Updated {fetchedMs != null && timeAgo(fetchedMs, now)}
                <span className="text-white/50"> ({clockTime(pricing.fetchedAt)})</span>
              </span>
            </>
          )}
        </div>
      </div>

      <details className="group border-t border-white/10 bg-black/10 text-xs text-white/75">
        <summary className="cursor-pointer list-none px-5 py-3 marker:hidden sm:px-6">
          <span className="underline-offset-2 group-open:underline">How this rate is set</span>
        </summary>
        <div className="space-y-3 px-5 pb-4 sm:px-6">
          <ul className="space-y-1.5">
            {pricing.sources.map((s) => (
              <li key={s.source} className="flex items-baseline justify-between gap-3">
                <span>
                  {SOURCE_LABEL[s.source]} <span className="text-white/45">{s.source === "pakgold" ? "primary" : "fallback"}</span>
                </span>
                <span className="text-right">
                  {HEALTH_LABEL[s.health]}
                  {s.pricePaisa != null && s.health !== "simulated" && (
                    <span className="text-white/50"> · {formatPkr(s.pricePaisa)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="leading-relaxed text-white/60">
            The server refreshes each source at most once every 5 minutes. PakGold is used first; GoldPrice.org only if PakGold is
            unavailable or stale. If neither can be trusted, trading pauses.
          </p>
        </div>
      </details>
    </section>
  );
}

export function PausedBanner({ state }: { state: AppState }) {
  if (state.pricing.status !== "paused") return null;
  return (
    <Notice tone="error" title="Trading is paused">
      We can&apos;t confirm a trustworthy gold price right now, so buying and selling is switched off to protect you. Balances are safe and unchanged.
    </Notice>
  );
}
