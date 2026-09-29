"use client";

import { useEffect } from "react";
import { formatGrams, formatPkr, parsePkr } from "@/lib/money";
import type { QuoteDto } from "./api-client";
import { Button, clockTime, cx, Notice, SOURCE_LABEL, useNow } from "./ui";

export function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-ink/60">{label}</dt>
      <dd className={cx("text-right tabular-nums", strong ? "text-base font-semibold text-ink" : "text-sm text-ink")}>{value}</dd>
    </div>
  );
}

export function QuoteSummary({ quote }: { quote: QuoteDto }) {
  const buy = quote.side === "buy";
  return (
    <dl className="divide-y divide-ink/8 rounded-xl bg-canvas px-4 ring-1 ring-ink/8">
      <Row label={buy ? "You pay" : "You sell"} value={buy ? formatPkr(quote.pkrPaisa) : formatGrams(quote.goldMg)} strong />
      <Row label={buy ? "You receive" : "You receive"} value={buy ? formatGrams(quote.goldMg) : formatPkr(quote.pkrPaisa)} strong />
      <Row label="Locked rate" value={`${formatPkr(quote.unitPricePaisa)} / g`} />
      <Row label="Market reference" value={`${formatPkr(quote.marketPaisa)} / g`} />
      <Row
        label="Price source"
        value={
          <>
            {SOURCE_LABEL[quote.source]} <span className="text-ink/50">· {clockTime(quote.priceFetchedAt)}</span>
          </>
        }
      />
    </dl>
  );
}

/** Paisa the user typed but is not charged, for a PKR-entered buy (gold rounds down to 1 mg). */
function roundingLeftover(quote: QuoteDto, entered: string): number {
  if (quote.side !== "buy" || quote.inputMode !== "pkr") return 0;
  try {
    return Math.max(0, parsePkr(entered) - quote.pkrPaisa);
  } catch {
    return 0;
  }
}

export function QuoteReview({
  quote,
  serverOffsetMs,
  busy,
  error,
  unsure,
  priceChange,
  enteredAmount,
  onConfirm,
  onCancel,
  onExpired,
}: {
  quote: QuoteDto;
  serverOffsetMs: number;
  busy: boolean;
  error: string | null;
  /** True when a confirm request was sent but we never heard back. Retrying is safe (idempotent). */
  unsure: boolean;
  priceChange: { from: number; to: number } | null;
  /** The raw amount the user typed, used to explain any rounding in a PKR-entered buy. */
  enteredAmount: string;
  onConfirm: () => void;
  onCancel: () => void;
  onExpired: () => void;
}) {
  const now = useNow(250);
  const total = new Date(quote.expiresAt).getTime() - new Date(quote.createdAt).getTime();
  const remaining = now == null ? total : new Date(quote.expiresAt).getTime() - (now + serverOffsetMs);
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const pct = Math.min(100, Math.max(0, (remaining / total) * 100));
  const low = seconds <= 15;
  const leftover = roundingLeftover(quote, enteredAmount);

  useEffect(() => {
    // Don't yank the screen away mid-request: the server decides the outcome of an in-flight confirm.
    if (now != null && remaining <= 0 && !busy) onExpired();
  }, [now, remaining, busy, onExpired]);

  return (
    <div className="space-y-4">
      {priceChange && (
        <Notice tone="warn" title="The price has changed">
          Your previous quote was {formatPkr(priceChange.from)} / g. The new locked rate is {formatPkr(priceChange.to)} / g. Please review before confirming.
        </Notice>
      )}

      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-ink">Review your quote</span>
          <span
            className={cx("tabular-nums font-semibold", low ? "text-[#8a2b1f]" : "text-brand")}
            role="timer"
            aria-live="off"
            aria-label={`${seconds} seconds left`}
          >
            {seconds}s left
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/8" aria-hidden>
          <div className={cx("h-full rounded-full transition-[width] duration-300 ease-linear", low ? "bg-[#c98a12]" : "bg-accent")} style={{ width: `${pct}%` }} />
        </div>
      </div>

      <QuoteSummary quote={quote} />
      <p className="text-xs leading-relaxed text-ink/55">
        This price is locked for you until the timer ends and includes our {quote.side === "buy" ? "10% buy markup" : "10% sell discount"}
        {quote.guardrailApplied ? ", raised to the minimum guardrail rate" : ""}. No other fees.
      </p>

      {leftover > 0 && (
        <Notice tone="info" title={`${formatPkr(leftover)} stays in your wallet`}>
          Gold trades in 0.001 g steps, so we rounded down to {formatGrams(quote.goldMg)} and only charge for that. You never pay more than you entered.
        </Notice>
      )}

      {unsure && (
        <Notice tone="warn" title="We didn't get a response">
          Your confirmation may have gone through. Tap confirm again — it&apos;s safe, and it can never create a second trade for this quote.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <Button onClick={onConfirm} disabled={busy || seconds === 0}>
        {busy ? "Confirming…" : unsure ? "Check & confirm again" : `Confirm ${quote.side === "buy" ? "purchase" : "sale"}`}
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={busy}>
        Change amount
      </Button>
    </div>
  );
}
