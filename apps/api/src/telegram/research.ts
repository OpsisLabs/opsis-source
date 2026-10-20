import type { DeskFact, StockDeskResult } from "@rh-chain/shared";
import { z } from "zod";
import { escapeText } from "../cards/render.js";

const en = {
  desk: "Stock Token Desk",
  launches: "Launch Radar",
  reference: "Chainlink reference (USD per token)",
  embedded: "multiplier embedded in feed",
  applied: "multiplier applied by desk",
  gap: "Pool gap (bps)",
  feed: "Feed status",
  fresh: "fresh",
  stale: "stale",
  offHours: "off-hours expected (New York calendar; holidays unknown)",
  paused: "paused",
  updated: "Feed updated",
  depth: "Depth at $1k reference notional: expected output",
  expired: "Unknown: quote expired",
  missingDepth: "Unknown: no quote at this size",
  unknown: "Unknown; source reason",
  block: "Reference block",
  depthBlock: "Depth block",
  missingBlock: "Unknown: block evidence unavailable",
  observed: "Observed at",
  limits:
    "USDG units are not dollars. Pool fees and impact included; network costs additional. Anchors are independent and current, not final.",
  stockLine:
    "A Stock Token tracks a stock; it is not a share. Not investment advice.",
  openDesk: "Open Stock Token Desk",
  unavailableDesk: "Stock Token Desk unavailable. Try again later.",
  unknownStock:
    "Unknown reviewed Stock Token. Use /desk AAPL or a reviewed Stock Token address.",
  usage: "Use /desk <ticker or token address>.",
  unavailableLaunches: "Launch Radar unavailable. Try again later.",
  window: "Newest in the {minutes}-minute feed; bounded registry coverage",
  partial: "Partial coverage; newer launches may be missing.",
  noLaunches: "No launches found in this feed window.",
  unknownAge: "Age unknown: launch timestamp unavailable or invalid",
  seconds: "{count}s ago",
  minutes: "{count}m ago",
  hours: "{count}h ago",
  days: "{count}d ago",
  launchLine: "No ranking. Not investment advice.",
  help: "Available commands",
  cardHelp: "/opsis <address> — token card",
  deskHelp: "/desk <ticker or token address> — reviewed Stock Token summary",
  launchHelp: "/launches — up to 5 newest launches in the feed",
  alertHelp:
    "/alert — create an alert; /alerts — list, stop or delete alert data",
  privacyHelp: "/privacy [en|zh] — privacy information",
  helpHelp: "/help — available commands",
};
const zh: Record<keyof typeof en, string> = {
  desk: "股票代币研究台",
  launches: "发行雷达",
  reference: "Chainlink 参考价（美元/代币）",
  embedded: "喂价已包含乘数",
  applied: "研究台已应用乘数",
  gap: "池价偏差（基点）",
  feed: "喂价状态",
  fresh: "新鲜",
  stale: "陈旧",
  offHours: "预计为非交易时段（纽约日历；节假日未知）",
  paused: "已暂停",
  updated: "喂价更新时间",
  depth: "按参考价折算的 1,000 美元名义金额深度：预期输出",
  expired: "未知：报价已过期",
  missingDepth: "未知：此金额没有报价",
  unknown: "未知；数据源原因",
  block: "参考价区块",
  depthBlock: "深度区块",
  missingBlock: "未知：缺少区块证据",
  observed: "观测时间",
  limits:
    "USDG 单位不等于美元。已包含池费和价格冲击；网络费用另计。各锚点独立，当前尚未最终确认。",
  stockLine: "股票代币跟踪股票；它并非股份。不构成投资建议。",
  openDesk: "打开股票代币研究台",
  unavailableDesk: "股票代币研究台暂不可用。请稍后重试。",
  unknownStock:
    "未知的已审阅股票代币。请使用 /desk AAPL 或已审阅的股票代币地址。",
  usage: "用法：/desk <代码或代币地址>。",
  unavailableLaunches: "发行雷达暂不可用。请稍后重试。",
  window: "最近 {minutes} 分钟数据中的最新发行；仅覆盖有限的登记范围",
  partial: "覆盖不完整；可能缺少更新的发行。",
  noLaunches: "此数据时间窗口内未发现发行。",
  unknownAge: "时间间隔未知：发行时间戳缺失或无效",
  seconds: "{count} 秒前",
  minutes: "{count} 分钟前",
  hours: "{count} 小时前",
  days: "{count} 天前",
  launchLine: "无排名。不构成投资建议。",
  help: "可用命令",
  cardHelp: "/opsis <地址> — 代币卡片",
  deskHelp: "/desk <代码或代币地址> — 已审阅股票代币摘要",
  launchHelp: "/launches — 数据中最多 5 个最新发行",
  alertHelp: "/alert — 创建提醒；/alerts — 列出、停止或删除提醒数据",
  privacyHelp: "/privacy [en|zh] — 隐私说明",
  helpHelp: "/help — 可用命令",
};
export function telegramCopy(
  key: keyof typeof en,
  values: Record<string, number> = {},
): string {
  const format = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
  return `${format(en[key])} / ${format(zh[key])}`;
}
const c = telegramCopy;
function unknown(reason: string): string {
  return `${c("unknown")}: <code>${escapeText(reason.slice(0, 120))}</code>`;
}
function block(fact: DeskFact<unknown>): string {
  const anchor =
    fact.state === "available"
      ? fact.evidence.find((e) => e.block !== null)
      : undefined;
  return anchor ? String(anchor.block) : c("missingBlock");
}
export function deskTelegramHtml(
  desk: StockDeskResult,
  origin: string,
  now = Date.now(),
): string {
  const reference = desk.reference;
  const feed = desk.feed;
  const depth = desk.depth.find((row) => row.notionalUsd === "1000")?.quote;
  const output = !depth
    ? c("missingDepth")
    : depth.state === "unknown"
      ? unknown(depth.reason)
      : Date.parse(depth.value.expiresAt) > now
        ? `${escapeText(depth.value.outputAmount)} USDG`
        : c("expired");
  return [
    `<b>${c("desk")} · ${escapeText(desk.symbol ?? "")} · 4663</b>`,
    `<code>${escapeText(desk.address)}</code>`,
    `${c("reference")}: ${reference.state === "available" ? `${escapeText(reference.value.priceUsd)} USD (${c(reference.value.multiplierEmbedded ? "embedded" : "applied")})` : unknown(reference.reason)}`,
    `${c("gap")}: ${desk.gapBps.state === "available" ? escapeText(desk.gapBps.value) : unknown(desk.gapBps.reason)}`,
    `${c("feed")}: ${feed.state === "available" ? [c(feed.value.stale ? "stale" : "fresh"), ...(feed.value.expectedOffHours ? [c("offHours")] : []), ...(feed.value.paused ? [c("paused")] : [])].join("; ") : unknown(feed.reason)}`,
    ...(feed.state === "available"
      ? [`${c("updated")}: ${escapeText(feed.value.updatedAt)}`]
      : []),
    `${c("depth")}: ${output}`,
    `${c("block")}: ${block(reference)}; ${c("depthBlock")}: ${depth ? block(depth) : c("missingBlock")}`,
    `${c("observed")}: ${escapeText(desk.observedAt)}`,
    c("limits"),
    `<i>${c("stockLine")}</i>`,
    `<a href="${escapeText(`${new URL(origin).origin}/rwa`)}">${c("openDesk")}</a>`,
  ].join("\n");
}

