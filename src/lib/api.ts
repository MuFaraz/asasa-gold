import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";

/** Wraps a route handler so domain errors become clean, typed JSON and everything else is a safe 500. */
export async function handle<T>(fn: () => Promise<T>, okStatus = 200): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data, { status: okStatus, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(
        { error: { code: e.code, message: e.message, details: e.details } },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: e.issues[0]?.message ?? "Invalid request." } },
        { status: 400 },
      );
    }
    console.error("Unhandled API error", e);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again." } },
      { status: 500 },
    );
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("INVALID_INPUT", "Request body must be valid JSON.");
  }
}
