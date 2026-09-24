import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages.js";
import type { AiProvider, AiProviderResult } from "./provider.js";
import type { AiSpendReservationLedger } from "./spend-budget.js";

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_INPUT_BYTE_CAP = 64 * 1024;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;
const DEFAULT_TIMEOUT_MS = 20_000;
// Conservative ceiling over the currently documented Opus 5 base rates ($5/$25 per MTok).
// Rates are integer micro-USD per token: $25/MTok input and $100/MTok output.
const DEFAULT_INPUT_MICRO_USD_PER_TOKEN = 25;
const DEFAULT_OUTPUT_MICRO_USD_PER_TOKEN = 100;
// Adds 1,024 tokens for message framing and protocol overhead. No tools/cache/thinking are enabled.
const PROMPT_PROTOCOL_OVERHEAD_TOKENS = 1_024;
const PUBLIC_FACT_KEYS = new Set([
  "blockNumber",
  "holderCount",
  "topHolderShareBps",
  "mintAuthorityPresent",
  "freezeAuthorityPresent",
  "paused",
  "proxyDetected",
  "transferFeeBps",
]);

/**
 * Versioned allowlist for model context. Provider admission and source terms/rights review remain separate.
 */
type PublicFactsEnvelope = {
  version: 1;
  chainId: number;
  subject: { kind: "token" | "wallet" | "transaction"; identifier: string };
  sourceIds: string[];
  facts: Record<string, number | boolean>;
};

type ClaudeMessagesClient = {
  create(params: MessageCreateParamsNonStreaming): Promise<Message>;
};

export type ClaudeProviderOptions = {
  apiKey: string;
  ledger: AiSpendReservationLedger;
  model?: string;
  client?: ClaudeMessagesClient;
  maxInputBytes?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  inputMicroUsdPerToken?: number;
  outputMicroUsdPerToken?: number;
};

/** Claude provider with a fail-closed, pre-request global spend reservation. */
export class ClaudeProvider implements AiProvider {
  private readonly client: ClaudeMessagesClient;
  private readonly model: string;
  private readonly maxInputBytes: number;
  private readonly maxOutputTokens: number;
  private readonly inputMicroUsdPerToken: number;
  private readonly outputMicroUsdPerToken: number;

  constructor(private readonly options: ClaudeProviderOptions) {
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxInputBytes = options.maxInputBytes ?? DEFAULT_INPUT_BYTE_CAP;
    this.maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const customModel = this.model !== DEFAULT_MODEL;
    if (customModel && (options.inputMicroUsdPerToken === undefined || options.outputMicroUsdPerToken === undefined)) {
      throw new RangeError("Custom Claude models require explicit input and output micro-USD/token upper bounds");
    }
    this.inputMicroUsdPerToken = options.inputMicroUsdPerToken ?? DEFAULT_INPUT_MICRO_USD_PER_TOKEN;
    this.outputMicroUsdPerToken = options.outputMicroUsdPerToken ?? DEFAULT_OUTPUT_MICRO_USD_PER_TOKEN;

    if (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0) {
      throw new RangeError("Claude API key must be configured");
    }
    if (typeof this.model !== "string" || this.model.trim().length === 0) {
      throw new RangeError("Claude model must be configured");
    }
    assertPositiveSafeInteger(this.maxInputBytes, "Claude input byte cap");
    assertPositiveSafeInteger(this.maxOutputTokens, "Claude max output tokens");
    assertPositiveSafeInteger(this.inputMicroUsdPerToken, "Claude input micro-USD/token upper bound");
    assertPositiveSafeInteger(this.outputMicroUsdPerToken, "Claude output micro-USD/token upper bound");
    assertPositiveSafeInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "Claude timeout");

    this.client = options.client ?? new Anthropic({
      apiKey: options.apiKey,
      maxRetries: 0,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }).messages;
  }

  generateAnswer(systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    return this.request(systemInstructions, input);
  }

  summarizeEntity(systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    return this.request(systemInstructions, input);
  }

  private async request(systemInstructions: string, input: unknown): Promise<AiProviderResult> {
    if (typeof systemInstructions !== "string" || systemInstructions.trim().length === 0) {
      throw new TypeError("Claude system instructions must be a non-empty string");
    }
    const serializedInput = serializePublicFactsEnvelope(input);

    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(systemInstructions).byteLength + encoder.encode(serializedInput).byteLength;
    if (inputBytes > this.maxInputBytes) throw new RangeError("Claude input exceeds configured byte cap");

    // UTF-8 byte count is a conservative token ceiling for text; add framing allowance.
    const inputTokenUpperBound = inputBytes + PROMPT_PROTOCOL_OVERHEAD_TOKENS;
    const costUpperBoundMicroUsd = inputTokenUpperBound * this.inputMicroUsdPerToken
      + this.maxOutputTokens * this.outputMicroUsdPerToken;
    if (!Number.isSafeInteger(costUpperBoundMicroUsd) || costUpperBoundMicroUsd <= 0) {
      throw new RangeError("Claude request cost upper bound is invalid");
    }

    let reservation;
    try {
      reservation = await this.options.ledger.reserve(costUpperBoundMicroUsd);
    } catch {
      throw new Error("CLAUDE_SPEND_RESERVATION_UNAVAILABLE");
    }
    if (reservation.status !== "reserved") {
      throw new Error(reservation.status === "exhausted" ? "CLAUDE_SPEND_CAP_EXHAUSTED" : "CLAUDE_SPEND_RESERVATION_UNAVAILABLE");
    }

    const response = await this.client.create({
      model: this.model,
      max_tokens: this.maxOutputTokens,
      system: systemInstructions,
      messages: [{ role: "user", content: serializedInput }],
    });
    return parseResponse(response);
  }
}

