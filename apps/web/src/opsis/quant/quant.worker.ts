import { datasetHash, runJointPortfolio, runQuant, validateDataset, type ExperimentSpec, type JointPortfolioPosition, type PriceDataset } from "@rh-chain/quant";

type Message = { id: number; dataset: PriceDataset; spec: ExperimentSpec; kind?: "single" }
  | { id: number; positions: JointPortfolioPosition[]; spec: ExperimentSpec; kind: "joint" };
self.onmessage = async (event: MessageEvent<Message>) => {
  const { id, spec } = event.data;
  try {
    if (event.data.kind === "joint") {
      const result = await runJointPortfolio(event.data.positions, spec, () => false);
      self.postMessage({ id, type: "joint-result", result });
      return;
    }
    const { dataset } = event.data;
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
