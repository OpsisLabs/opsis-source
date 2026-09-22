import { datasetHash, runQuant, validateDataset, type ExperimentSpec, type PriceDataset } from "@rh-chain/quant";

type Message = { id: number; dataset: PriceDataset; spec: ExperimentSpec };
self.onmessage = async (event: MessageEvent<Message>) => {
  const { id, dataset, spec } = event.data;
  try {
    const validation = validateDataset(dataset);
    if (!validation.ok) {
      self.postMessage({ id, type: "error", issues: validation.issues });
      return;
    }
    const result = runQuant(dataset, spec, () => false);
    self.postMessage({ id, type: "result", datasetHash: await datasetHash(dataset), result });
  } catch (error) {
    self.postMessage({ id, type: "error", issues: [{ code: "malformed", message: error instanceof Error ? error.message : "Quant run failed." }] });
  }
};
