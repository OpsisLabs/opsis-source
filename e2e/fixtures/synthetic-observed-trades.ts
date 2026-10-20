import { observedTradesFixture } from "./observed-trades";

/** Synthetic UI-review capture, never imported by product code.
 * Six events respect the observation engine's maximum returned row count.
 * Addresses, quantities and times do not represent market observations.
 */
export function syntheticObservedTradesFixture() {
  const data = observedTradesFixture();
  const base = {
    address: `0x${"c1".repeat(20)}`,
    symbol: "BASE",
    decimals: 18,
    reviewed: false,
  };
  const quote = {
    address: `0x${"c2".repeat(20)}`,
    symbol: "QUOTE",
    decimals: 6,
    reviewed: false,
  };
  data.pair.base = base;
  data.pair.quote = quote;
  const values = [
    "21840.125",
    "13250.5",
    "6840.75",
    "2510.125",
    "960.25",
    "380.5",
  ];
  const seconds = [145, 250, 75, 200, 25, 280];
  data.observations = values.map((value, index) => {
    const txHash = `0x${(index + 16).toString(16).padStart(64, "0")}`;
    return {
      ...data.observations[index % 2],
      id: `${txHash}:${index}`,
      txHash,
      logIndex: index,
      baseToken: base,
      quoteToken: quote,
      baseAmount: ["8.125", "5.25", "2.625", "0.875", "0.375", "0.125"][index],
      quoteAmount: value,
      notionalQuote: value,
      blockTime: new Date(
        Date.parse(data.window.fromTime!) + seconds[index] * 1000,
      ).toISOString(),
      blockNumber: data.window.fromBlock + seconds[index] * 3,
    };
  });
  data.coverage.matchedLogs = 6;
  data.coverage.topRows = 6;
  data.privacy.providerDestinations = ["Synthetic UI-review capture"];
  data.privacy.disclosure =
    "Synthetic fixture; no provider was called and no market observation is claimed.";
  data.limitations.unshift(
    "Synthetic illustrative data for design review only.",
  );
  return data;
}
