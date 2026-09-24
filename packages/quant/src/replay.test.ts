import { describe, expect, it } from "vitest";
import {
  datasetHash,
  exportRun,
  runJointPortfolio,
  runQuant,
  verifyQuantExport,
  type PriceDataset,
} from "./index";

const dates = (count: number) => Array.from({ length: count }, (_, n) =>
  new Date(Date.UTC(2026, 0, n + 1)).toISOString().slice(0, 10));
function dataset(address: string, offset = 0): PriceDataset {
  return {
    schemaVersion: 1,
    instrument: { chainId: 4663, address, symbol: "TEST" },
    quoteCurrency: "USD",
    clock: "daily_crypto_24_7",
    provenance: { source: "local fixture", observedAt: "2026-09-01T00:00:00Z" },
    synthetic: true,
    observations: dates(40).map((date, n) => ({ date, price: 100 + n + offset })),
  };
}
const spec = { seed: 42, bootstrapRuns: 12, confidence: 0.9, researchMode: true } as const;
const addressA = "0x0000000000000000000000000000000000000001";
const addressB = "0x0000000000000000000000000000000000000002";

describe("Quant export replay", () => {
  it("verifies a solo export and detects changed inputs and every changed result section", async () => {
    const input = dataset(addressA);
    const run = { datasetHash: await datasetHash(input), ...runQuant(input, spec) };
    const file = { exportedAt: "2026-09-22T00:00:00.000Z", dataset: input, run };
    expect(await verifyQuantExport(file)).toMatchObject({ ok: true, kind: "single" });

    const storedRun = { ...run, dataset: input };
    const emitted = JSON.parse(exportRun(input, storedRun)) as typeof file;
    expect(emitted.run).toEqual(run);
    expect(await verifyQuantExport(emitted)).toMatchObject({ ok: true, kind: "single" });

    const legacy = { ...file, run: storedRun };
    expect(await verifyQuantExport(legacy)).toMatchObject({ ok: true, kind: "single" });
    const mismatchedLegacy = JSON.parse(JSON.stringify(legacy)) as typeof legacy;
    mismatchedLegacy.run.dataset.observations[2]!.price += 1;
    expect(await verifyQuantExport(mismatchedLegacy)).toMatchObject({ ok: false, error: expect.stringMatching(/Legacy run dataset/) });

    const changedPrice = structuredClone(file);
    changedPrice.dataset.observations[2]!.price += 1;
    expect(await verifyQuantExport(changedPrice)).toMatchObject({ ok: false });
    const changedHash = structuredClone(file);
    changedHash.run.datasetHash = "0".repeat(64);
    expect(await verifyQuantExport(changedHash)).toMatchObject({ ok: false });
    for (const edit of [
      (copy: typeof file) => { copy.run.bootstrap.path[4]!.median += 0.01; },
      (copy: typeof file) => { copy.run.bootstrap.terminal.high += 0.01; },
      (copy: typeof file) => { copy.run.stats.totalReturn += 0.01; },
    ]) {
      const changed = structuredClone(file);
      edit(changed);
      expect(await verifyQuantExport(changed)).toMatchObject({ ok: false });
    }
  });

  it("verifies joint moving-block exports using embedded weights and model", async () => {
    const datasets = [dataset(addressA), dataset(addressB, 4)];
    const specWithBlocks = { ...spec, model: "historical_moving_block_bootstrap" as const, blockLength: 3 };
    const positions = datasets.map((data, index) => ({ dataset: data, weightBps: index === 0 ? 6000 : 4000 }));
    const run = await runJointPortfolio(positions, specWithBlocks);
    const file = { exportedAt: "2026-09-22T00:00:00.000Z", datasets, run };
    expect(await verifyQuantExport(file)).toMatchObject({ ok: true, kind: "joint" });
    const changed = structuredClone(file);
    changed.run.stats.tailCount += 1;
    expect(await verifyQuantExport(changed)).toMatchObject({ ok: false });
    const changedWeight = structuredClone(file);
    changedWeight.run.manifest.inputRefs[0]!.weightBps = 5_999;
    expect(await verifyQuantExport(changedWeight)).toMatchObject({ ok: false });
    const changedDate = structuredClone(file);
    changedDate.datasets[0]!.observations[4]!.date = "2026-01-06";
    expect(await verifyQuantExport(changedDate)).toMatchObject({ ok: false });
  });

  it("replays the single-instrument GBM model and detects parameter tampering", async () => {
    const input = dataset(addressA);
    const specWithGbm = { ...spec, model: "gbm_parametric_comparison" as const };
    const run = { datasetHash: await datasetHash(input), ...runQuant(input, specWithGbm) };
    const file = { exportedAt: "2026-09-22T00:00:00.000Z", dataset: input, run };
    expect(await verifyQuantExport(file)).toMatchObject({ ok: true, kind: "single" });
    const changed = structuredClone(file);
    changed.run.manifest.estimatedParameters!.dailyLogReturnMean += 1e-6;
    expect(await verifyQuantExport(changed)).toMatchObject({ ok: false });
  });

  it("fails closed for unsupported models or versions, malformed shapes and oversized files", async () => {
    const input = dataset(addressA);
    const run = { datasetHash: await datasetHash(input), ...runQuant(input, spec) };
    const file = { exportedAt: "2026-09-22T00:00:00.000Z", dataset: input, run };
    expect(await verifyQuantExport({ ...file, run: { ...run, manifest: { ...run.manifest, model: "future_model" } } })).toMatchObject({ ok: false, error: expect.stringMatching(/Unsupported Quant model/) });
    expect(await verifyQuantExport({ ...file, run: { ...run, manifest: { ...run.manifest, modelVersion: "2" } } })).toMatchObject({ ok: false, error: expect.stringMatching(/version/) });
    expect(await verifyQuantExport({ ...file, extra: true })).toMatchObject({ ok: false });
    expect(await verifyQuantExport({ ...file, dataset: { ...input, observations: "bad" } })).toMatchObject({ ok: false });
    expect(await verifyQuantExport({ ...file, dataset: { ...input, invented: true } })).toMatchObject({ ok: false });
    expect(await verifyQuantExport({ exportedAt: "2026-09-22", dataset: input, run, padding: "x".repeat(8 * 1024 * 1024) })).toMatchObject({ ok: false });
  });
});
