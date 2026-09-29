# What I did

## How I understood the assignment

Build a small but *trustworthy* gold trading demo: one user, three balances (customer PKR, customer gold, platform gold inventory), a live 24K PKR/gram rate, and a five-step journey — see price and its source → enter PKR or gold → review a 75-second locked quote → confirm once → receipt with updated balances. The brief stresses trust: show where the price came from and how fresh it is, and behave sensibly when data is missing, balances are short, quotes expire, or Confirm is pressed twice. I treated "coherent and finished" as more important than extra features, and made every stress case reproducible by a reviewer on the deployed app.

## Assumptions

- **Customer price direction.** "Customer buys" = the customer buys gold from the platform at `max(market × 1.10, guardrail)`; "customer sells" = customer sells gold to the platform at `market × 0.90`.
- **Guardrail.** The brief gives no value. I treat it as a minimum *buy* price per gram, default **PKR 40,000/g** (below today's marked-up price, so it only binds when the market drops or a reviewer raises it). It is editable from the demo panel. It never affects the sell price.
- **Platform also has cash.** To keep the system closed (no money created or destroyed) the platform holds a PKR balance (seeded PKR 50M) that receives buy payments and funds sell payouts. A sell can therefore also fail with "platform cannot pay out".
- **Seed data.** Customer PKR 5,000,000 · gold 50 g · platform inventory 1,000 g. Limits: min PKR 500 / 0.1 g, max PKR 100M / 10 kg per order.
- **Which PakGold number.** PakGold publishes several rates; I use its 24K "Rawa" (Rawalpindi/Islamabad sarafa) sell rate per tola, converted with 11.6638 g/tola — this reproduces the per-gram figure on their own page. GoldPrice.org gives XAU in PKR per troy ounce, converted with 31.1035 g/oz.
- **"Market reference" is per source.** The two sources measure slightly different things (local sarafa vs. spot; ~0.8% apart today), so I show the chosen source explicitly instead of blending.

## What I built

- **Live rate card** with source, "updated N min ago" and clock time, a Live / Backup source / Paused status, and an expandable panel showing both sources' health.
- **Trade flow** with Buy/Sell, PKR or gold input, an indicative preview, then a server-issued locked quote with a live countdown, price source/time, and a clear summary; confirm → receipt with balances after the trade; recent-trades list.
- **Pricing pipeline** on the server: PakGold first, GoldPrice.org as fallback, every upstream hit at most once per source per 5 minutes across all serverless instances, values validated (finite, within a sane band), sources cross-checked, and trading paused if neither can be trusted.
- **Safe settlement**: one database transaction that locks the quote and both accounts, re-checks balances, moves cash and gold, and writes the trade.
- **Reviewer demo controls** (source outages, guardrail, low balances, expire-quote, reset).
- **36 automated tests** running against a real Postgres (PGlite) with the production migrations.

## Key decisions

| Decision | Why |
|---|---|
| **Postgres (Neon) + Drizzle** rather than Firestore/KV/files | Money wants constraints and row locks. `CHECK (balance >= 0)` makes a negative balance impossible even if code is wrong; `UNIQUE(trades.quote_id)` makes a second trade for a quote impossible. Vercel's filesystem/memory is ephemeral, so state must live in a real DB. Neon is free and one-click on Vercel. |
| **Integer money everywhere** (paisa, milligrams) | No float drift. Input is parsed from strings and rejects excess precision instead of silently rounding. Rounding always favours the platform, and the customer pays/receives exactly what the quote shows. |
| **Server owns the quote** | The client can't influence price or expiry. Confirm takes only a quote id and always settles at the locked price — it never re-prices. If the quote has expired, the user gets a clear message and a one-tap new quote that explicitly says if the price moved. |
| **Idempotent confirm** | `confirmQuote` locks the quote row (`SELECT … FOR UPDATE`); a concurrent or repeated confirm waits, sees the finished trade, and returns the **same receipt** (`replayed: true`). The UI also disables the button, and network-timeout retries are safe. |
| **Price throttle in the database** | A per-source `last_attempt_at` plus a transaction-scoped advisory lock enforce "at most once per 5 min" across all serverless instances. Failed attempts count too, so an outage can't cause a retry storm. |
| **Trust rules are one pure function** (`selectPricing`) | Primary if fresh (≤15 min), else fallback, else paused; also paused if healthy sources disagree by >5%. Easy to read and unit-test. |
| **Simulated outages act at selection time** | The demo toggle marks a source unusable without calling upstream, so reviewers can test failover instantly and the 5-minute rule is never bypassed. |
| **Pause blocks confirm too** | If pricing becomes untrusted while a quote is open, confirming is blocked (the quote isn't lost; it just expires). I preferred safety to honouring a quote on stale data. An already-settled quote can always be re-fetched as a receipt. |
| **PGlite for tests and optional local dev** | Real Postgres semantics, no Docker or account needed by reviewers. |

## How I verified it

- `npm test` — pricing parsers/selection/throttling, guardrail, trade maths, insufficient cash/gold/inventory (including a balance change *after* quoting), expiry at exactly 75 s, demo expire, idempotent confirm (sequential, after expiry, and 8 concurrent), conservation of total PKR and gold across every trade, reset.
- Deployed to Vercel + Neon and fired 8 parallel confirm requests at the live URL: exactly one trade was created and all 8 responses returned the same receipt. Both real upstream sources (PakGold, GoldPrice.org) answered from Vercel's network.
- Drove the UI in a headless browser at a 390 px mobile viewport through buy, double-click confirm, receipt, insufficient gold, expiry, fallback and paused states.

## Known gaps

- **Demo controls and state are global and unauthenticated** (the brief excludes auth/admin). Anyone with the link shares one wallet and can reset it.
- **Upstream endpoints are unofficial.** PakGold's JSON and GoldPrice.org's `dbXRates` feed are the ones their websites use; they have no SLA or documented terms and could change or block datacenter IPs. If both fail the product pauses honestly rather than guessing.
- **PakGold "rawa" is a local market rate**, not spot; a production system would agree the exact reference price with the business.
- **Unit-level concurrency tests run on PGlite**, which serialises on one connection. To cover real lock contention I also fired 8 parallel confirms at the deployed app (Neon Postgres): 8 responses, 1 trade, 1 receipt, balances charged once. That check is manual; I would automate it in CI with a multi-connection test.
- No Playwright/e2e suite is committed (I verified the UI by scripted browser runs), no rate limiting, no i18n (Urdu), and times display in the viewer's locale.
- Only the most recent five trades are listed.
