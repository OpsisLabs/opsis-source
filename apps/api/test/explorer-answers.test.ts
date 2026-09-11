import type { AiExplorerAnswer, NormalizedEntity } from "@rh-chain/shared";
import { describe, expect, it, vi } from "vitest";
import { AiService } from "../src/ai/service.js";
import { loadEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { normalizeEntity } from "../src/chain/normalize.js";
import type { SourceDocumentInput } from "../src/chain/types.js";
import { applyPrivateProviderCoverage } from "../src/routes/private.js";
import { memoryStore } from "../src/db/memory.js";
import addressFixture from "./fixtures/blockscout-address.json";
import tokenBalancesFixture from "./fixtures/blockscout-token-balances.json";

const wallet: NormalizedEntity = {
  chainId: 4663,
  type: "wallet",
  value: "0x0000000000000000000000000000000000000042",
  facts: { address: "0x0000000000000000000000000000000000000042" },
  citations: [{
    id: "source-wallet",
    provider: "blockscout",
    url: "https://example.test/address",
    fetchedAt: "2026-08-10T00:00:00.000Z",
    fieldsUsed: ["nativeBalanceEth", "tokenBalances"],
    description: "Public wallet data"
  }],
  riskNotes: []
};

const transaction: NormalizedEntity = {
  ...wallet,
  type: "transaction",
  value: `0x${"a".repeat(64)}`,
  facts: {
    status: "0x1",
    valueEth: "1.25",
    gasUsed: "0x5208",
    from: `0x${"1".repeat(40)}`,
    to: `0x${"2".repeat(40)}`,
    tokenTransfers: [{ formattedValue: "10.5", tokenSymbol: "USDG", tokenAddress: `0x${"3".repeat(40)}` }],
    fee: { type: "actual", value: "21000000000000" }
  }
};

const token: NormalizedEntity = {
  ...wallet,
  type: "token",
  value: `0x${"b".repeat(40)}`,
  facts: {
    address: `0x${"b".repeat(40)}`,
    name: "Example Dollar",
    symbol: "EXD",
    decimals: "18",
    totalSupply: "1234500000000000000000",
    verified: false
  }
};

function service() {
  return new AiService(loadEnv({ NODE_ENV: "test", AI_PROVIDER: "fallback" }));
}

function walletSourceDoc(path: string, responseJson: unknown): SourceDocumentInput {
  return {
    id: `wallet-${path || "info"}`,
    provider: "blockscout",
    chainId: 4663,
    entityType: "wallet",
    entityValue: wallet.value,
    requestUrl: `https://example.test/api/v2/addresses/${wallet.value}${path}`,
    responseJson,
    fetchedAt: "2026-08-10T00:00:00.000Z"
  };
}

const zeroBalanceFixture = [{
  value: "0",
  token: {
    address_hash: `0x${"7".repeat(40)}`,
    name: "Zero Token",
    symbol: "ZRO",
    decimals: "18",
    type: "ERC-20"
  }
}];

describe("task-specific deterministic answers", () => {
  it("leads a reviewed holdings sample with exact quantities and names without calling it complete", async () => {
    const answer = await service().answer("ignored", {
      ...wallet,
      facts: {
        address: wallet.value,
        nativeBalanceEth: "0.803388546333112016",
        tokenBalanceCoverage: "reviewed_asset_sample",
        tokenBalanceContractsChecked: 12,
        tokenBalances: [
          { tokenSymbol: "USDG", tokenName: "Global Dollar", tokenAddress: `0x${"5".repeat(40)}`, formattedValue: "123.456789123456789" },
          { tokenSymbol: "AAPL", tokenName: "Apple", tokenAddress: `0x${"a".repeat(40)}`, formattedValue: "0.00195582723276964" }
        ]
      }
    }, "en", "holdings");

    expect(answer.answer).toContain("reviewed contracts");
    expect(answer.answer).toContain("not the wallet's complete portfolio");
    expect(answer.summaryBullets.join(" ")).toContain("Global Dollar (USDG)");
    // Precision: trimmed to six visible decimals, never rounded to zero.
    expect(answer.summaryBullets.join(" ")).toContain("123.456789");
    expect(answer.summaryBullets.join(" ")).toContain("0x5555…5555");
    expect(answer.summaryBullets.join(" ")).not.toContain("123.456789123456789");
  });

  it("says it could not determine holdings when the token source is unavailable", async () => {
    const answer = await service().answer("ignored", {
      ...wallet,
      facts: { address: wallet.value, nativeBalanceEth: "0", activityCoverage: "unavailable", tokenBalanceCoverage: "unavailable" }
    }, "en", "holdings");

    expect(answer.answer).toContain("couldn't determine");
    expect(answer.answer).toContain("not a zero balance");
    expect(answer.summaryBullets.join(" ")).toContain("Missing:");
    expect(answer.summaryBullets.join(" ")).not.toMatch(/0 token balances/);
  });

  it("counts only positive source-normalized balances from a real indexed response", async () => {
    const entity = normalizeEntity(4663, "wallet", wallet.value, [
      walletSourceDoc("", addressFixture),
      walletSourceDoc("/token-balances", tokenBalancesFixture)
    ]);
    // The normalized shape is what the resolver actually produces.
    expect(entity.facts.tokenBalances).toEqual([
      expect.objectContaining({ tokenSymbol: "FIX", formattedValue: "2.5" })
    ]);
    const answer = await service().answer("ignored", entity, "en", "holdings");
    expect(answer.answer).toContain("The available index returned 1 positive token balance");
    expect(answer.summaryBullets.join(" ")).toContain("2.5 Fixture Token (FIX)");
    expect(answer.summaryBullets.join(" ")).toContain("remain unknown");
  });

  it("does not count zero source-normalized balances as holdings", async () => {
    const entity = normalizeEntity(4663, "wallet", wallet.value, [
      walletSourceDoc("", addressFixture),
      walletSourceDoc("/token-balances", zeroBalanceFixture)
    ]);
    expect(entity.facts.tokenBalances).toEqual([
      expect.objectContaining({ tokenSymbol: "ZRO", formattedValue: "0" })
    ]);
    const answer = await service().answer("ignored", entity, "en", "holdings");
    expect(answer.answer).toContain("no positive token balances");
    expect(answer.answer).not.toContain("1 positive token balance");
  });

  it("treats a valid empty index as zero returned positives, not a missing source", async () => {
    const entity = normalizeEntity(4663, "wallet", wallet.value, [
      walletSourceDoc("", addressFixture),
      walletSourceDoc("/token-balances", [])
    ]);
    const answer = await service().answer("ignored", entity, "en", "holdings");
    expect(answer.answer).toContain("no positive token balances");
    expect(answer.answer).toContain("returned list can still be incomplete");
    expect(answer.answer).not.toContain("couldn't determine");
  });

  it("treats an absent token-balance list as unknown, not an index that reported zero", async () => {
    const normalized = normalizeEntity(4663, "wallet", wallet.value, [walletSourceDoc("", addressFixture)]);
    const covered = applyPrivateProviderCoverage({
      entity: normalized,
      providerDestinations: ["blockscout"],
      sources: []
    });
    expect(covered.entity.facts.tokenBalanceCoverage).toBe("unavailable");
    expect(covered.entity.facts.tokenBalances).toBeUndefined();
    const answer = await service().answer("ignored", covered.entity, "en", "holdings");
    expect(answer.answer).toContain("couldn't determine this wallet's token holdings");
    expect(answer.answer).toContain("no token-balance list was returned");
    expect(answer.answer).not.toContain("index returned no positive");
  });

  it("reports zero, unknown and invalid amounts as not positive instead of holdings", async () => {
    const answer = await service().answer("ignored", {
      ...wallet,
      facts: {
        address: wallet.value,
        tokenBalances: [
          { tokenSymbol: "ZERO", formattedValue: "0" },
          { tokenSymbol: "RAWNIL", rawValue: "0" },
          { tokenSymbol: "UNKNOWN" },
          { tokenSymbol: "BROKEN", formattedValue: "not-a-number" }
        ]
      }
    }, "en", "holdings");
    expect(answer.answer).toContain("no positive token balances");
    expect(answer.answer).not.toContain("ZERO");
    expect(answer.summaryBullets.join(" ")).toContain("not counted as a positive holding");
  });

  it("leads activity with the observed count and interval, not robotic boilerplate", async () => {
    const answer = await service().answer("ignored", {
      ...wallet,
      facts: {
        address: wallet.value,
        nativeBalanceEth: "0.25",
        transactionsFetched: 9,
        activityTimeWindow: { newest: "2026-09-01T00:00:00.000Z", oldest: "2026-08-01T00:00:00.000Z" }
      }
    }, "en", "activity");
    expect(answer.answer).toContain("The available records contain 9 transactions");
    expect(answer.answer).toContain("from 2026-08-01T00:00:00.000Z to 2026-09-01T00:00:00.000Z");
    expect(answer.answer).not.toMatch(/read-only activity view|bounded transaction count|informational/);
    expect(answer.summaryBullets.join(" ")).toContain("observed records; they do not prove buys, sells, or intent");
    expect(answer.summaryBullets.join(" ")).not.toContain("transactionsFetched");
    // The count is not repeated as a bullet once the lead states it.
    expect(answer.summaryBullets.join(" ")).not.toContain("9 recent transactions");

    const unavailable = await service().answer("ignored", {
      ...wallet,
      facts: { address: wallet.value, activityCoverage: "unavailable", tokenBalanceCoverage: "unavailable" }
    }, "en", "activity");
    expect(unavailable.answer).toContain("Recent activity couldn't be retrieved");
    expect(unavailable.summaryBullets.join(" ")).toContain("this is not a zero-count finding");
  });

  it("answers what moved for a successful transaction, kept distinct from the fee", async () => {
    const answer = await service().answer("ignored", transaction, "en", "moved");
    expect(answer.answer).toContain("moved 1.25 ETH");
    expect(answer.answer).toContain("token-transfer record");
    expect(answer.summaryBullets.join(" ")).toContain("not the network fee");
    expect(answer.summaryBullets.join(" ")).toContain("0x1111…1111");
  });

  it("never headlines a reverted transfer as completed", async () => {
    const failedWithValue = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, status: "0x0", valueEth: "5" }
    }, "en", "moved");
    expect(failedWithValue.answer).toContain("was reverted");
    expect(failedWithValue.answer).toContain("had 5 ETH attached");
    expect(failedWithValue.answer).not.toContain("moved 5 ETH");
    expect(failedWithValue.summaryBullets.join(" ")).toContain("did not complete");

    const failedTokenOnly = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, status: "0x0", valueEth: "0" }
    }, "en", "moved");
    expect(failedTokenOnly.answer).toContain("was reverted, so no movement completed");
    expect(failedTokenOnly.answer).toContain("token-transfer record");
  });

  it("does not confirm a pending or unknown transaction's movement", async () => {
    const pending = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, status: "pending" }
    }, "en", "moved");
    expect(pending.answer).toContain("pending");
    expect(pending.answer).toContain("not yet confirmed");
    expect(pending.answer).not.toContain("moved 1.25 ETH");

    const unknown = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, status: undefined }
    }, "en", "moved");
    expect(unknown.answer).toContain("does not establish whether this transaction succeeded");
    expect(unknown.answer).toContain("no completed movement is proven");
  });

  it("describes confirmed token-only movements and unknown native value without assuming zero", async () => {
    const tokenOnly = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, valueEth: "0" }
    }, "en", "moved");
    expect(tokenOnly.answer).toContain("token movements occurred");
    expect(tokenOnly.answer).not.toContain("nothing moved");

    const noTokenRecords = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, valueEth: "0", tokenTransfers: undefined }
    }, "en", "moved");
    expect(noTokenRecords.answer).toContain("no token-transfer records were returned");
    expect(noTokenRecords.answer).toContain("does not prove nothing moved");
    expect(noTokenRecords.summaryBullets.join(" ")).toContain("this is not proof of no token movement");

    const valueUnknown = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, valueEth: undefined }
    }, "en", "moved");
    expect(valueUnknown.answer).toContain("The attached native ETH amount is unavailable");
    expect(valueUnknown.summaryBullets.join(" ")).toContain("unavailable is not zero");
  });

  it("distinguishes success, failure and pending outcomes", async () => {
    const succeeded = await service().answer("ignored", transaction, "en", "success");
    expect(succeeded.answer).toContain("succeeded on Robinhood Chain");

    const failed = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, status: "0x0", failureDetail: "execution reverted" }
    }, "en", "success");
    expect(failed.answer).toContain("failed on Robinhood Chain");
    expect(failed.answer).toContain("network fee can still be charged");
    expect(failed.summaryBullets.join(" ")).toContain("failure detail");

    const pending = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, status: "pending" }
    }, "en", "success");
    expect(pending.answer).toContain("pending");
  });

  it("reports only an actual fee as paid, exactly, and never presents gas as the fee", async () => {
    const answer = await service().answer("ignored", transaction, "en", "fees");
    expect(answer.answer).toContain("paid network fee of exactly 0.000021 ETH");
    expect(answer.summaryBullets.join(" ")).toContain("Provider-reported fee type: actual");
    expect(answer.summaryBullets.join(" ")).toContain("21,000 gas units");
    expect(answer.summaryBullets.join(" ")).toContain("not an ETH or dollar fee");
    // Exact amount stays accessible in the normalized facts.
    expect(transaction.facts.fee).toEqual({ type: "actual", value: "21000000000000" });
  });

  it("never presents maximum, estimated or pending amounts as a paid fee", async () => {
    for (const type of ["maximum", "estimated", "pending"] as const) {
      const answer = await service().answer("ignored", {
        ...transaction,
        facts: { ...transaction.facts, fee: { type, value: "21000000000000" } }
      }, "en", "fees");
      expect(answer.answer).toContain("not a confirmed paid fee");
      expect(answer.answer).toContain(`${type} network amount`);
      expect(answer.answer).not.toContain("paid network fee of exactly");
      expect(answer.summaryBullets.join(" ")).toContain(`Reported fee type: ${type}`);
    }
  });

  it("treats an unknown fee discriminant or oversized value as unknown", async () => {
    const unknownType = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, fee: { type: "mystery", value: "21000000000000" } }
    }, "en", "fees");
    expect(unknownType.answer).toContain("could not be determined");

    const oversized = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, fee: { type: "actual", value: "1".repeat(120) } }
    }, "en", "fees");
    expect(oversized.answer).toContain("could not be determined");
  });

  it("marks an imprecise compact actual fee as rounded and keeps a tiny nonzero fee visible", async () => {
    const rounded = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, fee: { type: "actual", value: "21000000012345" } }
    }, "en", "fees");
    expect(rounded.answer).toContain("about 0.000021 ETH");
    expect(rounded.answer).toContain("rounded");
    expect(rounded.answer).toContain("exact amount is in the cited facts");

    const tiny = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, fee: { type: "actual", value: "1" } }
    }, "en", "fees");
    expect(tiny.answer).not.toContain(" 0 ETH");
    expect(tiny.answer).toMatch(/<0\.000001 ETH/);
  });

  it("never guesses units for an unknown fee object or a JS number", async () => {
    const weird = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, fee: { type: "mystery", value: "21000000000000" } }
    }, "en", "fees");
    expect(weird.answer).toContain("could not be determined");

    const numeric = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, fee: { type: "actual", value: 21000000000000 } }
    }, "en", "fees");
    expect(numeric.answer).toContain("could not be determined");
  });

  it("computes only a gas component from decimal or RPC-hex gas fields", async () => {
    const decimal = await service().answer("ignored", {
      ...transaction,
      facts: { status: "0x1", valueEth: "0", gasUsed: "21000", gasPriceWei: "1000000000" }
    }, "en", "fees");
    expect(decimal.answer).toContain("exact total fee was not returned");
    expect(decimal.answer).toContain("gas component of about 0.000021 ETH");
    expect(decimal.answer).toContain("not the total fee");
    expect(decimal.summaryBullets.join(" ")).toContain("Computed gas component only");

    const rpcHex = await service().answer("ignored", {
      ...transaction,
      facts: { status: "0x1", valueEth: "0", gasUsed: "0x5208", gasPriceWei: "0x3b9aca00" }
    }, "en", "fees");
    expect(rpcHex.answer).toContain("gas component of about 0.000021 ETH");

    const noGas = await service().answer("ignored", {
      ...transaction,
      facts: { status: "0x1", valueEth: "0" }
    }, "en", "fees");
    expect(noGas.answer).toContain("do not include gas used or a final fee amount");
    expect(noGas.answer).not.toContain("reports");
  });

  it("reports a missing fee as unknown rather than zero", async () => {
    const answer = await service().answer("ignored", {
      ...transaction,
      facts: { ...transaction.facts, fee: undefined }
    }, "en", "fees");
    expect(answer.answer).toContain("could not be determined");
    expect(answer.answer).toContain("attached native value is not the fee");
    expect(answer.summaryBullets.join(" ")).toContain("Missing:");
  });

  it("describes token identity from returned metadata without authenticating it", async () => {
    const answer = await service().answer("ignored", token, "en", "token");
    expect(answer.answer).toContain("Example Dollar (EXD)");
    expect(answer.answer).toContain("does not prove the real-world project");
    expect(answer.summaryBullets.join(" ")).toContain("1,234.5 tokens");
    expect(answer.summaryBullets.join(" ")).toContain("reported unverified");
    expect(answer.summaryBullets.join(" ")).toContain("not a legitimacy or safety verdict");
    // The full contract stays accessible; the shortened form is only display.
    expect(answer.summaryBullets.join(" ")).toContain(token.value);
    expect(answer.summaryBullets.join(" ")).not.toContain("1234500000000000000000");
  });

  it("omits supply when decimals are incompatible instead of inventing a scale", async () => {
    const answer = await service().answer("ignored", {
      ...token,
      facts: { ...token.facts, decimals: "unknown" }
    }, "en", "token");
    expect(answer.summaryBullets.join(" ")).not.toContain("total supply");
    expect(answer.summaryBullets.join(" ")).not.toContain("1234500000000000000000");
  });

  it("separates verifiable facts from labels and identity claims", async () => {
    const answer = await service().answer("ignored", token, "en", "verify");
    expect(answer.answer).toContain("What can be verified here");
    expect(answer.answer).toContain("does not authenticate a project");
    expect(answer.summaryBullets.join(" ")).toContain(`Exact contract address: ${token.value}.`);
    expect(answer.summaryBullets.join(" ")).toContain("not proof the project is legitimate or safe");
    expect(answer.answer).not.toContain("safe");
  });

  it("falls back to a factual overview note when a task does not fit the resolved entity", async () => {
    const answer = await service().answer("ignored", token, "en", "holdings");
    expect(answer.answer).toContain("fits a different kind of identifier");
    expect(answer.answer).toContain("overview explains the available Robinhood Chain facts");
    expect(answer.answer).not.toContain("positive token balance");
  });

  it("returns Simplified Chinese for goal tasks", async () => {
    const answer = await service().answer("ignored", {
      ...wallet,
      facts: {
        address: wallet.value,
        nativeBalanceEth: "0.25",
        tokenBalanceCoverage: "reviewed_asset_sample",
        tokenBalanceContractsChecked: 12,
        tokenBalances: [{ tokenSymbol: "USDG", tokenName: "Global Dollar", formattedValue: "10" }]
      }
    }, "zh-CN", "holdings");
    expect(answer.answer).toMatch(/[\u4e00-\u9fff]/);
    expect(answer.summaryBullets.join(" ")).toContain("USDG");
    expect(answer.answer).not.toContain("not the wallet's complete portfolio");
  });

  it("keeps arbitrary freeform questions on the overview path", async () => {
    const answer = await service().answer("just curious", wallet, "en");
    expect(answer.answer).toContain("overview explains");
  });

  it("never duplicates the answer as a bullet and keeps takeaways distinct", async () => {
    const answer = await service().answer("ignored", transaction, "en", "moved");
    expect(answer.summaryBullets).not.toContain(answer.answer);
    expect(new Set(answer.summaryBullets).size).toBe(answer.summaryBullets.length);
  });

  it("passes provider-controlled strings through as plain text without executing them", async () => {
    const answer = await service().answer("ignored", {
      ...wallet,
      facts: {
        address: wallet.value,
        tokenBalanceCoverage: "reviewed_asset_sample",
        tokenBalanceContractsChecked: 12,
        tokenBalances: [{
          tokenSymbol: "<script>alert(1)</script>",
          tokenName: "\"><img src=x onerror=alert(2)>",
          formattedValue: "1"
        }]
      }
    }, "en", "holdings");
    const serialized = JSON.stringify(answer);
    expect(serialized).toContain("<script>alert(1)</script>");
    expect(JSON.parse(serialized).answer).toBe(answer.answer);
    expect(typeof answer.answer).toBe("string");
    expect(typeof answer.summaryBullets[0]).toBe("string");
  });
});

