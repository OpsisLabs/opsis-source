import type { AiExplorerAnswer, ChainEntityType, NormalizedEntity } from "@rh-chain/shared";
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

export type AiLocale = "en" | "zh-CN";

const ZH_LANGUAGE_DIRECTIVE = [
  "",
  "Language:",
  "- Write answer, summaryBullets, inferences, uncertainty, and suggestedFollowUps in Simplified Chinese (zh-CN).",
  "- Keep addresses, transaction hashes, token symbols, chain names, decimals, and every number exactly as they appear in the facts; never translate or reformat them.",
  "- Keep every accuracy, safety, and no-advice rule above unchanged."
].join("\n");

function t(locale: AiLocale, en: string, zh: string): string {
  return locale === "zh-CN" ? zh : en;
}

function buildSystemInstructions(locale: AiLocale): string {
  return locale === "zh-CN" ? `${SYSTEM_INSTRUCTIONS}${ZH_LANGUAGE_DIRECTIVE}` : SYSTEM_INSTRUCTIONS;
}

function entityTypeLabel(type: ChainEntityType, locale: AiLocale): string {
  if (locale !== "zh-CN") return type;
  if (type === "wallet") return "钱包";
  if (type === "transaction") return "交易";
  if (type === "token") return "代币";
  if (type === "contract") return "合约";
  if (type === "block") return "区块";
  return "实体";
}

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

  async answer(question: string, entity: NormalizedEntity, locale: AiLocale = "en"): Promise<AiExplorerAnswer> {
    if (!this.provider) {
      observeAiCall(0, "fallback");
      return deterministicAnswer(question, entity, [], locale);
    }
    const startedAt = Date.now();
    let validationError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await this.provider.generateAnswer(buildSystemInstructions(locale), {
          question,
          locale,
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
        return sanitizeAnswer(parsed.data, entity, result.tokenUsage, locale);
      } catch (error) {
        validationError = error instanceof Error ? error.message : "invalid response";
      }
    }
    observeAiCall((Date.now() - startedAt) / 1000, "error");
    return deterministicAnswer(question, entity, [
      t(
        locale,
        "AI provider failed or returned invalid output; deterministic fallback was used.",
        "AI 提供方失败或返回了无效输出；已使用确定性回退结果。"
      )
    ], locale);
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

function deterministicAnswer(
  question: string,
  entity: NormalizedEntity,
  extraUncertainty: string[] = [],
  locale: AiLocale = "en"
): AiExplorerAnswer {
  const view = deterministicView(detectDeterministicIntent(question), entity, locale);
  const suggestedQuestions = [
    t(locale, "What source data supports this answer?", "哪些来源数据支持这个结论？"),
    entity.type === "transaction"
      ? t(locale, "Why did this transaction fail or succeed?", "这笔交易为什么失败或成功？")
      : t(locale, "Summarize recent activity for this address.", "总结这个地址最近的活动。"),
    t(locale, "Are there any evidence-based risk notes?", "有没有基于证据的风险提示？")
  ];
  return {
    answer: view.answer,
    summaryBullets: view.summaryBullets,
    confirmedFacts: buildConfirmedFacts(entity),
    inferences: [],
    facts: entity.facts,
    uncertainty: [
      t(locale, "Provider data may be incomplete or temporarily unavailable.", "提供方的数据可能不完整或暂时不可用。"),
      t(locale, "Risk notes are heuristic signals, not guarantees of safety or malicious intent.", "风险提示是启发式信号，并不保证安全，也不保证存在恶意意图。"),
      ...extraUncertainty
    ],
    riskNotes: entity.riskNotes,
    citations: entity.citations,
    suggestedQuestions,
    suggestedFollowUps: suggestedQuestions
  };
}

type DeterministicIntent = "overview" | "beginner" | "risk" | "evidence" | "activity";

function detectDeterministicIntent(question: string): DeterministicIntent {
  const normalized = question.toLowerCase();
  if (/\b(?:risks?|warnings?|signals?|safe|safety|scams?|suspicious)\b/.test(normalized) || /(?:风险|危险|警告|信号|安全|骗局|诈骗|可疑)/.test(question)) return "risk";
  if (/\b(?:evidence|sources?|citations?|proof|prove|verify|supports?|supporting)\b/.test(normalized) || /(?:证据|来源|引用|证明|验证|支持)/.test(question)) return "evidence";
  if (/\b(?:activity|transactions?|transfers?|movements?|history|recent|happened)\b/.test(normalized) || /(?:活动|交易|转账|流动|历史|最近|发生)/.test(question)) return "activity";
  if (/\b(?:beginner|first[-\s]?time|new\s+to|what\s+should\s+i\s+(?:know|notice)|what\s+stands?\s+out|explain(?:\s+(?:this|it))?\s+simply)\b/.test(normalized) || /(?:新手|初学者|第一次|入门|简单|通俗|值得注意|需要了解)/.test(question)) return "beginner";
  return "overview";
}

function deterministicView(
  intent: DeterministicIntent,
  entity: NormalizedEntity,
  locale: AiLocale
): { answer: string; summaryBullets: string[] } {
  if (entity.type === "transaction" && intent !== "risk" && intent !== "evidence") {
    return transactionView(entity, locale);
  }
  if (intent === "beginner") return beginnerView(entity, locale);
  if (intent === "risk") {
    const count = entity.riskNotes.length;
    return {
      answer: t(
        locale,
        `This read-only risk check found ${count} evidence-based signal${count === 1 ? "" : "s"} for this ${entity.type}. Signals are observations, not a safety or scam verdict; this is informational only, not financial advice.`,
        `这次只读风险检查针对此${entityTypeLabel(entity.type, locale)}发现了 ${count} 个基于证据的信号。这些信号只是观察结果，并非安全或诈骗定论；仅供参考，不构成财务建议。`
      ),
      summaryBullets: count > 0
        ? entity.riskNotes.slice(0, 5).map((note) => `${note.severity.toUpperCase()}: ${note.title} — ${note.detail}`)
        : [t(locale, "No specific heuristic risk signal was identified in the available facts.", "在可用事实中没有发现特定的启发式风险信号。")]
    };
  }
  if (intent === "evidence") {
    const count = entity.citations.length;
    return {
      answer: t(
        locale,
        `This read-only evidence view links ${count} citation${count === 1 ? "" : "s"} for the normalized ${entity.type} facts. Open the source panel to verify each cited field; this is informational only, not financial advice.`,
        `这个只读证据视图为此${entityTypeLabel(entity.type, locale)}的规范化事实关联了 ${count} 条引用。请打开来源面板核实每个被引用的字段；仅供参考，不构成财务建议。`
      ),
      summaryBullets: count > 0
        ? entity.citations.slice(0, 5).map((citation) => {
          const fields = citation.fieldsUsed.slice(0, 3).join(", ");
          return `${citation.provider}: ${citation.description}${fields ? ` — ${fields}` : ""}`;
        })
        : [t(locale, "No citation was available for the current result.", "当前结果没有可用的引用。")]
    };
  }
  if (intent === "activity") {
    return {
      answer: t(
        locale,
        `This read-only activity view summarizes the available Robinhood Chain history for this ${entity.type}. The bullets below use only cited facts; this is informational only, not financial advice.`,
        `这个只读活动视图总结了此${entityTypeLabel(entity.type, locale)}在 Robinhood Chain 上可用的历史记录。以下要点仅使用已引用的事实；仅供参考，不构成财务建议。`
      ),
      summaryBullets: buildActivityBullets(entity, locale)
    };
  }
  const riskCount = entity.riskNotes.length;
  return {
    answer: t(
      locale,
      `This read-only overview explains the available Robinhood Chain facts for this ${entity.type}. It includes ${riskCount} evidence-based risk signal${riskCount === 1 ? "" : "s"} and is informational only, not financial advice.`,
      `这个只读概览解释了此${entityTypeLabel(entity.type, locale)}在 Robinhood Chain 上可用的事实。其中包含 ${riskCount} 个基于证据的风险信号；仅供参考，不构成财务建议。`
    ),
    summaryBullets: buildSummaryBullets(entity, locale)
  };
}

function transactionOutcome(status: unknown): "succeeded" | "failed" | "pending" | "unknown" {
  const value = String(status ?? "").trim().toLowerCase();
  if (["ok", "success", "succeeded", "1", "0x1", "true"].includes(value)) return "succeeded";
  if (["error", "failed", "fail", "reverted", "0", "0x0", "false"].includes(value)) return "failed";
  if (value === "pending") return "pending";
  return "unknown";
}

function transactionView(entity: NormalizedEntity, locale: AiLocale): { answer: string; summaryBullets: string[] } {
  const facts = entity.facts;
  const outcome = transactionOutcome(facts.status);
  const headline = outcome === "unknown"
    ? t(locale, "The available receipt does not establish whether this Robinhood Chain transaction succeeded.", "现有回执无法确定这笔 Robinhood Chain 交易是否成功。")
    : outcome === "pending"
      ? t(locale, "This Robinhood Chain transaction is pending; its execution outcome is not confirmed.", "这笔 Robinhood Chain 交易处于待处理状态；其执行结果尚未确认。")
      : t(locale, `This transaction ${outcome} on Robinhood Chain.`, `这笔交易在 Robinhood Chain 上${outcome === "succeeded" ? "已成功" : "失败"}。`);
  const method = typeof facts.method === "string" && /^[a-zA-Z_][a-zA-Z0-9_]*(?:\([^\n]*\))?$/.test(facts.method)
    && !facts.method.startsWith("eth_") ? facts.method.slice(0, 100) : undefined;
  const context = outcome === "failed"
    ? t(locale, "Its execution was reverted, so the intended changes were not applied; a network fee can still be charged.", "其执行被回滚，因此预期的更改没有生效；仍可能被收取网络费用。")
    : facts.internalTransactionFailure === true
      ? t(locale, "At least one internal call reported an error; overall success does not prove every intended action completed.", "至少有一个内部调用报告了错误；整体成功并不证明每个预期操作都已完成。")
      : method
        ? t(locale, `The decoded call is ${method}; the method name alone does not prove its intended effect or safety.`, `解码后的调用是 ${method}；仅凭方法名不能证明其预期效果或安全性。`)
        : t(locale, "The action was not decoded, so this result cannot tell you whether it was a swap, approval, or another action.", "该操作未被解码，因此这个结果无法告诉你它是兑换、授权还是其他操作。");
  const bullets: string[] = [];
  // Native transaction value is not a token-transfer total or the network fee.
  const value = conciseFact(facts.valueEth);
  if (value && /^\d+(?:\.\d+)?$/.test(value)) {
    bullets.push(/^0(?:\.0+)?$/.test(value)
      ? t(locale, "No native ETH was attached. Tokens may still be involved; this does not mean the transaction was free.", "没有附带原生 ETH。仍可能涉及代币；这并不意味着这笔交易是免费的。")
      : t(locale, `${compactBeginnerDecimal(value)} ETH attached to the transaction—not the fee${outcome === "failed" ? "; the reverted transfer did not complete" : "; receipt and transfer evidence determine what completed"}.`, `${compactBeginnerDecimal(value)} ETH 已附加到交易——这不是手续费${outcome === "failed" ? "；被回滚的转账没有完成" : "；回执和转账证据决定实际完成了什么"}。`));
  } else {
    bullets.push(t(locale, "Native ETH amount is unavailable; raw values are not shown as coin amounts.", "原生 ETH 数量不可用；原始数值不会作为代币数量显示。"));
  }
  const shortAddress = (value: unknown): string | undefined => typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
    ? `${value.slice(0, 6)}…${value.slice(-4)}` : undefined;
  const from = shortAddress(facts.from);
  const to = shortAddress(facts.to);
  if (from && to) bullets.push(t(locale, `From ${from} to ${to}; these addresses do not identify their owners.`, `从 ${from} 到 ${to}；这些地址无法识别其所有者。`));
  if (method) bullets.push(t(locale, `Decoded method: ${method}. Review its inputs and resulting transfers in the sources.`, `解码方法：${method}。请在来源中查看其输入和产生的转账。`));
  const rawGas = conciseFact(facts.gasUsed);
  if (rawGas && /^(?:\d+|0x[\da-f]+)$/i.test(rawGas)) {
    const gas = BigInt(rawGas).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    bullets.push(t(locale, `${gas} gas units used—computational work, not an ETH or dollar fee.`, `使用了 ${gas} 个 gas 单位——这是计算工作量，不是 ETH 或美元费用。`));
  }
  bullets.push(Array.isArray(facts.tokenTransfers) && facts.tokenTransfers.length > 0
    ? t(locale, `${facts.tokenTransfers.length} token-transfer record${facts.tokenTransfers.length === 1 ? "" : "s"} returned; inspect amounts and recipients in the sources. Coverage may be incomplete.`, `返回了 ${facts.tokenTransfers.length} 条代币转账记录；请在来源中检查金额和接收方。覆盖范围可能不完整。`)
    : t(locale, "Token movements are not established by this view; 0 ETH alone does not mean nothing moved.", "此视图无法确定代币流动；仅有 0 ETH 并不意味着没有发生任何转移。"));
  return { answer: t(locale, `${headline} ${context}`, `${headline}${context}`), summaryBullets: bullets.slice(0, 5) };
}

function beginnerView(entity: NormalizedEntity, locale: AiLocale): { answer: string; summaryBullets: string[] } {
  const meaning = beginnerMeaning(entity, locale);
  const primaryFact = beginnerPrimaryFact(entity, locale);
  const coverage = beginnerCoverage(entity, locale);
  const limitedWalletSafety = entity.type === "wallet" && entity.facts.activityCoverage === "unavailable";
  const risk = entity.riskNotes.length > 0
    ? t(locale, `${entity.riskNotes.length} heuristic risk signal${entity.riskNotes.length === 1 ? " needs" : "s need"} attention; ${entity.riskNotes.length === 1 ? "it is" : "they are"} evidence to review, not a verdict.`, `有 ${entity.riskNotes.length} 个启发式风险信号需要关注；它们是待审查的证据，而不是定论。`)
    : limitedWalletSafety
      ? t(locale, "Activity and approval coverage was unavailable, so this result cannot meaningfully assess wallet safety; it is not proof of safety.", "活动和授权覆盖范围不可用，因此这个结果无法有意义地评估钱包安全性；这并不能证明它是安全的。")
      : t(locale, "No heuristic risk signal appeared in the available facts; that is not proof of safety.", "在可用事实中没有出现启发式风险信号；这并不能证明它是安全的。");
  const summaryBullets = [
    t(locale, `Meaning: ${meaning.bullet}`, `含义：${meaning.bullet}`),
    ...(primaryFact ? [t(locale, `Confirmed: ${primaryFact.bullet}`, `已确认：${primaryFact.bullet}`)] : []),
    ...coverage.bullets,
    t(locale, `Safety: ${risk}`, `安全：${risk}`),
    entity.citations.length > 0
      ? t(locale, "Next: open the source panel and verify the cited fields.", "下一步：打开来源面板并核实被引用的字段。")
      : t(locale, "Next: retry when source data is available before drawing conclusions.", "下一步：在来源数据可用后重试，然后再下结论。")
  ].slice(0, 5);

  const parts = entity.type === "wallet" && primaryFact
    ? [primaryFact.answer, entity.facts.accountType === "delegated_wallet" ? meaning.answer : undefined, coverage.answer, entity.riskNotes.length > 0 ? risk : undefined]
    : [meaning.answer, primaryFact?.answer, coverage.answer, risk];
  return {
    answer: parts.filter(Boolean).join(locale === "zh-CN" ? "" : " "),
    summaryBullets
  };
}

function beginnerMeaning(entity: NormalizedEntity, locale: AiLocale): { answer: string; bullet: string } {
  switch (entity.type) {
    case "wallet":
      if (entity.facts.accountType === "delegated_wallet") return {
        answer: t(locale, "This wallet has an EIP-7702 code delegation, allowing it to use smart-account behavior. The delegated code has not been audited by this lookup.", "这个钱包有 EIP-7702 代码委托，使其能够使用智能账户行为。本次查询没有审计被委托的代码。"),
        bullet: t(locale, "wallet with smart-account code delegation; this lookup does not verify the delegated code's safety.", "带有智能账户代码委托的钱包；本次查询不验证被委托代码的安全性。")
      };
      return {
        answer: t(locale, "This is a public wallet address on Robinhood Chain; it does not identify the person or prove who controls it.", "这是 Robinhood Chain 上的一个公开钱包地址；它不能识别这个人，也不能证明谁控制它。"),
        bullet: t(locale, "public wallet address, not a verified real-world identity.", "公开钱包地址，并非经过验证的现实身份。")
      };
    case "transaction":
      return {
        answer: t(locale, "This is a public Robinhood Chain transaction record, showing what the network accepted or rejected—not why a person chose the action.", "这是 Robinhood Chain 上的一条公开交易记录，显示网络接受或拒绝了什么——而不是某个人为何选择这样操作。"),
        bullet: t(locale, "public transaction record, not proof of a person's intent.", "公开交易记录，并非某个人意图的证明。")
      };
    case "token":
      return {
        answer: t(locale, "This is a token contract observed on Robinhood Chain; a contract address identifies code, not legitimacy, value, or endorsement.", "这是在 Robinhood Chain 上观察到的一个代币合约；合约地址标识的是代码，而不是合法性、价值或背书。"),
        bullet: t(locale, "token contract identity does not establish safety or value.", "代币合约身份不能确立安全性或价值。")
      };
    case "contract":
      return {
        answer: t(locale, "This is a public smart-contract address on Robinhood Chain; the address identifies deployed code, not who should trust or use it.", "这是 Robinhood Chain 上的一个公开智能合约地址；该地址标识的是已部署的代码，而不是谁应该信任或使用它。"),
        bullet: t(locale, "smart-contract address, not a trust or safety verdict.", "智能合约地址，并非信任或安全定论。")
      };
    case "block":
      return {
        answer: t(locale, "This is a Robinhood Chain block, a public batch of transactions recorded together by the network.", "这是 Robinhood Chain 的一个区块，是网络一起记录的一批公开交易。"),
        bullet: t(locale, "public batch of recorded transactions.", "一起记录的公开交易批次。")
      };
    default:
      return {
        answer: t(locale, "This is a public Robinhood Chain identifier, but the available facts do not establish a more specific identity.", "这是 Robinhood Chain 的一个公开标识符，但可用事实无法确立更具体的身份。"),
        bullet: t(locale, "public identifier with limited resolved identity.", "已解析身份有限的公开标识符。")
      };
  }
}

function beginnerPrimaryFact(entity: NormalizedEntity, locale: AiLocale): { answer: string; bullet: string } | undefined {
  const facts = entity.facts;
  if (entity.type === "wallet") {
    const balance = conciseFact(facts.nativeBalanceEth);
    const tokenBalances = Array.isArray(facts.tokenBalances)
      ? facts.tokenBalances.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
      : [];
    if (tokenBalances.length > 0) {
      const examples = tokenBalances.slice(0, 3).map((holding) => {
        const symbol = conciseFact(holding.tokenSymbol) ?? conciseFact(holding.symbol) ?? conciseFact(holding.tokenName) ?? t(locale, "token", "代币");
        const amount = compactBeginnerDecimal(conciseFact(holding.formattedValue));
        return amount ? `${amount} ${symbol}` : symbol;
      });
      const reviewedSample = facts.tokenBalanceCoverage === "reviewed_asset_sample";
      const holdingText = reviewedSample
        ? t(locale, `${tokenBalances.length} positive token balance${tokenBalances.length === 1 ? "" : "s"} in ChainScout's reviewed contract sample`, `ChainScout 已审查的合约样本中有 ${tokenBalances.length} 个正数代币余额`)
        : t(locale, `${tokenBalances.length} positive token balance${tokenBalances.length === 1 ? "" : "s"}`, `${tokenBalances.length} 个正数代币余额`);
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
          rwaSymbols.length > 0 ? t(locale, `tokenized assets ${rwaSymbols.join(", ")}`, `代币化资产 ${rwaSymbols.join("、")}`) : undefined
        ].filter((value): value is string => Boolean(value));
        const joinedHighlights = highlights.join(t(locale, "; ", "；"));
        return {
          answer: t(
            locale,
            `A bounded direct check found ${holdingText}${highlights.length > 0 ? `—including ${highlights.join("; ")}` : ""}${balance ? `—and a native balance of ${compactBeginnerDecimal(balance) ?? balance} ETH for network fees` : ""}.`,
            `一次有界直接检查发现${holdingText}${highlights.length > 0 ? `——包括${joinedHighlights}` : ""}${balance ? `——以及用于网络费用的 ${compactBeginnerDecimal(balance) ?? balance} ETH 原生余额` : ""}。`
          ),
          bullet: t(
            locale,
            `${holdingText}${highlights.length > 0 ? `; ${highlights.join("; ")}` : ""}${balance ? `; ${compactBeginnerDecimal(balance) ?? balance} ETH native` : ""}.`,
            `${holdingText}${highlights.length > 0 ? `；${joinedHighlights}` : ""}${balance ? `；${compactBeginnerDecimal(balance) ?? balance} ETH 原生` : ""}。`
          )
        };
      }
      const joinedExamples = examples.join(t(locale, ", ", "、"));
      return {
        answer: t(
          locale,
          `The available data found ${holdingText}, including ${examples.join(", ")}${balance ? `, with a confirmed native balance of ${compactBeginnerDecimal(balance) ?? balance} ETH for network fees` : ""}.`,
          `可用数据发现${holdingText}，包括 ${joinedExamples}${balance ? `，并确认有用于网络费用的 ${compactBeginnerDecimal(balance) ?? balance} ETH 原生余额` : ""}。`
        ),
        bullet: t(
          locale,
          `${holdingText}; ${examples.join(", ")}${balance ? `; ${compactBeginnerDecimal(balance) ?? balance} ETH native` : ""}.`,
          `${holdingText}；${joinedExamples}${balance ? `；${compactBeginnerDecimal(balance) ?? balance} ETH 原生` : ""}。`
        )
      };
    }
    if (balance) return {
      answer: t(locale, `The available data confirms a native balance of ${balance} ETH.`, `可用数据确认原生余额为 ${balance} ETH。`),
      bullet: t(locale, `native balance is ${balance} ETH.`, `原生余额为 ${balance} ETH。`)
    };
  }
  if (entity.type === "transaction") {
    const status = conciseFact(facts.status);
    const value = conciseFact(facts.valueEth ?? facts.value);
    const valueUnit = facts.valueEth !== undefined ? " ETH" : "";
    if (status && value) return {
      answer: t(locale, `The available receipt reports status ${status} and a transferred value of ${value}${valueUnit}.`, `现有回执报告状态为 ${status}，转账金额为 ${value}${valueUnit}。`),
      bullet: t(locale, `status ${status}; transferred value ${value}${valueUnit}.`, `状态 ${status}；转账金额 ${value}${valueUnit}。`)
    };
    if (status) return {
      answer: t(locale, `The available receipt reports transaction status ${status}.`, `现有回执报告交易状态为 ${status}。`),
      bullet: t(locale, `transaction status is ${status}.`, `交易状态为 ${status}。`)
    };
  }
  const name = conciseFact(facts.name);
  const symbol = conciseFact(facts.symbol);
  if (name || symbol) {
    const label = name && symbol ? `${name} (${symbol})` : (name ?? symbol)!;
    return {
      answer: t(locale, `The returned metadata labels it ${label}.`, `返回的元数据将其标记为 ${label}。`),
      bullet: t(locale, `returned metadata label is ${label}.`, `返回的元数据标签为 ${label}。`)
    };
  }
  return undefined;
}

