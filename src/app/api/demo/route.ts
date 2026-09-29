import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { expireQuote, resetDemo, setBalances, setGuardrail, setSimulatedOutage } from "@/lib/demo";

export const dynamic = "force-dynamic";

const amount = z.string().max(32);
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_guardrail"), pkrPerGram: amount }),
  z.object({ action: z.literal("simulate_outage"), source: z.enum(["pakgold", "goldprice"]), down: z.boolean() }),
  z.object({ action: z.literal("set_balances"), customerPkr: amount, customerGold: amount, inventoryGold: amount }),
  z.object({ action: z.literal("expire_quote"), quoteId: z.string().uuid() }),
  z.object({ action: z.literal("reset") }),
]);

/** Demo-only controls (the assessment excludes auth/admin); see WhatIDid.md. */
export const POST = (req: Request) =>
  handle(async () => {
    const db = getDb();
    const a = action.parse(await readJson(req));
    switch (a.action) {
      case "set_guardrail":
        await setGuardrail(db, a.pkrPerGram);
        break;
      case "simulate_outage":
        await setSimulatedOutage(db, a.source, a.down);
        break;
      case "set_balances":
        await setBalances(db, a);
        break;
      case "expire_quote":
        await expireQuote(db, a.quoteId);
        break;
      case "reset":
        await resetDemo(db);
        break;
    }
    return { ok: true };
  });
