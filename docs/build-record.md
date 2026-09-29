# Build record

**Project:** Asasa Gold, a single-user gold trading demo (Founding Engineer practical assessment)
**Tool:** Claude Code (VS Code extension), one continuous session
**Live:** https://asasa-gold-gamma.vercel.app · **Repo:** https://github.com/MuFaraz/asasa-gold

## About this document

The assessment asks for the coding-agent transcript. The complete, unedited transcript is in
[build-record-transcript.md](./build-record-transcript.md). Secrets are redacted and long tool
outputs are truncated, but nothing else is removed. Dead ends are left in.

I wrote to the agent in Roman Urdu / Hinglish, which is hard to skim. This page is a structured English
account of the same session: what I asked, what the agent did, what went wrong, and how it was
resolved. Prompts are translated faithfully, not embellished. Anything here can be checked against the raw transcript.

## How I worked with the agent

1. **Understand first, build second.** I told the agent to read the brief and settle the stack and architecture before writing code.
2. **I made the technology decisions.** The agent recommended; I asked questions until I was comfortable, then chose.
3. **Verify, don't trust.** Every claim was checked by tests, real HTTP calls against the deployed app, and scripted browser runs at a phone viewport.
4. **I reviewed the result as a user.** My own use of the live app found a real UX gap (see the rounding question below).

## Timeline

### 1. Reading the brief and choosing an approach
**My prompt (translated):** "I received an assessment and want to do proper work, follow best practice on everything, and decide the stack and architecture first. The requirements are in the attached PDF. Understand it before you start."

- The PDF could not be rendered (no `pdftoppm` on my machine). The agent fell back to extracting the text with a Python library instead.
- It summarised the brief back to me: wallets and balances, the five-step trade journey, the pricing rules (PakGold primary, GoldPrice.org fallback, 5-minute fetch limit, buy at `max(market × 1.10, guardrail)`, sell at `market × 0.90`), the trust requirements, and the submission format.
- **Before proposing a design it probed both price sources.** GoldPrice.org returned `Forbidden` to a bare request and worked once browser-like headers were added. For PakGold it found the JSON endpoint the site itself uses (`/webapi/pgr/GoldRate`) and confirmed that dividing the per-tola figure by 11.6638 reproduces the per-gram price shown on their page.
- It proposed Next.js + TypeScript on Vercel with Postgres, and listed four open questions (deploy accounts, guardrail meaning, seed balances, design system).

### 2. Database decision (my questions, three rounds)
- **Me:** "Whatever is free. I already run on Vercel. What is Postgres (Neon) + Drizzle? Tell me what is best first."
- The agent explained: Postgres is the database, Neon hosts it free and plugs into Vercel, Drizzle is a typed query and migration layer. It explained why state cannot live in memory or files on serverless.
- **Me:** "Are Neon and these things required? Can't we use MySQL? I think deployment will be a problem."
- The agent compared options: SQLite/JSON files do not survive on Vercel; free MySQL hosting is unreliable; Neon is free and integrates in one click.
- **I interrupted a scaffold command** to ask a further question: "Why not Firebase? Explain first, because I may be asked about this."
- The agent gave a fair comparison. Firestore transactions could do the job, but for money, database-enforced constraints (`CHECK balance >= 0`, `UNIQUE` on the settled quote) and row locks are a stronger fit.
- **Decision (mine):** Neon Postgres + Drizzle.

### 3. Building the core
The agent scaffolded the app and wrote the domain layer first, then the API, then the UI.

Design decisions made along the way (all documented in `WhatIDid.md`):
- Money is stored as integer paisa and milligrams. No floats touch money.
- The server owns the quote. Confirmation only takes a quote id and always settles at the locked price.
- Confirmation is idempotent through a row lock on the quote plus a `UNIQUE` constraint on the trade's quote id.
- The 5-minute upstream limit is enforced in the database (per-source attempt time plus an advisory lock), so it holds across serverless instances. Failed attempts count too.
- Source trust is a single pure function: primary if fresh, else fallback, else paused. It also pauses if two healthy sources disagree by more than 5%.
- Demo controls (simulate outage, set guardrail, expire quote, low balances, reset) let a reviewer exercise every stress case without redeploying.

### 4. Dead ends and fixes during the build