function beginnerCoverage(entity: NormalizedEntity, locale: AiLocale): { answer?: string; bullets: string[] } {
  if (entity.type !== "wallet") return { bullets: [] };
  const facts = entity.facts;
  const activityUnavailable = facts.activityCoverage === "unavailable";
  const tokensUnavailable = facts.tokenBalanceCoverage === "unavailable";
  const reviewedSample = facts.tokenBalanceCoverage === "reviewed_asset_sample";
  const contractsChecked = finiteNumber(facts.tokenBalanceContractsChecked);
  if (activityUnavailable && tokensUnavailable) return {
    answer: t(locale, "Recent activity and token balances could not be retrieved, so this view cannot determine recent behavior, the wallet's complete asset list, or its safety; missing data is not proof of safety.", "最近的活动和代币余额都无法获取，因此此视图无法确定最近行为、钱包的完整资产列表或其安全性；缺失数据并不能证明它安全。"),
    bullets: [
      t(locale, "Missing: recent activity and token balances were unavailable; unavailable does not mean zero.", "缺失：最近活动和代币余额均不可用；不可用并不意味着为零。")
    ]
  };
  if (activityUnavailable) return {
    answer: reviewedSample
      ? t(locale, `Recent activity could not be retrieved, and the token result checks only ${contractsChecked ?? "a bounded set of"} reviewed contracts, so this is useful holdings context—not the wallet's complete asset list or a meaningful wallet-safety assessment.`, `无法获取最近活动，代币结果仅检查了 ${contractsChecked ?? "有限数量"} 个已审查合约，因此这只是有用的持仓背景——并非钱包的完整资产列表，也不构成有意义的钱包安全评估。`)
      : t(locale, "Recent activity could not be retrieved, so this view cannot determine the wallet's recent behavior or meaningfully assess its safety.", "无法获取最近活动，因此此视图无法确定钱包的最近行为，也无法有意义地评估其安全性。"),
    bullets: [
      reviewedSample
        ? t(locale, `Coverage: ${contractsChecked ?? "a bounded set of"} reviewed token contracts checked; recent activity and all other tokens remain unknown.`, `覆盖范围：已检查 ${contractsChecked ?? "有限数量"} 个已审查代币合约；最近活动和所有其他代币仍然未知。`)
        : t(locale, "Missing: recent activity was unavailable; unavailable history does not mean no transactions.", "缺失：最近活动不可用；历史不可用并不意味着没有交易。")
    ]
  };
  if (tokensUnavailable) return {
    answer: t(locale, "Token balances could not be retrieved, so the native balance is not a complete asset list.", "无法获取代币余额，因此原生余额并不是完整的资产列表。"),
    bullets: [
      t(locale, "Missing: token balances were unavailable; the native balance is not the complete portfolio.", "缺失：代币余额不可用；原生余额并不是完整的投资组合。")
    ]
  };
  const transactionCount = finiteNumber(facts.transactionsFetched)
    ?? (Array.isArray(facts.recentTransactions) ? facts.recentTransactions.length : undefined);
  const tokenCount = Array.isArray(facts.tokenBalances) ? facts.tokenBalances.length : undefined;
  const coverageParts: string[] = [];
  if (transactionCount !== undefined) coverageParts.push(t(locale, `${transactionCount} recent transaction${transactionCount === 1 ? "" : "s"} in the returned window`, `返回窗口内有 ${transactionCount} 笔最近交易`));
  if (tokenCount !== undefined) coverageParts.push(t(locale, `${tokenCount} token balance${tokenCount === 1 ? "" : "s"} returned`, `返回了 ${tokenCount} 个代币余额`));
  return { bullets: coverageParts.length > 0 ? [t(locale, `Coverage: ${coverageParts.join("; ")}.`, `覆盖范围：${coverageParts.join("；")}。`)] : [] };
}

