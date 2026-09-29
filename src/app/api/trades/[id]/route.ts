import { z } from "zod";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getTrade } from "@/lib/trade/service";

export const dynamic = "force-dynamic";

export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) =>
  handle(async () => {
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Receipt not found.");
    return { trade: await getTrade(getDb(), id) };
  });
