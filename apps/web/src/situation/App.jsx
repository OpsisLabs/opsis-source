import { Link } from "react-router";
import { situationText } from "./copy.js";
import { useCopy } from "../opsis/copy";
import { OPSIS_PRESENTATION } from "../opsis/presentation";
const displayBrand = OPSIS_PRESENTATION ? "Opsis" : "Opsis";
import { data, newsUrl, marketUrl } from "./data.js";
import "./styles.css";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  ArrowCounterClockwise,
  FileText,
  ArrowUpRight,
  X,
  GlobeHemisphereWest,
  Clock,
  CheckCircle,
  DownloadSimple,
  CaretRight,
  BookOpen,
  ArrowsOut,
  Cursor,
  Sparkle,
  Crosshair,
  ChartLine,
  MapPin,
  Stack,
  Info,
} from "@phosphor-icons/react";
import { createGlobe } from "./globe.js";
import { chartTheme, observeChartTheme } from "./chart-theme.js";
import { drawChart } from "./chart.js";
import { eventSeries, eventTime, signed } from "./analysis.js";
import {
  evaluateEthMarketSnapshot,
  formatDuration,
  formatUsd,
  formatEthChange,
  formatUtcRange,
} from "./eth-market-brief.js";

const CANDLE_VIEW_INTERVAL_MS = 3600 * 1000;
const drawEthHourlyChart = (canvas, candles, locale) => {
  const context = canvas?.getContext("2d");
  if (!context) return;
  const theme = chartTheme(canvas);
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = Math.max(1, rect.height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width,
    height = rect.height,
    left = 64,
    right = width - 10,
    top = 12,
    bottom = height - 22;
  context.clearRect(0, 0, width, height);
  context.fillStyle = theme.panel;
  context.fillRect(0, 0, width, height);

  if (!candles.length) {
    context.fillStyle = theme.soft;
    context.font = "11px monospace";
    context.fillText(
      locale === "zh-CN"
        ? "无可用的完整小时 K 线"
        : "No complete hourly candles available",
      left,
      top + 4,
    );
    return;
  }

  const points = candles.map((candle) => ({
    time: candle.start + CANDLE_VIEW_INTERVAL_MS,
    value: candle.close,
  }));
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const pad = Math.max((maxValue - minValue) * 0.12, 1);
  const min = minValue - pad;
  const max = maxValue + pad;
  const domainStart = candles[0].start;
  const domainEnd = points.at(-1).time;
  const x = (time) =>
    left + ((time - domainStart) / (domainEnd - domainStart)) * (right - left);
  const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);

  context.strokeStyle = theme.line;
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, bottom);
  context.lineTo(right, bottom);
  context.stroke();

  context.strokeStyle = theme.line;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(left, y(min));
  context.lineTo(right, y(min));
  context.moveTo(left, y(max));
  context.lineTo(right, y(max));
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = theme.soft;
  context.font = "10px monospace";
  context.textBaseline = "middle";
  context.fillText(formatUsd(max), 6, y(max));
  context.fillText(formatUsd(min), 6, y(min));
  context.textBaseline = "alphabetic";

  context.strokeStyle = theme.accent;
  context.lineWidth = 2;
  context.beginPath();
  let previousTime = null;
  for (const point of points) {
    const cx = x(point.time);
    const cy = y(point.value);
    if (
      previousTime === null ||
      point.time - previousTime > CANDLE_VIEW_INTERVAL_MS
    ) {
      context.moveTo(cx, cy);
    } else {
      context.lineTo(cx, cy);
    }
    previousTime = point.time;
  }
  context.stroke();

  const targetTicks = Math.max(2, Math.min(6, Math.floor((right - left) / 80)));
  const step = Math.max(1, Math.ceil(points.length / targetTicks));
  context.fillStyle = theme.accent;
  context.textAlign = "center";
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    context.beginPath();
    context.arc(x(point.time), y(point.value), 2.6, 0, Math.PI * 2);
    context.fill();
    if (index % step !== 0 && index !== points.length - 1) continue;
    context.fillText(
      new Date(point.time).toISOString().slice(11, 16) + "Z",
      Math.min(Math.max(x(point.time), left + 16), right - 16),
      bottom + 14,
    );
  }
  context.textAlign = "start";
};
const stamp = (s) => new Date(s * 1000).toISOString().slice(11, 16);
export default function App() {
  const c = useCopy();
  const locale = c("en", "zh-CN");
  const localize = (text) => situationText(text, locale);
  const contextTitle = c(
    OPSIS_PRESENTATION ? "Source context" : "Opsis AI insight",
    "来源背景",
  );
  const photoFailed = (event) => {
    event.currentTarget.style.visibility = "hidden";
    event.currentTarget.parentElement.dataset.photoUnavailable = c(
      "Photo unavailable · open source",
      "照片不可用 · 打开来源",
    );
  };
  const [error, setError] = useState(""),
    [edition, setEdition] = useState("eth"),
    [selected, setSelected] = useState(0),
    [filter, setFilter] = useState("All"),
    [minutes, setMinutes] = useState(30),
    [enabled, setEnabled] = useState(["weth", "cbbtc", "pons"]),
    [insight, setInsight] = useState(false),
    [insightTab, setInsightTab] = useState("Context"),
    [modal, setModal] = useState(null),
    [sweep, setSweep] = useState(false),
    [auto, setAuto] = useState(true),
    [wide, setWide] = useState(false),
    [toast, setToast] = useState(""),
    [hover, setHover] = useState(null),
    [saved, setSaved] = useState([]);
  const globeEl = useRef(),
    globe = useRef(),
    chart = useRef(),
    ethBriefChart = useRef(),
    modalTrigger = useRef();
  const openModal = (value, trigger) => {
    modalTrigger.current = trigger ?? document.activeElement;
    setModal(value);
  };
  const select = (i) => {
    setSelected(i);
    setAuto(false);
    setSweep(false);
    setHover(null);
    globe.current?.select(i);
  };
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });
  useEffect(() => {
    if (!data || edition !== "archive" || !globeEl.current) return;
    try {
      globe.current = createGlobe(
        globeEl.current,
        data.news.events,
        (i) => selectRef.current(i),
        () =>
          setError(
            "The globe is unavailable. News and chart controls remain accessible.",
          ),
      );
      globe.current?.reset();
      setError("");
    } catch {
      setError(
        "The globe is unavailable. News and chart controls remain accessible.",
      );
    }
    return () => {
      globe.current?.dispose();
      globe.current = undefined;
    };
  }, [data, edition]);
  useEffect(() => {
    if (!sweep || !data) return;
    const id = setInterval(
      () =>
        setSelected((i) => {
          const next = (i + 1) % data.news.events.length;
          globe.current?.select(next);
          return next;
        }),
      6500,
    );
    return () => clearInterval(id);
  }, [sweep, data]);
  const e = data?.news.events[selected];
  const ethBrief = evaluateEthMarketSnapshot(data?.ethMarketBrief);
  const ethCandles =
    ethBrief.status === "valid" || ethBrief.status === "stale"
      ? ethBrief.hourlyCandles
      : [];
  const ethDailyChange =
    ethBrief.status === "valid" || ethBrief.status === "stale"
      ? formatEthChange(ethBrief.statsChangePercent)
      : "—";
  const ethPrice =
    ethBrief.status === "valid" || ethBrief.status === "stale"
      ? ethBrief.stats.last
      : null;
  const ethHeadline =
    ethPrice != null && ethPrice > 2600
      ? c(
          `ETH above ${formatUsd(2600)}. What can we verify?`,
          `ETH 高于 ${formatUsd(2600)}。我们能核实什么？`,
        )
      : c("ETH market brief", "ETH 市场简报");
  const ethUnavailableReason = localize(
    ethBrief.notLiveReason || "Captured snapshot unavailable",
  );
  const series = useMemo(
    () => (data ? eventSeries(data.market, e, minutes) : []),
    [data, e, minutes],
  );
  const ethBriefTime = ethBrief.capturedAt
    ? new Date(ethBrief.capturedAt).toLocaleString(
        locale === "zh-CN" ? "zh-CN" : "en-GB",
        {
          timeZone: "UTC",
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        },
      ) + " UTC"
    : c("No captured time available", "无可用采集时间");
  const ethStatusLabel =
    ethBrief.status === "valid"
      ? c("NOT LIVE · SNAPSHOT", "非实时 · 快照")
      : ethBrief.status === "stale"
        ? c("NOT LIVE · STALE", "非实时 · 已过期")
        : ethBrief.status === "invalid"
          ? c("NOT LIVE · INVALID SNAPSHOT", "非实时 · 快照无效")
          : c("NOT LIVE · NO SNAPSHOT", "非实时 · 无快照");
  const ethSnapshotAge =
    ethBrief.ageMinutes == null
      ? null
      : formatDuration(ethBrief.ageMinutes, locale);
  const ethGlobal =
    ethBrief.status === "valid" || ethBrief.status === "stale"
      ? ethBrief
      : null;
  useEffect(() => {
    if (!data || !chart.current) return;
    const render = () =>
      drawChart(
        chart.current,
        series.filter((a) => enabled.includes(a.id)),
        minutes,
        hover,
        locale,
      );
    render();
    const ro = new ResizeObserver(render);
    ro.observe(chart.current);
    const stopTheme = observeChartTheme(chart.current, render);
    return () => {
      ro.disconnect();
      stopTheme();
    };
  }, [data, series, enabled, minutes, hover, wide, edition, locale]);

  useEffect(() => {
    if (!ethBriefChart.current) return;
    const render = () =>
      drawEthHourlyChart(ethBriefChart.current, ethCandles, locale);
    render();
    const ro = new ResizeObserver(render);
    ro.observe(ethBriefChart.current);
    const stopTheme = observeChartTheme(ethBriefChart.current, render);
    return () => {
      ro.disconnect();
      stopTheme();
    };
  }, [ethCandles, ethBrief.status, edition, locale]);
  useEffect(() => {
    if (!modal && !insight) return;
    const trigger = modal ? modalTrigger.current : document.activeElement;
    const backgrounds = modal
      ? [
          ...document.querySelectorAll(
            ".product-shell > aside, .product-shell > button, .situation-surface > main",
          ),
        ]
      : [];
    const previous = backgrounds.map((node) => node.inert);
    backgrounds.forEach((node) => {
      node.inert = true;
    });
    const f = (x) => {
      if (x.key === "Escape") {
        setModal(null);
        setInsight(false);
      }
      if (modal && x.key === "Tab") {
        const items = [
          ...document
            .querySelector(".situation-surface .sr-dialog")
            .querySelectorAll("button,a[href]"),
        ];
        const first = items[0],
          last = items.at(-1);
        if (x.shiftKey && document.activeElement === first) {
          x.preventDefault();
          last.focus();
        } else if (!x.shiftKey && document.activeElement === last) {
          x.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", f);
    return () => {
      document.removeEventListener("keydown", f);
      backgrounds.forEach((node, i) => {
        node.inert = previous[i];
      });
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, [modal, insight]);
  if (!data)
    return (
      <div className="sr-loading">
        <img src="/logo.svg" width="50" />
        <p>
          {localize(error) ||
            c(
              "Connecting news and market observations…",
              "正在连接新闻与市场观测…",
            )}
        </p>
        {error && (
          <button onClick={() => location.reload()}>
            {c("Retry", "重试")}
          </button>
        )}
      </div>
    );
  const events = data.news.events,
    visible = events
      .map((v, index) => ({ ...v, index }))
      .filter((v) => filter === "All" || v.tags.includes(filter));
  const selectedTime = eventTime(e);
  const openInsight = () => {
    setInsight(true);
    setSweep(false);
    setInsightTab("Context");
  };
  const notify = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 2500);
  };
  const download = () => {
    const list = saved.length
      ? events.filter((v) => saved.includes(v.id))
      : events;
    const text =
      "# " +
      displayBrand +
      " " +
      c("World & markets", "世界与市场") +
      " — 2026-09-10\n\n" +
      c("News capture: ", "新闻采集：") +
      data.news.capturedAt +
      "\n" +
      c("Market capture: ", "市场采集：") +
      data.market.capturedAt +
      "\n\n" +
      list
        .map(
          (v) =>
            `## ${v.title}\n${c("Published", "发布于")}: ${v.time}\n${v.summary}\n\n${contextTitle} ${c("(prepared for this capture)", "（为此次采集预先准备）")}: ${localize(v.insight)}\n${c("Source", "来源")}: ${v.url}\n\n`,
        )
        .join("") +
      "\n" +
      c(
        "Price observations are contextual, not proof of causation.",
        "价格观测仅提供背景，不能证明因果关系。",
      ) +
      "\n";
    const u = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = displayBrand + "-situation-brief-2026-09-10.md";
    a.click();
    URL.revokeObjectURL(u);
    notify(c("Situation brief saved", "形势简报已保存"));
  };
  return (
    <div className="situation-surface" lang={locale}>
      <main className={"situation-room " + (wide ? "focus-room" : "")}>
        <nav
          className="sr-edition-switch"
          role="tablist"
          aria-label={c("World & markets edition", "世界与市场版本")}
        >
          <button
            role="tab"
            id="edition-eth"
            aria-selected={edition === "eth"}
            className={edition === "eth" ? "active" : ""}
            onClick={() => setEdition("eth")}
          >
            {c("ETH edition · 11 Sep 2026", "ETH 版 · 2026 年 9 月 11 日")}
          </button>
          <button
            role="tab"
            id="edition-archive"
            aria-selected={edition === "archive"}
            className={edition === "archive" ? "active" : ""}
            onClick={() => setEdition("archive")}
          >
            {c("10 Sep world feed archive", "9 月 10 日世界资讯归档")}
          </button>
        </nav>
        {edition === "eth" && (
          <>
            <section className="sr-title" data-testid="eth-edition-title">
              <div>
                <p className="sr-overline">
                  {c("SITUATION ROOM / ETH EDITION", "世界与市场 / ETH 版")}
                </p>
                <h1>
                  {c("World & markets", "世界与市场")}
                  <span>.</span>
                </h1>
                <p>
                  {c(
                    "Ethereum market brief: captured Coinbase ETH/USD data with dated source-linked context.",
                    "以太坊市场简报：已采集的 Coinbase ETH/USD 数据，附有日期和来源的背景说明。",
                  )}
                </p>
                <small className="sr-edition">
                  {c(
                    "11 September 2026 ETH edition · captured data",
                    "2026 年 9 月 11 日 ETH 版 · 采集数据",
                  )}{" "}
                  · {displayBrand}{" "}
                  {c("summaries of publisher reporting", "报道摘要")}
                </small>
              </div>
            </section>
            <section
              className="sr-eth-brief"
              data-testid="eth-market-brief"
              aria-label={c("ETH market brief", "ETH 市场简报")}
            >
              <div className="sr-eth-brief-head">
                <div>
                  <p className="sr-overline">
                    {c("ETH MARKET BRIEF", "ETH 市场简报")}
                  </p>
                  <h2>{ethHeadline}</h2>
                  <small>
                    {c("Captured", "采集于")} {ethBriefTime} ·{" "}
                    {c("not live", "非实时")}
                    {ethBrief.status === "stale" && ethSnapshotAge
                      ? c(
                          ` · ${ethSnapshotAge} old (older captured data)`,
                          ` · 数据已采集 ${ethSnapshotAge}（较早的采集数据）`,
                        )
                      : ""}
                  </small>
                </div>
                <span className={`sr-eth-status ${ethBrief.status}`}>
                  {ethStatusLabel}
                </span>
              </div>
              <p className="sr-eth-summary" data-testid="eth-market-price">
                {ethGlobal ? (
                  <>
                    {c("Last", "最新")} {formatUsd(ethPrice)} · 24h{" "}
                    {ethDailyChange}
                  </>
                ) : (
                  ethUnavailableReason
                )}
              </p>
              <p className="sr-eth-bridge-note">
                {c(
                  "Coinbase ETH/USD capture only. Timing is provided for context and does not establish a causal link.",
                  "仅为 Coinbase ETH/USD 的采集数据。时间信息仅供参考，不能确立因果关系。",
                )}
              </p>
              <div className="sr-eth-panels">
                <article
                  className="sr-eth-card"
                  aria-label={c("ETH market snapshot", "ETH 市场快照")}
                >
                  <div className="sr-eth-card-head">
                    <h3>{c("Single-venue snapshot", "单一交易场所快照")}</h3>
                    <small>
                      {c(
                        "Coinbase ETH/USD, not live",
                        "Coinbase ETH/USD，非实时",
                      )}
                    </small>
                  </div>
                  {ethGlobal ? (
                    <>
                      <p>
                        {ethGlobal.pair} · {localize(ethGlobal.scope)}
                      </p>
                      <p>
                        {c("Open", "开盘")}：{formatUsd(ethGlobal.stats.open)} ·{" "}
                        {c("High", "最高")}：{formatUsd(ethGlobal.stats.high)} ·
                        {c("Low", "最低")}：{formatUsd(ethGlobal.stats.low)} ·{" "}
                        {c("Last", "最新")}：{formatUsd(ethGlobal.stats.last)}
                      </p>
                      <a
                        className="sr-source-link"
                        href={ethGlobal.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c("Coinbase endpoint", "Coinbase 数据接口")}
                        <ArrowUpRight size={12} />
                      </a>
                    </>
                  ) : (
                    <p>{ethUnavailableReason}</p>
                  )}
                </article>
                <article
                  className="sr-eth-card"
                  aria-label={c("ETH hourly line chart", "ETH 每小时折线图")}
                >
                  <div className="sr-eth-card-head">
                    <h3>{c("Hourly close history", "每小时收盘价历史")}</h3>
                    <small>
                      {c(
                        "Complete candles only, no gap interpolation",
                        "仅含完整 K 线，缺口不插值",
                      )}
                    </small>
                  </div>
                  <canvas
                    ref={ethBriefChart}
                    aria-label={c(
                      "ETH hourly close chart",
                      "ETH 每小时收盘价图",
                    )}
                  />
                  <small>
                    {formatUtcRange(
                      ethCandles[0]?.start,
                      (ethCandles.at(-1)?.start ?? 0) + CANDLE_VIEW_INTERVAL_MS,
                      locale,
                    )}
                  </small>
                  <small className="sr-eth-gap-note">
                    {ethGlobal
                      ? `${ethCandles.length} ${c("complete hourly candles", "根完整小时 K 线")} · ${
                          ethGlobal.candleGaps.length
                            ? c(
                                `${ethGlobal.candleGaps.length} gap(s) disclosed, not bridged`,
                                `已披露 ${ethGlobal.candleGaps.length} 处缺口，未连接`,
                              )
                            : c("no gaps in captured window", "采集窗口无缺口")
                        }${
                          ethGlobal.candleConflicts?.length
                            ? c(
                                ` · ${ethGlobal.candleConflicts.length} conflicted bucket(s) rejected`,
                                ` · 已拒绝 ${ethGlobal.candleConflicts.length} 个冲突时段`,
                              )
                            : ""
                        }`
                      : c(
                          "No complete hourly candles available",
                          "无可用的完整小时 K 线",
                        )}
                  </small>
                </article>
              </div>
              <section
                className="sr-eth-context"
                data-testid="eth-market-context"
                aria-label={c("ETH source context", "ETH 来源背景")}
              >
                {ethBrief.newsContext?.length
                  ? ethBrief.newsContext.slice(0, 2).map((source) => (
                      <article
                        className="sr-eth-context-card"
                        key={source.url}
                        data-testid="eth-context-card"
                      >
                        <p className="sr-eth-context-label">
                          {displayBrand.toUpperCase()} {c("SUMMARY", "摘要")} ·{" "}
                          {source.source}
                        </p>
                        <h4>{localize(source.title)}</h4>
                        <p className="sr-eth-context-date">
                          {c("Published", "发布于")} {source.date}
                        </p>
                        <p>{localize(source.summary)}</p>
                        <details className="sr-eth-why">
                          <summary>
                            {c("Why this matters for ETH", "这为何与 ETH 有关")}
                          </summary>
                          <p>{localize(source.whyItMatters)}</p>
                        </details>
                        <a
                          className="sr-source-link"
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {c("Original", "原文")}：{source.originalTitle}{" "}
                          <ArrowUpRight size={12} />
                        </a>
                      </article>
                    ))
                  : null}
              </section>
              <Link
                to="/stress-test"
                className="sr-eth-action"
                aria-label={c("Test your ETH exposure", "测试你的 ETH 敞口")}
              >
                {OPSIS_PRESENTATION
                  ? c(
                      "Test your ETH exposure in Portfolio shocks",
                      "在投资组合冲击中测试你的 ETH 敞口",
                    )
                  : "Test your ETH exposure in the Portfolio shocks"}{" "}
                <ArrowUpRight size={12} />
              </Link>
            </section>
          </>
        )}
        {edition === "archive" && (
          <>
            <div className="sr-breadcrumb">
              <span>
                <GlobeHemisphereWest size={14} /> {c("QUANT LAB", "量化实验室")}{" "}
                <CaretRight size={11} /> {c("SITUATION ROOM", "世界与市场")}
              </span>
              <span>
                <Clock size={12} />{" "}
                {c(
                  "10 SEP 2026 · NEWS CAPTURE",
                  "2026 年 9 月 10 日 · 新闻采集",
                )}{" "}
                {data.news.capturedAt.slice(11, 16)} UTC
              </span>
            </div>
            <section className="sr-title">
              <div>
                <p className="sr-overline">
                  {c(
                    "WORLD EVENTS / ONCHAIN INTELLIGENCE",
                    "世界事件 / 链上研究",
                  )}
                </p>
                <h1>
                  {c("World & markets", "世界与市场")}
                  <span>.</span>
                </h1>
                <p>
                  {c(
                    "Follow the announcement. Examine the reaction.",
                    "跟进公告，查看市场反应。",
                  )}
                </p>
                <small className="sr-edition">
                  {c(
                    "10 September 2026 edition · captured data · English source coverage",
                    "2026 年 9 月 10 日版 · 采集数据 · 英文来源覆盖",
                  )}
                </small>
              </div>
              <div className="sr-title-actions">
                <button
                  className={"sr-secondary " + (sweep ? "active" : "")}
                  id="sweep"
                  onClick={() => {
                    setSweep(!sweep);
                    setAuto(false);
                    if (!sweep) globe.current?.select(selected);
                  }}
                >
                  {sweep ? (
                    <Pause size={16} />
                  ) : (
                    <GlobeHemisphereWest size={17} />
                  )}{" "}
                  {sweep
                    ? c("Pause world sweep", "暂停世界巡览")
                    : c("World sweep", "世界巡览")}
                </button>
                <button
                  className="sr-primary"
                  id="brief"
                  onClick={(event) => openModal("brief", event.currentTarget)}
                >
                  <FileText size={17} />
                  {c("Situation brief", "形势简报")}{" "}
                  {saved.length > 0 && <span>{saved.length}</span>}
                </button>
              </div>
            </section>
            <div className="sr-workbench">
              <section className="sr-world-panel">
                <div className="sr-world">
                  <div className="sr-world-label">
                    <span>
                      {c(
                        "GLOBAL SITUATION / 07 REPORTS · 10 SEP",
                        "全球动态 / 07 篇报道 · 9 月 10 日",
                      )}
                    </span>
                    <button
                      id="focus"
                      aria-label={c("Toggle focus view", "切换聚焦视图")}
                      onClick={() => setWide(!wide)}
                    >
                      <ArrowsOut size={15} />
                    </button>
                  </div>
                  <div className="sr-globe" ref={globeEl} />
                  <div className="sr-metrics">
                    <div>
                      <b>07</b>
                      <span>
                        {c("News reports", "新闻报道")}
                        <small>
                          {c("10 September 2026", "2026 年 9 月 10 日")}
                        </small>
                      </span>
                    </div>
                    <div>
                      <b>03</b>
                      <span>
                        {c("Onchain assets", "链上资产")}
                        <small>Robinhood Chain</small>
                      </span>
                    </div>
                    <div>
                      <b>05{c("m", "分")}</b>
                      <span>
                        {c("Price observations", "价格观测")}
                        <small>
                          {c("Before & after publication", "发布前后")}
                        </small>
                      </span>
                    </div>
                  </div>
                  <div className="sr-location" key={e.id}>
                    <MapPin size={14} />
                    <div>
                      <strong>{e.location}</strong>
                      <span>
                        {localize(e.category)} · {e.time.slice(11, 19)} UTC
                      </span>
                    </div>
                  </div>
                  <div className="sr-globe-tools">
                    <span>
                      <Cursor size={12} />
                      {c(
                        "Drag to orbit · scroll to zoom",
                        "拖动旋转 · 滚动缩放",
                      )}
                    </span>
                    <button
                      id="rotate"
                      aria-label={c("Toggle globe rotation", "切换地球旋转")}
                      onClick={() => {
                        setSweep(false);
                        setAuto(globe.current?.toggle() ?? false);
                      }}
                    >
                      {auto ? <Pause /> : <Play />}
                    </button>
                    <button
                      id="reset"
                      aria-label={c("Reset globe", "重置地球")}
                      onClick={() => {
                        globe.current?.reset();
                        setAuto(true);
                        setSweep(false);
                      }}
                    >
                      <ArrowCounterClockwise />
                    </button>
                  </div>
                </div>
                <div className="sr-market">
                  <div className="sr-chart-head">
                    <div>
                      <p className="sr-overline">
                        {c("PRICE AROUND PUBLICATION", "发布前后的价格")}
                      </p>
                      <strong>{e.title}</strong>
                    </div>
                    <div className="sr-windows">
                      {[15, 30, 60].map((n) => (
                        <button
                          id={"window-" + n}
                          key={n}
                          className={minutes === n ? "active" : ""}
                          onClick={() => {
                            setMinutes(n);
                            setHover(null);
                          }}
                        >
                          ±{n}
                          {c("m", "分")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="sr-chart-legend">
                    <span>
                      <span className="sr-status-dot" /> T0 ·{" "}
                      {e.time.slice(11, 19)} UTC
                    </span>
                    <div>
                      {series.map((a) => (
                        <button
                          key={a.id}
                          id={"asset-" + a.id}
                          aria-pressed={enabled.includes(a.id)}
                          onClick={() =>
                            setEnabled((v) =>
                              v.includes(a.id)
                                ? v.filter((x) => x !== a.id)
                                : [...v, a.id],
                            )
                          }
                        >
                          <i
                            style={{
                              background: {
                                weth: "var(--accent)",
                                cbbtc: "var(--ink)",
                                pons: "var(--surface-purple)",
                              }[a.id],
                            }}
                          />
                          {a.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                  {enabled.length ? (
                    <canvas
                      key={e.id + minutes}
                      ref={chart}
                      onPointerMove={(x) =>
                        setHover(
                          x.clientX -
                            x.currentTarget.getBoundingClientRect().left,
                        )
                      }
                      onPointerLeave={() => setHover(null)}
                      aria-label={c(
                        "Observed price changes before and after the selected news publication",
                        "所选新闻发布前后观测到的价格变化",
                      )}
                    />
                  ) : (
                    <div className="sr-empty">
                      {c(
                        "Choose an asset to compare its observed price.",
                        "选择资产以比较其观测价格。",
                      )}
                    </div>
                  )}
                  <div className="sr-chart-foot">
                    <span>
                      {c(
                        "Change from T0 sample · USDG pools · 5-minute observations",
                        "相对 T0 样本的变化 · USDG 池 · 每 5 分钟观测",
                      )}
                    </span>
                    <button
                      id="method"
                      onClick={(event) =>
                        openModal("sources", event.currentTarget)
                      }
                    >
                      {c("Sources & method", "来源与方法")}
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                </div>
              </section>
              <aside className="sr-events">
                <div className="sr-event-tools">
                  <span>
                    {c("WORLD FEED · 10 SEP", "世界资讯 · 9 月 10 日")}{" "}
                    <b>{visible.length}</b>
                  </span>
                  <div className="sr-filters">
                    {["All", "Policy", "Markets", "Macro"].map((f) => (
                      <button
                        id={"filter-" + f.toLowerCase()}
                        className={filter === f ? "active" : ""}
                        key={localize(f)}
                        onClick={() => setFilter(f)}
                      >
                        {localize(f)}
                      </button>
                    ))}
                  </div>
                </div>
                {insight ? (
                  <div
                    className="sr-insight"
                    role="region"
                    aria-label={contextTitle}
                  >
                    <div className="sr-insight-head">
                      <span>
                        <Sparkle size={17} weight="fill" /> {contextTitle}
                      </span>
                      <button
                        id="close-insight"
                        aria-label={c("Close AI insight", "关闭 AI 解读")}
                        onClick={() => setInsight(false)}
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <img
                      className="sr-insight-photo"
                      src={e.image}
                      alt={e.imageAlt}
                      onError={photoFailed}
                    />
                    <div className="sr-insight-content">
                      <p className="sr-overline">
                        {localize(e.category)} / {e.time.slice(11, 16)} UTC
                      </p>
                      <h2>{e.title}</h2>
                      <div className="sr-insight-tabs">
                        {["Context", "Price action", "Watch next"].map((t) => (
                          <button
                            key={localize(t)}
                            id={"insight-" + t.toLowerCase().replace(" ", "-")}
                            className={insightTab === t ? "active" : ""}
                            onClick={() => setInsightTab(t)}
                          >
                            {localize(t)}
                          </button>
                        ))}
                      </div>
                      {insightTab === "Context" ? (
                        <>
                          <h3>{c("What matters", "值得关注")}</h3>
                          <p>{localize(e.insight)}</p>
                          <div className="sr-insight-callout">
                            <Info size={16} />
                            <span>
                              {c(
                                "The publication timestamp anchors this view. The information may have reached markets earlier.",
                                "此视图以发布时间为基准。市场可能更早已获知这些信息。",
                              )}
                            </span>
                          </div>
                        </>
                      ) : insightTab === "Price action" ? (
                        <>
                          <h3>
                            {c("What the observations show", "观测结果说明")}
                          </h3>
                          {series.map((a) => (
                            <div className="sr-ai-price" key={a.id}>
                              <strong>{a.symbol}</strong>
                              <b>{signed(a.after)}</b>
                              <small>
                                T0 → +{minutes}
                                {c("m", "分钟")} · {a.coverage}/{a.expected}{" "}
                                {c("samples", "个样本")}
                              </small>
                            </div>
                          ))}
                          <p>
                            {c(
                              "These changes describe the selected pools around publication. Other news, liquidity and trading activity may explain the move. No causal effect is established.",
                              "这些变化描述所选池在发布前后的情况。其他新闻、流动性和交易活动也可能解释价格变动。不能据此确立因果关系。",
                            )}
                          </p>
                        </>
                      ) : (
                        <>
                          <h3>{c("What to check next", "接下来查看什么")}</h3>
                          <p>{localize(e.watch)}</p>
                          <div className="sr-insight-callout">
                            <Crosshair size={17} />
                            <span>
                              {c(
                                "Switch between 15, 30 and 60 minutes. Check whether the move began before the report.",
                                "切换 15、30 和 60 分钟窗口，查看变动是否在报道发布前已开始。",
                              )}
                            </span>
                          </div>
                        </>
                      )}
                      <a
                        className="sr-source-link"
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {c("Read source evidence", "阅读来源证据")}
                        <ArrowUpRight size={15} />
                      </a>
                      <small className="sr-ai-note">
                        {c(
                          "AI context prepared for this captured session. Price calculations update with your selected window.",
                          "AI 背景说明为此次采集预先准备。价格计算随所选窗口更新。",
                        )}
                      </small>
                    </div>
                  </div>
                ) : (
                  <div className="sr-event-list">
                    {visible.map((ev) => (
                      <button
                        className={
                          "sr-event " +
                          (ev.index === selected ? "selected" : "")
                        }
                        key={ev.id}
                        id={"event-" + ev.id}
                        onClick={() => select(ev.index)}
                        aria-pressed={ev.index === selected}
                      >
                        <div className="sr-event-photo">
                          <img
                            src={ev.image}
                            alt={ev.imageAlt}
                            onError={photoFailed}
                          />
                          <b>{String(ev.index + 1).padStart(2, "0")}</b>
                        </div>
                        <div className="sr-event-copy">
                          <div>
                            <span>{localize(ev.category)}</span>
                            <time>{ev.time.slice(11, 16)} UTC</time>
                          </div>
                          <h2>{ev.title}</h2>
                          <p>{ev.summary}</p>
                          <footer>
                            <span>{ev.source}</span>
                            <ArrowUpRight size={13} />
                          </footer>
                        </div>
                      </button>
                    ))}
                    {!visible.length && (
                      <p className="sr-empty">
                        {c("No reports in this category.", "此类别没有报道。")}
                      </p>
                    )}
                  </div>
                )}
                <div className="sr-feed-actions">
                  <button
                    className="sr-investigate"
                    id="investigate"
                    onClick={(event) => openModal("event", event.currentTarget)}
                  >
                    <BookOpen size={16} />
                    {c("Source details", "来源详情")}
                  </button>
                  <button
                    className="sr-primary"
                    id="ai-insight"
                    onClick={openInsight}
                  >
                    <Sparkle size={17} weight="fill" />
                    {c("AI insight", "AI 解读")} <ArrowUpRight size={15} />
                  </button>
                </div>
              </aside>
            </div>
            <section className="sr-reactions">
              <div className="sr-reactions-label">
                <ChartLine size={22} />
                <div>
                  <strong>{c("Reaction window", "反应窗口")}</strong>
                  <small>
                    {stamp(selectedTime - minutes * 60)} —{" "}
                    {stamp(selectedTime + minutes * 60)} UTC
                  </small>
                </div>
              </div>
              {series.map((a) => (
                <div className="sr-reaction" key={a.id}>
                  <strong>
                    {a.symbol}
                    <small>
                      {a.coverage}/{a.expected} {c("samples", "个样本")}
                    </small>
                  </strong>
                  <span>
                    <small>
                      −{minutes}
                      {c("m", "分")} → T0
                    </small>
                    <b>{signed(a.before)}</b>
                  </span>
                  <span>
                    <small>
                      T0 → +{minutes}
                      {c("m", "分")}
                    </small>
                    <b
                      className={
                        a.after > 0 ? "positive" : a.after < 0 ? "negative" : ""
                      }
                    >
                      {signed(a.after)}
                    </b>
                  </span>
                </div>
              ))}
            </section>
            <section className="sr-sequence">
              <div>
                <span>
                  <Stack size={14} />
                  {c("ANNOUNCEMENT SEQUENCE", "公告顺序")}
                </span>
                <small>
                  {c(
                    "10 SEP · UTC · select to investigate",
                    "9 月 10 日 · UTC · 选择以查看详情",
                  )}
                </small>
              </div>
              <div className="sr-sequence-items">
                {[...events].reverse().map((ev) => (
                  <button
                    id={"sequence-" + ev.id}
                    key={ev.id}
                    className={e.id === ev.id ? "active" : ""}
                    onClick={() =>
                      select(events.findIndex((v) => v.id === ev.id))
                    }
                  >
                    <time>{ev.time.slice(11, 16)}</time>
                    <span>
                      {localize(
                        ev.id === "ecb"
                          ? "ECB rates"
                          : ev.id === "clarity"
                            ? "Clarity draft"
                            : ev.id === "sec"
                              ? "SEC proposal"
                              : ev.id === "okx"
                                ? "OKX Europe"
                                : ev.id === "esma"
                                  ? "EU access"
                                  : ev.id === "monument"
                                    ? "Monument"
                                    : "Polymarket",
                      )}
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
            </section>
            <div className="sr-context">
              <span>
                <CheckCircle size={14} />
                {c("Source-linked facts", "附来源的事实")}
              </span>
              <p>
                {c(
                  "News and price changes share a timeline. Proximity does not establish causation.",
                  "新闻与价格变化使用同一时间轴。时间接近不代表因果关系。",
                )}
              </p>
              <button
                onClick={(event) => openModal("sources", event.currentTarget)}
              >
                {c("View provenance", "查看溯源")}
                <ArrowUpRight size={13} />
              </button>
            </div>
          </>
        )}
        {error && <p className="sr-error">{localize(error)}</p>}
      </main>
      {modal && (
        <div
          className="sr-overlay"
          onClick={(x) => {
            if (x.target === x.currentTarget) setModal(null);
          }}
        >
          <section
            className="sr-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "brief"
                ? c("Situation brief", "形势简报")
                : modal === "sources"
                  ? c("Sources and methodology", "来源与方法")
                  : c("Event investigation", "事件详情")
            }
          >
            <button
              className="sr-close"
              id="close-modal"
              aria-label={c("Close dialog", "关闭对话框")}
              onClick={() => setModal(null)}
              autoFocus
            >
              <X size={20} />
            </button>
            {modal === "event" ? (
              <>
                <img
                  className="sr-dialog-hero"
                  src={e.image}
                  alt={e.imageAlt}
                  onError={photoFailed}
                />
                <div className="sr-dialog-body">
                  <p className="sr-overline">
                    {localize(e.category)} / {e.time.slice(11, 19)} UTC
                  </p>
                  <h2>{e.title}</h2>
                  <p>{e.detail}</p>
                  <div className="sr-evidence">
                    <CheckCircle size={18} />
                    <div>
                      <strong>{e.source}</strong>
                      <small>{localize(e.timeBasis)}</small>
                      <small>
                        {c("Map", "地图")}：{localize(e.locationBasis)}。
                      </small>
                    </div>
                  </div>
                  <a
                    className="sr-primary"
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c("Read original source", "阅读原始来源")}
                    <ArrowUpRight size={16} />
                  </a>
                  <button
                    className="sr-secondary"
                    id="save-event"
                    onClick={() => {
                      setSaved((v) =>
                        v.includes(e.id)
                          ? v.filter((id) => id !== e.id)
                          : [...v, e.id],
                      );
                      notify(
                        saved.includes(e.id)
                          ? c("Removed from brief", "已从简报移除")
                          : c("Added to your brief", "已加入简报"),
                      );
                    }}
                  >
                    {saved.includes(e.id) ? (
                      <CheckCircle size={16} />
                    ) : (
                      <FileText size={16} />
                    )}{" "}
                    {saved.includes(e.id)
                      ? c("Added to brief", "已加入简报")
                      : c("Add to brief", "加入简报")}
                  </button>
                  <small className="sr-illustration-note">
                    {e.photoCredit}. {localize(e.photoNote)}
                  </small>
                </div>
              </>
            ) : modal === "brief" ? (
              <div className="sr-dialog-body">
                <p className="sr-overline">
                  {displayBrand.toUpperCase()} /{" "}
                  {c("SITUATION BRIEF", "形势简报")}
                </p>
                <h2>
                  {c("Your world view,", "你的世界视角，")}
                  <br />
                  {c("with the evidence.", "以证据为依据。")}
                </h2>
                <p>
                  {saved.length
                    ? c(
                        saved.length + " saved reports",
                        `已保存 ${saved.length} 篇报道`,
                      )
                    : c(
                        "All " + events.length + " reports",
                        `全部 ${events.length} 篇报道`,
                      )}{" "}
                  · {c("10 September 2026", "2026 年 9 月 10 日")}
                </p>
                {(saved.length
                  ? events.filter((v) => saved.includes(v.id))
                  : events
                ).map((ev) => (
                  <article className="sr-brief-item" key={ev.id}>
                    <time>{ev.time.slice(11, 16)}</time>
                    <div>
                      <h3>{ev.title}</h3>
                      <p>{ev.summary}</p>
                      <a href={ev.url} target="_blank" rel="noreferrer">
                        {ev.source} <ArrowUpRight size={11} />
                      </a>
                    </div>
                  </article>
                ))}
                <button
                  className="sr-primary"
                  id="download-brief"
                  onClick={download}
                >
                  <DownloadSimple size={16} />
                  {c("Save situation brief", "保存形势简报")}
                </button>
              </div>
            ) : (
              <div className="sr-dialog-body">
                <p className="sr-overline">
                  {c("TRACEABLE BY DESIGN", "每项信息均可溯源")}
                </p>
                <h2>
                  {c("Every point has", "每个数据点")}
                  <br />
                  {c("a source.", "都有来源。")}
                </h2>
                <h3>
                  {c(
                    "Dated reports, real photographs",
                    "有日期的报道与真实照片",
                  )}
                </h3>
                <p>
                  {c(
                    "Seven reports published on 10 September 2026. Six use CoinDesk's public RSS; the ECB rate decision uses its official release. Photos come from publishers, with credit and date context in each event's source details.",
                    "七篇报道于 2026 年 9 月 10 日发布。其中六篇来自 CoinDesk 公开 RSS；欧洲央行利率决议来自其官方公告。照片由出版方提供，各事件的来源详情列有署名和日期背景。",
                  )}
                </p>
                <p>
                  {c(
                    "Publication time is not necessarily the first announcement time. The SEC story analyzes an earlier proposal. Globe pins locate a jurisdiction or institution; arcs show the report sequence, not financial transfers.",
                    "发布时间未必是首次公告时间。SEC 报道分析的是较早的提案。地球标记表示司法辖区或机构；弧线表示报道顺序，不表示资金转移。",
                  )}
                </p>
                {events.map((ev) => (
                  <a
                    key={ev.id}
                    className="sr-source-link"
                    target="_blank"
                    rel="noreferrer"
                    href={ev.url}
                  >
                    {ev.title}
                    <ArrowUpRight size={15} />
                  </a>
                ))}
                <h3>{c("Observed crypto prices", "观测到的加密资产价格")}</h3>
                <p>
                  {c(
                    "Robinhood Chain (4663). Exact WETH, cbBTC and PONS contracts, quoted in USDG. Pool marginal prices are sampled from V3 swap logs every five minutes around publication, with a maximum swap age of 120 seconds. Missing samples remain gaps.",
                    "Robinhood Chain（4663）。使用精确的 WETH、cbBTC 和 PONS 合约，以 USDG 报价。在发布前后每五分钟从 V3 Swap 日志采样池的边际价格，Swap 距采样时刻最多 120 秒。缺失样本保留为空缺。",
                  )}
                </p>
                <p>
                  {c(
                    "Charts show change from the sample immediately at or before publication. Before and after cards use the selected window endpoints. Lines join observations; they are not minute-level prices or executable quotes. Captured",
                    "图表显示相对发布时刻或之前最近样本的变化。发布前后卡片使用所选窗口的端点。连线仅连接观测点，不是分钟级价格或可执行报价。采集于",
                  )}{" "}
                  {data.market.capturedAt.slice(11, 16)} UTC.
                </p>
                <a className="sr-source-link" href={marketUrl} target="_blank">
                  {c(
                    "Inspect observations and contracts",
                    "查看观测数据与合约",
                  )}
                  <ArrowUpRight size={15} />
                </a>
                <h3>{contextTitle}</h3>
                <p>
                  {c(
                    "Source-grounded AI context was prepared for this captured session. The price tab calculates observed changes as you select a window. This edition contains a dated news and market capture. It does not continuously refresh or generate new model responses.",
                    "本次采集的 AI 背景说明预先根据来源准备。价格标签页随所选窗口计算观测变化。此版本包含有日期的新闻与市场采集数据，不会持续刷新或生成新的模型回复。",
                  )}
                </p>
                <a className="sr-source-link" href={newsUrl} target="_blank">
                  {c(
                    "Inspect report and photo provenance",
                    "查看报道与照片来源",
                  )}
                  <ArrowUpRight size={15} />
                </a>
              </div>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="sr-toast" role="status">
          <CheckCircle size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
