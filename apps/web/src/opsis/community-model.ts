export const COMMUNITY_DRAFT_VERSION = 1 as const;

export type SuggestionDraft = {
  version: typeof COMMUNITY_DRAFT_VERSION;
  whatWereYouTrying: string;
  whatStoppedYou: string;
  contact: string;
  creditName: string;
  creditOptIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SuggestionFields = Pick<
  SuggestionDraft,
  "whatWereYouTrying" | "whatStoppedYou" | "contact" | "creditName" | "creditOptIn"
>;

export type ChangelogEvidence = {
  id: string;
  releaseId: string;
  title: string;
  summary: string;
  /** Simplified Chinese copy; English is shown when absent. */
  titleZh?: string;
  summaryZh?: string;
  workspace: "research" | "check" | "watch" | "lab";
  status: "shipped" | "in-progress" | "blocked";
  observedAt: string;
  verifiedAt: string | null;
  sourceLabel: string;
  sourceUrl: string | null;
};

export type ChangelogEntry = ChangelogEvidence & {
  date: string;
};

const MAX_FIELD = 2_000;

function text(value: unknown, max = MAX_FIELD): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function emptySuggestionFields(): SuggestionFields {
  return { whatWereYouTrying: "", whatStoppedYou: "", contact: "", creditName: "", creditOptIn: false };
}

export function validateSuggestion(fields: SuggestionFields): string | null {
  if (text(fields.whatWereYouTrying).length < 10) return "Tell us what you were trying to do.";
  if (text(fields.whatStoppedYou).length < 10) return "Tell us what stopped you.";
  if (text(fields.contact).length > 320) return "Contact details are too long.";
  if (text(fields.creditName).length > 160) return "The credit name is too long.";
  if (fields.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(fields.contact))) {
    return "Use a valid email address or leave contact blank.";
  }
  return null;
}

