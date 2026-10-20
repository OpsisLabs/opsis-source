import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeftRight, ArrowRight, ExternalLink, Info } from "lucide-react";
import { useI18n } from "../i18n";
import { useCopy } from "../opsis/copy";
import { workspaceLink } from "../opsis/model";
import { FollowWalletAction } from "../watch/FollowWalletAction";
import type {
  ObservedTradeObservation,
  ObservedTradesResponse,
  ObservedTradeToken,
} from "./api";
import type { FeeChoice } from "./BiggestTrades";
import { swapAmounts, type ScatterScale } from "./chart";
import { tradeText } from "./copy";
import { TradesChart } from "./TradesChart";
import {
  explorerAddressUrl,
  explorerTxUrl,
  followClassification,
  formatTimestamp,
  OBSERVED_TRADES_CHAIN_ID,
  OBSERVED_TRADES_FEE_OPTIONS,
  OBSERVED_TRADES_WINDOW_OPTIONS,
  senderTypeKey,
  shortAddress,
} from "./model";
import "./trades-workspace.css";

const symbol = (token: ObservedTradeToken) =>
  token.symbol || shortAddress(token.address);

function Fact({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "trades-ws-mono" : undefined}>{children}</dd>
    </div>
  );
}

function PublicLink({
  href,
  children,
  label,
}: {
  href: string | null;
  children: ReactNode;
  label?: string;
}) {
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      {children} <ExternalLink size={13} aria-hidden="true" />
    </a>
  ) : (
    <>{children}</>
  );
}

