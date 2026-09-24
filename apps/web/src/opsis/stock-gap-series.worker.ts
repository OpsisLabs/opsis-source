import { parseStockGapSeries } from "./stock-gap-series";

self.onmessage = (event: MessageEvent<{ id: number; rawJson: string }>) => {
  const { id, rawJson } = event.data;
  try {
    self.postMessage({ id, type: "result", result: parseStockGapSeries(JSON.parse(rawJson) as unknown) });
  } catch (cause) {
    self.postMessage({ id, type: "error", error: cause instanceof Error ? cause.message : "The series could not be validated." });
  }
};
