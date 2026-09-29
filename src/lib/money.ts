import { MG_PER_GRAM, PAISA_PER_PKR } from "./config";
import { AppError } from "./errors";

/**
 * Parse a user-typed decimal ("12,500.50") into integer minor units without floats.
 * Rejects anything with more precision than `scale` allows instead of silently rounding.
 */
export function parseDecimal(raw: string, scale: 2 | 3, label: string): number {
  const cleaned = raw.trim().replace(/,/g, "");
  const m = /^(\d{1,12})(?:\.(\d+))?$/.exec(cleaned);
  if (!m) throw new AppError("INVALID_INPUT", `Enter a valid ${label} amount.`);
  const frac = m[2] ?? "";
  if (frac.length > scale) {
    throw new AppError("INVALID_INPUT", `${label} supports at most ${scale} decimal places.`);
  }
  const units = Number(m[1]) * 10 ** scale + Number(frac.padEnd(scale, "0") || 0);
  if (!Number.isSafeInteger(units)) throw new AppError("INVALID_INPUT", `That ${label} amount is too large.`);
  return units;
}

export const parsePkr = (raw: string) => parseDecimal(raw, 2, "PKR");
export const parseGrams = (raw: string) => parseDecimal(raw, 3, "gold");

const pkrFmt = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pkrWhole = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

export const formatPkr = (paisa: number) => `PKR ${pkrFmt.format(paisa / PAISA_PER_PKR)}`;
export const formatPkrWhole = (paisa: number) => `PKR ${pkrWhole.format(paisa / PAISA_PER_PKR)}`;
export const formatGrams = (mg: number) => `${(mg / MG_PER_GRAM).toFixed(3)} g`;
