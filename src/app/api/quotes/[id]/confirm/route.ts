import { z } from "zod";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { confirmQuote } from "@/lib/trade/service";

export const dynamic = "force-dynamic";

/** Idempotent: repeating this call for the same quote returns the same receipt and never a second trade. */
export const POST = (_req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new AppError("QUOTE_NOT_FOUND", "Unknown quote.");
    return confirmQuote(getDb(), id);
  });
