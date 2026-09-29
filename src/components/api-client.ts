import type { AppState } from "@/lib/state";
import type { BalancesDto, ConfirmResult, QuoteDto } from "@/lib/trade/service";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** `network` means we never got an answer, so the outcome of a write is unknown and must be retried safely. */
export const isNetworkError = (e: unknown) => e instanceof ApiError && e.code === "NETWORK";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json" } });
  } catch {
    throw new ApiError("NETWORK", "Couldn't reach the server. Check your connection.", 0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(json?.error?.code ?? "INTERNAL", json?.error?.message ?? "Something went wrong.", res.status);
  }
  return json as T;
}

const post = <T>(url: string, body?: unknown) =>
  request<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  state: () => request<AppState>("/api/state"),
  quote: (input: { side: "buy" | "sell"; mode: "pkr" | "gold"; amount: string }) =>
    post<{ quote: QuoteDto }>("/api/quotes", input).then((r) => r.quote),
  confirm: (quoteId: string) => post<ConfirmResult>(`/api/quotes/${quoteId}/confirm`),
  demo: (body: Record<string, unknown>) => post<{ ok: true }>("/api/demo", body),
};

export type { AppState, BalancesDto, ConfirmResult, QuoteDto };