function sanitizeAnswer(raw: RawAiAnswer, entity: NormalizedEntity, tokenUsage: Record<string, number> | undefined, locale: AiLocale): AiExplorerAnswer {
  const fallback = deterministicAnswer("", entity, [], locale);
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

function buildSummaryBullets(entity: NormalizedEntity, locale: AiLocale): string[] {
  return [
    ...buildActivityBullets(entity, locale).slice(0, 2),
    t(locale, `${entity.citations.length} linked citation${entity.citations.length === 1 ? "" : "s"} support the view.`, `有 ${entity.citations.length} 条关联引用支持该视图。`),
    t(locale, `${entity.riskNotes.length} evidence-based risk signal${entity.riskNotes.length === 1 ? "" : "s"} identified.`, `识别出 ${entity.riskNotes.length} 个基于证据的风险信号。`)
  ].slice(0, 5);
}

function buildActivityBullets(entity: NormalizedEntity, locale: AiLocale): string[] {
  const facts = entity.facts;
  const bullets: string[] = [];
  const activityUnavailable = facts.activityCoverage === "unavailable";
  const tokenBalancesUnavailable = facts.tokenBalanceCoverage === "unavailable";
  const reviewedSample = facts.tokenBalanceCoverage === "reviewed_asset_sample";
  if (activityUnavailable && tokenBalancesUnavailable) {
    bullets.push(t(locale, "Recent activity and token balances were unavailable from the public indexer; this is not a zero-count finding.", "公共索引器无法提供最近活动和代币余额；这并不是计数为零的结果。"));
  } else if (activityUnavailable) {
    bullets.push(t(locale, "Recent activity was unavailable from the public indexer; this is not a zero-transaction finding.", "公共索引器无法提供最近活动；这并不是零交易的结果。"));
  } else if (tokenBalancesUnavailable) {
    bullets.push(t(locale, "Token balances were unavailable from the public indexer; this is not a zero-balance finding.", "公共索引器无法提供代币余额；这并不是零余额的结果。"));
  }
  const transactionCount = finiteNumber(facts.transactionsFetched)
    ?? (Array.isArray(facts.recentTransactions) ? facts.recentTransactions.length : undefined);
  if (!activityUnavailable && transactionCount !== undefined) bullets.push(t(locale, `${transactionCount} recent transaction${transactionCount === 1 ? "" : "s"} in the available activity window.`, `可用活动窗口内有 ${transactionCount} 笔最近交易。`));
  const nativeBalance = conciseFact(facts.nativeBalanceEth);
  if (nativeBalance) bullets.push(t(locale, `Native balance: ${nativeBalance} ETH.`, `原生余额：${nativeBalance} ETH。`));
  if (!tokenBalancesUnavailable && Array.isArray(facts.tokenBalances)) {
    const checked = finiteNumber(facts.tokenBalanceContractsChecked);
    bullets.push(reviewedSample
      ? t(locale, `${facts.tokenBalances.length} positive balance${facts.tokenBalances.length === 1 ? "" : "s"} found across ${checked ?? "the bounded"} reviewed token contracts; this is not a complete portfolio.`, `在 ${checked ?? "有限"} 个已审查代币合约中发现 ${facts.tokenBalances.length} 个正数余额；这并不是完整的投资组合。`)
      : t(locale, `${facts.tokenBalances.length} token balance${facts.tokenBalances.length === 1 ? "" : "s"} returned.`, `返回了 ${facts.tokenBalances.length} 个代币余额。`));
  }
  const status = conciseFact(facts.status);
  if (status) bullets.push(t(locale, `Transaction status: ${status}.`, `交易状态：${status}。`));
  const value = conciseFact(facts.valueEth ?? facts.value);
  if (value) bullets.push(t(locale, `Transferred value: ${value}${facts.valueEth !== undefined ? " ETH" : ""}.`, `转账金额：${value}${facts.valueEth !== undefined ? " ETH" : ""}。`));
  if (Array.isArray(facts.recentTransfers)) bullets.push(t(locale, `${facts.recentTransfers.length} recent token transfer${facts.recentTransfers.length === 1 ? "" : "s"} returned.`, `返回了 ${facts.recentTransfers.length} 笔最近代币转账。`));
  return bullets.length > 0 ? bullets.slice(0, 5) : [t(locale, "No bounded activity count was available in the cited facts.", "在被引用的事实中没有可用的有界活动计数。")];
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
      if (entity.type === "transaction" && key === "status") {
        return [{ fact: `Transaction outcome: ${transactionOutcome(value)}`, sourceIds }];
      }
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
    || /\b(?:send|share|enter)\s+(?:your\s+)?(?:seed phrase|private key)\b/i.test(value)
    || /(?:你应该|建议你|我建议|你必须|你需要|务必)\s*(?:买|买入|卖出|出售|交易|兑换|桥接|授权|签名|提交|转账)/.test(value)
    || /(?:保证|肯定|一定|绝对)(?:是)?(?:安全|骗局|诈骗|恶意)/.test(value)
    || /(?:发送|分享|输入|提供)\s*(?:你的)?\s*(?:助记词|私钥|种子短语)/.test(value);
}
