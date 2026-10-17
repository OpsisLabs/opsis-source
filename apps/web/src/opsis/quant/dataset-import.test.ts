import { describe, expect, it } from "vitest";
import { datasetHash, exportRun, runQuant, validateDataset, type PriceDataset } from "@rh-chain/quant";
import { buildImportedDataset, datasetDiagnosticChinese, type DatasetImport } from "./dataset-import";

const now = new Date("2026-09-01T00:00:00Z");
const observations = Array.from({ length: 190 }, (_, index) => ({
  date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
  price: 100 + index,
}));
const file: DatasetImport = {
  text: `date,price\n${observations.map(({ date, price }) => `${date},${price}`).join("\n")}`,
  csv: true,
  observedAt: now.toISOString(),
};
const metadata: Omit<PriceDataset, "observations"> = {
  schemaVersion: 1,
  instrument: { chainId: 4663, address: `0x${"1".repeat(40)}`, symbol: "FIRST" },
  quoteCurrency: "USD",
  clock: "daily_crypto_24_7",
  provenance: { source: "Synthetic test observations", observedAt: file.observedAt },
};

describe("Quant dataset import data path", () => {
  it("revalidates a file selected before metadata, then uses edits in Run and Export", async () => {
    const invalid = buildImportedDataset(file, { ...metadata, instrument: { ...metadata.instrument, address: "", symbol: "" } }, now);
    expect(invalid.dataset).toBeNull();
    expect(invalid.error).toContain("Instrument needs");
    const first = buildImportedDataset(file, metadata, now);
    expect(first.error).toBe("");
    const editedMetadata = {
      ...metadata,
      instrument: { chainId: 1, address: `0x${"2".repeat(40)}`, symbol: "SECOND" },
      quoteCurrency: "EUR",
      provenance: { ...metadata.provenance, source: "Revised synthetic observations" },
    };
    const edited = buildImportedDataset(file, editedMetadata, now);
    expect(edited.error).toBe("");
    const dataset = edited.dataset!;
    expect(dataset).toMatchObject(editedMetadata);
    expect(dataset.observations).toEqual(observations);
    expect(validateDataset(dataset, now, { minimumReturns: 180 }).ok).toBe(true);
    const hash = await datasetHash(dataset);
    expect(hash).not.toBe(await datasetHash(first.dataset!));
    const run = { ...runQuant(dataset, { bootstrapRuns: 10, seed: 42, confidence: 0.9, researchMode: false }), datasetHash: hash };
    const exported = JSON.parse(exportRun(dataset, run));
    expect(exported.dataset).toMatchObject(editedMetadata);
    expect(exported.run.datasetHash).toBe(hash);
    const invalidAgain = buildImportedDataset(file, { ...editedMetadata, instrument: { ...editedMetadata.instrument, chainId: 0 } }, now);
    expect(invalidAgain.dataset).toBeNull();
    expect(invalidAgain.error).toContain("Instrument needs");
  });

  it("keeps JSON's metadata authoritative and refuses malformed files", () => {
    const json = { ...file, csv: false, text: JSON.stringify({ ...metadata, observations }) };
    expect(buildImportedDataset(json, { ...metadata, quoteCurrency: "EUR" }, now).dataset?.quoteCurrency).toBe("USD");
    expect(buildImportedDataset({ ...json, text: "{" }, metadata, now).error).toContain("Could not parse JSON");
    expect(buildImportedDataset({ ...file, text: "bad,header\n1,2" }, metadata, now).dataset).toBeNull();
  });

  it("explains all empty-object validation issues in Chinese with schema names intact", () => {
    const result = buildImportedDataset({ ...file, csv: false, text: "{}" }, metadata, now);
    const message = datasetDiagnosticChinese(result.error);
    expect(message).toContain("必须提供 schemaVersion 1 和 instrument 资产标识。");
    expect(message).toContain("quoteCurrency 必须是明确的货币代码。");
    expect(message).toContain("20 字节 address 和 symbol");
    expect(message).toContain("observations 必须为数组");
    expect(message).not.toMatch(/required|must|needs|supported/);
  });

  it("localizes dated diagnostics, parser failures and insufficient history", () => {
    for (const message of [
      "Duplicate date 2025-01-01; rows are never silently merged.",
      "Expected consecutive daily observations between 2025-01-01 and 2025-01-03; found 2 days.",
      "At least 180 daily returns are required for this method.",
      "Could not parse JSON. Provide a valid dataset object.",
      buildImportedDataset({ ...file, text: "bad,header\n1,2" }, metadata, now).error,
    ]) {
      expect(datasetDiagnosticChinese(message)).toMatch(/[\u3400-\u9fff]/);
      expect(datasetDiagnosticChinese(message)).not.toMatch(/required|must|needs|Expected|Duplicate|Could not/);
    }
  });
});
