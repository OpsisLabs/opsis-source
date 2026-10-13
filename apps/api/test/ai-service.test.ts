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
  it.each(["Explain this transaction", "What should a beginner know?", "What happened?", "Explain"])("explains receipt facts in plain English for %s", async (question) => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const facts = { status: "0x1", valueEth: "0", gasUsed: "0x3074c", from: `0x${"1".repeat(40)}`, to: `0x${"2".repeat(40)}` };
    const answer = await service.answer(question, { ...entity, facts });
    expect(answer.answer).toContain("succeeded on Robinhood Chain");
    expect(answer.answer).toContain("action was not decoded");
    expect(answer.summaryBullets.join(" ")).toContain("No native ETH was attached");
    expect(answer.summaryBullets.join(" ")).toContain("does not mean the transaction was free");
    expect(answer.summaryBullets.join(" ")).toContain("198,476 gas units");
    expect(answer.summaryBullets.join(" ")).toContain("From 0x1111…1111 to 0x2222…2222");
    expect(answer.summaryBullets.join(" ")).not.toContain("0x1.");
    expect(answer.facts).toEqual(facts);
    expect(answer.confirmedFacts).toContainEqual({ fact: "Transaction outcome: succeeded", sourceIds: ["source-1"] });
    expect(answer.citations).toEqual(entity.citations);
  });

  it.each(["0x0", "error", "reverted", 0, false])("does not call reverted value a completed transfer (%s)", async (status) => {
    const answer = await new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" })).answer("Explain", {
      ...entity, facts: { status, valueEth: "1.25", gasUsed: "21000" },
    });
    expect(answer.answer).toContain("failed on Robinhood Chain");
    expect(answer.answer).toContain("network fee can still be charged");
    expect(answer.summaryBullets.join(" ")).toContain("reverted transfer did not complete");
    expect(answer.summaryBullets.join(" ")).not.toContain("Transferred value");
  });

  it.each([undefined, "not-success", "0x12"])("does not infer success or a native amount from missing/unknown facts (%s)", async (status) => {
    const answer = await new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" })).answer("Explain", {
      ...entity, facts: { status, value: "1000000000000000000", gasUsed: "-1", method: "0xa9059cbb" },
    });
    expect(answer.answer).toContain("does not establish whether");
    expect(answer.answer).toContain("action was not decoded");
    expect(answer.summaryBullets.join(" ")).toContain("Native ETH amount is unavailable");
    expect(answer.summaryBullets.join(" ")).not.toMatch(/1000000000000000000|gas units/);
  });

  it("keeps pending and internal-call errors distinct from full execution success", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const pending = await service.answer("Explain", { ...entity, facts: { status: "pending" } });
    expect(pending.answer).toContain("outcome is not confirmed");
    const partial = await service.answer("Explain", { ...entity, facts: { status: "ok", internalTransactionFailure: true } });
    expect(partial.answer).toContain("does not prove every intended action completed");
    const decoded = await service.answer("Explain", { ...entity, facts: { status: "ok", method: "approve(address,uint256)", tokenTransfers: [{}] } });
    expect(decoded.answer).toContain("decoded call is approve");
    expect(decoded.answer).toContain("does not prove its intended effect or safety");
    expect(decoded.summaryBullets.join(" ")).toContain("1 token-transfer record returned");
  });

  it("explains delegated wallets without claiming their delegated code is safe", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const answer = await service.answer("What stands out to a beginner?", {
      ...entity, type: "wallet",
      facts: { accountType: "delegated_wallet", nativeBalanceEth: "0.25", activityCoverage: "unavailable" },
    });
    expect(answer.answer).toContain("EIP-7702 code delegation");
    expect(answer.answer).toContain("has not been audited");
    expect(answer.summaryBullets.join(" ")).toContain("smart-account code delegation");
  });

  it("keeps unknown RPC-only contract metadata unknown in English and Chinese", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const contract: NormalizedEntity = {
      ...entity,
      type: "contract",
      value: `0x${"8".repeat(40)}`,
      facts: {
        codePresent: true,
        nativeBalanceEth: "0",
        verified: null,
        abiAvailable: null,
        proxy: null,
        activityCoverage: "unavailable",
        sourceCoverage: "unavailable",
        holderCoverage: "unavailable",
        observation: "latest_rpc_sample"
      }
    };
    const en = await service.answer("What is this?", contract, "en");
    const zh = await service.answer("这是什么？", contract, "zh-CN");
    expect(en.answer).not.toContain("reported unverified");
    expect(en.answer).not.toMatch(/no activity|no .*transactions/i);
    expect(zh.answer).not.toContain("未验证");
    expect(zh.answer).not.toContain("没有活动");
    expect(en.summaryBullets.join(" ")).toContain("Recent activity was unavailable");
    expect(zh.summaryBullets.join(" ")).toContain("无法提供最近活动");
  });

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
    expect(overview.summaryBullets.join(" ")).toContain("public wallet address");
    expect(overview.answer).toContain("native balance of 0.25 ETH");
    expect(overview.answer).toContain("not a verdict");
    expect(overview.summaryBullets).toContain("Meaning: public wallet address, not a verified real-world identity.");
    expect(overview.summaryBullets).toContain("Next: open the source panel and verify the cited fields.");
    expect(risk.answer).toContain("risk check");
    expect(risk.summaryBullets.join(" ")).toContain("Concentrated activity");
    expect(evidence.answer).toContain("evidence view");
    expect(evidence.summaryBullets.join(" ")).toContain("blockscout");
    expect(activity.answer).toContain("The available records contain 9 transactions");
    expect(activity.summaryBullets.join(" ")).toContain("observed records; they do not prove buys, sells, or intent");
  });

  it("describes unavailable wallet coverage without manufacturing zero activity", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const answer = await service.answer("What stands out to a beginner?", {
      ...entity,
      type: "wallet",
      facts: {
        nativeBalanceEth: "0.25",
        activityCoverage: "unavailable",
        tokenBalanceCoverage: "unavailable"
      }
    });

    expect(answer.answer).toContain("cannot determine recent behavior, the wallet's complete asset list, or its safety");
    expect(answer.answer).toContain("not proof of safety");
    expect(answer.summaryBullets).toContain("Missing: recent activity and token balances were unavailable; unavailable does not mean zero.");
    expect(answer.summaryBullets).toContain("Next: open the source panel and verify the cited fields.");
    expect(answer.summaryBullets.join(" ")).not.toMatch(/0 recent transactions|0 token balances/);
  });

  it("turns a reviewed token-balance sample into useful beginner context without calling it complete", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const answer = await service.answer("What should a beginner know?", {
      ...entity,
      type: "wallet",
      facts: {
        nativeBalanceEth: "0.803388546333112016",
        activityCoverage: "unavailable",
        tokenBalanceCoverage: "reviewed_asset_sample",
        tokenBalanceContractsChecked: 12,
        tokenBalances: [
          { tokenSymbol: "AAPL", formattedValue: "0.00195582723276964" },
          { tokenSymbol: "NVDA", formattedValue: "0.000087283447671763" },
          { tokenSymbol: "SPY", formattedValue: "0.003640538791008344" }
        ]
      }
    });

    expect(answer.answer).toContain("3 positive token balances in Opsis's reviewed contract sample");
    expect(answer.answer).toContain("tokenized assets AAPL, NVDA, SPY");
    expect(answer.answer).toContain("native balance of 0.803388 ETH for network fees");
    expect(answer.answer).toContain("not the wallet's complete asset list");
    expect(answer.summaryBullets).toContain("Coverage: 12 reviewed token contracts checked; recent activity and all other tokens remain unknown.");
    expect(answer.answer).toContain("not the wallet's complete asset list or a meaningful wallet-safety assessment");
  });

  it("treats common beginner wording as a specific explanatory intent", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const wallet: NormalizedEntity = {
      ...entity,
      type: "wallet",
      facts: {
        nativeBalanceEth: "0.693262389611335472",
        activityCoverage: "unavailable",
        tokenBalanceCoverage: "unavailable"
      }
    };

    for (const question of [
      "What should a beginner know?",
      "What should I notice?",
      "Explain this simply"
    ]) {
      const result = await service.answer(question, wallet);
      expect(result.summaryBullets.join(" ")).toContain("public wallet address");
      expect(result.answer).toContain("0.693262389611335472 ETH");
      expect(result.answer).toContain("could not be retrieved");
      expect(result.answer).not.toContain("This read-only overview explains");
    }
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

    expect(answer.answer).toContain("succeeded on Robinhood Chain");
    expect(answer.answer).toContain("action was not decoded");
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

describe("AI answer locale", () => {
  it("keeps the English deterministic fallback unchanged and returns Simplified Chinese for zh-CN", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const wallet: NormalizedEntity = {
      ...entity,
      type: "wallet",
      value: "0x0000000000000000000000000000000000000042",
      facts: { nativeBalanceEth: "0.25", transactionsFetched: 3 },
      riskNotes: []
    };
    const en = await service.answer("What stands out to a beginner?", wallet);
    const zh = await service.answer("What stands out to a beginner?", wallet, "zh-CN");

    expect(en.summaryBullets).toContain("Meaning: public wallet address, not a verified real-world identity.");
    expect(en.summaryBullets).toContain("Next: open the source panel and verify the cited fields.");
    expect(en.answer).toContain("native balance of 0.25 ETH");

    expect(zh.summaryBullets.join(" ")).toContain("含义：公开钱包地址");
    expect(zh.answer).toMatch(/[\u4e00-\u9fff]/);
    expect(zh.uncertainty.join(" ")).toMatch(/[\u4e00-\u9fff]/);
    expect(zh.suggestedQuestions.join(" ")).toMatch(/[\u4e00-\u9fff]/);
    expect(zh.suggestedQuestions).toEqual(zh.suggestedFollowUps);
    expect(zh.answer).toContain("0.25 ETH");
    expect(zh.answer).not.toMatch(/public wallet address|Meaning:/);

    const zhBeginner = await service.answer("新手应该注意什么？", wallet, "zh-CN");
    expect(zhBeginner.summaryBullets.join(" ")).toContain("含义：");
    expect(zhBeginner.answer).toMatch(/[\u4e00-\u9fff]/);
  });

  it("localizes transaction prose while keeping hashes, addresses, symbols, and numbers verbatim", async () => {
    const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
    const zh = await service.answer("Explain", {
      ...entity,
      facts: { status: "0x1", valueEth: "0", gasUsed: "0x3074c", from: `0x${"1".repeat(40)}`, to: `0x${"2".repeat(40)}` }
    }, "zh-CN");

    expect(zh.answer).toContain("已成功");
    expect(zh.summaryBullets.join(" ")).toContain("198,476 个 gas");
    expect(zh.summaryBullets.join(" ")).toContain("从 0x1111…1111 到 0x2222…2222");
    expect(zh.summaryBullets.join(" ")).toContain("0x1111…1111");
    expect(zh.summaryBullets.join(" ")).toContain("0x2222…2222");
    expect(zh.summaryBullets.join(" ")).not.toContain("No native ETH was attached");
  });

  it("sends the requested locale and Chinese writing directive to the provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({
        answer: "这笔交易在 Robinhood Chain 上成功。",
        summaryBullets: [],
        inferences: [],
        uncertainty: [],
        suggestedFollowUps: []
      })
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const answer = await new AiService(loadEnv({ NODE_ENV: "test", OPENAI_API_KEY: "test-key" }))
      .answer("Explain", entity, "zh-CN");

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.input[0].content).toContain("Simplified Chinese");
    expect(JSON.parse(request.input[1].content).locale).toBe("zh-CN");
    expect(answer.answer).toBe("这笔交易在 Robinhood Chain 上成功。");
  });
});

