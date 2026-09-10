export type BenchmarkInput = { provider: "tcgdex" | "ygoprodeck"; cardId: string };
export type CardBenchmark = {
  provider: BenchmarkInput["provider"];
  cardId: string;
  name: string;
  fetchedAt: string;
  sourceUrl: string;
  rows: Array<{ market: string; variant: string; metric: string; amount: number; currency: "USD" | "EUR"; updatedAt: string | null }>;
};
