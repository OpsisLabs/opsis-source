import type { AiExplorerAnswer, NormalizedEntity } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import { z } from "zod";
import { observeAiCall } from "../observability/metrics.js";
import { OllamaProvider, OpenAiProvider, type AiProvider } from "./provider.js";
import { formatUnits } from "../chain/normalize.js";

const SYSTEM_INSTRUCTIONS = [
  "You explain Robinhood Chain activity to curious people who are not blockchain engineers.",
  "",
  "Everything you are shown happened on Robinhood Chain, an Ethereum layer-2 network",
  "(chain ID 4663). Never describe it as Ethereum mainnet or say a token lives 'on",
  "Ethereum'. Say 'on Robinhood Chain'. Standards such as ERC-20 still apply and can",
  "be named.",
  "",
  "How to write — the reader is scanning, not reading:",
  "- `answer` is a verdict, not an essay. Two sentences at most: what this is, and",
  "  the single thing that matters most about it. Never open with filler like",
  "  'This token is...' followed by a recital of every field.",
  "- `summaryBullets` carry the detail. Three to five, each one short enough to",
  "  take in at a glance — aim for under twelve words. One idea per bullet, the",
  "  most decision-relevant first. No bullet should repeat the answer.",
  "- Lead every bullet with the number or fact, then its meaning: 'Top 10 wallets",
  "  hold 15% — dispersed, hard for one seller to move the price.'",
  "- Only go longer if the reader explicitly asks for detail or an explanation.",
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
  "Reading distribution data (tokens):",
  "- liquidityPoolShare is the share of supply sitting in a trading pool. That is",
  "  the pot people buy from and sell into, not a person's holding. Never describe",
  "  it as a whale.",
  "- top1WalletShare / top10WalletShare exclude the pool and describe private",
  "  holders. Give the reader a yardstick: broadly held tokens usually keep the top",
  "  ten under about 25%; above 50% a few people can move the price at will.",
  "- deployerStillHolds is what the creator kept. Say what it means without",
  "  accusing anyone.",
  "- Translate every number into a consequence the reader can act on, e.g. what",
  "  thin liquidity means when they try to sell.",
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
  "summaryBullets: three to five, each a distinct takeaway, fact first, no repetition of the answer.",
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

// These values are useful to machines but unsafe to show as plain numbers to
// beginners. Their normalized siblings (for example nativeBalanceEth and
// valueEth) carry the human unit; showing both can make raw wei look like an
// enormous coin balance.
const RAW_BEGINNER_FACT_KEYS = new Set([
  "coinBalance",
  "gasPriceWei",
  "methodId",
  "rawTrace",
  "stateChanges",
  "totalSupply"
]);

function buildAiEntityInput(entity: NormalizedEntity): unknown {
  const beginnerFacts = { ...entity.facts, ...derivedBeginnerFacts(entity.facts) };
  const visibleFacts = Object.fromEntries(
    Object.entries(beginnerFacts)
      .filter(([key]) => !INTERNAL_FACT_KEYS.has(key) && !RAW_BEGINNER_FACT_KEYS.has(key))
      .filter(([key]) => key !== "value" || entity.facts.valueEth === undefined)
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
  const view = deterministicView(detectDeterministicIntent(question), entity);
  return {
    answer: view.answer,
    summaryBullets: view.summaryBullets,
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

type DeterministicIntent = "overview" | "beginner" | "risk" | "evidence" | "activity";

function detectDeterministicIntent(question: string): DeterministicIntent {
  const normalized = question.toLowerCase();
  if (/\b(?:risks?|warnings?|signals?|safe|safety|scams?|suspicious)\b/.test(normalized)) return "risk";
  if (/\b(?:evidence|sources?|citations?|proof|prove|verify|supports?|supporting)\b/.test(normalized)) return "evidence";
  if (/\b(?:activity|transactions?|transfers?|movements?|history|recent|happened)\b/.test(normalized)) return "activity";
  if (/\b(?:beginner|first[-\s]?time|new\s+to|what\s+should\s+i\s+(?:know|notice)|what\s+stands?\s+out|explain(?:\s+(?:this|it))?\s+simply)\b/.test(normalized)) return "beginner";
  return "overview";
}

function deterministicView(
  intent: DeterministicIntent,
  entity: NormalizedEntity
): { answer: string; summaryBullets: string[] } {
  if (intent === "beginner") return beginnerView(entity);
  if (intent === "risk") {
    const count = entity.riskNotes.length;
    return {
      answer: `This read-only risk check found ${count} evidence-based signal${count === 1 ? "" : "s"} for this ${entity.type}. Signals are observations, not a safety or scam verdict; this is informational only, not financial advice.`,
      summaryBullets: count > 0
        ? entity.riskNotes.slice(0, 5).map((note) => `${note.severity.toUpperCase()}: ${note.title} — ${note.detail}`)
        : ["No specific heuristic risk signal was identified in the available facts."]
    };
  }
  if (intent === "evidence") {
    const count = entity.citations.length;
    return {
      answer: `This read-only evidence view links ${count} citation${count === 1 ? "" : "s"} for the normalized ${entity.type} facts. Open the source panel to verify each cited field; this is informational only, not financial advice.`,
      summaryBullets: count > 0
        ? entity.citations.slice(0, 5).map((citation) => {
          const fields = citation.fieldsUsed.slice(0, 3).join(", ");
          return `${citation.provider}: ${citation.description}${fields ? ` — ${fields}` : ""}`;
        })
        : ["No citation was available for the current result."]
    };
  }
  if (intent === "activity") {
    return {
      answer: `This read-only activity view summarizes the available Robinhood Chain history for this ${entity.type}. The bullets below use only cited facts; this is informational only, not financial advice.`,
      summaryBullets: buildActivityBullets(entity)
    };
  }
  const riskCount = entity.riskNotes.length;
  return {
    answer: `This read-only overview explains the available Robinhood Chain facts for this ${entity.type}. It includes ${riskCount} evidence-based risk signal${riskCount === 1 ? "" : "s"} and is informational only, not financial advice.`,
    summaryBullets: buildSummaryBullets(entity)
  };
}

function beginnerView(entity: NormalizedEntity): { answer: string; summaryBullets: string[] } {
  const meaning = beginnerMeaning(entity);
  const primaryFact = beginnerPrimaryFact(entity);
  const coverage = beginnerCoverage(entity);
  const limitedWalletSafety = entity.type === "wallet" && entity.facts.activityCoverage === "unavailable";
  const risk = entity.riskNotes.length > 0
    ? `${entity.riskNotes.length} heuristic risk signal${entity.riskNotes.length === 1 ? " needs" : "s need"} attention; ${entity.riskNotes.length === 1 ? "it is" : "they are"} evidence to review, not a verdict.`
    : limitedWalletSafety
      ? "Activity and approval coverage was unavailable, so this result cannot meaningfully assess wallet safety; it is not proof of safety."
    : "No heuristic risk signal appeared in the available facts; that is not proof of safety.";
  const summaryBullets = [
    `Meaning: ${meaning.bullet}`,
    ...(primaryFact ? [`Confirmed: ${primaryFact.bullet}`] : []),
    ...coverage.bullets,
    `Safety: ${risk}`,
    entity.citations.length > 0
      ? "Next: open the source panel and verify the cited fields."
      : "Next: retry when source data is available before drawing conclusions."
  ].slice(0, 5);

  return {
    answer: entity.type === "wallet" && primaryFact
      ? [primaryFact.answer, coverage.answer, entity.riskNotes.length > 0 ? risk : undefined].filter(Boolean).join(" ")
      : [meaning.answer, primaryFact?.answer, coverage.answer, risk].filter(Boolean).join(" "),
    summaryBullets
  };
}

function beginnerMeaning(entity: NormalizedEntity): { answer: string; bullet: string } {
  switch (entity.type) {
    case "wallet":
      return {
        answer: "This is a public wallet address on Robinhood Chain; it does not identify the person or prove who controls it.",
        bullet: "public wallet address, not a verified real-world identity."
      };
    case "transaction":
      return {
        answer: "This is a public Robinhood Chain transaction record, showing what the network accepted or rejected—not why a person chose the action.",
        bullet: "public transaction record, not proof of a person's intent."
      };
    case "token":
      return {
        answer: "This is a token contract observed on Robinhood Chain; a contract address identifies code, not legitimacy, value, or endorsement.",
        bullet: "token contract identity does not establish safety or value."
      };
    case "contract":
      return {
        answer: "This is a public smart-contract address on Robinhood Chain; the address identifies deployed code, not who should trust or use it.",
        bullet: "smart-contract address, not a trust or safety verdict."
      };
    case "block":
      return {
        answer: "This is a Robinhood Chain block, a public batch of transactions recorded together by the network.",
        bullet: "public batch of recorded transactions."
      };
    default:
      return {
        answer: "This is a public Robinhood Chain identifier, but the available facts do not establish a more specific identity.",
        bullet: "public identifier with limited resolved identity."
      };
  }
}

function beginnerPrimaryFact(entity: NormalizedEntity): { answer: string; bullet: string } | undefined {
  const facts = entity.facts;
  if (entity.type === "wallet") {
    const balance = conciseFact(facts.nativeBalanceEth);
    const tokenBalances = Array.isArray(facts.tokenBalances)
      ? facts.tokenBalances.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
      : [];
    if (tokenBalances.length > 0) {
      const examples = tokenBalances.slice(0, 3).map((holding) => {
        const symbol = conciseFact(holding.tokenSymbol) ?? conciseFact(holding.symbol) ?? conciseFact(holding.tokenName) ?? "token";
        const amount = compactBeginnerDecimal(conciseFact(holding.formattedValue));
        return amount ? `${amount} ${symbol}` : symbol;
      });
      const reviewedSample = facts.tokenBalanceCoverage === "reviewed_asset_sample";
      const holdingText = `${tokenBalances.length} positive token balance${tokenBalances.length === 1 ? "" : "s"}${reviewedSample ? " in ChainScout's reviewed contract sample" : ""}`;
      if (reviewedSample) {
        const bySymbol = new Map(tokenBalances.map((holding) => [
          conciseFact(holding.tokenSymbol) ?? conciseFact(holding.symbol),
          holding
        ]));
        const amountFor = (symbol: string): string | undefined => {
          const amount = compactBeginnerDecimal(conciseFact(bySymbol.get(symbol)?.formattedValue));
          return amount ? `${amount} ${symbol}` : undefined;
        };
        const rwaSymbols = tokenBalances
          .map((holding) => conciseFact(holding.tokenSymbol) ?? conciseFact(holding.symbol))
          .filter((symbol): symbol is string => Boolean(symbol) && symbol !== "USDG" && symbol !== "WETH")
          .slice(0, 6);
        const highlights = [
          amountFor("USDG"),
          amountFor("WETH"),
          rwaSymbols.length > 0 ? `tokenized assets ${rwaSymbols.join(", ")}` : undefined
        ].filter((value): value is string => Boolean(value));
        return {
          answer: `A bounded direct check found ${holdingText}${highlights.length > 0 ? `—including ${highlights.join("; ")}` : ""}${balance ? `—and a native balance of ${compactBeginnerDecimal(balance) ?? balance} ETH for network fees` : ""}.`,
          bullet: `${holdingText}${highlights.length > 0 ? `; ${highlights.join("; ")}` : ""}${balance ? `; ${compactBeginnerDecimal(balance) ?? balance} ETH native` : ""}.`
        };
      }
      return {
        answer: `The available data found ${holdingText}, including ${examples.join(", ")}${balance ? `, with a confirmed native balance of ${compactBeginnerDecimal(balance) ?? balance} ETH for network fees` : ""}.`,
        bullet: `${holdingText}; ${examples.join(", ")}${balance ? `; ${compactBeginnerDecimal(balance) ?? balance} ETH native` : ""}.`
      };
    }
    if (balance) return {
      answer: `The available data confirms a native balance of ${balance} ETH.`,
      bullet: `native balance is ${balance} ETH.`
    };
  }
  if (entity.type === "transaction") {
    const status = conciseFact(facts.status);
    const value = conciseFact(facts.valueEth ?? facts.value);
    if (status && value) return {
      answer: `The available receipt reports status ${status} and a transferred value of ${value}${facts.valueEth !== undefined ? " ETH" : ""}.`,
      bullet: `status ${status}; transferred value ${value}${facts.valueEth !== undefined ? " ETH" : ""}.`
    };
    if (status) return {
      answer: `The available receipt reports transaction status ${status}.`,
      bullet: `transaction status is ${status}.`
    };
  }
  const name = conciseFact(facts.name);
  const symbol = conciseFact(facts.symbol);
  if (name || symbol) {
    const label = name && symbol ? `${name} (${symbol})` : (name ?? symbol)!;
    return {
      answer: `The returned metadata labels it ${label}.`,
      bullet: `returned metadata label is ${label}.`
    };
  }
  return undefined;
}

function beginnerCoverage(entity: NormalizedEntity): { answer?: string; bullets: string[] } {
  if (entity.type !== "wallet") return { bullets: [] };
  const facts = entity.facts;
  const activityUnavailable = facts.activityCoverage === "unavailable";
  const tokensUnavailable = facts.tokenBalanceCoverage === "unavailable";
  const reviewedSample = facts.tokenBalanceCoverage === "reviewed_asset_sample";
  const contractsChecked = finiteNumber(facts.tokenBalanceContractsChecked);
  if (activityUnavailable && tokensUnavailable) return {
    answer: "Recent activity and token balances could not be retrieved, so this view cannot determine recent behavior, the wallet's complete asset list, or its safety; missing data is not proof of safety.",
    bullets: [
      "Missing: recent activity and token balances were unavailable; unavailable does not mean zero."
    ]
  };
  if (activityUnavailable) return {
    answer: reviewedSample
      ? `Recent activity could not be retrieved, and the token result checks only ${contractsChecked ?? "a bounded set of"} reviewed contracts, so this is useful holdings context—not the wallet's complete asset list or a meaningful wallet-safety assessment.`
      : "Recent activity could not be retrieved, so this view cannot determine the wallet's recent behavior or meaningfully assess its safety.",
    bullets: [
      reviewedSample
        ? `Coverage: ${contractsChecked ?? "a bounded set of"} reviewed token contracts checked; recent activity and all other tokens remain unknown.`
        : "Missing: recent activity was unavailable; unavailable history does not mean no transactions."
    ]
  };
  if (tokensUnavailable) return {
    answer: "Token balances could not be retrieved, so the native balance is not a complete asset list.",
    bullets: [
      "Missing: token balances were unavailable; the native balance is not the complete portfolio."
    ]
  };
  const transactionCount = finiteNumber(facts.transactionsFetched)
    ?? (Array.isArray(facts.recentTransactions) ? facts.recentTransactions.length : undefined);
  const tokenCount = Array.isArray(facts.tokenBalances) ? facts.tokenBalances.length : undefined;
  const coverageParts: string[] = [];
  if (transactionCount !== undefined) coverageParts.push(`${transactionCount} recent transaction${transactionCount === 1 ? "" : "s"} in the returned window`);
  if (tokenCount !== undefined) coverageParts.push(`${tokenCount} token balance${tokenCount === 1 ? "" : "s"} returned`);
  return { bullets: coverageParts.length > 0 ? [`Coverage: ${coverageParts.join("; ")}.`] : [] };
}

function sanitizeAnswer(raw: RawAiAnswer, entity: NormalizedEntity, tokenUsage?: Record<string, number>): AiExplorerAnswer {
  const fallback = deterministicAnswer("", entity);
  const candidate = typeof raw.answer === "string" ? raw.answer.trim().slice(0, 4000) : "";
  const suggested = cleanStrings(raw.suggestedFollowUps ?? raw.suggestedQuestions, 5, 300, fallback.suggestedQuestions);
  const summaryBullets = cleanStrings(raw.summaryBullets, 10, 500, fallback.summaryBullets)
    .map((bullet) => groundTransactionGas(bullet, entity));
  return {
    answer: candidate && !containsUnsafeDirective(candidate)
      ? groundTransactionGas(candidate, entity)
      : fallback.answer,
    summaryBullets,
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

/** Correct a common model digit-transposition without rewriting its prose. */
function groundTransactionGas(text: string, entity: NormalizedEntity): string {
  if (entity.type !== "transaction") return text;
  const raw = entity.facts.gasUsed;
  if (typeof raw !== "string" && typeof raw !== "number") return text;
  try {
    const exact = BigInt(raw).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return text
      .replace(/\b[\d,]+(?=\s+gas\b)/gi, exact)
      .replace(/(\bgas\s+used(?:\s+(?:was|is|of))?\s*)[\d,]+/gi, `$1${exact}`);
  } catch {
    return text;
  }
}

function buildSummaryBullets(entity: NormalizedEntity): string[] {
  return [
    ...buildActivityBullets(entity).slice(0, 2),
    `${entity.citations.length} linked citation${entity.citations.length === 1 ? "" : "s"} support the view.`,
    `${entity.riskNotes.length} evidence-based risk signal${entity.riskNotes.length === 1 ? "" : "s"} identified.`
  ].slice(0, 5);
}

function buildActivityBullets(entity: NormalizedEntity): string[] {
  const facts = entity.facts;
  const bullets: string[] = [];
  const activityUnavailable = facts.activityCoverage === "unavailable";
  const tokenBalancesUnavailable = facts.tokenBalanceCoverage === "unavailable";
  const reviewedSample = facts.tokenBalanceCoverage === "reviewed_asset_sample";
  if (activityUnavailable && tokenBalancesUnavailable) {
    bullets.push("Recent activity and token balances were unavailable from the public indexer; this is not a zero-count finding.");
  } else if (activityUnavailable) {
    bullets.push("Recent activity was unavailable from the public indexer; this is not a zero-transaction finding.");
  } else if (tokenBalancesUnavailable) {
    bullets.push("Token balances were unavailable from the public indexer; this is not a zero-balance finding.");
  }
  const transactionCount = finiteNumber(facts.transactionsFetched)
    ?? (Array.isArray(facts.recentTransactions) ? facts.recentTransactions.length : undefined);
  if (!activityUnavailable && transactionCount !== undefined) bullets.push(`${transactionCount} recent transaction${transactionCount === 1 ? "" : "s"} in the available activity window.`);
  const nativeBalance = conciseFact(facts.nativeBalanceEth);
  if (nativeBalance) bullets.push(`Native balance: ${nativeBalance} ETH.`);
  if (!tokenBalancesUnavailable && Array.isArray(facts.tokenBalances)) {
    const checked = finiteNumber(facts.tokenBalanceContractsChecked);
    bullets.push(reviewedSample
      ? `${facts.tokenBalances.length} positive balance${facts.tokenBalances.length === 1 ? "" : "s"} found across ${checked ?? "the bounded"} reviewed token contracts; this is not a complete portfolio.`
      : `${facts.tokenBalances.length} token balance${facts.tokenBalances.length === 1 ? "" : "s"} returned.`);
  }
  const status = conciseFact(facts.status);
  if (status) bullets.push(`Transaction status: ${status}.`);
  const value = conciseFact(facts.valueEth ?? facts.value);
  if (value) bullets.push(`Transferred value: ${value}${facts.valueEth !== undefined ? " ETH" : ""}.`);
  if (Array.isArray(facts.recentTransfers)) bullets.push(`${facts.recentTransfers.length} recent token transfer${facts.recentTransfers.length === 1 ? "" : "s"} returned.`);
  return bullets.length > 0 ? bullets.slice(0, 5) : ["No bounded activity count was available in the cited facts."];
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

function conciseFact(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return undefined;
}

function compactBeginnerDecimal(value: string | undefined): string | undefined {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return value;
  const [whole = "0", fraction = ""] = value.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!fraction || /^0+$/.test(fraction)) return groupedWhole;
  const visible = fraction.slice(0, 6).replace(/0+$/, "");
  if (!visible) return `<0.${"0".repeat(5)}1`;
  return `${groupedWhole}.${visible}`;
}

function buildConfirmedFacts(entity: NormalizedEntity): AiExplorerAnswer["confirmedFacts"] {
  const sourceIds = entity.citations.map((citation) => citation.id);
  const beginnerFacts = { ...entity.facts, ...derivedBeginnerFacts(entity.facts) };
  return Object.entries(beginnerFacts)
    .filter(([key]) => !INTERNAL_FACT_KEYS.has(key) && !RAW_BEGINNER_FACT_KEYS.has(key))
    .filter(([key]) => key !== "value" || entity.facts.valueEth === undefined)
    .flatMap(([key, value]) => {
      const rendered = renderConfirmedFact(value);
      return rendered ? [{ fact: `${humanizeFactKey(key)}: ${rendered}`, sourceIds }] : [];
    })
    .slice(0, 25);
}

function derivedBeginnerFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const decimals = typeof facts.decimals === "number"
    ? facts.decimals
    : typeof facts.decimals === "string" && /^\d+$/.test(facts.decimals)
      ? Number(facts.decimals)
      : Number.NaN;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return {};
  const formattedSupply = formatUnits(facts.totalSupply, facts.decimals);
  return formattedSupply === undefined ? {} : { totalSupplyTokens: formattedSupply };
}

function renderConfirmedFact(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() ? value.trim().slice(0, 500) : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"} returned`;
  if (typeof value !== "object") return undefined;
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" ? serialized.slice(0, 500) : undefined;
  } catch {
    return undefined;
  }
}

function humanizeFactKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? `${words[0]?.toUpperCase()}${words.slice(1)}` : "Fact";
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
