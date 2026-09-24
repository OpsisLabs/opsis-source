import { datasetHash, observedCorrelationMatrix, runJointPortfolio, runQuant, validateDataset, verifyQuantExport, type ExperimentSpec, type JointPortfolioPosition, type PriceDataset } from "@rh-chain/quant";

type Message = { id: number; dataset: PriceDataset; spec: ExperimentSpec; kind?: "single" }
  | { id: number; positions: JointPortfolioPosition[]; spec: ExperimentSpec; kind: "joint" }
  | { id: number; rawJson: string; kind: "replay" }
  | { id: number; datasets: PriceDataset[]; kind: "correlation" };
self.onmessage = async (event: MessageEvent<Message>) => {
  const { id } = event.data;
  try {
    if (event.data.kind === "correlation") {
      const result = observedCorrelationMatrix(event.data.datasets);
      self.postMessage({ id, type: "correlation-result", result });
      return;
    }
    if (event.data.kind === "replay") {
      const verification = await verifyQuantExport(JSON.parse(event.data.rawJson) as unknown);
      if (!verification.ok) {
        self.postMessage({ id, type: "replay-error", message: verification.error });
        return;
      }
      const { run, kind } = verification;
      self.postMessage({ id, type: "replay-result", summary: {
        kind,
        model: run.manifest.model,
        seed: run.manifest.seed,
        runs: run.manifest.bootstrapRuns,
        horizon: run.manifest.horizon,
        inputs: kind === "joint" ? verification.datasets.length : 1,
        terminalMedian: run.bootstrap.terminal.median,
      } });
      return;
    }
    const { spec } = event.data;
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
