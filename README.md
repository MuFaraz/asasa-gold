# Asasa Gold

A single-user demo for buying and selling 24K gold at a live PKR/gram rate, with **75-second server-locked quotes**, visible price source and freshness, and safe, exactly-once settlement.

- Stack: Next.js 16 (App Router) · TypeScript · Tailwind v4 · Postgres (Neon) · Drizzle ORM · Zod · Vitest
- Design: Asasa palette (`#0D4A46` `#8CCB50` `#F9FAFA` `#1A1F1B`), mobile-first
- Read **[WhatIDid.md](./WhatIDid.md)** for the reasoning, assumptions, decisions and known gaps.

## Try it (as a reviewer)

1. Open the app. You start with **PKR 5,000,000**, **50 g** of gold, and a platform inventory of **1,000 g**.
2. Pick Buy or Sell, enter PKR or grams, tap **Get 75-second quote**, review, **Confirm**, and read the receipt. All three balances update.
3. Open **Demo controls** (bottom of the page) to exercise every edge case without changing code:

| Scenario | How |
|---|---|
| Primary source down → fallback used | Toggle *Simulate PakGold outage* |
| Both sources down → trading pauses | Also toggle *Simulate GoldPrice.org outage* |
| Guardrail overrides the +10% price | *Set above market (forces guardrail)*, then get a buy quote |
| Quote expires | Wait 75 s, or tap *Expire my current quote now* |
| Insufficient cash / gold / inventory | *Low cash*, *Low gold*, *Low inventory* presets |
| Double-confirm | Double-click Confirm (or `curl` the confirm endpoint twice): one trade, same receipt |
| Start over | *Reset balances & history* |

## Run locally

Requires Node 20+.

```bash
npm install

# Option A: zero-setup local Postgres (PGlite over a TCP socket)
npm run dev:db                      # terminal 1, leave running
cp .env.example .env.local          # DATABASE_URL points at it

# Option B: any Postgres, e.g. a free Neon database
# put its connection string in .env.local as DATABASE_URL

npm run db:migrate                  # applies SQL migrations + seeds balances (idempotent)
npm run dev                         # http://localhost:3000
```

Other scripts: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:generate` (after editing `src/lib/db/schema.ts`).

## Deploy (Vercel + Neon, both free)

1. Push this repo to GitHub and import it in Vercel.
2. In the Vercel project: **Storage → Create → Neon (Postgres)** and connect it to the project. This injects `DATABASE_URL`.
3. Deploy. Vercel runs the `vercel-build` script (`npm run db:migrate && next build`), so the schema and seed data are applied automatically on every deploy.

No other environment variables are needed.

## Project layout

```
src/lib/config.ts           every business constant (TTL, markup %, limits, seed balances)
src/lib/money.ts            strict decimal parsing to integer paisa / milligrams
src/lib/pricing/sources.ts  PakGold + GoldPrice.org fetchers, parsing, sanity validation
src/lib/pricing/select.ts   pure "which price can we trust?" decision + customer price derivation
src/lib/pricing/service.ts  DB-backed 5-minute throttled refresh (advisory lock)
src/lib/trade/calc.ts       integer-only trade maths
src/lib/trade/service.ts    createQuote / confirmQuote (transactional, idempotent)
src/lib/db/schema.ts        tables + CHECK/UNIQUE constraints
src/app/api/*               thin route handlers (zod-validated)
src/components/*            UI
drizzle/                    generated SQL migrations
tests/                      Vitest against a real Postgres (PGlite) using the production migrations
```
