import type { AiExplorerAnswer, NormalizedEntity } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import { z } from "zod";
import { observeAiCall } from "../observability/metrics.js";
import { OllamaProvider, OpenAiProvider, type AiProvider } from "./provider.js";

const SYSTEM_INSTRUCTIONS = [
  "You explain Robinhood Chain activity to curious people who are not blockchain engineers.",
  "",
  "Everything you are shown happened on Robinhood Chain, an Ethereum layer-2 network",
  "(chain ID 4663). Never describe it as Ethereum mainnet or say a token lives 'on",
  "Ethereum'. Say 'on Robinhood Chain'. Standards such as ERC-20 still apply and can",
  "be named.",
  "",
  "How to write:",
  "- Open with what this thing IS, in one sentence a newcomer understands.",
  "- Plain English, short sentences. Gloss any unavoidable jargon in a few words.",
  "- Write about the thing itself, never about how you obtained the data. Never mention",
  "  providers, source records, citations, indexing, normalization, or how many data",
  "  sources agreed. The reader cares about the chain, not the pipeline.",
  "- Never restate raw field names like coinBalance, rawSourceCount or transactionsFetched.",
  "  Translate them: 'has never held any ETH', not 'zero native coin balance'.",
  "- Describe absent data as what it means in practice. Nothing at all to report is a",
  "  short answer, not a list of everything that is zero.",
  "- Format numbers for humans: 1,000,000,000 tokens, not raw wei or exponents.",
  "- The interface already shows the address, so do not repeat it in full. Say 'this",
  "  token' or 'this wallet'. Shorten any other address to its 0x1234…abcd form.",
  "",
  "Accuracy and safety:",
  "- Use only the supplied facts. Never invent on-chain activity.",
  "- Say plainly when something is unknown rather than implying it is absent.",
  "- No financial, investment, tax, legal, trading, or compliance advice, and never",
  "  recommend buying, selling, swapping, approving, or signing anything.",
  "- Report risk signals as observations with their evidence. No absolute scam or",
  "  safety verdicts, and no reassurance that something is safe.",
  "",
  "Return strict JSON with answer, summaryBullets, inferences, uncertainty, and suggestedFollowUps.",
  "summaryBullets: at most four, each a distinct takeaway, no repetition of the answer text.",
  "suggestedFollowUps: questions this specific entity makes worth asking next."
].join("\n");

const aiOutputSchema = z.object({
  answer: z.string().min(1),
  summaryBullets: z.array(z.string()).optional(),
  confirmedFacts: z.array(z.object({ fact: z.string(), sourceIds: z.array(z.string()) })).optional(),
  inferences: z.array(z.object({
    inference: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
    sourceIds: z.array(z.string())
  })).optional(),
  facts: z.record(z.unknown()).optional(),
  uncertainty: z.array(z.string()).optional(),
  riskNotes: z.array(z.unknown()).optional(),
  citations: z.array(z.unknown()).optional(),
  suggestedQuestions: z.array(z.string()).optional(),
  suggestedFollowUps: z.array(z.string()).optional()
}).strict();

type RawAiAnswer = z.infer<typeof aiOutputSchema>;

export class AiService {
  private readonly provider?: AiProvider;

  constructor(env: Env, provider?: AiProvider) {
    this.provider = provider ?? selectProvider(env);
  }

  async answer(question: string, entity: NormalizedEntity): Promise<AiExplorerAnswer> {
    if (!this.provider) {
      observeAiCall(0, "fallback");
      return deterministicAnswer(question, entity);
    }
    const startedAt = Date.now();
    let validationError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.provider.generateAnswer(SYSTEM_INSTRUCTIONS, {
          question,
          entity: buildAiEntityInput(entity),
          ...(validationError ? { correction: `The previous JSON was invalid: ${validationError}` } : {}),
          requiredResponseShape: {
            answer: "string",
            summaryBullets: "string[]",
            inferences: "{ inference: string; confidence: low|medium|high; sourceIds: string[] }[]",
            uncertainty: "string[]",
            suggestedFollowUps: "string[]"
          }
        });
        const parsed = aiOutputSchema.safeParse(JSON.parse(result.text));
        if (!parsed.success) {
          observeAiCall((Date.now() - startedAt) / 1000, "invalid");
          validationError = parsed.error.issues.map((issue) => issue.message).join("; ").slice(0, 500);
          continue;
        }
        observeAiCall((Date.now() - startedAt) / 1000, "success");
        return sanitizeAnswer(parsed.data, entity, result.tokenUsage);
      } catch (error) {
        validationError = error instanceof Error ? error.message : "invalid response";
      }
    }
    observeAiCall((Date.now() - startedAt) / 1000, "error");
    return deterministicAnswer(question, entity, ["AI provider failed or returned invalid output; deterministic fallback was used."]);
  }
}

/**
 * Bookkeeping the model should never narrate. These are pipeline details, and
 * when they reach the prompt the answer starts describing how the data was
 * fetched instead of what is on the chain.
 */
const INTERNAL_FACT_KEYS = new Set([
  "sourceIds",
  "rawSourceCount",
  "explorerUrl",
  "chainId",
  "highValueThresholdWei",
  "activityTimeWindow"
]);

