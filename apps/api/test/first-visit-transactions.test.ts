import { describe, expect, it } from "vitest";
import { encodeAbiParameters, toEventSelector, toFunctionSelector, type Address } from "viem";
import { loadEnv } from "../src/config/env.js";
import { AlchemyProvider } from "../src/chain/alchemy.js";
import { normalizeEntity } from "../src/chain/normalize.js";
import { AiService } from "../src/ai/service.js";
import { UNISWAP_V3_FACTORY } from "../src/exit-check/constants.js";
import { RESEARCH_MAX_RPC_SUBCALLS, type DecodedAction } from "../src/chain/transaction-actions.js";

const weth = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const usdg = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const from = `0x${"1".repeat(40)}`;
const to = `0x${"2".repeat(40)}`;
const pool = `0x${"3".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`;
const blockHash = `0x${"b".repeat(64)}`;
const uint = (value: bigint) => encodeAbiParameters([{ type: "uint256" }], [value]);
const abiAddress = (value: string) => encodeAbiParameters([{ type: "address" }], [value as Address]);
const indexed = (value: string) => abiAddress(value);
const transferTopic = toEventSelector("Transfer(address,address,uint256)");
const approvalTopic = toEventSelector("Approval(address,address,uint256)");
const swapTopic = toEventSelector("Swap(address,address,int256,int256,uint160,uint128,int24)");
const env = loadEnv({ NODE_ENV: "test", ENABLE_PUBLIC_RPC_FALLBACK: "true", AI_PROVIDER: "fallback" });

function transfer(address = usdg, amount = 250000000n, index = 0) {
  return { address, topics: [transferTopic, indexed(from), indexed(to)], data: uint(amount), logIndex: `0x${index.toString(16)}` };
}
function approval(amount: bigint) { return { ...transfer(usdg, amount), topics: [approvalTopic, indexed(from), indexed(to)] }; }
function swap(amount0 = 9971792718036424539n, amount1 = -23481520000n, index = 0, address = pool) {
  return { address, topics: [swapTopic, indexed(from), indexed(to)], logIndex: `0x${index.toString(16)}`,
    data: encodeAbiParameters([{ type: "int256" }, { type: "int256" }, { type: "uint160" }, { type: "uint128" }, { type: "int24" }],
      [amount0, amount1, 2n ** 96n, 1000n, 0]) };
}

async function research(logs: unknown[], options: { verified?: boolean; status?: string; error?: boolean; metadata?: unknown } = {}) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const rpc = new AlchemyProvider(env, { async requestJson(_url, init) {
    const request = JSON.parse(String(init?.body));
    calls.push(request);
    if (request.method === "eth_getTransactionByHash") return { result: { hash, from, to, value: "0x0", blockHash, blockNumber: "0x2a" } };
    if (request.method === "eth_getTransactionReceipt") return { result: { transactionHash: hash, blockHash, blockNumber: "0x2a",
      status: options.status ?? "0x1", gasUsed: "0x5208", logs } };
    if (options.error) throw new Error("RPC unavailable");
    const { to: target, data } = request.params[0];
    if (target === UNISWAP_V3_FACTORY) {
      expect(data).toBe(toFunctionSelector("getPool(address,address,uint24)") + encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "uint24" }], [weth, usdg, 500]).slice(2));
      // Each synthetic pool is factory-confirmed only when requested by the fixture.
      const poolRead = [...calls].reverse().find((call) => (call.params[0] as { data?: string }).data === toFunctionSelector("token0()"));
      return { result: abiAddress(options.verified === false ? from : (poolRead!.params[0] as { to: string }).to) };
    }
    if (data === toFunctionSelector("token0()")) return { result: abiAddress(weth) };
    if (data === toFunctionSelector("token1()")) return { result: abiAddress(usdg) };
    if (data === toFunctionSelector("fee()")) return { result: uint(500n) };
    if (data === toFunctionSelector("symbol()")) return { result: options.metadata ?? encodeAbiParameters([{ type: "string" }], ["DEMO"]) };
    if (data === toFunctionSelector("decimals()")) return { result: uint(6n) };
    throw new Error("unexpected read");
  } });
  const docs = await rpc.getTransaction(hash);
  const entity = normalizeEntity(4663, "transaction", hash, docs);
  return { entity, calls, actions: entity.facts.decodedActions as DecodedAction[] };
}

