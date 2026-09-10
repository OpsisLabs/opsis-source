import type { ScoutSwapQuote } from "../swap/api";
import { translateCurrent } from "../i18n/translate";
const SCALE = 10n ** 18n;
export function units(value: string): bigint {
  if (!/^(0|[1-9]\d{0,30})(\.\d{1,18})?$/.test(value)) throw new Error(translateCurrent("trade.error.invalidDecimal"));
  const [whole, part = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(part.padEnd(18, "0"));
}
export function decimal(value: bigint): string {
  const whole = value / SCALE;
  const part = (value % SCALE).toString().padStart(18, "0").replace(/0+$/, "");
  return part ? `${whole}.${part}` : whole.toString();
}
export function scenario(quote: ScoutSwapQuote, weth: string, usdg: string, wethReference: string, now = Date.now()) {
  if (!Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= now || Date.parse(quote.quotedAt) > now + 5000) throw new Error(translateCurrent("trade.error.quoteExpiredOrInvalid"));
  if (quote.simulation.status === "failed") throw new Error(translateCurrent("trade.error.simulationFailed"));
  const balances = { WETH: units(weth), USDG: units(usdg) };
  const before = { ...balances };
  const input = units(quote.input.amount), output = units(quote.output.amount), minimum = units(quote.output.minimumReceived);
  const reference = units(wethReference);
  if (input <= 0n || reference <= 0n || minimum > output) throw new Error(translateCurrent("trade.error.invalidBounds"));
  if (balances[quote.input.symbol] < input) throw new Error(translateCurrent("trade.error.insufficientBalance"));
  balances[quote.input.symbol] -= input;
  balances[quote.output.symbol] += output;
  const worst = { ...balances, [quote.output.symbol]: balances[quote.output.symbol] - output + minimum };
  const allocation = (values: typeof balances) => {
    const wethValue = values.WETH * reference / SCALE;
    const total = wethValue + values.USDG;
    return { totalUsdg: decimal(total), wethPercent: total ? `${wethValue * 10000n / total / 100n}.${(wethValue * 10000n / total % 100n).toString().padStart(2, "0")}` : "0.00" };
  };
  return { before: { WETH: decimal(before.WETH), USDG: decimal(before.USDG), ...allocation(before) }, after: { WETH: decimal(balances.WETH), USDG: decimal(balances.USDG), ...allocation(balances) }, minimum: { WETH: decimal(worst.WETH), USDG: decimal(worst.USDG), ...allocation(worst) } };
}
