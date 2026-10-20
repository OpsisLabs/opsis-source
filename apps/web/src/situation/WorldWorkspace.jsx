import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  ChartBar,
  ChartLine,
  Clock,
  FileText,
  Info,
  MagnifyingGlass,
  MapPin,
  Table,
} from "@phosphor-icons/react";
import { useCopy } from "../opsis/copy";
import { situationText } from "./copy.js";
import { formatUsd, formatUtcRange } from "./eth-market-brief.js";
import { signed } from "./analysis.js";
import MarketChart from "./MarketChart";
import { captureSummary } from "./workspace-chart";
import "./world-workspace.css";

function Tabs({ name, value, items, onChange }) {
  return (
    <div className="world-ws-tabs" role="tablist" aria-label={name}>
      {items.map(([id, label]) => (
        <button
          key={id}
          id={`world-tab-${id}`}
          role="tab"
          aria-selected={value === id}
          aria-controls={`world-panel-${id}`}
          tabIndex={value === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const index = items.findIndex(([item]) => item === value);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      items.length) %
                    items.length;
            onChange(items[next][0]);
            document.getElementById(`world-tab-${items[next][0]}`)?.focus();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const HOUR = 3600000;
const fullTime = (time) =>
  new Date(time)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$|Z$/, " UTC");
const clockTime = (time) => new Date(time).toISOString().slice(11, 19);

/** Opsis presentation of the same captures, selections and analysis as the legacy room. */
export default function WorldWorkspace({
  data,
  edition,
  setEdition,
  events,
  visible,
  selected,
  select,
  filter,
  setFilter,
  minutes,
  setMinutes,
  series,
  enabled,
  setEnabled,
  ethBrief,
  ethGlobal,
  ethCandles,
  ethDailyChange,
  ethHeadline,
  ethBriefTime,
  ethStatusLabel,
  ethSnapshotAge,
  ethUnavailableReason,
  saved,
  setSaved,
  download,
  toast,
  newsUrl,
  marketUrl,
}) {
  const c = useCopy(),
    locale = c("en", "zh-CN");
  const localize = (text) => situationText(text, locale);
  const [search, setSearch] = useState("");
  const [ethSelection, setEthSelection] = useState(0);
  const [dock, setDock] = useState("details");
  const [view, setView] = useState("chart");
  const [showVolume, setShowVolume] = useState(true);
  const isEth = edition === "eth";
  const event = events[selected];
  const report = isEth ? ethBrief.newsContext?.[ethSelection] : event;
  const sources = isEth ? (ethBrief.newsContext ?? []) : visible;
  const matches = sources.filter(
    (source) =>
      `${localize(source.title)} ${source.source}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) &&
      (!isEth || filter === "All" || filter === "Markets"),
  );
  const changeEdition = (next) => {
    setEdition(next);
    setSearch("");
    setFilter("All");
    setView("chart");
  };
  const activeSeries = isEth
    ? [
        {
          id: "eth",
          label: "ETH/USD",
          points: ethCandles.map((candle) => ({
            time: candle.start + HOUR,
            value: candle.close,
            volume: candle.volume,
          })),
        },
      ]
    : series
        .filter((asset) => enabled.includes(asset.id))
        .map((asset) => ({
          id: asset.id,
          label: asset.symbol,
          points: asset.points.map((point) => ({
            time: point.requestedTime * 1000,
            value: point.change,
          })),
        }));
  const publication = isEth ? null : Date.parse(event.time);
  const domain = isEth
    ? ethCandles.length
      ? [ethCandles[0].start, ethCandles.at(-1).start + HOUR]
      : null
    : [publication - minutes * 60000, publication + minutes * 60000];
  const summary = captureSummary(activeSeries[0]?.points ?? []);
  const amount = (number) =>
    number == null
      ? unknown
      : number.toLocaleString(locale, { maximumFractionDigits: 2 });
  const capture = isEth ? ethBriefTime : fullTime(data.market.capturedAt);
  const unknown = c("Unavailable", "不可用");
  const gapNote = ethGlobal
    ? `${ethCandles.length} ${c("complete hourly candles", "根完整小时 K 线")} · ${ethGlobal.candleGaps.length ? c(`${ethGlobal.candleGaps.length} gap(s) disclosed, not bridged`, `已披露 ${ethGlobal.candleGaps.length} 处缺口，未连接`) : c("no gaps in captured window", "采集窗口无缺口")}${ethGlobal.candleConflicts?.length ? c(` · ${ethGlobal.candleConflicts.length} conflicted bucket(s) rejected`, ` · 已拒绝 ${ethGlobal.candleConflicts.length} 个冲突时段`) : ""}`
    : c("No complete hourly candles available", "无可用的完整小时 K 线");
  const evidenceFacts = report && (
    <dl className="world-ws-evidence-facts">
      <div>
        <dt>
          <Clock size={16} />
          {c("Published", "发布于")}
        </dt>
        <dd>{isEth ? report.date : fullTime(report.time)}</dd>
      </div>
      <div>
        <dt>
          <FileText size={16} />
          {c("Source", "来源")}
        </dt>
        <dd>
          <a href={report.url} target="_blank" rel="noopener noreferrer">
            {report.source} <ArrowUpRight size={14} />
          </a>
        </dd>
      </div>
      <div>
        <dt>
          <MapPin size={16} />
          {c("Location context", "位置背景")}
        </dt>
        <dd>
          {isEth
            ? c("Not recorded in this capture", "此次采集未记录")
            : localize(report.location)}
          {!isEth && <small>{localize(report.locationBasis)}</small>}
        </dd>
      </div>
    </dl>
  );

  return (
    <div className="world-ws-page" lang={locale}>
      <div className="world-ws-toolbar">
        <div className="world-ws-title">
          <h1>{c("World & markets", "世界与市场")}</h1>
          <p className="sr-only">
            {c(
              "Explore captured market observations beside dated reports and their sources.",
              "对照注明日期的报道及其来源，查看采集的市场观测数据。",
            )}
          </p>
        </div>
        <Tabs
          name={c("World & markets edition", "世界与市场版本")}
          value={edition}
          items={[
            [
              "eth",
              c("ETH edition · 11 Sep 2026", "ETH 版 · 2026 年 9 月 11 日"),
            ],
            [
              "archive",
              c("10 Sep world feed archive", "9 月 10 日世界资讯归档"),
            ],
          ]}
          onChange={changeEdition}
        />
        {!isEth && (
          <button className="world-ws-button" onClick={download}>
            {c("Save situation brief", "保存形势简报")}{" "}
            <span className="world-ws-mono">
              {saved.length || events.length}
            </span>
          </button>
        )}
      </div>
      <div
        id={`world-panel-${isEth ? "archive" : "eth"}`}
        role="tabpanel"
        aria-labelledby={`world-tab-${isEth ? "archive" : "eth"}`}
        hidden
      />
      <div
        id={`world-panel-${edition}`}
        role="tabpanel"
        aria-labelledby={`world-tab-${edition}`}
        className="world-ws-grid-layout"
      >
        <section
          className="world-ws-panel world-ws-events"
          aria-labelledby="world-events-title"
        >
          <div className="world-ws-head">
            <h2 id="world-events-title">{c("Market events", "市场事件")}</h2>
            <span className="world-ws-count">{sources.length}</span>
          </div>
          <label className="world-ws-search">
            <MagnifyingGlass size={18} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={c("Search events", "搜索事件")}
              placeholder={c("Search events…", "搜索事件…")}
            />
          </label>
          <div
            className="world-ws-filters"
            role="group"
            aria-label={c("Event category", "事件类别")}
          >
            {(isEth
              ? ["All", "Markets"]
              : ["All", "Policy", "Markets", "Macro"]
            ).map((tag) => (
              <button
                key={tag}
                aria-pressed={filter === tag}
                onClick={() => setFilter(tag)}
              >
                {localize(tag)}
              </button>
            ))}
          </div>
          <p className="world-ws-list-note">
            {isEth
              ? c(
                  "11 September 2026 · publisher reporting",
                  "2026 年 9 月 11 日 · 出版方报道",
                )
              : c(
                  "10 September 2026 · English source coverage",
                  "2026 年 9 月 10 日 · 英文来源的中文译文",
                )}
          </p>
          <div className="world-ws-event-list">
            {matches.map((source) => {
              const active = isEth
                ? source.url === report?.url
                : source.id === event.id;
              return (
                <button
                  className="world-ws-event"
                  key={source.url}
                  aria-pressed={active}
                  onClick={() =>
                    isEth
                      ? setEthSelection(ethBrief.newsContext.indexOf(source))
                      : select(source.index)
                  }
                >
                  <time dateTime={source.time ?? source.date}>
                    <span>
                      {isEth ? c("Sep", "9月") : source.time.slice(11, 16)}
                    </span>
                    <span>{isEth ? source.date.slice(-2) : "UTC"}</span>
                  </time>
                  <span className="world-ws-event-copy">
                    <strong>{localize(source.title)}</strong>
                    <small>{source.source}</small>
                    <span className="world-ws-category">
                      {isEth
                        ? c("ETH context", "ETH 背景")
                        : localize(source.category)}
                    </span>
                  </span>
                  <span className="world-ws-selection" aria-hidden="true">
                    {active ? "●" : "○"}
                  </span>
                </button>
              );
            })}
            {!matches.length && (
              <p className="world-ws-empty" role="status">
                {c(
                  "No reports match these filters.",
                  "没有符合这些筛选条件的报道。",
                )}
              </p>
            )}
          </div>
          <p className="world-ws-list-limit">
            <Info size={16} />
            {isEth
              ? c(
                  "Publication dates only. Exact report times are unavailable in this capture.",
                  "仅有发布日期。此次采集未提供报道的确切发布时间。",
                )
              : c(
                  "Select a report to align its publication time with the observed series.",
                  "选择报道，将其发布时间与观测序列对齐。",
                )}
          </p>
        </section>

        <section
          className="world-ws-panel world-ws-canvas"
          aria-labelledby="world-market-title"
          data-testid={isEth ? "eth-market-brief" : "archive-market-series"}
        >
          <div className="world-ws-head">
            <div className="world-ws-market-heading">
              <h2 id="world-market-title">
                {isEth
                  ? c(
                      "ETH price around captured reports",
                      "采集报道期间的 ETH 价格",
                    )
                  : c("Price around publication", "发布前后的价格")}
              </h2>
              <p>
                {isEth
                  ? c(
                      "Coinbase · ETH/USD · single venue",
                      "Coinbase · ETH/USD · 单一交易场所",
                    )
                  : c(
                      "Robinhood Chain · 4663 · USDG pools",
                      "Robinhood Chain · 4663 · USDG 池",
                    )}
              </p>
            </div>
            <div className="world-ws-chart-controls">
              <div
                className="world-ws-segment"
                role="group"
                aria-label={c("Market view", "市场视图")}
              >
                <button
                  aria-label={c("Chart", "图表")}
                  title={c("Chart", "图表")}
                  aria-pressed={view === "chart"}
                  onClick={() => setView("chart")}
                >
                  <ChartLine size={19} />
                </button>
                <button
                  aria-label={c("Table", "表格")}
                  title={c("Table", "表格")}
                  aria-pressed={view === "table"}
                  onClick={() => setView("table")}
                >
                  <Table size={19} />
                </button>
              </div>
              {isEth ? (
                <label
                  className="world-ws-check"
                  title={c("Hourly volume (ETH)", "每小时成交量（ETH）")}
                >
                  <input
                    type="checkbox"
                    checked={showVolume}
                    onChange={(event) => setShowVolume(event.target.checked)}
                  />
                  <ChartBar size={19} aria-hidden="true" />
                  <span className="sr-only">
                    {c("Hourly volume (ETH)", "每小时成交量（ETH）")}
                  </span>
                </label>
              ) : null}
            </div>
          </div>
          <p className="world-ws-capture">
            <span className="world-ws-status">
              {isEth
                ? ethStatusLabel
                : c("Not live · captured", "非实时 · 采集数据")}
            </span>
            <span>
              {c("Captured", "采集于")} {capture}
            </span>
            {isEth && ethBrief.status === "stale" && ethSnapshotAge && (
              <span>
                {c(
                  `${ethSnapshotAge} old (older captured data)`,
                  `数据已采集 ${ethSnapshotAge}（较早的采集数据）`,
                )}
              </span>
            )}
          </p>
          {!isEth && (
            <div className="world-ws-archive-controls">
              <div
                className="world-ws-segment"
                role="group"
                aria-label={c("Publication window", "发布窗口")}
              >
                {[15, 30, 60].map((window) => (
                  <button
                    key={window}
                    aria-pressed={minutes === window}
                    onClick={() => setMinutes(window)}
                  >
                    ±{window}
                    {c("m", "分")}
                  </button>
                ))}
              </div>
              <div
                className="world-ws-legend"
                role="group"
                aria-label={c("Observed assets", "观测资产")}
              >
                {series.map((asset) => (
                  <button
                    key={asset.id}
                    aria-pressed={enabled.includes(asset.id)}
                    onClick={() =>
                      setEnabled((previous) =>
                        previous.includes(asset.id)
                          ? previous.filter((id) => id !== asset.id)
                          : [...previous, asset.id],
                      )
                    }
                  >
                    <i className={`world-ws-swatch-${asset.id}`} />
                    {asset.symbol}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="world-ws-chart-context">
            {isEth ? (
              <span>
                {domain
                  ? formatUtcRange(domain[0], domain[1], locale)
                  : c(
                      "No complete hourly candles available",
                      "无可用的完整小时 K 线",
                    )}
              </span>
            ) : (
              <>
                <strong>{localize(event.title)}</strong>
                <span>
                  {c("Published", "发布于")} {fullTime(event.time)}
                </span>
              </>
            )}
          </div>
          <div hidden={view !== "chart"}>
            <MarketChart
              key={edition + (isEth ? "" : event.id + minutes)}
              series={activeSeries}
              interval={isEth ? HOUR : 300000}
              domain={domain}
              marker={publication}
              markerTitle={isEth ? "" : localize(event.title)}
              volume={!isEth || showVolume}
              value={isEth ? formatUsd : signed}
              time={(time) => clockTime(time).slice(0, 5)}
              labels={{
                chart: isEth
                  ? showVolume
                    ? c(
                        "Captured ETH hourly close in USD and hourly volume in ETH",
                        "采集的 ETH 每小时美元收盘价及以 ETH 计价的每小时成交量",
                      )
                    : c(
                        "Captured ETH hourly close in USD",
                        "采集的 ETH 每小时美元收盘价",
                      )
                  : c(
                      "Observed price changes before and after the selected news publication",
                      "所选新闻发布前后观测到的价格变化",
                    ),
                unit: isEth
                  ? c("Price (USD)", "价格（USD）")
                  : c("Change from T0 (%)", "相对 T0 的变化（%）"),
                volume: isEth
                  ? c("Volume (ETH)", "成交量（ETH）")
                  : c("Volume", "成交量"),
                volumeEmpty: c(
                  "Volume unavailable in this capture",
                  "此次采集无成交量数据",
                ),
                publication: c("Published", "发布于"),
                inspect: c("Inspect observation", "查看观测点"),
                missing: unknown,
                start: c("Start", "开始"),
                end: c("End", "结束"),
                dateOnly: c(
                  "Publication date only · exact time unavailable",
                  "仅有发布日期 · 确切时间不可用",
                ),
                empty: !activeSeries.length
                  ? c(
                      "Choose an asset to compare its observed price.",
                      "选择资产以比较其观测价格。",
                    )
                  : isEth
                    ? `${ethUnavailableReason}. ${c("No accepted hourly candles. Open a valid captured edition to inspect prices and volume.", "无已接受的小时 K 线。打开有效的采集版本以查看价格和成交量。")}`
                    : c(
                        "Observed changes unavailable in this window",
                        "此窗口的观测变化不可用",
                      ),
              }}
            />
          </div>
          <div
            hidden={view !== "table"}
            className="world-ws-table-wrap"
            tabIndex={0}
            role="region"
            aria-label={c("Exact market observations", "精确市场观测数据")}
          >
            <table>
              <caption>
                {isEth
                  ? c(
                      "Complete hourly candles · USD prices · ETH volume",
                      "完整小时 K 线 · 美元价格 · ETH 成交量",
                    )
                  : c(
                      "5-minute pool observations · USDG per token · changes from T0",
                      "每 5 分钟池观测 · 每代币 USDG · 相对 T0 的变化",
                    )}
              </caption>
              <thead>
                <tr>
                  {(isEth
                    ? [
                        c("Candle start (UTC)", "K 线开始（UTC）"),
                        c("Open (USD)", "开盘（USD）"),
                        c("High (USD)", "最高（USD）"),
                        c("Low (USD)", "最低（USD）"),
                        c("Close (USD)", "收盘（USD）"),
                        c("Volume (ETH)", "成交量（ETH）"),
                      ]
                    : [
                        c("Asset", "资产"),
                        c("Requested time (UTC)", "请求时间（UTC）"),
                        c("Observed price (USDG)", "观测价格（USDG）"),
                        c("Change from T0", "相对 T0 的变化"),
                        c("Swap age (seconds)", "Swap 年龄（秒）"),
                        c("Sample block", "采样区块"),
                      ]
                  ).map((heading) => (
                    <th scope="col" key={heading}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isEth
                  ? ethCandles.map((candle) => (
                      <tr key={candle.start}>
                        <th scope="row">{fullTime(candle.start)}</th>
                        {[
                          candle.open,
                          candle.high,
                          candle.low,
                          candle.close,
                          candle.volume,
                        ].map((number, i) => (
                          <td key={i}>{String(number)}</td>
                        ))}
                      </tr>
                    ))
                  : series
                      .filter((asset) => enabled.includes(asset.id))
                      .flatMap((asset) =>
                        asset.points.map((point) => (
                          <tr key={asset.id + point.requestedTime}>
                            <th scope="row">{asset.symbol}</th>
                            <td>{fullTime(point.requestedTime * 1000)}</td>
                            <td>
                              {point.price == null
                                ? unknown
                                : String(point.price)}
                            </td>
                            <td>
                              {point.change == null
                                ? unknown
                                : String(point.change) + "%"}
                            </td>
                            <td>{point.ageSeconds ?? unknown}</td>
                            <td>{point.sampleBlock ?? unknown}</td>
                          </tr>
                        )),
                      )}
              </tbody>
            </table>
            {isEth && !ethCandles.length && <p>{ethUnavailableReason}</p>}
            {!isEth && !enabled.length && (
              <p>
                {c(
                  "Choose an asset to compare its observed price.",
                  "选择资产以比较其观测价格。",
                )}
              </p>
            )}
          </div>
          <p className="world-ws-chart-note">
            {isEth
              ? gapNote
              : c(
                  "Change from T0 sample · USDG pools · 5-minute observations. Missing samples remain gaps.",
                  "相对 T0 样本的变化 · USDG 池 · 每 5 分钟观测。缺失样本保留为空缺。",
                )}
            {!isEth &&
              series
                .filter(
                  (asset) => enabled.includes(asset.id) && !asset.baseline,
                )
                .map((asset) => (
                  <span key={asset.id}>
                    {" "}
                    {c(
                      `${asset.symbol}: T0 sample unavailable; changes unavailable.`,
                      `${asset.symbol}：T0 样本不可用；变化不可用。`,
                    )}
                  </span>
                ))}
          </p>
          <dl className="world-ws-facts">
            {isEth ? (
              <>
                <div>
                  <dt>{c("First hourly close", "首个小时收盘价")}</dt>
                  <dd>{formatUsd(summary.first)}</dd>
                </div>
                <div>
                  <dt>{c("Last hourly close", "最后小时收盘价")}</dt>
                  <dd data-testid="eth-window-end">
                    {formatUsd(summary.last)}
                    <small
                      className={
                        summary.change == null
                          ? undefined
                          : summary.change >= 0
                            ? "world-ws-positive"
                            : "world-ws-negative"
                      }
                    >
                      {signed(summary.change)}{" "}
                      {c("in captured window", "采集窗口内")}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>{c("Avg. hourly volume", "平均小时成交量")}</dt>
                  <dd>
                    {amount(summary.averageVolume)}{" "}
                    <span className="world-ws-unit">ETH</span>
                    <small>
                      {summary.volumeCount}{" "}
                      {c("complete candles", "根完整 K 线")}
                    </small>
                  </dd>
                </div>
              </>
            ) : (
              series
                .filter((asset) => enabled.includes(asset.id))
                .map((asset) => (
                  <div key={asset.id}>
                    <dt>
                      {asset.symbol} · T0 → +{minutes}
                      {c("m", "分")}
                    </dt>
                    <dd>
                      {asset.after === null ? unknown : signed(asset.after)}
                      <small>
                        {asset.coverage}/{asset.expected}{" "}
                        {c("samples", "个样本")}
                      </small>
                    </dd>
                  </div>
                ))
            )}
          </dl>
        </section>

        <aside
          className="world-ws-panel world-ws-dock"
          aria-label={c("Event evidence", "事件证据")}
        >
          <Tabs
            name={c("Evidence view", "证据视图")}
            value={dock}
            items={[
              ["details", c("Event details", "事件详情")],
              ["method", c("Sources & method", "来源与方法")],
            ]}
            onChange={setDock}
          />
          <div
            id="world-panel-details"
            role="tabpanel"
            aria-labelledby="world-tab-details"
            hidden={dock !== "details"}
            className="world-ws-dock-body"
          >
            {report ? (
              <>
                <span className="world-ws-category">
                  {isEth
                    ? c("Opsis summary", "Opsis 摘要")
                    : localize(report.category)}
                </span>
                <h2>{localize(report.title)}</h2>
                <p>{localize(report.summary)}</p>
                {evidenceFacts}
                {!isEth && report.detail !== report.summary && (
                  <details>
                    <summary>{c("Report detail", "报道详情")}</summary>
                    <p>{localize(report.detail)}</p>
                  </details>
                )}
                <p className="world-ws-causation">
                  <Info size={16} />
                  <span>
                    {c(
                      "Timing does not establish causation",
                      "时间接近不代表因果关系",
                    )}
                  </span>
                </p>
                {isEth ? (
                  <>
                    <p className="world-ws-limit">
                      {c(
                        "Exact publication time unavailable. No publication marker is inferred from a date.",
                        "确切发布时间不可用。不根据日期推断发布标记。",
                      )}
                    </p>
                    <details>
                      <summary>
                        {c("Why this matters for ETH", "这为何与 ETH 有关")}
                      </summary>
                      <p>{localize(report.whyItMatters)}</p>
                    </details>
                    <div className="world-ws-original">
                      <h3>{c("Original source", "原始来源")}</h3>
                      <a
                        lang="en"
                        href={report.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {report.originalTitle} <ArrowUpRight size={14} />
                      </a>
                      <p>
                        {c(
                          "Original excerpt unavailable in this capture. Open the publisher's report.",
                          "此次采集没有原文摘录。请打开出版方报道。",
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="world-ws-limit">
                      {localize(report.timeBasis)}
                    </p>
                    <div className="world-ws-original">
                      <h3>
                        {c("Original source (excerpt)", "原始来源（摘录）")}
                      </h3>
                      {report.sourceExcerpt ? (
                        <blockquote lang="en">
                          {report.sourceExcerpt}
                        </blockquote>
                      ) : (
                        <p>
                          {c(
                            "Original excerpt unavailable in this capture. Open the publisher's report.",
                            "此次采集没有原文摘录。请打开出版方报道。",
                          )}
                        </p>
                      )}
                    </div>
                    <details>
                      <summary>{c("Source context", "来源背景")}</summary>
                      <p>{localize(report.insight)}</p>
                      <small>
                        {c(
                          "AI context prepared for this captured session. Price calculations update with your selected window.",
                          "AI 背景说明为此次采集预先准备。价格计算随所选窗口更新。",
                        )}
                      </small>
                    </details>
                    <details>
                      <summary>
                        {c("What to check next", "接下来查看什么")}
                      </summary>
                      <p>{localize(report.watch)}</p>
                    </details>
                    <button
                      className="world-ws-button"
                      aria-pressed={saved.includes(event.id)}
                      onClick={() =>
                        setSaved((previous) =>
                          previous.includes(event.id)
                            ? previous.filter((id) => id !== event.id)
                            : [...previous, event.id],
                        )
                      }
                    >
                      {saved.includes(event.id)
                        ? c("Added to brief", "已加入简报")
                        : c("Add to brief", "加入简报")}
                    </button>
                  </>
                )}
              </>
            ) : (
              <p role="status">
                {c(
                  "Source context unavailable in this capture.",
                  "此次采集的来源背景不可用。",
                )}
              </p>
            )}
          </div>
          <div
            id="world-panel-method"
            role="tabpanel"
            aria-labelledby="world-tab-method"
            hidden={dock !== "method"}
            className="world-ws-dock-body"
          >
            <h2>{c("Sources & method", "来源与方法")}</h2>
            {isEth ? (
              <>
                <h3>{c("Single-venue snapshot", "单一交易场所快照")}</h3>
                <p>{ethHeadline}</p>
                <p>
                  {c(
                    "Coinbase ETH/USD capture only. Timing is provided for context and does not establish a causal link.",
                    "仅为 Coinbase ETH/USD 的采集数据。时间信息仅供参考，不能确立因果关系。",
                  )}
                </p>
                {ethGlobal ? (
                  <>
                    <dl className="world-ws-evidence-facts">
                      {[
                        [c("Open", "开盘"), ethGlobal.stats.open],
                        [c("High", "最高"), ethGlobal.stats.high],
                        [c("Low", "最低"), ethGlobal.stats.low],
                        [c("Last", "最新"), ethGlobal.stats.last],
                      ].map(([label, number]) => (
                        <div key={label}>
                          <dt>{label} (USD)</dt>
                          <dd
                            className="world-ws-mono"
                            data-testid={
                              label === c("Last", "最新")
                                ? "eth-market-price"
                                : undefined
                            }
                          >
                            {formatUsd(number)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      {c("24h change · snapshot", "24 小时变化 · 快照")}:{" "}
                      {ethDailyChange} ·{" "}
                      {c(
                        "Stats last differs from the last complete hourly close.",
                        "统计最新价与最后完整小时收盘价不同。",
                      )}
                    </p>
                    <a
                      href={ethGlobal.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {c("Coinbase endpoint", "Coinbase 数据接口")}{" "}
                      <ArrowUpRight size={14} />
                    </a>
                  </>
                ) : (
                  <p>{ethUnavailableReason}</p>
                )}
                <p>
                  {c(
                    "Only complete hourly candles are shown at their closing times. Gaps and rejected conflicting buckets are not interpolated. Volume is per candle in ETH, not USD.",
                    "仅显示完整小时 K 线，并按收盘时间绘制。缺口及被拒绝的冲突时段不插值。成交量按每根 K 线以 ETH 计价，而非美元。",
                  )}
                </p>
                <p>{gapNote}</p>
                <Link className="world-ws-button" to="/stress-test">
                  {c(
                    "Test your ETH exposure in Portfolio shocks",
                    "在投资组合冲击中测试你的 ETH 敞口",
                  )}{" "}
                  →
                </Link>
              </>
            ) : (
              <>
                <p>
                  {c(
                    "Robinhood Chain (4663). Exact WETH, cbBTC and PONS contracts, quoted in USDG. Pool marginal prices are sampled from V3 swap logs every five minutes around publication, with a maximum swap age of 120 seconds. Missing samples remain gaps.",
                    "Robinhood Chain（4663）。使用精确的 WETH、cbBTC 和 PONS 合约，以 USDG 报价。在发布前后每五分钟从 V3 Swap 日志采样池的边际价格，Swap 距采样时刻最多 120 秒。缺失样本保留为空缺。",
                  )}
                </p>
                <p>
                  {c(
                    "Charts show change from the sample immediately at or before publication. Before and after cards use the selected window endpoints. Lines join observations; they are not minute-level prices or executable quotes.",
                    "图表显示相对发布时刻或之前最近样本的变化。发布前后卡片使用所选窗口的端点。连线仅连接观测点，不是分钟级价格或可执行报价。",
                  )}
                </p>
                <p>
                  {c(
                    "Publication time is not necessarily the first announcement time. The SEC story analyzes an earlier proposal.",
                    "发布时间未必是首次公告时间。SEC 报道分析的是较早的提案。",
                  )}
                </p>
                <p>
                  {c(
                    "Source-grounded AI context was prepared for this captured session. This edition does not continuously refresh or generate new model responses.",
                    "本次采集的 AI 背景说明预先根据来源准备。此版本不会持续刷新或生成新的模型回复。",
                  )}
                </p>
                <dl className="world-ws-evidence-facts">
                  <div>
                    <dt>{c("News capture", "新闻采集")}</dt>
                    <dd>{fullTime(data.news.capturedAt)}</dd>
                  </div>
                  <div>
                    <dt>{c("Market capture", "市场采集")}</dt>
                    <dd>{capture}</dd>
                  </div>
                </dl>
                <a href={marketUrl} target="_blank" rel="noopener noreferrer">
                  {c(
                    "Inspect observations and contracts",
                    "查看观测数据与合约",
                  )}{" "}
                  <ArrowUpRight size={14} />
                </a>
                <details>
                  <summary>{c("Instrument identities", "资产标识")}</summary>
                  {series.map((asset) => (
                    <dl key={asset.id} className="world-ws-evidence-facts">
                      <div>
                        <dt>
                          {asset.symbol} · {c("Contract", "合约")}
                        </dt>
                        <dd className="world-ws-mono">{asset.contract}</dd>
                      </div>
                      <div>
                        <dt>{c("Pool", "池")}</dt>
                        <dd className="world-ws-mono">{asset.pool}</dd>
                      </div>
                    </dl>
                  ))}
                  <p className="world-ws-mono">
                    USDG · {data.market.quoteContract}
                  </p>
                </details>
                <a href={newsUrl} target="_blank" rel="noopener noreferrer">
                  {c("Inspect report provenance", "查看报道来源")}{" "}
                  <ArrowUpRight size={14} />
                </a>
              </>
            )}
          </div>
        </aside>
      </div>
      {toast && <p role="status">{toast}</p>}
    </div>
  );
}