describe("private route goal metadata", () => {
  const emptyAnswer: AiExplorerAnswer = {
    answer: "ok",
    summaryBullets: [],
    confirmedFacts: [],
    inferences: [],
    facts: {},
    uncertainty: [],
    riskNotes: [],
    citations: [],
    suggestedQuestions: [],
    suggestedFollowUps: []
  };

  async function injectRoute(payload: Record<string, unknown>) {
    const answer = vi.fn(async () => emptyAnswer);
    const resolve = vi.fn(async () => ({
      entity: { ...wallet, facts: { ...wallet.facts, activityCoverage: "unavailable", tokenBalanceCoverage: "unavailable" } },
      providerDestinations: ["blockscout"],
      sources: []
    }));
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }), undefined, {
      privateAnalysis: { resolve, answer }
    });
    const before = { sessions: memoryStore.sessions.size, messages: memoryStore.messages.size };
    const response = await app.inject({ method: "POST", url: "/v1/private/analyze", payload });
    const after = { sessions: memoryStore.sessions.size, messages: memoryStore.messages.size };
    await app.close();
    return { response, answer, resolve, before, after };
  }

  it("accepts a known task and forwards it to the deterministic answer without persistence", async () => {
    const { response, answer, resolve, before, after } = await injectRoute({ entity: wallet.value, task: "holdings" });
    expect(response.statusCode).toBe(200);
    expect(answer).toHaveBeenCalledWith(expect.any(String), expect.any(Object), undefined, "holdings");
    // Task metadata never changes provider routing or the privacy receipt.
    expect(resolve).toHaveBeenCalledWith("unknown", wallet.value, {
      limit: 25,
      includeApprovals: false,
      privateMode: true
    });
    expect(response.json().privacy).toMatchObject({ modelProvider: "none", providerDestinations: ["blockscout"] });
    expect(after).toEqual(before);
  });

  it("rejects an unknown task value instead of silently ignoring it", async () => {
    const { response, answer } = await injectRoute({ entity: wallet.value, task: "make-me-rich" });
    expect(response.statusCode).toBe(400);
    expect(answer).not.toHaveBeenCalled();
  });

  it("keeps a freeform question valid with no task field", async () => {
    const { response, answer } = await injectRoute({ entity: wallet.value, question: "What can I notice?" });
    expect(response.statusCode).toBe(200);
    expect(answer).toHaveBeenCalledWith("What can I notice?", expect.any(Object));
  });
});
