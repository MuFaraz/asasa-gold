"use client";

import { useState } from "react";
import { formatPkr } from "@/lib/money";
import { PAISA_PER_PKR, MG_PER_GRAM } from "@/lib/config";
import type { AppState } from "./api-client";
import { Button, cx, Label, Notice, SOURCE_LABEL } from "./ui";

const pkrStr = (paisa: number) => (paisa / PAISA_PER_PKR).toFixed(2);
const gramStr = (mg: number) => (mg / MG_PER_GRAM).toFixed(3);

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink/55">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand", checked ? "bg-brand" : "bg-ink/20")}
      >
        <span className={cx("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </label>
  );
}

/**
 * Reviewer-facing test bench. There's no auth in this project by design, so these
 * controls let anyone reproduce every edge case on the live deployment without a code change.
 */
export function DemoPanel({
  state,
  activeQuoteId,
  onChanged,
}: {
  state: AppState;
  activeQuoteId: string | null;
  onChanged: (action: Record<string, unknown>) => Promise<void>;
}) {
  const [guardrail, setGuardrail] = useState(pkrStr(state.guardrailPaisa));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { balances } = state;

  const run = async (action: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await onChanged(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const setBal = (patch: Partial<{ customerPkr: string; customerGold: string; inventoryGold: string }>) =>
    run({
      action: "set_balances",
      customerPkr: pkrStr(balances.customerPkrPaisa),
      customerGold: gramStr(balances.customerGoldMg),
      inventoryGold: gramStr(balances.inventoryGoldMg),
      ...patch,
    });

  const marketPkr = state.pricing.status === "paused" ? null : Math.round(state.pricing.marketPaisa / PAISA_PER_PKR);

  return (
    <details className="group rounded-2xl border border-dashed border-ink/25 bg-white/60">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:hidden">
        <span>
          <span className="block text-sm font-semibold text-ink">Demo controls</span>
          <span className="block text-xs text-ink/55">Test outages, expiry, low balances and the guardrail</span>
        </span>
        <span className="text-ink/40 transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>

      <div className="space-y-6 border-t border-dashed border-ink/20 px-5 py-5">
        <Notice tone="info">These controls exist only for reviewers of this demo (the brief excludes auth and admin). They change shared demo state.</Notice>
        {error && <Notice tone="error">{error}</Notice>}

        <section>
          <Label>Price sources</Label>
          <div className="divide-y divide-ink/8">
            {(["pakgold", "goldprice"] as const).map((id) => (
              <Toggle
                key={id}
                label={`Simulate ${SOURCE_LABEL[id]} outage`}
                hint={id === "pakgold" ? "Primary source: trading should switch to the fallback." : "Fallback source: turn both on to pause trading."}
                checked={state.simulation[id]}
                disabled={busy}
                onChange={(down) => run({ action: "simulate_outage", source: id, down })}
              />
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <Label>Guardrail (minimum buy price per gram)</Label>
          <div className="flex gap-2">
            <div className="flex min-h-11 flex-1 items-center rounded-xl bg-white px-3 ring-1 ring-ink/15 focus-within:ring-2 focus-within:ring-brand">
              <span className="text-sm text-ink/45">PKR</span>
              <input
                inputMode="decimal"
                value={guardrail}
                onChange={(e) => setGuardrail(e.target.value.replace(/[^\d.,]/g, ""))}
                aria-label="Guardrail in PKR per gram"
                className="w-full bg-transparent px-2 text-sm tabular-nums outline-none"
              />
            </div>
            <Button variant="secondary" className="!w-auto !min-h-11 px-4 text-sm" disabled={busy} onClick={() => run({ action: "set_guardrail", pkrPerGram: guardrail })}>
              Apply
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {marketPkr != null && (
              <Button variant="ghost" className="!w-auto !min-h-10 px-3 text-xs" disabled={busy} onClick={() => { const v = String(Math.round(marketPkr * 1.2)); setGuardrail(v); void run({ action: "set_guardrail", pkrPerGram: v }); }}>
                Set above market (forces guardrail)
              </Button>
            )}
            <Button variant="ghost" className="!w-auto !min-h-10 px-3 text-xs" disabled={busy} onClick={() => { setGuardrail("1"); void run({ action: "set_guardrail", pkrPerGram: "1" }); }}>
              Disable
            </Button>
          </div>
          <p className="text-xs text-ink/55">Current: {formatPkr(state.guardrailPaisa)} / g. Buy price = max(market × 1.10, guardrail).</p>
        </section>

        <section className="space-y-2">
          <Label>Balances</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button variant="ghost" className="!min-h-10 text-xs" disabled={busy} onClick={() => setBal({ customerPkr: "1000" })}>Low cash (PKR 1,000)</Button>
            <Button variant="ghost" className="!min-h-10 text-xs" disabled={busy} onClick={() => setBal({ customerGold: "0.5" })}>Low gold (0.5 g)</Button>
            <Button variant="ghost" className="!min-h-10 text-xs" disabled={busy} onClick={() => setBal({ inventoryGold: "1" })}>Low inventory (1 g)</Button>
          </div>
          <p className="text-xs text-ink/55">Platform cash (funds sells): {formatPkr(balances.platformPkrPaisa)}</p>
        </section>

        <section className="space-y-2">
          <Label>Quote &amp; data</Label>
          <Button variant="ghost" className="!min-h-10 text-sm" disabled={busy || !activeQuoteId} onClick={() => activeQuoteId && run({ action: "expire_quote", quoteId: activeQuoteId })}>
            Expire my current quote now
          </Button>
          <Button variant="danger" className="!min-h-10 text-sm" disabled={busy} onClick={() => run({ action: "reset" })}>
            Reset balances &amp; history
          </Button>
        </section>
      </div>
    </details>
  );
}