describe("risk signal summary", () => {
  const service = new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
  const token = (facts: Record<string, unknown>, riskNotes: NormalizedEntity["riskNotes"] = []): NormalizedEntity => ({
    ...entity, type: "token", value: `0x${"1".repeat(40)}`, facts: { name: "Example", symbol: "EX", decimals: 18, ...facts }, riskNotes
  });

  it("does not report zero signals as a result when the data behind them was unavailable", async () => {
    for (const field of ["holderCoverage", "activityCoverage", "sourceCoverage"]) {
      const english = (await service.answer("", token({ [field]: "unavailable" }), "en", "overview")).summaryBullets.join(" ");
      expect(english).toContain("Risk signals could not be assessed");
      expect(english).toContain("This is not a clean result.");
      expect(english).not.toContain("0 evidence-based risk signals identified");
    }
    const chinese = (await service.answer("", token({ holderCoverage: "unavailable" }), "zh-CN", "overview")).summaryBullets.join(" ");
    expect(chinese).toContain("无法评估风险信号");
  });

  it("keeps the count when coverage was read", async () => {
    const bullets = (await service.answer("", token({ holderCoverage: "complete", activityCoverage: "complete", sourceCoverage: "complete" }), "en", "overview")).summaryBullets.join(" ");
    expect(bullets).toContain("0 evidence-based risk signals identified.");
  });
});