function parseResponse(response: Message): AiProviderResult {
  if (!response || response.type !== "message" || response.role !== "assistant"
    || (response.stop_reason !== "end_turn" && response.stop_reason !== "max_tokens")) {
    throw new Error("CLAUDE_INVALID_RESPONSE");
  }
  if (!Array.isArray(response.content) || response.content.length === 0) throw new Error("CLAUDE_EMPTY_RESPONSE");
  const texts: string[] = [];
  for (const block of response.content) {
    if (!block || block.type !== "text" || typeof block.text !== "string") throw new Error("CLAUDE_UNEXPECTED_CONTENT");
    texts.push(block.text);
  }
  const text = texts.join("").trim();
  if (!text) throw new Error("CLAUDE_EMPTY_RESPONSE");
  const usage = response.usage;
  const tokenUsage = usage && Number.isSafeInteger(usage.input_tokens) && Number.isSafeInteger(usage.output_tokens)
    ? {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        total_tokens: usage.input_tokens + usage.output_tokens,
      }
    : undefined;
  return { text, ...(tokenUsage ? { tokenUsage } : {}) };
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
}

function serializePublicFactsEnvelope(input: unknown): string {
  const envelope = ownRecord(input, "Claude input must be a versioned public-facts envelope");
  requireExactKeys(envelope, ["version", "chainId", "subject", "sourceIds", "facts"]);
  if (envelope.version !== 1) throw new TypeError("Unsupported Claude public-facts envelope version");
  if (!Number.isSafeInteger(envelope.chainId) || (envelope.chainId as number) <= 0 || (envelope.chainId as number) > 2_147_483_647) {
    throw new TypeError("Claude envelope chainId is invalid");
  }

  const subject = ownRecord(envelope.subject, "Claude envelope subject is invalid");
  requireExactKeys(subject, ["kind", "identifier"]);
  if (subject.kind !== "token" && subject.kind !== "wallet" && subject.kind !== "transaction") {
    throw new TypeError("Claude envelope subject kind is invalid");
  }
  const idPattern = subject.kind === "transaction" ? /^0x[0-9a-fA-F]{64}$/ : /^0x[0-9a-fA-F]{40}$/;
  if (typeof subject.identifier !== "string" || !idPattern.test(subject.identifier)) {
    throw new TypeError("Claude envelope public identifier is invalid");
  }

  if (!Array.isArray(envelope.sourceIds) || Object.getPrototypeOf(envelope.sourceIds) !== Array.prototype
    || envelope.sourceIds.length < 1 || envelope.sourceIds.length > 32
    || Reflect.ownKeys(envelope.sourceIds).length !== envelope.sourceIds.length + 1) {
    throw new TypeError("Claude envelope sourceIds are invalid");
  }
  const sourceIds: unknown[] = [];
  for (let index = 0; index < envelope.sourceIds.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(envelope.sourceIds, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new TypeError("Claude envelope sourceIds are invalid");
    sourceIds.push(descriptor.value);
  }
  if (sourceIds.some((sourceId) => typeof sourceId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(sourceId))
    || new Set(sourceIds).size !== sourceIds.length) {
    throw new TypeError("Claude envelope sourceIds are invalid");
  }

  const facts = ownRecord(envelope.facts, "Claude envelope facts are invalid");
  const factEntries = Object.entries(facts);
  if (factEntries.length < 1 || factEntries.length > PUBLIC_FACT_KEYS.size) {
    throw new TypeError("Claude envelope facts are invalid");
  }
  for (const [key, value] of factEntries) {
    if (!PUBLIC_FACT_KEYS.has(key)) throw new TypeError("Claude envelope contains an unapproved public fact key");
    if (["mintAuthorityPresent", "freezeAuthorityPresent", "paused", "proxyDetected"].includes(key)) {
      if (typeof value !== "boolean") throw new TypeError(`Claude public fact ${key} must be boolean`);
    } else if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new TypeError(`Claude public fact ${key} must be a non-negative safe integer`);
    }
    if ((key === "topHolderShareBps" || key === "transferFeeBps") && (value as number) > 10_000) {
      throw new TypeError(`Claude public fact ${key} is out of range`);
    }
  }

  const normalized: PublicFactsEnvelope = {
    version: 1,
    chainId: envelope.chainId as number,
    subject: { kind: subject.kind, identifier: subject.identifier as string },
    sourceIds: sourceIds as string[],
    facts: facts as Record<string, number | boolean>,
  };
  return JSON.stringify(normalized);
}

function ownRecord(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(message);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(message);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, expected: string[]): void {
  const actual = Object.keys(record);
  if (actual.length !== expected.length || expected.some((key) => !Object.hasOwn(record, key))) {
    throw new TypeError("Claude public-facts envelope has unexpected fields");
  }
}
