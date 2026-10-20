import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  CircleHelp,
  Database,
  FileText,
  Search,
} from "lucide-react";
import { useCopy } from "./copy";
import type { Capabilities, CapabilityId, CapabilityStatus } from "./model";
import { statusDetails } from "./status-copy";
import {
  capabilityAvailability,
  capabilityCheckedAt,
  capabilityRows,
  type Availability,
} from "./status-model";
import NetworkPulsePanel from "./NetworkPulsePanel";
import "./utility-workspace.css";

const sources: Record<CapabilityId, [string, string]> = {
  contractFacts: ["Blockscout contract metadata", "Blockscout 合约元数据"],
  networkPulse: ["Read-only RPC and Chainlink", "只读 RPC 与 Chainlink"],
  linkedWallets: ["Explorer and read-only RPC", "浏览器与只读 RPC"],
  claimCheck: ["Existing controls, explorer and launch facts", "现有控制、浏览器与发行事实"],
  launchCards: ["Reviewed launch registry, RPC and explorer", "已查阅发行登记、RPC 与区块浏览器"],
  research: ["Public chain data", "公开链上数据"],
  tokenControls: ["Read-only RPC", "只读 RPC"],
  exitCheck: ["Uniswap V3 pool reads", "Uniswap V3 流动池读取"],
  watch: ["On-demand snapshots", "按需快照"],
  rwa: ["Issuer and chain evidence", "发行方与链上证据"],
  observedTrades: ["Uniswap V3 Swap logs", "Uniswap V3 Swap 日志"],
  perpHandoff: ["Reviewed venue pages", "已查阅的场所页面"],
  swapPreview: ["Uniswap V3 QuoterV2 · on-chain RPC", "Uniswap V3 QuoterV2 · 链上 RPC"],
  savedCheckComparisons: ["Encrypted browser records", "浏览器加密记录"],
  openDataSql: ["Your own CSV files", "自己的 CSV 文件"],
  openDataDatasets: ["Published Opsis datasets", "Opsis 已发布数据集"],
  receipts: ["Opsis signing key", "Opsis 签名密钥"],
  publicCards: ["Shared token card engines", "共享代币卡片引擎"],
  publicMcp: ["Shared token card engines", "共享代币卡片引擎"],
  alerts: ["Bounded chain observations", "有限链上观测"],
  stockDesk: ["Chainlink, pool and issuer evidence", "Chainlink、流动池与发行方证据"],
  telegramBot: ["Shared token card engines", "共享代币卡片引擎"],
};
const destinations: Record<CapabilityId, string> = {
  contractFacts: "/research",
  networkPulse: "/status",
  linkedWallets: "/research",
  claimCheck: "/research/claims",
  launchCards: "/research/launches",
  research: "/research",
  tokenControls: "/research",
  exitCheck: "/check",
  watch: "/watch",
  rwa: "/rwa",
  observedTrades: "/biggest-trades",
  perpHandoff: "/check/perp-scenario",
  swapPreview: "/swap",
  savedCheckComparisons: "/saved",
  openDataSql: "/lab?view=research",
  openDataDatasets: "/lab?view=research",
  receipts: "/verify",
  publicCards: "/docs",
  publicMcp: "/docs",
  telegramBot: "/docs",
  alerts: "/docs",
  stockDesk: "/rwa",
};
const states: Record<Availability, [string, string]> = {
  available: ["Available", "可用"],
  unavailable: ["Unavailable", "不可用"],
  "not-enabled": ["Not enabled", "未启用"],
  stale: ["Stale", "已过期"],
  unknown: ["Unknown", "未知"],
};
function apiQuoteRow(row: CapabilityStatus) {
  return row.id === "swapPreview" && row.scope.includes("Trade API");
}
function sourceFor(row: CapabilityStatus): [string, string] {
  return apiQuoteRow(row) ? ["Uniswap Trade API", "Uniswap Trade API"] : sources[row.id];
}
function detailsFor(row: CapabilityStatus) {
  const details = statusDetails[row.id];
  if (!apiQuoteRow(row)) return details;
  return { ...details,
    scope: ["Robinhood Chain WETH/USDG quote preview through the Uniswap Trade API", "通过 Uniswap Trade API 预览 Robinhood Chain WETH/USDG 报价"] as [string, string],
    origin: ["Live quote on request", "按请求实时报价"] as [string, string],
    freshness: ["Short-lived quote; Uniswap requotes before any trade", "短时有效报价；任何交易前由 Uniswap 重新报价"] as [string, string],
    coverage: ["WETH and USDG only", "仅限 WETH 和 USDG"] as [string, string],
    limits: ["A preview, not an execution; Opsis never signs or broadcasts.", "仅为预览，不会执行；Opsis 从不签名或广播交易。"] as [string, string],
  };
}
const manifestLabels: Record<
  "scope" | "origin" | "freshness" | "coverage" | "limits",
  [string, string]