| What went wrong | What happened | Resolution |
|---|---|---|
| A large shell heredoc failed with a quoting error | No files were written | Re-created the files with the file-writing tool instead of shell heredocs |
| `create-next-app` had already run from an interrupted attempt | Folder existed and blocked a second scaffold | Inspected it, kept the existing scaffold |
| The test suite failed once with a database-init error | Each test booted its own in-memory Postgres (WASM) and ran out of resources | Shared one instance per test file and truncated between tests |
| Tests crashed again later with out-of-memory | Dev servers and a headless browser were consuming RAM | Stopped background processes; set tests to run one file at a time so this is stable on smaller machines |
| The agent stopped **all** `node` and `msedge` processes to free memory | This may have closed unrelated processes of mine | The agent flagged this to me as its own mistake |
| Dev servers vanished between tool calls | Background processes started with `&` were killed when the call ended | Restarted them as proper background tasks |
| Layout on mobile put the trade form below the rate, balances and history | Poor mobile flow | Reordered so mobile reads rate → balances → trade → history, while desktop keeps two columns |
| The "Live" status pill was unreadable | Dark text on a dark card | Switched pill colours for the dark background |
| "Expire my quote now" did nothing visible | Client kept counting down its own timer | The client now moves to the expired state immediately when the server expires the quote |
| `next lint` rejected JSX inside `try/catch` | React lint rule | Moved data loading out of the render path |

### 5. Deployment
**My prompt:** "Can you deploy to Vercel yourself? Then do it."

- The Vercel CLI was not installed. The agent ran it through `npx` and started the login; I approved the device sign-in in my browser.
- The CLI linked the project and reported that a GitHub repository was already connected, which I had created and pushed myself in the meantime.
- Provisioning Neon required accepting marketplace terms. The agent **stopped and asked me to accept them in the browser** rather than working around it. I did, and the agent retried.
- The linking step edited `.gitignore` in a way that would have ignored `.env.example`, and the Neon setup dropped extra agent-skill files into the project. The agent removed both.
- Deployed to production. Migrations and seed data run automatically in the build.
- Checked immediately after: the site was public, both price sources answered from Vercel's network, and 8 parallel confirm requests against the live Neon database created exactly one trade.

### 6. Full re-test against the brief
**My prompt (translated):** "Test everything once more against the requirements, and slightly change the code so it doesn't look AI-made, but don't break anything."

- The agent ran a 42-check script against the **live** deployment covering each requirement: seed state, live rate and freshness, pricing formulas, the 5-minute limit, 75-second TTL, settlement and balance conservation, concurrent confirmation, expiry, insufficient cash/gold/inventory, guardrail, fallback and pause, and input validation.
- First run: 38 passed, 4 failed. The four failures were a timing artefact in the test script (an upstream refresh legitimately became due mid-run, and the script compared against stale state), not a product bug. The agent explained this, fixed the script, and the second run passed 42/42. A browser run at a 390 px viewport passed too.
- **On disguising AI authorship:** the agent declined to alter the code in order to hide that it was AI-assisted, pointing out that the assessment explicitly allows AI tools and asks for the transcript. I then confirmed: "If the assessment says AI tools are allowed, there is no need to remove anything." The code was left as written.
- One real UI polish issue surfaced in the mobile screenshots (rate-tile text wrapping) and was fixed and redeployed.

### 7. A bug report from my own testing
**My message:** I entered PKR 5,000,000 (my full wallet) and requested a quote. "You pay" was slightly less, and after the purchase a small amount remained. "Is this correct according to the requirement, or is the calculation wrong?"

- The agent worked through the numbers: at PKR 41,141.59/g the money buys 121.5313… g. Gold trades in 0.001 g steps, so the quote rounds down to **121.531 g** and charges only for that (PKR 4,999,978.58). The remainder, **PKR 21.42**, is less than the price of 1 mg (PKR 41.14) and stays in the wallet.
- Conclusion: the calculation was correct and safe (never charges more than entered, never charges for gold not delivered). **The UI failed to explain it.**
- Fix: the quote screen now shows "PKR 21.42 stays in your wallet" with the reason. It was redeployed and re-verified live with the same 5,000,000 scenario.

### 8. Submission materials
- Wrote the submission email, then this build record. I asked for the record to be in proper English, which is why this page exists alongside the raw transcript.
- Converted the session log to Markdown with automatic redaction of connection strings, tokens, one-time login codes and personal email, then scanned the output for leftovers before committing.

## Outcome

- **Automated tests:** 36 (pricing parsing, source selection, throttling, guardrail, trade maths, insufficient balances, expiry boundary, idempotency including concurrent confirms, conservation of totals, reset).
- **Live verification:** 42 requirement checks and scripted mobile browser runs against the deployed app.
- **Known gaps** are listed honestly in `WhatIDid.md`: shared unauthenticated demo state, unofficial price endpoints, and concurrency proven manually on Neon rather than in CI.
