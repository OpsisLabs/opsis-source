import { describe, expect, it } from "vitest";
import { datasetHash, runJointPortfolio, type ExperimentSpec, type PriceDataset } from "./index";

const spec: ExperimentSpec = { bootstrapRuns: 40, seed: 42, confidence: 0.9, researchMode: true };

function series(address: string, returns: number[], startDay = 1): PriceDataset {
  const observations = [{ date: new Date(Date.UTC(2026, 0, startDay)).toISOString().slice(0, 10), price: 100 }];
  for (const [index, value] of returns.entries()) {
    observations.push({
      date: new Date(Date.UTC(2026, 0, startDay + index + 1)).toISOString().slice(0, 10),
      price: observations[index]!.price * (1 + value),
    });
  }
  return {
    schemaVersion: 1,
    instrument: { chainId: 4663, address, symbol: address.slice(-4) },
    quoteCurrency: "USD",
    clock: "daily_crypto_24_7",
    provenance: { source: "local synthetic fixture", observedAt: "2026-04-01T00:00:00Z" },
    synthetic: true,
    observations,
  };
}

const addressA = "0x0000000000000000000000000000000000000001";
const addressB = "0x0000000000000000000000000000000000000002";
const opposite = Array.from({ length: 40 }, (_, day) => day % 2 === 0 ? 0.1 : -0.1);
const positions = () => [
  { dataset: series(addressA, opposite), weightBps: 5_000 },
  { dataset: series(addressB, opposite.map((value) => -value)), weightBps: 5_000 },
];

describe("joint portfolio bootstrap", () => {
  it("preserves same-day covariance instead of independently drawing assets", async () => {
    const input = positions();
    const result = await runJointPortfolio(input, spec);
    expect(Math.abs(result.stats.totalReturn)).toBeLessThan(1e-12);
    expect(result.stats.volatilityAnnualized).toBeLessThan(1e-12);
    expect(Object.values(result.bootstrap.terminal).every((value) => Math.abs(value - 1) < 1e-12)).toBe(true);
    expect(result.bootstrap.path.every((point) => Math.abs(point.median - 1) < 1e-12 && point.bands.every((band) => Math.abs(band.low - 1) < 1e-12 && Math.abs(band.high - 1) < 1e-12))).toBe(true);
    expect(result.manifest.inputRefs.map((ref) => ref.datasetHash)).toEqual(await Promise.all(input.map((position) => datasetHash(position.dataset))));
    expect(result.manifest.assumptions.join(" ")).toMatch(/Constant-mix.*rebalanced/);
  });

  it("repeats exactly with a seed and records the joint moving-block model", async () => {
    const input = positions();
    input[1]!.weightBps = 4_000;
    input[0]!.weightBps = 6_000;
    const block: ExperimentSpec = { ...spec, model: "historical_moving_block_bootstrap", blockLength: 5 };
    const first = await runJointPortfolio(input, block);
    const second = await runJointPortfolio(input, block);
    expect(first).toEqual(second);
    expect(first.manifest.model).toBe("joint_portfolio_moving_block_bootstrap");
    expect(first.manifest.blockLength).toBe(5);
    expect(first.bootstrap.path).toHaveLength(41);
    expect(first.bootstrap.terminal.high).toBeGreaterThan(first.bootstrap.terminal.low);
  });

  it("keeps the single-instrument GBM comparison unavailable to joint portfolios", async () => {
    await expect(runJointPortfolio(positions(), { ...spec, model: "gbm_parametric_comparison" }))
      .rejects.toThrow(/Unsupported joint portfolio bootstrap model/);
  });

  it("refuses mismatched dates, currencies, duplicate identities and invalid weights", async () => {
    const shifted = positions();
    shifted[1]!.dataset = series(addressB, opposite.map((value) => -value), 2);
    await expect(runJointPortfolio(shifted, spec)).rejects.toThrow(/align exactly/);
    const currency = positions();
    currency[1]!.dataset.quoteCurrency = "EUR";
    await expect(runJointPortfolio(currency, spec)).rejects.toThrow(/same quote currency/);
    const duplicate = positions();
    duplicate[1]!.dataset.instrument.address = addressA.toUpperCase().replace("0X", "0x");
    await expect(runJointPortfolio(duplicate, spec)).rejects.toThrow(/distinct/);
    const badWeights = positions();
    badWeights[0]!.weightBps = 5_001;
    await expect(runJointPortfolio(badWeights, spec)).rejects.toThrow(/10,000 basis points/);
  });

  it("refuses short standard history, invalid blocks and cancellation", async () => {
    await expect(runJointPortfolio(positions(), { ...spec, researchMode: false })).rejects.toThrow(/180/);
    await expect(runJointPortfolio(positions(), { ...spec, model: "historical_moving_block_bootstrap", blockLength: 31 })).rejects.toThrow(/Block length/);
    await expect(runJointPortfolio(positions(), spec, () => true)).rejects.toThrow("cancelled");
  });
});