> = {
  scope: ["Scope", "范围"],
  origin: ["Origin", "来源"],
  freshness: ["Freshness", "时效"],
  coverage: ["Coverage", "覆盖范围"],
  limits: ["Limits", "限制"],
};

export default function Status({
  capabilities,
  previewKey = "",
}: {
  capabilities: Capabilities;
  previewKey?: string;
}) {
  const c = useCopy();
  const rows = capabilityRows(capabilities);
  const [selectedId, setSelectedId] = useState<CapabilityId>(
    rows[0]?.id ?? "research",
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  const copy = selected && detailsFor(selected);
  const availability = selected && capabilityAvailability(selected);
  const checked = selected && capabilityCheckedAt(selected.id);
  const filtered = rows.filter((row) => {
    const search =
      `${c(...statusDetails[row.id].label)} ${c(...sourceFor(row))} ${row.scope}`.toLocaleLowerCase();
    return (
      search.includes(query.trim().toLocaleLowerCase()) &&
      (filter === "all" || capabilityAvailability(row) === filter)
    );
  });
  const documented = (
    key: "scope" | "origin" | "freshness" | "coverage" | "limits",
  ) => (copy ? c(...copy[key]) : "");
  return (
    <div className="utility-ws status-ws">
      <NetworkPulsePanel capabilities={capabilities} previewKey={previewKey} />
      <div className="status-ws-layout">
        <section
          className="utility-ws-panel status-ws-registry"
          aria-label={c("Capability registry", "功能登记表")}
        >
          <div className="utility-ws-toolbar">
            <h2>{c("All sources", "所有来源")}</h2>
            <label className="utility-ws-search">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">
                {c("Search sources or tools", "搜索来源或工具")}
              </span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={c("Search sources or tools…", "搜索来源或工具…")}
              />
            </label>
            <label>
              <span className="sr-only">
                {c("Filter availability", "筛选可用性")}
              </span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">{c("All states", "所有状态")}</option>
                {Object.entries(states).map(([key, label]) => (
                  <option key={key} value={key}>
                    {c(...label)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <table className="status-ws-table">
            <caption className="sr-only">
              {c(
                "Capabilities configured on this deployment. Select a tool to inspect its evidence.",
                "此部署配置的功能。选择工具以查看其证据。",
              )}
            </caption>
            <thead>
              <tr>
                {[
                  ["Tool", "工具"],
                  ["Data source", "数据来源"],
                  ["Last checked", "上次核查"],
                  ["Coverage", "覆盖范围"],
                  ["Availability", "可用性"],
                ].map(([en, zh]) => (
                  <th scope="col" key={en}>
                    {c(en, zh)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const state = capabilityAvailability(row);
                return (
                  <tr
                    key={row.id}
                    data-selected={selected?.id === row.id || undefined}
                  >
                    <th scope="row">
                      <button
                        type="button"
                        aria-pressed={selected?.id === row.id}
                        aria-controls="status-ws-evidence"
                        onClick={() => setSelectedId(row.id)}
                      >
                        <span className="utility-ws-icon">
                          <Database size={17} aria-hidden="true" />
                        </span>
                        {c(...statusDetails[row.id].label)}
                      </button>
                    </th>
                    <td data-label={c("Data source", "数据来源")}>
                      {c(...sourceFor(row))}
                    </td>
                    <td
                      data-label={c("Last checked", "上次核查")}
                      className="status-ws-date"
                    >
                      {capabilityCheckedAt(row.id) ??
                        c("Not checked", "未核查")}
                    </td>
                    <td data-label={c("Coverage", "覆盖范围")}>
                      {row.id === "perpHandoff"
                        ? c("Directory", "目录")
                        : c("Unknown", "未知")}
                    </td>
                    <td data-label={c("Availability", "可用性")}>
                      <span className="utility-ws-state" data-state={state}>
                        {state === "unknown" && (
                          <CircleHelp size={14} aria-hidden="true" />
                        )}
                        {c(...states[state])}
                      </span>
                      <span className="utility-ws-sub">
                        {row.enabled
                          ? c("Enabled", "已启用")
                          : c("Server flag off", "服务器标志已关闭")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="utility-ws-empty" role="status">
              {c(
                "No sources match these filters.",
                "没有来源符合这些筛选条件。",
              )}
            </p>
          )}
          <footer className="status-ws-registry-footer">
            <span>
              {c(
                `${filtered.length} of ${rows.length} capabilities`,
                `${filtered.length} / ${rows.length} 项功能`,
              )}
            </span>
            <span>
              {c("Select a tool for evidence →", "选择工具查看证据 →")}
            </span>
          </footer>
          <details className="utility-ws-legend">
            <summary>
              {c("What do these states mean?", "这些状态表示什么？")}
            </summary>
            <dl>
              {Object.entries(states).map(([key, label]) => (
                <div key={key}>
                  <dt>{c(...label)}</dt>
                  <dd>
                    {key === "unknown"
                      ? c(
                          "Configured, but no provider health observation is recorded here.",
                          "已配置，但此处没有提供商运行状况观测记录。",
                        )
                      : key === "available"
                        ? c(
                            "The dated, static venue directory is enabled. This is not trading access.",
                            "带日期的静态场所目录已启用。这不代表具备交易权限。",
                          )
                        : key === "not-enabled"
                          ? c(
                              "The server capability flag is off.",
                              "服务器功能标志已关闭。",
                            )
                          : key === "stale"
                            ? c(
                                "The directory review is overdue; its date stays visible.",
                                "目录已超过查阅期限；仍显示其日期。",
                              )
                            : c(
                                "No admitted perp opening or closing service exists.",
                                "尚无已准入的永续合约开仓或平仓服务。",
                              )}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
        {selected && copy && availability && (
          <aside
            className="utility-ws-panel status-ws-dock"
            id="status-ws-evidence"
            aria-labelledby="status-evidence-title"
          >
            <header className="utility-ws-dock-head">
              <span className="utility-ws-icon">
                <FileText size={22} aria-hidden="true" />
              </span>
              <div>
                <h2 id="status-evidence-title">{c(...copy.label)}</h2>
                <p>{c(...sourceFor(selected))}</p>
              </div>
            </header>
            <p className="status-ws-banner">
              <CircleHelp size={16} aria-hidden="true" />
              {selected.enabled
                ? c(
                    "Enabled · provider health unknown",
                    "已启用 · 提供商运行状况未知",
                  )
                : c(
                    "Not enabled · server flag off",
                    "未启用 · 服务器标志已关闭",
                  )}
            </p>
            <dl className="utility-ws-facts">
              <div>
                <dt>{c("Source", "来源")}</dt>
                <dd>{documented("origin")}</dd>
              </div>
              <div>
                <dt>{c("Scope", "范围")}</dt>
                <dd>{documented("scope")}</dd>
              </div>
              <div>
                <dt>{c("Coverage", "覆盖范围")}</dt>
                <dd>{documented("coverage")}</dd>
              </div>
              <div>
                <dt>{c("Freshness", "时效")}</dt>
                <dd>{documented("freshness")}</dd>
              </div>
              <div>
                <dt>{c("Last checked", "上次核查")}</dt>
                <dd>{checked ?? c("Not checked", "未核查")}</dd>
              </div>
            </dl>
            <section className="utility-ws-dock-section">
              <h3>{c("Observation timeline", "观测时间线")}</h3>
              {checked ? (
                <ol className="status-ws-timeline">
                  <li>
                    <time dateTime={checked}>{checked}</time>
                    <p>
                      {c(
                        "Venue directory reviewed. Static reference; not live.",
                        "已查阅场所目录。静态参考，并非实时数据。",
                      )}
                    </p>
                  </li>
                </ol>
              ) : (
                <div className="utility-ws-empty">
                  <FileText size={26} aria-hidden="true" />
                  <p>
                    {c(
                      "No dated provider check recorded. Enabled means configured; health and complete coverage are unverified.",
                      "没有带日期的提供商核查记录。已启用表示已配置；运行状况及完整覆盖情况尚未验证。",
                    )}
                  </p>
                </div>
              )}
            </section>
            {capabilities.manifest && (
              <details className="utility-ws-manifest">
                <summary>
                  {c("Exact server manifest", "服务器原始清单")}
                </summary>
                <dl className="utility-ws-facts">
                  {(
                    [
                      "scope",
                      "origin",
                      "freshness",
                      "coverage",
                      "limits",
                    ] as const
                  ).map((key) => (
                    <div key={key}>
                      <dt>{c(...manifestLabels[key])}</dt>
                      <dd>{selected[key]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <section className="utility-ws-dock-section">
              <h3>{c("Next action", "下一步")}</h3>
              <p>
                {selected.enabled
                  ? c(
                      "Open this tool to run its existing on-demand check. This registry does not probe providers.",
                      "打开此工具以运行现有的按需核查。此登记表不探测提供商。",
                    )
                  : c(
                      "This capability is not enabled on the server. Retrying cannot enable it.",
                      "服务器尚未启用此功能。重试无法启用它。",
                    )}
              </p>
              {selected.enabled && (
                <Link className="opsis-action" to={destinations[selected.id]}>
                  {c("Retry in tool", "在工具中重试")}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </section>
            <details className="utility-ws-dock-section status-ws-cost">
              <summary>{c("Limits & cost boundary", "限制与费用边界")}</summary>
              <p>{documented("limits")}</p>
              <p>
                {c(
                  "External transactions incur network, liquidity and protocol charges. Opsis does not sign or broadcast transactions.",
                  "外部交易涉及网络、流动性和协议费用。Opsis 不签名或广播交易。",
                )}
              </p>
            </details>
          </aside>
        )}
      </div>
      <div className="utility-ws-context">
        <p>
          {c(
            "Robinhood Chain · 4663. Registry flags show server configuration; the network panel has its own observation time.",
            "Robinhood Chain · 4663。登记表标志表示服务器配置；网络面板另有观测时间。",
          )}
        </p>
        <span className="utility-ws-mono">
          {capabilities.manifest?.build
            ? c(
                `Build ${capabilities.manifest.build}.`,
                `构建版本 ${capabilities.manifest.build}。`,
              )
            : c("Build identifier unavailable.", "构建标识不可用。")}
        </span>
      </div>
      <p className="utility-ws-notice">
        {c(
          "Perp opening and closing: unavailable. No venue is admitted for the intended Canada/US scope.",
          "永续合约开仓和平仓：不可用。加拿大／美国目标范围尚无已准入的交易场所。",
        )}
      </p>
    </div>
  );
}
