"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatGrams, formatPkr } from "@/lib/money";
import { api, ApiError, isNetworkError, type AppState, type ConfirmResult, type QuoteDto } from "./api-client";
import { Balances } from "./Balances";
import { DemoPanel } from "./DemoPanel";
import { PausedBanner, RateCard } from "./RateCard";
import { QuoteReview, QuoteSummary } from "./QuoteReview";
import { Receipt } from "./Receipt";
import { TradeForm, type FormValues } from "./TradeForm";
import { Button, Card, dateTime, Notice } from "./ui";

type Flow =
  | { step: "form" }
  | { step: "quote"; quote: QuoteDto; priceChange: { from: number; to: number } | null }
  | { step: "expired"; quote: QuoteDto }
  | { step: "receipt"; result: ConfirmResult };

const POLL_MS = 20_000;

export function TradingApp({ initial }: { initial: AppState }) {
  const [state, setState] = useState(initial);
  const [offset, setOffset] = useState(() => new Date(initial.serverNow).getTime() - Date.now());
  const [flow, setFlow] = useState<Flow>({ step: "form" });
  const [values, setValues] = useState<FormValues>({ side: "buy", mode: "pkr", amount: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsure, setUnsure] = useState(false);
  const confirming = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.state();
      setState(next);
      setOffset(new Date(next.serverNow).getTime() - Date.now());
    } catch {
      /* keep showing the last known state; the next poll will retry */
    }
  }, []);

  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && void refresh();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const requestQuote = async (previous?: QuoteDto) => {
    setBusy(true);
    setError(null);
    try {
      const quote = await api.quote({ side: values.side, mode: values.mode, amount: values.amount });
      setUnsure(false);
      const changed = previous && previous.unitPricePaisa !== quote.unitPricePaisa;
      setFlow({ step: "quote", quote, priceChange: changed ? { from: previous.unitPricePaisa, to: quote.unitPricePaisa } : null });
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get a quote.");
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (quote: QuoteDto) => {
    if (confirming.current) return; // belt and braces: server is idempotent anyway
    confirming.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.confirm(quote.id);
      setUnsure(false);
      setState((s) => ({ ...s, balances: result.balances }));
      setFlow({ step: "receipt", result });
      void refresh();
    } catch (e) {
      if (isNetworkError(e)) {
        setUnsure(true);
      } else if (e instanceof ApiError && e.code === "QUOTE_EXPIRED") {
        setFlow({ step: "expired", quote });
      } else {
        setError(e instanceof Error ? e.message : "Couldn't confirm the trade.");
      }
      void refresh();
    } finally {
      confirming.current = false;
      setBusy(false);
    }
  };

  const reset = () => {
    setFlow({ step: "form" });
    setError(null);
    setUnsure(false);
    setValues((v) => ({ ...v, amount: "" }));
  };

  const onExpired = useCallback(() => {
    setFlow((f) => (f.step === "quote" ? { step: "expired", quote: f.quote } : f));
  }, []);

  const activeQuoteId = flow.step === "quote" ? flow.quote.id : null;
  const runDemo = useCallback(
    async (action: Record<string, unknown>) => {
      await api.demo(action);
      if (action.action === "reset") setFlow({ step: "form" });
      if (action.action === "expire_quote") onExpired();
      await refresh();
    },
    [refresh, onExpired],
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      <header className="mb-5 flex items-center gap-3 sm:mb-7">
        <span className="grid size-9 place-items-center rounded-xl bg-brand text-accent" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M12 2.5l2.4 5.4 5.9.6-4.4 3.9 1.3 5.8L12 15.2 6.8 18.2l1.3-5.8L3.7 8.5l5.9-.6L12 2.5z" /></svg>
        </span>
        <div className="leading-tight">
          <h1 className="text-lg font-semibold text-ink">Asasa Gold</h1>
          <p className="text-xs text-ink/55">Buy and sell 24K gold at a locked price</p>
        </div>
        <span className="ml-auto rounded-full bg-ink/6 px-2.5 py-1 text-xs font-medium text-ink/60">Demo</span>
      </header>

      {/* Mobile: one column in reading order (rate, balances, trade, history). Desktop: two columns. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-6">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-1"><RateCard state={state} /></div>
          <div className="order-2"><Balances balances={state.balances} /></div>
          <div className="order-4"><RecentTrades trades={state.recentTrades} /></div>
        </div>

        <div className="contents lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-5">
          <div className="order-3 space-y-5">
            <PausedBanner state={state} />
            <Card>
              {flow.step === "form" && (
                <TradeForm state={state} values={values} onChange={setValues} onSubmit={() => void requestQuote()} busy={busy} error={error} />
              )}
              {flow.step === "quote" && (
                <QuoteReview
                  quote={flow.quote}
                  serverOffsetMs={offset}
                  busy={busy}
                  error={error}
                  unsure={unsure}
                  priceChange={flow.priceChange}
                  onConfirm={() => void confirm(flow.quote)}
                  onCancel={reset}
                  onExpired={onExpired}
                />
              )}
              {flow.step === "expired" && (
                <div className="space-y-4">
                  <Notice tone="warn" title="This quote expired">
                    Quotes are locked for 75 seconds. Nothing was traded and your balances are unchanged. Get a fresh quote to continue — you&apos;ll see if the price moved.
                  </Notice>
                  <QuoteSummary quote={flow.quote} />
                  {error && <Notice tone="error">{error}</Notice>}
                  <Button onClick={() => void requestQuote(flow.quote)} disabled={busy}>
                    {busy ? "Getting a new quote…" : "Get a new quote"}
                  </Button>
                  <Button variant="ghost" onClick={reset} disabled={busy}>Change amount</Button>
                </div>
              )}
              {flow.step === "receipt" && <Receipt result={flow.result} onDone={reset} />}
            </Card>
          </div>
          <div className="order-5"><DemoPanel state={state} activeQuoteId={activeQuoteId} onChanged={runDemo} /></div>
        </div>
      </div>
    </main>
  );
}

function RecentTrades({ trades }: { trades: AppState["recentTrades"] }) {
  return (
    <section aria-label="Recent trades">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/55">Recent trades</h2>
      {trades.length === 0 ? (
        <p className="rounded-xl bg-white px-4 py-5 text-sm text-ink/55 ring-1 ring-ink/8">No trades yet. Your first receipt will appear here.</p>
      ) : (
        <ul className="divide-y divide-ink/8 overflow-hidden rounded-xl bg-white ring-1 ring-ink/8">
          {trades.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {t.side === "buy" ? "Bought" : "Sold"} {formatGrams(t.goldMg)}
                </p>
                <p className="truncate text-xs text-ink/50">
                  {t.receiptNo} · {dateTime(t.createdAt)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{t.side === "buy" ? "−" : "+"}{formatPkr(t.pkrPaisa)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