describe("first visit receipt actions", () => {
  it.each([
    [9971792718036424539n, -23481520000n, weth, usdg, "9.971792718036424539", "23481.52"],
    [-9971792718036424539n, 23481520000n, usdg, weth, "23481.52", "9.971792718036424539"]
  ] as const)("decodes the verified pool's signed direction (%s, %s)", async (a, b, sold, bought, soldAmount, boughtAmount) => {
    const { entity, actions, calls } = await research([swap(a, b)]);
    expect(actions).toEqual([{ kind: "uniswap_v3_swap", logIndex: 0, pool, feeBps: 5,
      sold: { token: { address: sold, symbol: sold === weth ? "WETH" : "USDG", decimals: sold === weth ? 18 : 6 }, rawAmount: (a > 0n ? a : b).toString(), amount: soldAmount },
      bought: { token: { address: bought, symbol: bought === weth ? "WETH" : "USDG", decimals: bought === weth ? 18 : 6 }, rawAmount: (a < 0n ? -a : -b).toString(), amount: boughtAmount },
      sender: from, recipient: to }]);
    expect(entity.facts.decodeCoverage).toBe("decoded");
    expect(calls).toHaveLength(6);
    // Pool and token facts are read at the latest block: nodes without historical state refuse older ones.
    expect(calls.slice(2).every((call) => call.params[1] === "latest")).toBe(true);
  });

  it("keeps transfers when the pool fails factory verification", async () => {
    const { entity, actions } = await research([transfer(), swap(1n, -1n, 1)], { verified: false });
    expect(actions.map((action) => action.kind)).toEqual(["erc20_transfer"]);
    expect(entity.facts.decodeCoverage).toBe("partial");
  });

  it("decodes a reviewed-token transfer without extra RPC and preserves exact units", async () => {
    const { actions, calls } = await research([transfer()]);
    expect(actions).toEqual([{ kind: "erc20_transfer", logIndex: 0, token: { address: usdg, symbol: "USDG", decimals: 6 },
      from, to, rawAmount: "250000000", amount: "250" }]);
    expect(calls).toHaveLength(2);
  });

  it.each([0n, 250000000n, 2n ** 255n - 1n, 2n ** 255n, 2n ** 256n - 1n])("decodes allowance %s with the unlimited threshold", async (amount) => {
    const { actions } = await research([approval(amount)]);
    expect(actions[0]).toMatchObject({ kind: "erc20_approval", owner: from, spender: to, rawAmount: amount.toString(), unlimited: amount >= 2n ** 255n });
  });

  it.each([
    ["ERC-721", { ...transfer(), topics: [...transfer().topics, uint(42n)], data: "0x" }],
    ["short data", { ...transfer(), data: "0x01" }],
    ["noncanonical address", { ...transfer(), topics: [transferTopic, `0x${"f".repeat(64)}`, indexed(to)] }],
    ["removed", { ...transfer(), removed: true }],
    ["mismatched receipt", { ...transfer(), transactionHash: blockHash }],
    ["bad block", { ...transfer(), blockNumber: "0x2b" }],
    ["fractional index", { ...transfer(), logIndex: "0x1.2" }],
    ["same-sign swap", swap(1n, 1n)],
    ["zero swap", swap(0n, -1n)]
  ])("leaves %s undecoded without metadata requests", async (_label, log) => {
    const { entity, actions, calls } = await research([log]);
    expect(actions).toEqual([]);
    expect(entity.facts.decodeCoverage).toBe("none");
    expect(calls).toHaveLength(2);
  });

  it("does not duplicate a log index and marks mixed logs partial", async () => {
    const { entity, actions } = await research([transfer(), transfer(), {}]);
    expect(actions).toHaveLength(1);
    expect(entity.facts.decodeCoverage).toBe("partial");
  });

  it("limits metadata to six distinct tokens, including reviewed ones", async () => {
    const logs = Array.from({ length: 7 }, (_, index) => transfer(`0x${(index + 1).toString(16).repeat(40)}`, 1234567n, index));
    const { entity, actions, calls } = await research(logs);
    expect(actions).toHaveLength(7);
    expect(actions[5]).toMatchObject({ token: { symbol: "DEMO", decimals: 6 }, amount: "1.234567" });
    expect(actions[6]).toMatchObject({ token: { symbol: null, decimals: null }, amount: null });
    expect(entity.facts.decodeCoverage).toBe("partial");
    expect(calls).toHaveLength(14);
  });

  it("caps actions at 40 without claiming complete decoding", async () => {
    const { entity, actions, calls } = await research(Array.from({ length: 41 }, (_, i) => transfer(usdg, 1n, i)));
    expect(actions).toHaveLength(40);
    expect(entity.facts.decodeCoverage).toBe("partial");
    expect(calls).toHaveLength(2);
  });

  it("retains raw amounts on metadata failure", async () => {
    const { entity, actions } = await research([transfer(from)], { error: true });
    expect(actions[0]).toMatchObject({ token: { symbol: null, decimals: null }, rawAmount: "250000000", amount: null });
    expect(entity.facts.decodeCoverage).toBe("partial");
  });

  it("reuses RPC reads for repeated token metadata and pool verification", async () => {
    const { calls } = await research([transfer(from), transfer(from, 1n, 1), swap(1n, -1n, 2), swap(1n, -1n, 3)]);
    expect(calls).toHaveLength(8);
  });

  it("stops at the request subcall ceiling and preserves already decoded transfers", async () => {
    const logs = [transfer(), ...Array.from({ length: 10 }, (_, i) => swap(1n, -1n, i + 1, `0x${(i + 10).toString(16).padStart(40, "0")}`))];
    const { calls, entity, actions } = await research(logs);
    expect(calls).toHaveLength(RESEARCH_MAX_RPC_SUBCALLS);
    expect(entity.facts.decodeCoverage).toBe("partial");
    expect(actions.filter((action) => action.kind === "uniswap_v3_swap")).toHaveLength(5);
  });

  it("marks an empty receipt as no decoded actions", async () => {
    const { entity, calls } = await research([]);
    expect(entity.facts).toMatchObject({ decodedActions: [], decodeCoverage: "none" });
    expect(calls).toHaveLength(2);
  });
});

