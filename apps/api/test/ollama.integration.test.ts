import type { NormalizedEntity } from "@rh-chain/shared";
import { describe, expect, it } from "vitest";
import { AiService } from "../src/ai/service.js";
import { loadEnv } from "../src/config/env.js";

const ollamaUrl = process.env.TEST_OLLAMA_URL;
const describeOllama = ollamaUrl ? describe : describe.skip;

describeOllama("Ollama integration", () => {
  it("returns a validated source-grounded answer", async () => {
    const entity: NormalizedEntity = {
      chainId: 4663,
      type: "wallet",
      value: "0x0000000000000000000000000000000000000001",
      facts: { transactionsFetched: 2, failedTransactions: 0 },
      citations: [{
        id: "source-1",
        provider: "integration-fixture",
        url: "https://example.test/wallet",
        fetchedAt: "2026-07-11T00:00:00.000Z",
        fieldsUsed: ["transactionsFetched", "failedTransactions"],
        description: "Wallet activity fixture"
      }],
      riskNotes: []
    };
    const service = new AiService(loadEnv({
      NODE_ENV: "test",
      AI_PROVIDER: "ollama",
      OLLAMA_BASE_URL: ollamaUrl,
      OLLAMA_MODEL: process.env.TEST_OLLAMA_MODEL ?? "qwen3:4b",
      OLLAMA_TIMEOUT_MS: "180000"
    }));

    const answer = await service.answer("What does the supplied wallet activity show?", entity);

    expect(answer.answer.length).toBeGreaterThan(20);
    expect(answer.tokenUsage?.total_tokens).toBeGreaterThan(0);
    expect(answer.facts).toEqual(entity.facts);
    expect(answer.citations).toEqual(entity.citations);
    expect(answer.uncertainty).not.toContain("AI provider failed or returned invalid output; deterministic fallback was used.");
  }, 180_000);
});
