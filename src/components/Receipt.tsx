"use client";

import { formatGrams, formatPkr } from "@/lib/money";
import type { ConfirmResult } from "./api-client";
import { Button, dateTime, Notice, SOURCE_LABEL } from "./ui";
import { Row } from "./QuoteReview";

export function Receipt({ result, onDone }: { result: ConfirmResult; onDone: () => void }) {
  const { trade, replayed } = result;
  const buy = trade.side === "buy";
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-full bg-accent text-ink" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <div>
          <h2 className="text-lg font-semibold text-ink">{buy ? "Purchase complete" : "Sale complete"}</h2>
          <p className="text-sm text-ink/60">Receipt {trade.receiptNo}</p>
        </div>
      </div>

      {replayed && (
        <Notice tone="info" title="Already confirmed">
          This quote was settled earlier. Here is the original receipt — you were not charged twice.
        </Notice>
      )}

      <dl className="divide-y divide-ink/8 rounded-xl bg-canvas px-4 ring-1 ring-ink/8">
        <Row label={buy ? "Paid" : "Received"} value={formatPkr(trade.pkrPaisa)} strong />
        <Row label={buy ? "Gold received" : "Gold sold"} value={formatGrams(trade.goldMg)} strong />
        <Row label="Rate" value={`${formatPkr(trade.unitPricePaisa)} / g`} />
        <Row label="Price source" value={SOURCE_LABEL[trade.source]} />
        <Row label="Settled" value={dateTime(trade.createdAt)} />
      </dl>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/55">Balances after this trade</p>
        <dl className="divide-y divide-ink/8 rounded-xl bg-canvas px-4 ring-1 ring-ink/8">
          <Row label="Your cash" value={formatPkr(trade.customerPkrAfter)} />
          <Row label="Your gold" value={formatGrams(trade.customerGoldAfter)} />
          <Row label="Platform inventory" value={formatGrams(trade.inventoryGoldAfter)} />
        </dl>
      </div>

      <Button onClick={onDone}>Make another trade</Button>
    </div>
  );
}
