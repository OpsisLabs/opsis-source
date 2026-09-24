import Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@anthropic-ai/sdk/resources/messages.js";
import { describe, expect, it, vi } from "vitest";
import { ClaudeProvider } from "../src/ai/claude-provider.js";
import type { AiSpendReservationLedger } from "../src/ai/spend-budget.js";

function message(content: unknown = [{ type: "text", text: "A grounded explanation." }], usage = { input_tokens: 12, output_tokens: 7 }): Message {
  return {
    id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5", content: content as Message["content"],
    stop_reason: "end_turn", stop_sequence: null, usage: usage as Message["usage"],
  } as Message;
}

function publicFactsEnvelope(facts: Record<string, unknown> = { holderCount: 12 }) {
  return {
    version: 1,
    chainId: 4663,
    subject: { kind: "token", identifier: `0x${"a".repeat(40)}` },
    sourceIds: ["chain-read:4663:block:123"],
    facts,
  };
}

function setup(reply: () => Promise<Message> = async () => message(), reserve = vi.fn(async () => ({
  status: "reserved" as const, remainingDailyMicroUsd: 10_000_000, remainingMonthlyMicroUsd: 20_000_000,
}))) {
  const create = vi.fn(async () => reply());
  const provider = new ClaudeProvider({
    apiKey: "test-key",
    ledger: { reserve } as AiSpendReservationLedger,
    client: { create } as never,
    maxOutputTokens: 500,
  });
  return { provider, reserve, create };
}

describe("ClaudeProvider", () => {
  it("reserves the exact conservative integer upper bound before sending bounded serialized input", async () => {
    const { provider, reserve, create } = setup();
    const input = publicFactsEnvelope({ holderCount: 12, topHolderShareBps: 6500, paused: false });
    const serialized = JSON.stringify(input);
    const inputBytes = new TextEncoder().encode("Explain.").byteLength + new TextEncoder().encode(serialized).byteLength;
    const exactMicroUsd = (inputBytes + 1_024) * 25 + 500 * 100;

    await expect(provider.generateAnswer("Explain.", input)).resolves.toMatchObject({
      text: "A grounded explanation.", tokenUsage: { input_tokens: 12, output_tokens: 7, total_tokens: 19 },
    });
    expect(reserve).toHaveBeenCalledExactlyOnceWith(exactMicroUsd);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: "claude-opus-5", max_tokens: 500, system: "Explain.", messages: [{ role: "user", content: serialized }],
    });
  });

  it("reserves separately for concurrent calls and for later calls", async () => {
    const { provider, reserve, create } = setup();
    await Promise.all([
      provider.generateAnswer("system", publicFactsEnvelope({ holderCount: 1 })),
      provider.summarizeEntity("system", publicFactsEnvelope({ holderCount: 2 })),
    ]);
    await provider.generateAnswer("system", publicFactsEnvelope({ holderCount: 3 }));
    expect(reserve).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it.each([
    [{ status: "exhausted", remainingDailyMicroUsd: 0, remainingMonthlyMicroUsd: 0 }, "CLAUDE_SPEND_CAP_EXHAUSTED"],
    [{ status: "unavailable" }, "CLAUDE_SPEND_RESERVATION_UNAVAILABLE"],
  ] as const)("does not call the SDK when reservation returns %s", async (result, error) => {
    const { provider, create } = setup(async () => message(), vi.fn(async () => result as never));
    await expect(provider.generateAnswer("system", publicFactsEnvelope())).rejects.toThrow(error);
    expect(create).not.toHaveBeenCalled();
  });

  it("fails closed when the ledger throws or returns an unknown state", async () => {
    const { provider, create } = setup(async () => message(), vi.fn(async () => { throw new Error("redis"); }));
    await expect(provider.generateAnswer("system", publicFactsEnvelope())).rejects.toThrow("CLAUDE_SPEND_RESERVATION_UNAVAILABLE");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects invalid pricing/configuration and invalid or oversized input before reservation", async () => {
    expect(() => new ClaudeProvider({ apiKey: "k", ledger: { reserve: vi.fn() }, inputMicroUsdPerToken: 0 })).toThrow(/positive safe integer/);
    expect(() => new ClaudeProvider({ apiKey: "k", ledger: { reserve: vi.fn() }, model: " " })).toThrow(/model/);
    expect(() => new ClaudeProvider({ apiKey: "k", ledger: { reserve: vi.fn() }, model: "claude-next" })).toThrow(/explicit input and output/);
    expect(() => new ClaudeProvider({ apiKey: "k", ledger: { reserve: vi.fn() }, model: "claude-next", inputMicroUsdPerToken: 20 })).toThrow(/explicit input and output/);
    expect(() => new ClaudeProvider({ apiKey: "k", ledger: { reserve: vi.fn() }, model: "claude-next", inputMicroUsdPerToken: 20, outputMicroUsdPerToken: 80 })).not.toThrow();
    const { provider, reserve, create } = setup();
    await expect(provider.generateAnswer("system", undefined)).rejects.toThrow(/public-facts envelope/);
    const capped = new ClaudeProvider({
      apiKey: "k", ledger: { reserve }, client: { create } as never, maxInputBytes: 3,
    });
    await expect(capped.generateAnswer("system", publicFactsEnvelope())).rejects.toThrow(/byte cap/);
    expect(reserve).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects raw questions and private or arbitrary nested payloads before reservation or SDK access", async () => {
    const { provider, reserve, create } = setup();
    const rejectedInputs = [
      "Why is this token risky?",
      { question: "Why is this token risky?" },
      { ...publicFactsEnvelope(), labels: ["personal label"] },
      { ...publicFactsEnvelope(), facts: { ...publicFactsEnvelope().facts, notes: "private note" } },
      { ...publicFactsEnvelope(), facts: { ...publicFactsEnvelope().facts, weights: { portfolio: 0.5 } } },
      { ...publicFactsEnvelope(), facts: { ...publicFactsEnvelope().facts, arbitrary: { nested: true } } },
      { ...publicFactsEnvelope(), facts: { ...publicFactsEnvelope().facts, holderCount: "12" } },
    ];
    for (const input of rejectedInputs) {
      await expect(provider.generateAnswer("system", input)).rejects.toThrow();
    }
    expect(reserve).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("does not retry a failed SDK call and rejects malformed or non-text replies", async () => {
    const sdk = new Anthropic({ apiKey: "test-key", maxRetries: 0, timeout: 1_000 });
    expect(sdk.maxRetries).toBe(0);
    expect(sdk.timeout).toBe(1_000);

    const failed = setup(async () => { throw new Error("provider failure"); });
    await expect(failed.provider.generateAnswer("system", publicFactsEnvelope())).rejects.toThrow("provider failure");
    expect(failed.create).toHaveBeenCalledOnce();

    const empty = setup(async () => message([{ type: "text", text: "   " }]));
    await expect(empty.provider.generateAnswer("system", publicFactsEnvelope())).rejects.toThrow("CLAUDE_EMPTY_RESPONSE");
    const unexpected = setup(async () => message([{ type: "tool_use", id: "x", name: "anything", input: {} }]));
    await expect(unexpected.provider.generateAnswer("system", publicFactsEnvelope())).rejects.toThrow("CLAUDE_UNEXPECTED_CONTENT");
  });
});
