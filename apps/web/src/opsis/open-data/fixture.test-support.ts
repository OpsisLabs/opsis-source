import type { OpenDataset } from "@rh-chain/shared";
export const dataset: OpenDataset = {
  id: "example_swaps",
  title: "Example Swaps",
  source: "Synthetic local fixture",
  chain: { id: 4663, name: "Robinhood Chain" },
  range: { kind: "block", from: "100", to: "101" },
  rowCount: 2,
  fileName: "example_swaps.parquet",
  sha256: "0".repeat(64),
  generatedAt: "2026-10-19T00:00:00.000Z",
  codeSha: "0".repeat(40),
  limitations: ["Example only"],
};
