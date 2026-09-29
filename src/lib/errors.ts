export type ErrorCode =
  | "INVALID_INPUT"
  | "AMOUNT_TOO_SMALL"
  | "AMOUNT_TOO_LARGE"
  | "PRICING_UNAVAILABLE"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_GOLD"
  | "INSUFFICIENT_INVENTORY"
  | "INSUFFICIENT_PLATFORM_CASH"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_EXPIRED"
  | "NOT_FOUND";

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  AMOUNT_TOO_SMALL: 422,
  AMOUNT_TOO_LARGE: 422,
  PRICING_UNAVAILABLE: 503,
  INSUFFICIENT_FUNDS: 422,
  INSUFFICIENT_GOLD: 422,
  INSUFFICIENT_INVENTORY: 422,
  INSUFFICIENT_PLATFORM_CASH: 422,
  QUOTE_NOT_FOUND: 404,
  QUOTE_EXPIRED: 410,
  NOT_FOUND: 404,
};

/** A domain error that is safe to show to the user. Anything else is a 500. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}