export function TradesWorkspace({
  token,
  fee,
  windowBlocks,
  status,
  data,
  message,
  onToken,
  onFee,
  onWindow,
  onSubmit,
}: {
  token: string;
  fee: FeeChoice;
  windowBlocks: number;
  status: "idle" | "loading" | "ready" | "error";
  data: ObservedTradesResponse | null;
  message: string;
  onToken: (value: string) => void;
  onFee: (value: FeeChoice) => void;
  onWindow: (value: number) => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const c = useCopy();
  return (
    <div className="trades-ws-page">
      <form
        className="trades-ws-panel trades-ws-controls"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="trades-ws-fields">
          <label className="trades-ws-token">
            <span id="trades-token-label">{t("trades.form.tokenLabel")}</span>
            <input
              aria-labelledby="trades-token-label"
              aria-describedby="trades-token-hint"
              value={token}
              onChange={(event) => onToken(event.target.value)}
              placeholder={t("trades.form.tokenPlaceholder")}
              spellCheck={false}
              autoComplete="off"
            />
            <small id="trades-token-hint" className="sr-only">
              {t("trades.form.tokenHint")}
            </small>
          </label>
          <label>
            <span id="trades-fee-label">{t("trades.form.feeLabel")}</span>
            <select
              aria-labelledby="trades-fee-label"
              value={String(fee)}
              onChange={(event) =>
                onFee(
                  event.target.value === "auto"
                    ? "auto"
                    : (Number(event.target.value) as FeeChoice),
                )
              }
            >
              <option value="auto">{t("trades.form.feeAuto")}</option>
              {OBSERVED_TRADES_FEE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t("trades.form.feeOption", {
                    fee: option,
                    pct: option / 10_000,
                  })}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span id="trades-window-label">{t("trades.form.windowLabel")}</span>
            <select
              aria-labelledby="trades-window-label"
              value={String(windowBlocks)}
              onChange={(event) => onWindow(Number(event.target.value))}
            >
              {OBSERVED_TRADES_WINDOW_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t("trades.form.windowOption", { blocks: option })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="trades-ws-consent"
          role="region"
          aria-label={t("trades.consent.title")}
        >
          <div>
            <p>
              {c(
                "Only public pool inputs go to dRPC, a paid gateway that may use independent nodes. No wallet, Vault or AI data.",
                "仅公开矿池输入会发送至 dRPC；这个付费网关可能使用独立节点。不发送钱包、保险库或 AI 数据。",
              )}
            </p>
            <details className="trades-ws-disclosure">
              <summary>{t("trades.consent.title")}</summary>
              <p>{t("trades.consent.body")}</p>
            </details>
          </div>
          <button
            className="trades-ws-primary"
            type="submit"
            disabled={status === "loading"}
          >
            {status === "loading"
              ? c("Observing…", "正在观察…")
              : c("Observe recent swaps", "观察近期交易")}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </form>
      <div className="trades-ws-status" role="status">
        {status === "loading"
          ? c(
              "Reading a bounded Swap window. No background refresh.",
              "正在读取有限的 Swap 窗口。不会后台刷新。",
            )
          : ""}
      </div>
      {status === "error" && (
        <div className="trades-ws-panel trades-ws-error" role="alert">
          <h2>{t("trades.error.title")}</h2>
          <p>{message}</p>
          <button onClick={onSubmit}>{c("Try again", "重试")}</button>
        </div>
      )}
      {status === "ready" && data ? (
        <TradesResult data={data} />
      ) : (
        <div className="trades-ws-grid trades-ws-initial">
          <section
            className="trades-ws-panel trades-ws-plot"
            aria-labelledby="trades-idle-title"
          >
            <header className="trades-ws-head">
              <div>
                <h2 id="trades-idle-title">
                  {c("Swap value over time", "兑换金额随时间变化")}
                </h2>
                <p>
                  {c(
                    "Observed events · one factory-verified pool",
                    "已观察事件 · 单一工厂验证矿池",
                  )}
                </p>
              </div>
            </header>
            <TradesChart
              data={null}
              selectedId={undefined}
              onSelect={() => {}}
              scale="log"
              unit={c("quote units", "报价单位")}
              emptyState={
                <>
                  <ArrowLeftRight size={24} aria-hidden="true" />
                  <h3>
                    {c(
                      "Choose a pool and observe a window",
                      "选择矿池并观察窗口",
                    )}
                  </h3>
                  <p>
                    {status === "idle"
                      ? c(
                          "Your clicked observation will appear here, with exact amounts in a linked table. Nothing has been requested for the current inputs.",
                          "点击观察后，结果将在此显示，并在关联表格中列出精确金额。尚未为当前输入请求数据。",
                        )
                      : c(
                          "Complete an observation to populate these axes. Missing data is never shown as zero.",
                          "完成观察后将填充这些坐标轴。缺失数据绝不显示为零。",
                        )}
                  </p>
                </>
              }
            />
          </section>
          <aside
            className="trades-ws-panel trades-ws-inspector"
            aria-label={c("Event inspector", "事件详情")}
          >
            <h2>{c("Event inspector", "事件详情")}</h2>
            <p className="trades-ws-note">
              {c(
                "Select an observed Swap to inspect its pair, exact input and output, transaction and capture bounds.",
                "选择已观察的 Swap，查看其交易对、精确输入输出、交易及捕获范围。",
              )}
            </p>
            <p className="trades-ws-boundary">
              <Info size={15} aria-hidden="true" />
              {c(
                "Swap events, not token transfers. No identity or profit attribution.",
                "Swap 事件，不是代币转账。不推断身份或利润。",
              )}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function TradesResult({ data }: { data: ObservedTradesResponse }) {
  const c = useCopy();
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState(data.observations[0]?.id);
  const [scale, setScale] = useState<ScatterScale>("log");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const select = (id: string) => {
    setSelectedId(id);
    setPage(
      Math.floor(
        data.observations.findIndex((row) => row.id === id) / pageSize,
      ),
    );
  };
  const selected =
    data.observations.find((row) => row.id === selectedId) ??
    data.observations[0];
  const quote = symbol(data.pair.quote);
  return (
    <div className="trades-ws-grid">
      <section
        className="trades-ws-panel trades-ws-plot"
        aria-labelledby="trades-plot-title"
      >
        <header className="trades-ws-head">
          <div>
            <h2 id="trades-plot-title">
              {c("Swap value over time", "兑换金额随时间变化")}
            </h2>
            <p>
              {c(
                `Each point is one observed Swap · ${quote} units, not USD`,
                `每个图点为一个已观察 Swap · 单位为 ${quote}，不是美元`,
              )}
            </p>
          </div>
          {data.observations.length > 0 && (
            <label className="trades-ws-scale">
              <span id="trades-scale-label" className="sr-only">
                {c("Value scale", "金额刻度")}
              </span>
              <select
                aria-labelledby="trades-scale-label"
                value={scale}
                onChange={(event) =>
                  setScale(event.target.value as ScatterScale)
                }
              >
                <option value="log">{c("Log scale", "对数刻度")}</option>
                <option value="linear">{c("Linear scale", "线性刻度")}</option>
              </select>
            </label>
          )}
        </header>
        {(data.window.capped ||
          data.window.narrowed ||
          data.coverage.logCapReached) && (
          <p className="trades-ws-note">
            {c(
              "Limited capture: the requested window was capped, narrowed, or reached a log limit. Inspect Context for the exact bounds and notes.",
              "有限捕获：请求窗口已限幅、缩小或达到日志上限。精确范围及说明见背景标签。",
            )}
          </p>
        )}
        <TradesChart
          data={data}
          selectedId={selected?.id}
          onSelect={select}
          scale={scale}
          unit={quote}
          emptyState={
            data.observations.length === 0 ? (
              <>
                <h3>{t("trades.empty.title")}</h3>
                <p>{t("trades.empty.body")}</p>
              </>
            ) : undefined
          }
        />
        <p className="trades-ws-scope">
          {c(
            "One verified pool · bounded window · largest returned events only. Not a chain-wide ranking or a live feed.",
            "单一验证矿池 · 有限窗口 · 仅返回的最大事件。并非全链排名或实时数据流。",
          )}
        </p>
        <p className="trades-ws-read-time">
          {c("Read at", "读取时间")}{" "}
          <time dateTime={data.fetchedAt}>
            {formatTimestamp(data.fetchedAt) || c("Unknown", "未知")}
          </time>{" "}
          · {c("Snapshot · not live", "快照 · 非实时")}
        </p>
      </section>
      <section
        className="trades-ws-panel trades-ws-table"
        aria-labelledby="trades-table-title"
      >
        <header className="trades-ws-head">
          <div>
            <h2 id="trades-table-title">
              {c(
                `Observed swaps (${data.observations.length})`,
                `已观察兑换（${data.observations.length}）`,
              )}
            </h2>
            <p>{t("trades.table.caption")}</p>
          </div>
        </header>
        {data.observations.length > 0 ? (
          <>
            <div
              className="trades-ws-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={c(
                "Observed swaps table; scroll for all columns",
                "已观察兑换表格；滚动查看所有列",
              )}
            >
              <table>
                <caption className="sr-only">
                  {c(
                    "Exact observed values. Select an event to update the chart and inspector.",
                    "精确观察值。选择事件以更新图表及详情。",
                  )}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{c("Time (UTC)", "时间（UTC）")}</th>
                    <th scope="col">{c("Pool", "矿池")}</th>
                    <th scope="col">{c("Input", "输入")}</th>
                    <th scope="col">{c("Output", "输出")}</th>
                    <th scope="col">
                      {c(`Value (${quote})`, `金额（${quote}）`)}
                    </th>
                    <th scope="col">{c("Source", "来源")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.observations
                    .slice(page * pageSize, (page + 1) * pageSize)
                    .map((row, offset) => {
                      const index = page * pageSize + offset;
                      const { input, output } = swapAmounts(row);
                      return (
                        <tr
                          key={row.id}
                          data-selected={row.id === selected?.id || undefined}
                        >
                          <td>
                            <button
                              className="trades-ws-row-select"
                              aria-label={c(
                                `Select swap ${index + 1}`,
                                `选择兑换 ${index + 1}`,
                              )}
                              aria-pressed={row.id === selected?.id}
                              onClick={() => select(row.id)}
                            >
                              {formatTimestamp(row.blockTime)
                                ?.replace("T", " ")
                                .replace(".000Z", "") ||
                                c("Time unknown", "时间未知")}
                            </button>
                          </td>
                          <td>
                            <span>Uniswap V3</span>
                            <small>
                              {symbol(row.baseToken)} / {symbol(row.quoteToken)}{" "}
                              · {row.fee / 10_000}%
                            </small>
                          </td>
                          <td className="trades-ws-mono">
                            {input.amount} {symbol(input.token)}
                          </td>
                          <td className="trades-ws-mono">
                            {output.amount} {symbol(output.token)}
                          </td>
                          <td className="trades-ws-mono">
                            {row.notionalQuote}
                          </td>
                          <td>
                            <PublicLink
                              href={explorerTxUrl(row.txHash)}
                              label={c("View transaction", "查看交易")}
                            >
                              {c("On-chain", "链上")}
                            </PublicLink>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="trades-ws-table-footer">
              <p className="trades-ws-note">
                {c(
                  `${data.observations.length} displayed / ${data.coverage.matchedLogs} matched · no missing rows inferred.`,
                  `显示 ${data.observations.length} 条 / 匹配 ${data.coverage.matchedLogs} 条 · 不推算缺失行。`,
                )}
              </p>
              {data.observations.length > 5 && (
                <div className="trades-ws-pagination">
                  <label>
                    <span id="trades-rows-label">
                      {c("Rows per page", "每页行数")}
                    </span>
                    <select
                      aria-labelledby="trades-rows-label"
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value));
                        setPage(0);
                      }}
                    >
                      {[5, 10, 25].map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>
                    {page * pageSize + 1}–
                    {Math.min((page + 1) * pageSize, data.observations.length)}{" "}
                    / {data.observations.length}
                  </span>
                  <button
                    aria-label={c("Previous page", "上一页")}
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    ‹
                  </button>
                  <button
                    aria-label={c("Next page", "下一页")}
                    disabled={(page + 1) * pageSize >= data.observations.length}
                    onClick={() => setPage(page + 1)}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="trades-ws-note">{t("trades.summary.empty")}</p>
        )}
      </section>
      <Inspector data={data} selected={selected} />
    </div>
  );
}

function Inspector({
  data,
  selected,
}: {
  data: ObservedTradesResponse;
  selected: ObservedTradeObservation | undefined;
}) {
  const { t } = useI18n();
  const c = useCopy();
  const [tab, setTab] = useState<"event" | "context">("event");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const amounts = selected ? swapAmounts(selected) : null;
  const unknown = c("Unknown", "未知");
  return (
    <aside
      className="trades-ws-panel trades-ws-inspector"
      aria-label={c("Event inspector", "事件详情")}
    >
      <div
        className="trades-ws-tabs"
        role="tablist"
        aria-label={c("Swap details", "兑换详情")}
      >
        {(["event", "context"] as const).map((name, index) => (
          <button
            key={name}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`trades-tab-${name}`}
            type="button"
            role="tab"
            aria-controls={`trades-panel-${name}`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              if (
                ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : 1 - index;
                setTab(next === 0 ? "event" : "context");
                tabRefs.current[next]?.focus();
              }
            }}
          >
            {name === "event" ? c("Event", "事件") : c("Context", "背景")}
          </button>
        ))}
      </div>
      <section
        id="trades-panel-event"
        role="tabpanel"
        aria-labelledby="trades-tab-event"
        tabIndex={0}
        hidden={tab !== "event"}
      >
        {selected && amounts ? (
          <>
            <div className="trades-ws-event-kind">
              <ArrowLeftRight size={24} aria-hidden="true" />
              <div>
                <h2>{c("Observed swap", "已观察兑换")}</h2>
                <p>{c("On-chain DEX event", "链上 DEX 事件")}</p>
              </div>
            </div>
            <dl className="trades-ws-facts">
              <Fact label={c("Time (UTC)", "时间（UTC）")} mono>
                {formatTimestamp(selected.blockTime)
                  ?.replace("T", " ")
                  .replace(".000Z", "") || unknown}
              </Fact>
              <Fact
                label={c(
                  `Value (${symbol(selected.quoteToken)})`,
                  `金额（${symbol(selected.quoteToken)}）`,
                )}
                mono
              >
                {selected.notionalQuote}
              </Fact>
              <Fact label={c("Pair / direction", "交易对 / 方向")}>
                {symbol(amounts.input.token)} → {symbol(amounts.output.token)}
              </Fact>
              <Fact label={c("Amount in", "输入数量")} mono>
                {amounts.input.amount} {symbol(amounts.input.token)}
              </Fact>
              <Fact label={c("Amount out", "输出数量")} mono>
                {amounts.output.amount} {symbol(amounts.output.token)}
              </Fact>
              <Fact label={c("Pool", "矿池")}>
                Uniswap V3
                <small>
                  {symbol(selected.baseToken)} / {symbol(selected.quoteToken)} (
                  {selected.fee / 10_000}%)
                </small>
              </Fact>
              <Fact label={c("Source", "来源")}>
                {c("On-chain Swap event", "链上 Swap 事件")}
              </Fact>
            </dl>
            <div className="trades-ws-section">
              <h3>{c("Transaction type", "交易类型")}</h3>
              <p>{c("Swap (DEX)", "兑换（DEX）")}</p>
              <p className="trades-ws-note">{t("trades.result.methodValue")}</p>
              <p className="trades-ws-note">
                {c(
                  "An event is not a net position, profit, or proof of identity.",
                  "事件不代表净头寸、利润或身份证明。",
                )}
              </p>
            </div>
            <div className="trades-ws-section">
              <h3>{c("Capture bounds", "捕获范围")}</h3>
              <dl className="trades-ws-facts">
                <Fact label={c("Block number", "区块号")} mono>
                  {selected.blockNumber}
                </Fact>
                <Fact label={c("Block hash", "区块哈希")} mono>
                  <span title={selected.blockHash}>
                    {shortAddress(selected.blockHash)}
                  </span>
                </Fact>
                <Fact label={c("Transaction", "交易")} mono>
                  <PublicLink href={explorerTxUrl(selected.txHash)}>
                    <span title={selected.txHash}>
                      {shortAddress(selected.txHash)}
                    </span>
                  </PublicLink>
                </Fact>
                <Fact label={c("Log index", "日志索引")} mono>
                  {selected.logIndex}
                </Fact>
                <Fact label={c("Pool address", "矿池地址")} mono>
                  <PublicLink href={explorerAddressUrl(selected.pool)}>
                    <span title={selected.pool}>
                      {shortAddress(selected.pool)}
                    </span>
                  </PublicLink>
                </Fact>
              </dl>
            </div>
            <details className="trades-ws-addresses">
              <summary>
                {c("Token and sender identities", "代币及发送方标识")}
              </summary>
              <dl className="trades-ws-facts">
                <Fact label={c("Block hash", "区块哈希")} mono>
                  {selected.blockHash}
                </Fact>
                <Fact label={c("Transaction", "交易")} mono>
                  {selected.txHash}
                </Fact>
                <Fact label={c("Pool address", "矿池地址")} mono>
                  {selected.pool}
                </Fact>
                {[selected.baseToken, selected.quoteToken].map((token) => (
                  <Fact key={token.address} label={symbol(token)} mono>
                    {token.address}
                    <small>
                      {token.reviewed
                        ? c("Reviewed metadata", "已审查元数据")
                        : c("Self-reported metadata", "自行报告的元数据")}{" "}
                      · {c("Decimals", "小数位")} {token.decimals}
                    </small>
                  </Fact>
                ))}
                <Fact label={t("trades.table.sender")} mono>
                  {selected.transactionSender || unknown}
                  <small>
                    {t(senderTypeKey(selected.transactionSenderType))}
                  </small>
                </Fact>
                <Fact label={t("trades.table.eventSender")} mono>
                  {selected.eventSender || unknown}
                </Fact>
                <Fact label={t("trades.table.eventRecipient")} mono>
                  {selected.eventRecipient || unknown}
                </Fact>
              </dl>
              {selected.transactionSenderType === "eoa" &&
                selected.transactionSender && (
                  <FollowWalletAction
                    address={selected.transactionSender}
                    chainId={OBSERVED_TRADES_CHAIN_ID}
                    classification={followClassification(
                      selected.transactionSenderType,
                    )}
                    variant="row"
                    className="trades-ws-follow"
                  />
                )}
            </details>
            {explorerTxUrl(selected.txHash) && (
              <Link
                className="trades-ws-primary trades-ws-research"
                to={workspaceLink("/research", selected.txHash)}
              >
                {c("Research transaction", "研究交易")}{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </>
        ) : (
          <p className="trades-ws-note">
            {c(
              "No event selected. The Context tab keeps the observation window and source receipt.",
              "尚未选择事件。背景标签保留观察窗口及来源回执。",
            )}
          </p>
        )}
      </section>
      <section
        id="trades-panel-context"
        role="tabpanel"
        aria-labelledby="trades-tab-context"
        tabIndex={0}
        hidden={tab !== "context"}
      >
        <h2>{c("Observation context", "观察背景")}</h2>
        <dl className="trades-ws-facts">
          <Fact label={c("Chain", "链")}>
            {data.chain.name} · {data.chain.id}
          </Fact>
          <Fact label={t("trades.result.pairLabel")}>
            {symbol(data.pair.base)} / {symbol(data.pair.quote)}
          </Fact>
          <Fact label={c("Block window", "区块窗口")} mono>
            {data.window.fromBlock} → {data.window.toBlock}
          </Fact>
          <Fact label={c("Start (UTC)", "开始（UTC）")} mono>
            {formatTimestamp(data.window.fromTime) || unknown}
          </Fact>
          <Fact label={c("End (UTC)", "结束（UTC）")} mono>
            {formatTimestamp(data.window.toTime) || unknown}
          </Fact>
          <Fact label={c("Read at (UTC)", "读取时间（UTC）")} mono>
            {formatTimestamp(data.fetchedAt) || unknown}
          </Fact>
          <Fact
            label={c("Requested / observed blocks", "请求 / 观察区块数")}
            mono
          >
            {data.window.requestedBlocks} / {data.window.blockCount}
          </Fact>
          <Fact label={t("trades.result.scannedLabel")}>
            {t("trades.result.scannedValue", {
              scanned: data.coverage.logsScanned,
              matched: data.coverage.matchedLogs,
              cap: data.coverage.logCap,
            })}
          </Fact>
          <Fact label={c("Pools requested / verified", "请求矿池数 / 已验证")}>
            {data.coverage.poolsRequested} /{" "}
            {data.coverage.poolVerified ? c("Yes", "是") : unknown}
          </Fact>
          <Fact
            label={c(
              "Block cap / log cap reached",
              "区块上限 / 是否达到日志上限",
            )}
            mono
          >
            {data.coverage.blockCap} /{" "}
            {data.coverage.logCapReached
              ? c("Yes · partial coverage", "是 · 部分覆盖")
              : c("No", "否")}
          </Fact>
          <Fact label={c("Window capped / narrowed", "窗口已限幅 / 缩小")}>
            {data.window.capped ? c("Yes", "是") : c("No", "否")} /{" "}
            {data.window.narrowed ? c("Yes", "是") : c("No", "否")}
          </Fact>
          <Fact label={t("trades.result.rpcLabel")} mono>
            {data.coverage.rpcUnits}
          </Fact>
          <Fact label={c("Source destinations", "来源目的地")}>
            {data.privacy.providerDestinations.join(" · ") || unknown}
          </Fact>
          <Fact label={t("trades.result.poolLabel")} mono>
            {data.pair.pool}
          </Fact>
          <Fact label={c("Factory", "工厂")} mono>
            {data.pair.factory}
          </Fact>
        </dl>
        {data.window.notes.length > 0 && (
          <div className="trades-ws-section">
            <h3>{t("trades.result.notes")}</h3>
            {data.window.notes.map((note) => (
              <p className="trades-ws-note" key={note}>
                {tradeText(note, t)}
              </p>
            ))}
          </div>
        )}
        <div className="trades-ws-section">
          <h3>{t("trades.limitations.title")}</h3>
          <ul>
            {data.limitations.map((limit) => (
              <li key={limit}>{tradeText(limit, t)}</li>
            ))}
          </ul>
        </div>
        <div className="trades-ws-section">
          <h3>{t("trades.privacy.label")}</h3>
          <p className="trades-ws-note">
            {tradeText(data.privacy.disclosure, t)}
          </p>
        </div>
      </section>
    </aside>
  );
}
