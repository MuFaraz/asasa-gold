import { MG_PER_GRAM } from "../config";

export type Side = "buy" | "sell";
export type InputMode = "pkr" | "gold";

/**
 * Integer-only trade maths. `unitPricePaisa` is paisa per gram; gold is in mg.
 * Every rounding decision goes in the platform's favour, and the customer always
 * pays/receives exactly what the quote shows (no hidden second rounding).
 */
export function computeTrade(
  side: Side,
  mode: InputMode,
  amountUnits: number, // paisa when mode='pkr', mg when mode='gold'
  unitPricePaisa: number,
): { pkrPaisa: number; goldMg: number } {
  if (mode === "pkr") {
    if (side === "buy") {
      // Spend at most the entered PKR: round gold DOWN, then charge for exactly that gold (<= entered).
      const goldMg = Math.floor((amountUnits * MG_PER_GRAM) / unitPricePaisa);
      return { goldMg, pkrPaisa: Math.ceil((goldMg * unitPricePaisa) / MG_PER_GRAM) };
    }
    // Customer wants to receive exactly this PKR: sell enough gold to cover it (round UP).
    return { pkrPaisa: amountUnits, goldMg: Math.ceil((amountUnits * MG_PER_GRAM) / unitPricePaisa) };
  }
  const value = (amountUnits * unitPricePaisa) / MG_PER_GRAM;
  return { goldMg: amountUnits, pkrPaisa: side === "buy" ? Math.ceil(value) : Math.floor(value) };
}