export function createSuggestionDraft(fields: SuggestionFields, now = new Date()): SuggestionDraft {
  const timestamp = now.toISOString();
  return {
    version: COMMUNITY_DRAFT_VERSION,
    whatWereYouTrying: text(fields.whatWereYouTrying),
    whatStoppedYou: text(fields.whatStoppedYou),
    contact: text(fields.contact, 320),
    creditName: text(fields.creditName, 160),
    creditOptIn: Boolean(fields.creditOptIn),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function saveSuggestionDraft(fields: SuggestionFields, previous: SuggestionDraft | null, now = new Date()): SuggestionDraft {
  const next = createSuggestionDraft(fields, now);
  return previous ? { ...next, createdAt: previous.createdAt } : next;
}

export function suggestionExport(draft: SuggestionDraft): string {
  return JSON.stringify({ ...draft, exportedAt: new Date().toISOString() }, null, 2);
}

export function suggestionMarkdown(draft: SuggestionDraft, locale = "en"): string {
  const c = (en: string, zh: string) => locale === "zh-CN" ? zh : en;
  return [
    c("# Opsis improvement suggestion", "# Opsis 改进建议"),
    "",
    `${c("What I was trying to do", "我尝试做什么")}\n\n${draft.whatWereYouTrying}`,
    "",
    `${c("What stopped me", "什么阻止了我")}\n\n${draft.whatStoppedYou}`,
    ...(draft.contact ? ["", `${c("Contact (optional)", "联系方式（可选）")}\n\n${draft.contact}`] : []),
    ...(draft.creditOptIn && draft.creditName ? ["", `${c("Credit name", "署名")}\n\n${draft.creditName}`] : []),
    "",
    `${c("Ask before using this name in a changelog", "在更新日志中使用此名称前请先征得我的同意")}: ${draft.creditOptIn ? c("Yes", "是") : c("No", "否")}`,
    "",
    c("This is a local draft. It has not been posted or sent.", "这是本地草稿，尚未发布或发送。"),
  ].join("\n");
}

export function deriveChangelog(records: readonly ChangelogEvidence[]): ChangelogEntry[] {
  return records
    .filter((record) => record.status === "shipped" && iso(record.observedAt) && iso(record.verifiedAt) && record.sourceLabel.trim())
    .map((record) => ({ ...record, date: new Date(record.verifiedAt as string).toISOString().slice(0, 10) }))
    .sort((a, b) => Date.parse(b.verifiedAt as string) - Date.parse(a.verifiedAt as string));
}

/** Only reviewed, dated evidence is eligible for public changelog copy. */
// Each entry is a release candidate merged into main and verified live on the
// production beta (release-specific evidence in docs/releases). Preview-only work is
// never listed here.
const RC25_TAGGED = "2026-09-26T04:29:21Z";
const RC26_TAGGED = "2026-09-26T04:54:37Z";
const PRODUCTION_VERIFIED = "2026-09-26T04:59:00Z";
const RC29_TAGGED = "2026-10-12T23:21:19Z";
const RC29_PRODUCTION_VERIFIED = "2026-10-12T23:40:00Z";
const RC31_TAGGED = "2026-10-13T15:53:05Z";
const RC31_PRODUCTION_VERIFIED = "2026-10-13T16:53:00Z";
const RC34_TAGGED = "2026-10-14T16:56:05Z";
const RC34_PRODUCTION_VERIFIED = "2026-10-14T17:05:00Z";
export const reviewedChangelogEvidence: readonly ChangelogEvidence[] = [
  {
    id: "rc-34-holders",
    releaseId: "34-explorer-data",
    title: "Holders, transfers and verification in Research",
    summary: "Research shows a token's holder count, lifetime transfers, source verification and upgradeable proxy, the largest holders with trading pools and burned supply shown separately, recent transfers and when the data was read, from Blockscout. A wallet shows its recent transactions. The explorer has a daily allowance; when it is used up, Research says so and answers from chain reads.",
    titleZh: "研究中的持有人、转移与验证",
    summaryZh: "研究会显示代币的持有人数、累计转移次数、源代码验证与可升级代理、最大持有人（交易池与销毁供应量单独列出）、近期转移以及数据读取时间，数据来自 Blockscout。钱包会显示近期交易。区块浏览器设有每日配额；配额用完时，研究会说明这一点，并改用链上读取作答。",
    workspace: "research",
    status: "shipped",
    observedAt: RC34_TAGGED,
    verifiedAt: RC34_PRODUCTION_VERIFIED,
    sourceLabel: "Release 34 · rc/34-explorer-data/1",
    sourceUrl: null,
  },
  {
    id: "rc-34-lookalikes",
    releaseId: "34-explorer-data",
    title: "Lookalike tokens flagged in Watch and Research",
    summary: "A token that uses a reviewed asset's symbol from a different contract, a well-known symbol that is not on the reviewed list, or a name with hidden characters is named as such and listed first. Watch checks reviewed assets first within its bound.",
    titleZh: "观察与研究中标出仿冒代币",
    summaryZh: "使用已审核资产符号但合约不同的代币、使用不在已审核列表中的知名符号的代币，以及名称含隐藏字符的代币，都会被明确标出并优先列出。观察会在其范围内优先核查已审核资产。",
    workspace: "watch",
    status: "shipped",
    observedAt: RC34_TAGGED,
    verifiedAt: RC34_PRODUCTION_VERIFIED,
    sourceLabel: "Release 34 · rc/34-explorer-data/1",
    sourceUrl: null,
  },
  {
    id: "rc-31-first-visit",
    releaseId: "31-first-visit",
    title: "Research recognises tokens and explains transactions",
    summary: "Auto mode recognises a token from its address. Transfers, approvals and Uniswap V3 swaps in a transaction are explained in plain words, wallet balances are shown, and reviewed symbols and one-click examples start a lookup. Trade Check no longer quotes a token into itself.",
    titleZh: "研究可识别代币并解释交易",
    summaryZh: "自动模式可根据地址识别代币。交易中的转账、授权和 Uniswap V3 兑换会用通俗语言解释，钱包余额会显示出来，已审核符号和一键示例可直接开始查询。交易核查不再把代币报价为其自身。",
    workspace: "research",
    status: "shipped",
    observedAt: RC31_TAGGED,
    verifiedAt: RC31_PRODUCTION_VERIFIED,
    sourceLabel: "Release 31 · rc/31-first-visit/1",
    sourceUrl: null,
  },
  {
    id: "rc-29-perp-tools",
    releaseId: "29-perp-handoff",
    title: "Perp cost scenario: funding, liquidation estimate and venue directory",
    summary: "Model hypothetical perp holding cost, funding over a holding period and an estimated liquidation price from your own numbers, and compare assumption sets. A dated directory lists venues by the region you state, with conditions, sources and a review date. Opsis has no perp trading; the venue's own figure governs.",
    titleZh: "永续成本情景：资金费、清算估算与场所目录",
    summaryZh: "使用您自己的数字建立假设永续持仓成本、持有期间资金费及清算价格估算，并比较假设组。附日期的目录按您声明的地区列出场所，并注明条件、来源及核查日期。Opsis 不提供永续合约交易；以场所自身的数值为准。",
    workspace: "check",
    status: "shipped",
    observedAt: RC29_TAGGED,
    verifiedAt: RC29_PRODUCTION_VERIFIED,
    sourceLabel: "Release 29 · rc/29-perp-handoff/1",
    sourceUrl: null,
  },
  {
    id: "rc-25-biggest-trades-1",
    releaseId: "25-biggest-trades",
    title: "Biggest observed trades",
    summary: "Compare the largest observed Uniswap V3 swaps for a token in a bounded recent block window, with exact amounts and transaction sources, then follow a public address into Watch.",
    titleZh: "最大已观察交易",
    summaryZh: "在有限的近期区块范围内比较某代币最大的已观察 Uniswap V3 兑换，显示精确数量和交易来源，并可将公开地址添加到观察。",
    workspace: "research",
    status: "shipped",
    observedAt: RC25_TAGGED,
    verifiedAt: PRODUCTION_VERIFIED,
    sourceLabel: "Release 25 · rc/25-biggest-trades/1",
    sourceUrl: null,
  },
  {
    id: "rc-26-research",
    releaseId: "26-opsis-workspaces",
    title: "Research with sources",
    summary: "Look up a Robinhood Chain token, wallet, transaction or contract and see what was found, where it came from and at which block, with limits stated.",
    titleZh: "附来源的研究",
    summaryZh: "查询 Robinhood Chain 代币、钱包、交易或合约，查看发现了什么、来自哪里以及对应区块，并注明局限。",
    workspace: "research",
    status: "shipped",
    observedAt: RC26_TAGGED,
    verifiedAt: PRODUCTION_VERIFIED,
    sourceLabel: "Release 26 · rc/26-opsis-workspaces/1",
    sourceUrl: null,
  },
  {
    id: "rc-26-trade-check",
    releaseId: "26-opsis-workspaces",
    title: "Exit check at your size",
    summary: "Quote what a token amount returns from official Uniswap V3 pools at one block, with price impact, fees and an optional three-point size curve. Gas is excluded.",
    titleZh: "按你的数量核查退出",
    summaryZh: "在同一区块从官方 Uniswap V3 流动池报价某代币数量可换回多少，显示价格影响、费用和可选的三点数量曲线。不含 Gas。",
    workspace: "check",
    status: "shipped",
    observedAt: RC26_TAGGED,
    verifiedAt: PRODUCTION_VERIFIED,
    sourceLabel: "Release 26 · rc/26-opsis-workspaces/1",
    sourceUrl: null,
  },
  {
    id: "rc-26-watch",
    releaseId: "26-opsis-workspaces",
    title: "Encrypted Watch inbox",
    summary: "Save public wallets under a passphrase in your browser, refresh them on demand, and review what changed, what is unfinished and what coverage is unknown. No background monitoring.",
    titleZh: "加密观察收件箱",
    summaryZh: "在浏览器中用口令保存公开钱包，按需刷新，并查看变化、未完成事项和未知覆盖。不在后台监控。",
    workspace: "watch",
    status: "shipped",
    observedAt: RC26_TAGGED,
    verifiedAt: PRODUCTION_VERIFIED,
    sourceLabel: "Release 26 · rc/26-opsis-workspaces/1",
    sourceUrl: null,
  },
  {
    id: "rc-26-quant-lab",
    releaseId: "26-opsis-workspaces",
    title: "Quant Lab experiments",
    summary: "Run seeded bootstrap and comparison experiments on data you import, locally in your browser, and export a manifest that replays exactly.",
    titleZh: "Quant Lab 实验",
    summaryZh: "在浏览器本地对你导入的数据运行带种子的自助抽样和对比实验，并导出可精确重放的清单。",
    workspace: "lab",
    status: "shipped",
    observedAt: RC26_TAGGED,
    verifiedAt: PRODUCTION_VERIFIED,
    sourceLabel: "Release 26 · rc/26-opsis-workspaces/1",
    sourceUrl: null,
  },
];
