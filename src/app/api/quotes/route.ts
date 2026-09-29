import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { createQuote } from "@/lib/trade/service";

export const dynamic = "force-dynamic";

const body = z.object({
  side: z.enum(["buy", "sell"]),
  mode: z.enum(["pkr", "gold"]),
  amount: z.string().max(32),
});

export const POST = (req: Request) =>
  handle(async () => ({ quote: await createQuote(getDb(), body.parse(await readJson(req))) }), 201);