describe("first visit deterministic transaction words", () => {
  const ai = new AiService(env);
  it.each(["en", "zh-CN"] as const)("describes the swap and retains gas and ownership limits in %s", async (locale) => {
    const { entity } = await research([transfer(), swap(9971792718036424539n, -23481520000n, 1)]);
    const answer = await ai.answer("Explain", entity, locale);
    expect(answer.answer).toContain("≈9.971792 WETH");
    expect(answer.answer).toContain("23,481.52 USDG");
    expect(answer.answer).toContain("0.05%");
    expect(answer.answer).toContain(locale === "en" ? "1 other decoded action" : "还有 1 个已解码操作");
    expect(answer.summaryBullets.join(" ")).toContain(locale === "en" ? "21,000 gas units" : "21,000 个 gas 单位");
    expect(answer.summaryBullets.join(" ")).toContain(locale === "en" ? "do not identify their owners" : "无法识别其所有者");
    expect(answer.answer).not.toContain("action was not decoded");
    expect(answer.answer).not.toMatch(/\b(?:safe|unsafe|guaranteed|will|best|recommended|free)\b/i);
  });

  it.each(["en", "zh-CN"] as const)("describes transfer, limited and unlimited allowance in %s", async (locale) => {
    for (const [log, en, zh] of [
      [transfer(), "It moved 250 USDG", "250 USDG 从"],
      [approval(250000000n), "an allowance of 250 USDG", "250 USDG 的额度授权"],
      [approval(2n ** 255n), "an unlimited USDG allowance", "USDG 的无限额度授权"]
    ] as const) {
      const { entity } = await research([log]);
      const answer = await ai.answer("Explain", entity, locale);
      expect(answer.answer).toContain(locale === "en" ? en : zh);
      expect(answer.summaryBullets.join(" ")).toContain(locale === "en" ? en : zh);
    }
  });

  it.each(["en", "zh-CN"] as const)("qualifies failed logged actions in %s", async (locale) => {
    const { entity, actions } = await research([transfer(), swap(1n, -1n, 1)], { status: "0x0" });
    expect(actions).toHaveLength(2);
    const answer = await ai.answer("Explain", entity, locale);
    expect(answer.answer).toContain(locale === "en" ? "logged actions did not take effect" : "日志中的操作没有生效");
    expect(answer.answer).not.toMatch(/It swapped|It moved|It set/);
  });

  it("summarises only the first three actions and counts the rest", async () => {
    const { entity } = await research(Array.from({ length: 5 }, (_, i) => transfer(usdg, 1n, i)));
    const answer = await ai.answer("Explain", entity);
    expect(answer.answer.match(/It moved/g)).toHaveLength(3);
    expect(answer.answer).toContain("2 other decoded actions");
  });

  it("keeps small fractions and unknown metadata explicit", async () => {
    const { entity } = await research([transfer(weth, 123456789n)]);
    expect((await ai.answer("Explain", entity)).answer).toContain("≈0.000000000123456 WETH");
    const unknown = await research([transfer(from)], { error: true });
    expect((await ai.answer("Explain", unknown.entity)).answer).toContain("250000000 raw units");
    expect((await ai.answer("Explain", unknown.entity)).answer).toContain("decimals unknown");
    expect((await ai.answer("Explain", unknown.entity)).answer).toContain("Decoding is partial");
  });

  it.each(["en", "zh-CN"] as const)("keeps today's no-decoding sentences in %s", async (locale) => {
    const { entity } = await research([]);
    const answer = await ai.answer("Explain", entity, locale);
    expect(answer.answer).toBe(locale === "en"
      ? "This transaction succeeded on Robinhood Chain. The action was not decoded, so this result cannot tell you whether it was a swap, approval, or another action."
      : "这笔交易在 Robinhood Chain 上已成功。该操作未被解码，因此这个结果无法告诉你它是兑换、授权还是其他操作。");
  });
});
