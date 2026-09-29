"use client";

import { formatGrams, formatPkr } from "@/lib/money";
import type { BalancesDto } from "./api-client";
import { Label } from "./ui";

function Tile({ label, value, hint, wide }: { label: string; value: string; hint: string; wide?: boolean }) {
  return (
    <div className={`${wide ? "col-span-2 " : ""}rounded-xl bg-white p-4 ring-1 ring-ink/8`}>
      <Label>{label}</Label>
      <p className="mt-1.5 text-lg font-semibold sm:text-xl tabular-nums text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink/50">{hint}</p>
    </div>
  );
}

export function Balances({ balances }: { balances: BalancesDto }) {
  return (
    <section aria-label="Balances" className="grid grid-cols-2 gap-3">
      <Tile wide label="Your cash" value={formatPkr(balances.customerPkrPaisa)} hint="PKR wallet" />
      <Tile label="Your gold" value={formatGrams(balances.customerGoldMg)} hint="24K holdings" />
      <Tile label="Platform inventory" value={formatGrams(balances.inventoryGoldMg)} hint="Gold available to buy" />
    </section>
  );
}
