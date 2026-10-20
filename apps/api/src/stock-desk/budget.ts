import { AppError } from "../http/errors.js";

type Budget = { consume(units: number): Promise<void> };
/** Conservatively charged up front; unused reserved units are not refunded. */
export async function reserveBudget(
  budget: Budget,
  units: number,
): Promise<Budget> {
  await budget.consume(units);
  let remaining = units;
  return {
    async consume(value) {
      if (!Number.isInteger(value) || value <= 0 || value > remaining)
        throw new AppError(
          "STOCK_DESK_RESERVATION_EXCEEDED",
          503,
          "Stock desk scan reservation exhausted",
        );
      remaining -= value;
    },
  };
}
