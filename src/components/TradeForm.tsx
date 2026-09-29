"use client";

import { useId } from "react";
import { formatGrams, formatPkr, parseGrams, parsePkr } from "@/lib/money";
import { computeTrade, type InputMode, type Side } from "@/lib/trade/calc";
import type { AppState } from "./api-client";
import { Button, cx, Label, Notice } from "./ui";

export type FormValues = { side: Side; mode: InputMode; amount: string };

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-xl bg-canvas p-1 ring-1 ring-ink/8">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand",
            value === o.value ? "bg-brand text-white shadow-sm" : "text-ink/65 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Non-binding estimate using the currently displayed price; the server's quote is what counts. */
function estimate(values: FormValues, state: AppState): string | null {
  if (!state.customerPrices || !values.amount.trim()) return null;
  try {
    const units = values.mode === "pkr" ? parsePkr(values.amount) : parseGrams(values.amount);
    const price = values.side === "buy" ? state.customerPrices.buyPaisa : state.customerPrices.sellPaisa;
    const t = computeTrade(values.side, values.mode, units, price);
    if (t.goldMg <= 0 || t.pkrPaisa <= 0) return null;
    if (values.mode === "pkr") {
      return `${values.side === "buy" ? "You'd receive about" : "You'd sell about"} ${formatGrams(t.goldMg)}`;
    }
    return `${values.side === "buy" ? "You'd pay about" : "You'd receive about"} ${formatPkr(t.pkrPaisa)}`;
  } catch {
    return null;
  }
}

export function TradeForm({
  state,
  values,
  onChange,
  onSubmit,
  busy,
  error,
}: {
  state: AppState;
  values: FormValues;
  onChange: (v: FormValues) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}) {
  const inputId = useId();
  const paused = state.pricing.status === "paused";
  const { side, mode } = values;

  const fieldLabel = {
    "buy-pkr": "Amount to spend",
    "buy-gold": "Gold to buy",
    "sell-pkr": "Amount to receive",
    "sell-gold": "Gold to sell",
  }[`${side}-${mode}` as const];
  const est = estimate(values, state);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !paused) onSubmit();
      }}
    >
      <Segmented
        label="Trade direction"
        value={side}
        options={[
          { value: "buy", label: "Buy gold" },
          { value: "sell", label: "Sell gold" },
        ]}
        onChange={(v) => onChange({ ...values, side: v })}
      />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={inputId}>
            <Label>{fieldLabel}</Label>
          </label>
          <div className="w-44">
            <Segmented
              label="Enter amount in"
              value={mode}
              options={[
                { value: "pkr", label: "PKR" },
                { value: "gold", label: "Gold (g)" },
              ]}
              onChange={(v) => onChange({ ...values, mode: v, amount: "" })}
            />
          </div>
        </div>
        <div className="flex items-center rounded-xl bg-white px-4 ring-1 ring-ink/15 focus-within:ring-2 focus-within:ring-brand">
          <span className="text-base font-medium text-ink/45">{mode === "pkr" ? "PKR" : "g"}</span>
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            placeholder={mode === "pkr" ? "e.g. 100,000" : "e.g. 2.5"}
            value={values.amount}
            onChange={(e) => onChange({ ...values, amount: e.target.value.replace(/[^\d.,]/g, "") })}
            aria-describedby={`${inputId}-hint`}
            className="min-h-14 w-full bg-transparent px-3 text-2xl font-semibold tabular-nums text-ink outline-none placeholder:text-ink/25"
          />
        </div>
        <p id={`${inputId}-hint`} className="min-h-5 text-sm text-ink/60">
          {est ?? (mode === "pkr" ? "Up to 2 decimal places." : "Up to 3 decimal places (milligram precision).")}
        </p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Button type="submit" disabled={busy || paused || !values.amount.trim()}>
        {busy ? "Getting your quote…" : paused ? "Trading paused" : "Get 75-second quote"}
      </Button>
      <p className="text-center text-xs text-ink/50">Nothing is traded until you review and confirm the quote.</p>
    </form>
  );
}