const timestamp = z.string().datetime({ offset: true });
const feedSchema = z.object({
  chainId: z.literal(4663),
  minutes: z.number().int().min(1).max(60),
  observedAt: timestamp,
  anchor: z.object({
    blockNumber: z.number().int().nonnegative().safe(),
    timestamp,
  }),
  coverage: z.object({ state: z.enum(["available", "partial"]) }),
  entries: z
    .array(
      z.object({
        token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        launchpad: z.string().min(1).max(160),
        created: z.object({
          blockNumber: z.number().int().nonnegative().safe(),
          logIndex: z.number().int().nonnegative().safe(),
          timestamp: timestamp.nullable(),
        }),
        partial: z.boolean().optional(),
      }),
    )
    .max(200),
});
function age(timestamp: string | null, now: number): string {
  const seconds =
    timestamp === null ? NaN : Math.floor((now - Date.parse(timestamp)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return c("unknownAge");
  const [key, divisor] =
    seconds < 60
      ? (["seconds", 1] as const)
      : seconds < 3600
        ? (["minutes", 60] as const)
        : seconds < 86400
          ? (["hours", 3600] as const)
          : (["days", 86400] as const);
  return c(key, { count: Math.floor(seconds / divisor) });
}
export function launchesTelegramHtml(
  input: Record<string, unknown>,
  origin: string,
  now = Date.now(),
): string {
  const feed = feedSchema.parse(input);
  const entries = [...feed.entries]
    .sort(
      (a, b) =>
        b.created.blockNumber - a.created.blockNumber ||
        b.created.logIndex - a.created.logIndex,
    )
    .slice(0, 5);
  return [
    `<b>${c("launches")} · 4663</b>`,
    c("window", { minutes: feed.minutes }),
    ...(feed.coverage.state === "partial" ||
    feed.entries.some((entry) => entry.partial)
      ? [c("partial")]
      : []),
    ...entries.map((entry) => {
      const link = `${new URL(origin).origin}/research?entity=${encodeURIComponent(entry.token)}`;
      return `${escapeText(entry.launchpad)} · <a href="${escapeText(link)}">${entry.token.slice(0, 6)}…${entry.token.slice(-4)}</a> · ${age(entry.created.timestamp, now)}`;
    }),
    ...(!entries.length ? [c("noLaunches")] : []),
    `${c("observed")}: ${escapeText(feed.observedAt)}; #${feed.anchor.blockNumber}`,
    `<i>${c("launchLine")}</i>`,
  ].join("\n");
}
export function telegramHelp(enabled: {
  desk: boolean;
  launches: boolean;
  alerts: boolean;
}): string {
  const commands: Array<keyof typeof en> = ["cardHelp"];
  if (enabled.desk) commands.push("deskHelp");
  if (enabled.launches) commands.push("launchHelp");
  if (enabled.alerts) commands.push("alertHelp");
  commands.push("privacyHelp", "helpHelp");
  return [
    `<b>${c("help")}</b>`,
    ...commands.map((key) => escapeText(c(key))),
  ].join("\n");
}