function buildAiEntityInput(entity: NormalizedEntity): unknown {
  const visibleFacts = Object.fromEntries(
    Object.entries(entity.facts).filter(([key]) => !INTERNAL_FACT_KEYS.has(key))
  );
  const compactFacts = compactValue(visibleFacts, 0);
  const serializedFacts = JSON.stringify(compactFacts);
  return {
    chain: "Robinhood Chain, an Ethereum layer-2 network",
    chainId: entity.chainId,
    type: entity.type,
    facts: serializedFacts.length <= 6_000
      ? compactFacts
      : { preview: serializedFacts.slice(0, 6_000), truncated: true },
    // Ids and fields only: passing provider names and descriptions invites the
    // model to write about where the data came from.
    citations: entity.citations.slice(0, 25).map((citation) => ({
      id: citation.id,
      fieldsUsed: citation.fieldsUsed.slice(0, 25)
    })),
    riskNotes: entity.riskNotes.slice(0, 10).map((note) => ({
      severity: note.severity,
      title: note.title.slice(0, 200),
      detail: note.detail.slice(0, 500)
    }))
  };
}

function compactValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) {
    return {
      totalItems: value.length,
      sample: value.slice(0, 5).map((item) => compactValue(item, depth + 1))
    };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (depth >= 2) return { fieldCount: entries.length, nestedDataOmitted: true };
    return Object.fromEntries(entries.slice(0, 25).map(([key, item]) => [key, compactValue(item, depth + 1)]));
  }
  return String(value).slice(0, 500);
}

function selectProvider(env: Env): AiProvider | undefined {
  if (env.AI_PROVIDER === "ollama") return new OllamaProvider(env);
  if (env.AI_PROVIDER === "openai") return new OpenAiProvider(env);
  if (env.AI_PROVIDER === "auto" && env.OPENAI_API_KEY) return new OpenAiProvider(env);
  return undefined;
}

function deterministicAnswer(question: string, entity: NormalizedEntity, extraUncertainty: string[] = []): AiExplorerAnswer {
  const riskText = entity.riskNotes.length > 0 ? ` I found ${entity.riskNotes.length} risk note(s) based on the available source data.` : " I did not find specific risk notes in the currently normalized data.";
  return {
    answer: `This is a read-only explanation for the ${entity.type} ${entity.value}. The available facts are summarized from provider data and linked citations.${riskText} This is informational only and not financial advice.`,
    summaryBullets: buildSummaryBullets(entity),
    confirmedFacts: buildConfirmedFacts(entity),
    inferences: [],
    facts: entity.facts,
    uncertainty: [
      "Provider data may be incomplete or temporarily unavailable.",
      "Risk notes are heuristic signals, not guarantees of safety or malicious intent.",
      ...extraUncertainty
    ],
    riskNotes: entity.riskNotes,
    citations: entity.citations,
    suggestedQuestions: [
      "What source data supports this answer?",
      entity.type === "transaction" ? "Why did this transaction fail or succeed?" : "Summarize recent activity for this address.",
      "Are there any evidence-based risk notes?"
    ],
    suggestedFollowUps: [
      "What source data supports this answer?",
      entity.type === "transaction" ? "Why did this transaction fail or succeed?" : "Summarize recent activity for this address.",
      "Are there any evidence-based risk notes?"
    ]
  };
}

function sanitizeAnswer(raw: RawAiAnswer, entity: NormalizedEntity, tokenUsage?: Record<string, number>): AiExplorerAnswer {
  const fallback = deterministicAnswer("", entity);
  const candidate = typeof raw.answer === "string" ? raw.answer.trim().slice(0, 4000) : "";
  const suggested = cleanStrings(raw.suggestedFollowUps ?? raw.suggestedQuestions, 5, 300, fallback.suggestedQuestions);
  return {
    answer: candidate && !containsUnsafeDirective(candidate) ? candidate : fallback.answer,
    summaryBullets: cleanStrings(raw.summaryBullets, 10, 500, fallback.summaryBullets),
    confirmedFacts: buildConfirmedFacts(entity),
    inferences: cleanInferences(raw.inferences, entity),
    facts: entity.facts,
    uncertainty: cleanStrings(raw.uncertainty, 10, 500, fallback.uncertainty),
    riskNotes: entity.riskNotes,
    citations: entity.citations,
    suggestedQuestions: suggested,
    suggestedFollowUps: suggested,
    ...(tokenUsage ? { tokenUsage } : {})
  };
}

function buildSummaryBullets(entity: NormalizedEntity): string[] {
  return [
    `Resolved a Robinhood Chain ${entity.type}.`,
    `${entity.citations.length} source record(s) support the normalized result.`,
    `${entity.riskNotes.length} evidence-based risk note(s) were identified.`
  ];
}

function buildConfirmedFacts(entity: NormalizedEntity): AiExplorerAnswer["confirmedFacts"] {
  const sourceIds = entity.citations.map((citation) => citation.id);
  return Object.entries(entity.facts).slice(0, 25).map(([key, value]) => ({
    fact: `${key}: ${typeof value === "object" ? JSON.stringify(value).slice(0, 500) : String(value)}`,
    sourceIds
  }));
}

function cleanInferences(value: RawAiAnswer["inferences"], entity: NormalizedEntity): AiExplorerAnswer["inferences"] {
  if (!value) return [];
  const allowedSources = new Set(entity.citations.map((citation) => citation.id));
  return value.slice(0, 10).map((item) => ({
    inference: item.inference.trim().slice(0, 500),
    confidence: item.confidence,
    sourceIds: item.sourceIds.filter((id) => allowedSources.has(id))
  })).filter((item) => item.inference.length > 0);
}

function cleanStrings(value: unknown, maxItems: number, maxLength: number, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map(String).map((item) => item.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : fallback;
}

function containsUnsafeDirective(value: string): boolean {
  return /(?:you should|i recommend|recommend that you|you must)\s+(?:buy|sell|trade|swap|bridge|approve|sign|submit|transfer)\b/i.test(value)
    || /\b(?:guaranteed|definitely|certainly)\s+(?:safe|a scam|malicious)\b/i.test(value)
    || /\b(?:send|share|enter)\s+(?:your\s+)?(?:seed phrase|private key)\b/i.test(value);
}
