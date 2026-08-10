import type { NormalizedEntity } from "@rh-chain/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiService } from "../src/ai/service.js";
import { loadEnv } from "../src/config/env.js";

const entity: NormalizedEntity = {
  chainId: 4663,
  type: "transaction",
  value: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  facts: { status: "ok", value: "5" },
  citations: [{
    id: "source-1",
    provider: "blockscout",
    url: "https://example.test/tx",
    fetchedAt: "2026-07-10T00:00:00.000Z",
    fieldsUsed: ["status"],
    description: "Transaction evidence"
  }],
  riskNotes: []
};

afterEach(() => vi.unstubAllGlobals());

describe("AI answer boundary", () => {
  it("maps supported private questions to distinct deterministic cited views", async () => {
    const wallet: NormalizedEntity = {
      ...entity,
      type: "wallet",
      value: "0x0000000000000000000000000000000000000042",
      facts: { transactionsFetched: 9, nativeBalanceEth: "0.25", tokenBalances: [{ symbol: "TEST" }] },
      riskNotes: [{ severity: "medium", title: "Concentrated activity", detail: "Most recent transfers involve one counterparty." }]
    };
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));

    const [overview, risk, evidence, activity] = await Promise.all([
      service.answer("What stands out to a beginner?", wallet),
      service.answer("What risks should I notice?", wallet),
      service.answer("What source data supports this answer?", wallet),
      service.answer("Explain the recent activity in plain English.", wallet)
    ]);

    expect(new Set([overview.answer, risk.answer, evidence.answer, activity.answer]).size).toBe(4);
    expect(risk.answer).toContain("risk check");
    expect(risk.summaryBullets.join(" ")).toContain("Concentrated activity");
    expect(evidence.answer).toContain("evidence view");
    expect(evidence.summaryBullets.join(" ")).toContain("blockscout");
    expect(activity.answer).toContain("activity view");
    expect(activity.summaryBullets).toContain("9 recent transactions in the available activity window.");
  });

  it("omits unavailable and internal fields from beginner-facing confirmed facts", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const answer = await service.answer("Show the evidence", {
      ...entity,
      type: "wallet",
      facts: {
        address: "0x0000000000000000000000000000000000000042",
        coinBalance: "45131510997491630",
        nativeBalanceEth: "0.04513151099749163",
        transactionsFetched: 0,
        recentTransactions: [],
        isContract: false,
        sourceIds: ["source-1"],
        explorerUrl: "https://example.test/address/0x42"
      }
    });

    expect(answer.confirmedFacts).toEqual([
      { fact: "Address: 0x0000000000000000000000000000000000000042", sourceIds: ["source-1"] },
      { fact: "Native balance eth: 0.04513151099749163", sourceIds: ["source-1"] },
      { fact: "Transactions fetched: 0", sourceIds: ["source-1"] },
      { fact: "Recent transactions: 0 items returned", sourceIds: ["source-1"] },
      { fact: "Is contract: no", sourceIds: ["source-1"] }
    ]);
    const renderedFacts = answer.confirmedFacts.map((fact) => fact.fact).join(" ");
    expect(renderedFacts).not.toContain("undefined");
    expect(renderedFacts).not.toContain("45131510997491630");
    expect(renderedFacts).not.toContain("Coin balance");
  });

  it("converts raw token supply into decimal-adjusted beginner units", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const answer = await service.answer("Show the evidence", {
      ...entity,
      type: "token",
      facts: { symbol: "TEST", totalSupply: "1234500000000000000000", decimals: "18" }
    });
    const renderedFacts = answer.confirmedFacts.map((fact) => fact.fact).join(" ");

    expect(renderedFacts).toContain("Total supply tokens: 1234.5");
    expect(renderedFacts).not.toContain("1234500000000000000000");

    const missingDecimals = await service.answer("Show the evidence", {
      ...entity,
      type: "token",
      facts: { symbol: "ODD", totalSupply: "1234500000000000000000" }
    });
    const missingDecimalsFacts = missingDecimals.confirmedFacts.map((fact) => fact.fact).join(" ");
    expect(missingDecimalsFacts).not.toContain("Total supply");
    expect(missingDecimalsFacts).not.toContain("1234500000000000000000");
  });

  it("keeps normalized facts and citations authoritative", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({
        answer: "The source reports a successful transaction.",
        facts: { status: "invented", amount: "999" },
        uncertainty: ["Provider indexing can lag."],
        citations: [],
        riskNotes: [{ severity: "high", title: "Invented", detail: "Invented" }],
        suggestedQuestions: ["What source supports this?"]
      })
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const answer = await new AiService(loadEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key" })).answer("Explain", entity);

    expect(answer.facts).toEqual(entity.facts);
    expect(answer.citations).toEqual(entity.citations);
    expect(answer.riskNotes).toEqual(entity.riskNotes);
    expect(answer.answer).toBe("The source reports a successful transaction.");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ store: false });
  });

  it("grounds transaction gas figures in the normalized receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({
        answer: "This successful call used 19892 gas.",
        summaryBullets: ["Gas used 19,892 — moderate cost."]
      })
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const answer = await new AiService(loadEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key" })).answer(
      "Explain",
      { ...entity, facts: { ...entity.facts, gasUsed: "0x3074c" } },
    );

    expect(answer.answer).toContain("198,476 gas");
    expect(answer.summaryBullets).toContain("Gas used 198,476 — moderate cost.");
  });

  it("replaces transactional advice with the deterministic safe answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({ answer: "You should buy this token now.", uncertainty: [], suggestedQuestions: [] })
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const answer = await new AiService(loadEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key" })).answer("Should I buy?", entity);

    expect(answer.answer).toContain("read-only");
    expect(answer.answer).toContain("informational only");
    expect(answer.answer).not.toContain("buy this token");
    expect(answer.uncertainty.length).toBeGreaterThan(0);
  });

  it("retries invalid AI JSON once before accepting a valid response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify({ missing: "answer" }) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        output_text: JSON.stringify({ answer: "The transaction succeeded according to the supplied source." }),
        usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 }
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const answer = await new AiService(loadEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key" })).answer("Explain", entity);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(answer.answer).toContain("succeeded");
    expect(answer.tokenUsage).toEqual({ input_tokens: 10, output_tokens: 8, total_tokens: 18 });
  });

  it("uses Ollama structured output without an API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify({ answer: "The supplied source identifies a successful transaction." }) },
      prompt_eval_count: 12,
      eval_count: 9
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const answer = await new AiService(loadEnv({
      NODE_ENV: "test",
      AI_PROVIDER: "ollama",
      OLLAMA_MODEL: "test-model"
    })).answer("What happened?", entity);

    expect(answer.answer).toContain("successful transaction");
    expect(answer.tokenUsage).toEqual({ input_tokens: 12, output_tokens: 9, total_tokens: 21 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://127.0.0.1:11434/api/chat");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      model: "test-model",
      stream: false,
      think: false,
      format: { type: "object", additionalProperties: false }
    });
    expect(request.messages[1].content).toContain("What happened?");
  });

  it("bounds hydrated chain data before sending it to AI", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: { content: JSON.stringify({
        answer: "The bounded source bundle contains a transaction sample.",
        summaryBullets: [],
        inferences: [],
        uncertainty: [],
        suggestedFollowUps: []
      }) }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const hydratedEntity: NormalizedEntity = {
      ...entity,
      facts: {
        coinBalance: "45131510997491630",
        nativeBalanceEth: "0.04513151099749163",
        totalSupply: "1234500000000000000000",
        decimals: "18",
        transactions: Array.from({ length: 100 }, (_, index) => ({
          hash: `0x${String(index).padStart(64, "0")}`,
          input: "a".repeat(2_000)
        }))
      }
    };

    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "ollama" }));
    await service.answer("Summarize", hydratedEntity);

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const userContent = String(request.messages[1].content);
    expect(userContent.length).toBeLessThan(10_000);
    expect(userContent).toContain('"totalItems":100');
    expect(userContent).toContain('"nativeBalanceEth":"0.04513151099749163"');
    expect(userContent).toContain('"totalSupplyTokens":"1234.5"');
    expect(userContent).not.toContain("45131510997491630");
    expect(userContent).not.toContain("1234500000000000000000");
    expect(userContent).not.toContain("coinBalance");
    expect(userContent).not.toContain(hydratedEntity.value);

    await service.answer("Summarize", {
      ...entity,
      type: "token",
      facts: { symbol: "ODD", totalSupply: "1234500000000000000000", decimals: "unknown" }
    });
    const invalidDecimalsRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    const invalidDecimalsContent = String(invalidDecimalsRequest.messages[1].content);
    expect(invalidDecimalsContent).not.toContain("1234500000000000000000");
    expect(invalidDecimalsContent).not.toContain("totalSupplyTokens");
  });
});
