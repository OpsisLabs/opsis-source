import { Link } from "react-router";
import { useCopy } from "../opsis/copy";
import { OPSIS_PRESENTATION } from "../opsis/presentation";
const displayBrand = OPSIS_PRESENTATION ? "Opsis" : "ChainScout";
const contextTitle = OPSIS_PRESENTATION ? "Source context" : "Scout AI insight";
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
const drawEthHourlyChart = (canvas, candles) => {
  const context = canvas?.getContext("2d");
  if (!context) return;
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
  context.fillStyle = "#171717";
  context.fillRect(0, 0, width, height);

  if (!candles.length) {
    context.fillStyle = "#a99f96";
    context.font = "11px monospace";
    context.fillText("No complete hourly candles available", left, top + 4);
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
  const x = (time) => left + ((time - domainStart) / (domainEnd - domainStart)) * (right - left);
  const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);

  context.strokeStyle = "#393633";
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(left, bottom);
  context.lineTo(right, bottom);
  context.stroke();

  context.strokeStyle = "#6f6660";
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(left, y(min));
  context.lineTo(right, y(min));
  context.moveTo(left, y(max));
  context.lineTo(right, y(max));
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#a8a19a";
  context.font = "10px monospace";
  context.textBaseline = "middle";
  context.fillText(formatUsd(max), 6, y(max));
  context.fillText(formatUsd(min), 6, y(min));
  context.textBaseline = "alphabetic";

  context.strokeStyle = "#fa6c34";
  context.lineWidth = 2;
  context.beginPath();
  let previousTime = null;
  for (const point of points) {
    const cx = x(point.time);
    const cy = y(point.value);
    if (previousTime === null || point.time - previousTime > CANDLE_VIEW_INTERVAL_MS) {
      context.moveTo(cx, cy);
    } else {
      context.lineTo(cx, cy);
    }
    previousTime = point.time;
  }
  context.stroke();

  const targetTicks = Math.max(2, Math.min(6, Math.floor((right - left) / 80)));
  const step = Math.max(1, Math.ceil(points.length / targetTicks));
  context.fillStyle = "#ed8c51";
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
const photoFailed = (event) => {
  event.currentTarget.style.visibility = "hidden";
  event.currentTarget.parentElement.dataset.photoUnavailable =
    "Photo unavailable · open source";
};
const stamp = (s) => new Date(s * 1000).toISOString().slice(11, 16);
export default function App() {
  const c = useCopy();
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
      globe.current = createGlobe(globeEl.current, data.news.events, (i) =>
        selectRef.current(i),
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
    ethBrief.status === "valid" || ethBrief.status === "stale" ? ethBrief.hourlyCandles : [];
  const ethDailyChange =
    ethBrief.status === "valid" || ethBrief.status === "stale"
      ? formatEthChange(ethBrief.statsChangePercent)
      : "—";
  const ethPrice = ethBrief.status === "valid" || ethBrief.status === "stale" ? ethBrief.stats.last : null;
  const ethHeadline =
    ethPrice != null && ethPrice > 2600
      ? `ETH above ${formatUsd(2600)}. What can we verify?`
      : "ETH market brief";
  const ethUnavailableReason = ethBrief.notLiveReason || "Captured snapshot unavailable";
  const series = useMemo(
    () => (data ? eventSeries(data.market, e, minutes) : []),
    [data, e, minutes],
  );
  const ethBriefTime = ethBrief.capturedAt
    ? new Date(ethBrief.capturedAt).toLocaleString("en-GB", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }) + " UTC"
    : "No captured time available";
  const ethStatusLabel =
    ethBrief.status === "valid"
      ? "NOT LIVE · SNAPSHOT"
      : ethBrief.status === "stale"
        ? "NOT LIVE · STALE"
        : ethBrief.status === "invalid"
          ? "NOT LIVE · INVALID SNAPSHOT"
          : "NOT LIVE · NO SNAPSHOT";
  const ethSnapshotAge =
    ethBrief.ageMinutes == null ? null : formatDuration(ethBrief.ageMinutes);
  const ethGlobal =
    ethBrief.status === "valid" || ethBrief.status === "stale" ? ethBrief : null;
  useEffect(() => {
    if (!data || !chart.current) return;
    const render = () =>
      drawChart(
        chart.current,
        series.filter((a) => enabled.includes(a.id)),
        minutes,
        hover,
      );
    render();
    const ro = new ResizeObserver(render);
    ro.observe(chart.current);
    return () => ro.disconnect();
  }, [data, series, enabled, minutes, hover, wide, edition]);

  useEffect(() => {
    if (!ethBriefChart.current) return;
    drawEthHourlyChart(ethBriefChart.current, ethCandles);
    const ro = new ResizeObserver(() =>
      drawEthHourlyChart(ethBriefChart.current, ethCandles),
    );
    ro.observe(ethBriefChart.current);
    return () => ro.disconnect();
  }, [ethCandles, ethBrief.status, edition]);
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
        <p>{error || "Connecting news and market observations…"}</p>
        {error && <button onClick={() => location.reload()}>Retry</button>}
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
      "# " + displayBrand + " Situation Room — 10 September 2026\n\nNews capture: " +
      data.news.capturedAt +
      "\nMarket capture: " +
      data.market.capturedAt +
      "\n\n" +
      list
        .map(
          (v) =>
            `## ${v.title}\nPublished: ${v.time}\n${v.summary}\n\n${OPSIS_PRESENTATION ? "Source context" : "Scout AI context"} (prepared for this capture): ${v.insight}\nSource: ${v.url}\n\n`,
        )
        .join("") +
      "\nPrice observations are contextual, not proof of causation.\n";
    const u = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = displayBrand + "-situation-brief-2026-09-10.md";
    a.click();
    URL.revokeObjectURL(u);
    notify("Situation brief saved");
  };
  return (
    <div className="situation-surface" lang="en">
      <main className={"situation-room " + (wide ? "focus-room" : "")}>
        <nav
          className="sr-edition-switch"
          role="tablist"
          aria-label="Situation Room edition"
        >
          <button
            role="tab"
            id="edition-eth"
            aria-selected={edition === "eth"}
            className={edition === "eth" ? "active" : ""}
            onClick={() => setEdition("eth")}
          >
            ETH edition · 11 Sep 2026
          </button>
          <button
            role="tab"
            id="edition-archive"
            aria-selected={edition === "archive"}
            className={edition === "archive" ? "active" : ""}
            onClick={() => setEdition("archive")}
          >
            10 Sep world feed archive
          </button>
        </nav>
        {edition === "eth" && (
          <>
            <section className="sr-title" data-testid="eth-edition-title">
              <div>
                <p className="sr-overline">SITUATION ROOM / ETH EDITION</p>
                <h1>
                  {OPSIS_PRESENTATION ? "World & markets" : "Situation Room"}<span>.</span>
                </h1>
                <p>
                  Ethereum market brief: captured Coinbase ETH/USD data with
                  dated source-linked context.
                </p>
                <small className="sr-edition">
                  11 September 2026 ETH edition · captured data · {displayBrand}
                  summaries of publisher reporting
                </small>
              </div>
            </section>
            <section
              className="sr-eth-brief"
              data-testid="eth-market-brief"
              aria-label="ETH market brief"
            >
          <div className="sr-eth-brief-head">
            <div>
              <p className="sr-overline">ETH MARKET BRIEF</p>
              <h2>{ethHeadline}</h2>
              <small>
                Captured {ethBriefTime} · not live
                {ethBrief.status === "stale" && ethSnapshotAge
                  ? ` · ${ethSnapshotAge} old (older captured data)`
                  : ""}
              </small>
            </div>
            <span className={`sr-eth-status ${ethBrief.status}`}>{ethStatusLabel}</span>
          </div>
          <p className="sr-eth-summary" data-testid="eth-market-price">
            {ethGlobal ? (
              <>
                Last {formatUsd(ethPrice)} · 24h {ethDailyChange}
              </>
            ) : (
              ethUnavailableReason
            )}
          </p>
          <p className="sr-eth-bridge-note">
            Coinbase ETH/USD capture only. Timing is provided for context and does not establish a causal link.
          </p>
          <div className="sr-eth-panels">
            <article className="sr-eth-card" aria-label="ETH market snapshot">
              <div className="sr-eth-card-head">
                <h3>Single-venue snapshot</h3>
                <small>Coinbase ETH/USD, not live</small>
              </div>
              {ethGlobal ? (
                <>
                  <p>
                    {ethGlobal.pair} · {ethGlobal.scope}
                  </p>
                  <p>
                    Open: {formatUsd(ethGlobal.stats.open)} · High: {formatUsd(ethGlobal.stats.high)} ·
                    Low: {formatUsd(ethGlobal.stats.low)} · Last: {formatUsd(ethGlobal.stats.last)}
                  </p>
                  <a
                    className="sr-source-link"
                    href={ethGlobal.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Coinbase endpoint <ArrowUpRight size={12} />
                  </a>
                </>
              ) : (
                <p>{ethUnavailableReason}</p>
              )}
            </article>
            <article className="sr-eth-card" aria-label="ETH hourly line chart">
              <div className="sr-eth-card-head">
                <h3>Hourly close history</h3>
                <small>Complete candles only, no gap interpolation</small>
              </div>
              <canvas ref={ethBriefChart} aria-label="ETH hourly close chart" />
              <small>
                {formatUtcRange(
                  ethCandles[0]?.start,
                  (ethCandles.at(-1)?.start ?? 0) + CANDLE_VIEW_INTERVAL_MS,
                )}
              </small>
              <small className="sr-eth-gap-note">
                {ethGlobal
                  ? `${ethCandles.length} complete hourly candles · ${
                      ethGlobal.candleGaps.length
                        ? `${ethGlobal.candleGaps.length} gap(s) disclosed, not bridged`
                        : "no gaps in captured window"
                    }${
                      ethGlobal.candleConflicts?.length
                        ? ` · ${ethGlobal.candleConflicts.length} conflicted bucket(s) rejected`
                        : ""
                    }`
                  : "No complete hourly candles available"}
              </small>
            </article>
          </div>
          <section
            className="sr-eth-context"
            data-testid="eth-market-context"
            aria-label="ETH source context"
          >
            {ethBrief.newsContext?.length
              ? ethBrief.newsContext.slice(0, 2).map((source) => (
                  <article
                    className="sr-eth-context-card"
                    key={source.url}
                    data-testid="eth-context-card"
                  >
                    <p className="sr-eth-context-label">
                      {displayBrand.toUpperCase()} SUMMARY · {source.source}
                    </p>
                    <h4>{source.title}</h4>
                    <p className="sr-eth-context-date">
                      Published {source.date}
                    </p>
                    <p>{source.summary}</p>
                    <details className="sr-eth-why">
                      <summary>Why this matters for ETH</summary>
                      <p>{source.whyItMatters}</p>
                    </details>
                    <a
                      className="sr-source-link"
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Original: {source.originalTitle} <ArrowUpRight size={12} />
                    </a>
                  </article>
                ))
              : null}
          </section>
          <Link to="/stress-test" className="sr-eth-action">
            {c("Open Portfolio shocks", "打开投资组合冲击")} <ArrowUpRight size={12} />
          </Link>
        </section>
          </>
        )}
        {edition === "archive" && (
          <>
        <div className="sr-breadcrumb">
          <span>
            <GlobeHemisphereWest size={14} /> QUANT LAB <CaretRight size={11} />{" "}
            SITUATION ROOM
          </span>
          <span>
            <Clock size={12} /> 10 SEP 2026 · NEWS CAPTURE{" "}
            {data.news.capturedAt.slice(11, 16)} UTC
          </span>
        </div>
        <section className="sr-title">
          <div>
            <p className="sr-overline">WORLD EVENTS / ONCHAIN INTELLIGENCE</p>
            <h1>
              {OPSIS_PRESENTATION ? "World & markets" : "Situation Room"}<span>.</span>
            </h1>
            <p>Follow the announcement. Examine the reaction.</p>
            <small className="sr-edition">
              10 September 2026 edition · captured data · English source
              coverage
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
              {sweep ? <Pause size={16} /> : <GlobeHemisphereWest size={17} />}{" "}
              {sweep ? "Pause world sweep" : "World sweep"}
            </button>
            <button
              className="sr-primary"
              id="brief"
              onClick={(event) => openModal("brief", event.currentTarget)}
            >
              <FileText size={17} /> Situation brief{" "}
              {saved.length > 0 && <span>{saved.length}</span>}
            </button>
          </div>
        </section>
        <div className="sr-workbench">
          <section className="sr-world">
            <div className="sr-world-label">
              <span>GLOBAL SITUATION / 07 REPORTS · 10 SEP</span>
              <button
                id="focus"
                aria-label="Toggle focus view"
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
                  News reports<small>10 September 2026</small>
                </span>
              </div>
              <div>
                <b>03</b>
                <span>
                  Onchain assets<small>Robinhood Chain</small>
                </span>
              </div>
              <div>
                <b>05m</b>
                <span>
                  Price observations<small>Before & after publication</small>
                </span>
              </div>
            </div>
            <div className="sr-location" key={e.id}>
              <MapPin size={14} />
              <div>
                <strong>{e.location}</strong>
                <span>
                  {e.category} · {e.time.slice(11, 19)} UTC
                </span>
              </div>
            </div>
            <div className="sr-globe-tools">
              <span>
                <Cursor size={12} /> Drag to orbit · scroll to zoom
              </span>
              <button
                id="rotate"
                aria-label="Toggle globe rotation"
                onClick={() => {
                  setSweep(false);
                  setAuto(globe.current?.toggle() ?? false);
                }}
              >
                {auto ? <Pause /> : <Play />}
              </button>
              <button
                id="reset"
                aria-label="Reset globe"
                onClick={() => {
                  globe.current?.reset();
                  setAuto(true);
                  setSweep(false);
                }}
              >
                <ArrowCounterClockwise />
              </button>
            </div>
            <div className="sr-market">
              <div className="sr-chart-head">
                <div>
                  <p className="sr-overline">PRICE AROUND PUBLICATION</p>
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
                      ±{n}m
                    </button>
                  ))}
                </div>
              </div>
              <div className="sr-chart-legend">
                <span>
                  <span className="sr-status-dot" /> T0 · {e.time.slice(11, 19)}{" "}
                  UTC
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
                            weth: "#fa6c34",
                            cbbtc: "#f0e8da",
                            pons: "#9c8faf",
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
                      x.clientX - x.currentTarget.getBoundingClientRect().left,
                    )
                  }
                  onPointerLeave={() => setHover(null)}
                  aria-label="Observed price changes before and after the selected news publication"
                />
              ) : (
                <div className="sr-empty">
                  Choose an asset to compare its observed price.
                </div>
              )}
              <div className="sr-chart-foot">
                <span>
                  Change from T0 sample · USDG pools · 5-minute observations
                </span>
                <button
                  id="method"
                  onClick={(event) => openModal("sources", event.currentTarget)}
                >
                  Sources & method <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          </section>
          <aside className="sr-events">
            <div className="sr-event-tools">
              <span>
                WORLD FEED · 10 SEP <b>{visible.length}</b>
              </span>
              <div className="sr-filters">
                {["All", "Policy", "Markets", "Macro"].map((f) => (
                  <button
                    id={"filter-" + f.toLowerCase()}
                    className={filter === f ? "active" : ""}
                    key={f}
                    onClick={() => setFilter(f)}
                  >
                    {f}
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
                    aria-label="Close AI insight"
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
                    {e.category} / {e.time.slice(11, 16)} UTC
                  </p>
                  <h2>{e.title}</h2>
                  <div className="sr-insight-tabs">
                    {["Context", "Price action", "Watch next"].map((t) => (
                      <button
                        key={t}
                        id={"insight-" + t.toLowerCase().replace(" ", "-")}
                        className={insightTab === t ? "active" : ""}
                        onClick={() => setInsightTab(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {insightTab === "Context" ? (
                    <>
                      <h3>What matters</h3>
                      <p>{e.insight}</p>
                      <div className="sr-insight-callout">
                        <Info size={16} />
                        <span>
                          The publication timestamp anchors this view. The
                          information may have reached markets earlier.
                        </span>
                      </div>
                    </>
                  ) : insightTab === "Price action" ? (
                    <>
                      <h3>What the observations show</h3>
                      {series.map((a) => (
                        <div className="sr-ai-price" key={a.id}>
                          <strong>{a.symbol}</strong>
                          <b>{signed(a.after)}</b>
                          <small>
                            T0 to +{minutes}m · {a.coverage}/{a.expected}{" "}
                            samples
                          </small>
                        </div>
                      ))}
                      <p>
                        These changes describe the selected pools around
                        publication. Other news, liquidity and trading activity
                        may explain the move. No causal effect is established.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3>What to check next</h3>
                      <p>{e.watch}</p>
                      <div className="sr-insight-callout">
                        <Crosshair size={17} />
                        <span>
                          Switch between 15, 30 and 60 minutes. Check whether
                          the move began before the report.
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
                    Read source evidence <ArrowUpRight size={15} />
                  </a>
                  <small className="sr-ai-note">
                    AI context prepared for this captured session. Price
                    calculations update with your selected window.
                  </small>
                </div>
              </div>
            ) : (
              <div className="sr-event-list">
                {visible.map((ev) => (
                  <button
                    className={
                      "sr-event " + (ev.index === selected ? "selected" : "")
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
                        <span>{ev.category}</span>
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
                  <p className="sr-empty">No reports in this category.</p>
                )}
              </div>
            )}
            <div className="sr-feed-actions">
              <button
                className="sr-investigate"
                id="investigate"
                onClick={(event) => openModal("event", event.currentTarget)}
              >
                <BookOpen size={16} /> Source details
              </button>
              <button
                className="sr-primary"
                id="ai-insight"
                onClick={openInsight}
              >
                <Sparkle size={17} weight="fill" /> AI insight{" "}
                <ArrowUpRight size={15} />
              </button>
            </div>
          </aside>
        </div>
        <section className="sr-reactions">
          <div className="sr-reactions-label">
            <ChartLine size={22} />
            <div>
              <strong>Reaction window</strong>
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
                  {a.coverage}/{a.expected} samples
                </small>
              </strong>
              <span>
                <small>−{minutes}m → T0</small>
                <b>{signed(a.before)}</b>
              </span>
              <span>
                <small>T0 → +{minutes}m</small>
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
              <Stack size={14} /> ANNOUNCEMENT SEQUENCE
            </span>
            <small>10 SEP · UTC · select to investigate</small>
          </div>
          <div className="sr-sequence-items">
            {[...events].reverse().map((ev) => (
              <button
                id={"sequence-" + ev.id}
                key={ev.id}
                className={e.id === ev.id ? "active" : ""}
                onClick={() => select(events.findIndex((v) => v.id === ev.id))}
              >
                <time>{ev.time.slice(11, 16)}</time>
                <span>
                  {ev.id === "ecb"
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
                              : "Polymarket"}
                </span>
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        </section>
        <div className="sr-context">
          <span>
            <CheckCircle size={14} /> Source-linked facts
          </span>
          <p>
            News and price changes share a timeline. Proximity does not
            establish causation.
          </p>
          <button
            onClick={(event) => openModal("sources", event.currentTarget)}
          >
            View provenance <ArrowUpRight size={13} />
          </button>
        </div>
          </>
        )}
        {error && <p className="sr-error">{error}</p>}
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
                ? "Situation brief"
                : modal === "sources"
                  ? "Sources and methodology"
                  : "Event investigation"
            }
          >
            <button
              className="sr-close"
              id="close-modal"
              aria-label="Close dialog"
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
                    {e.category} / {e.time.slice(11, 19)} UTC
                  </p>
                  <h2>{e.title}</h2>
                  <p>{e.detail}</p>
                  <div className="sr-evidence">
                    <CheckCircle size={18} />
                    <div>
                      <strong>{e.source}</strong>
                      <small>{e.timeBasis}</small>
                      <small>Map: {e.locationBasis}.</small>
                    </div>
                  </div>
                  <a
                    className="sr-primary"
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read original source <ArrowUpRight size={16} />
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
                          ? "Removed from brief"
                          : "Added to your brief",
                      );
                    }}
                  >
                    {saved.includes(e.id) ? (
                      <CheckCircle size={16} />
                    ) : (
                      <FileText size={16} />
                    )}{" "}
                    {saved.includes(e.id) ? "Added to brief" : "Add to brief"}
                  </button>
                  <small className="sr-illustration-note">
                    {e.photoCredit}. {e.photoNote}
                  </small>
                </div>
              </>
            ) : modal === "brief" ? (
              <div className="sr-dialog-body">
                <p className="sr-overline">{displayBrand.toUpperCase()} / SITUATION BRIEF</p>
                <h2>
                  Your world view,
                  <br />
                  with the evidence.
                </h2>
                <p>
                  {saved.length
                    ? saved.length + " saved reports"
                    : "All " + events.length + " reports"}{" "}
                  · 10 September 2026
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
                  <DownloadSimple size={16} /> Save situation brief
                </button>
              </div>
            ) : (
              <div className="sr-dialog-body">
                <p className="sr-overline">TRACEABLE BY DESIGN</p>
                <h2>
                  Every point has
                  <br />a source.
                </h2>
                <h3>Dated reports, real photographs</h3>
                <p>
                  Seven reports published on 10 September 2026. Six use
                  CoinDesk's public RSS; the ECB rate decision uses its official
                  release. Photos come from publishers, with credit and date
                  context in each event's source details.
                </p>
                <p>
                  Publication time is not necessarily the first announcement
                  time. The SEC story analyzes an earlier proposal. Globe pins
                  locate a jurisdiction or institution; arcs show the report
                  sequence, not financial transfers.
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
                <h3>Observed crypto prices</h3>
                <p>
                  Robinhood Chain (4663). Exact WETH, cbBTC and PONS contracts,
                  quoted in USDG. Pool marginal prices are sampled from V3 swap
                  logs every five minutes around publication, with a maximum
                  swap age of 120 seconds. Missing samples remain gaps.
                </p>
                <p>
                  Charts show change from the sample immediately at or before
                  publication. Before and after cards use the selected window
                  endpoints. Lines join observations; they are not minute-level
                  prices or executable quotes. Captured{" "}
                  {data.market.capturedAt.slice(11, 16)} UTC.
                </p>
                <a className="sr-source-link" href={marketUrl} target="_blank">
                  Inspect observations and contracts <ArrowUpRight size={15} />
                </a>
                <h3>{contextTitle}</h3>
                <p>
                  Source-grounded AI context was prepared for this captured
                  session. The price tab calculates observed changes as you
                  select a window. This edition contains a dated news and market
                  capture. It does not continuously refresh or generate new
                  model responses.
                </p>
                <a className="sr-source-link" href={newsUrl} target="_blank">
                  Inspect report and photo provenance <ArrowUpRight size={15} />
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
