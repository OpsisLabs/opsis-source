import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import WorldWorkspace from "./WorldWorkspace.jsx";
import App from "./App.jsx";
import LoadFailure from "./LoadFailure";
import ToolWorkspace from "../opsis/ToolWorkspace";
import { data, marketUrl, newsUrl } from "./data.js";
import { eventSeries } from "./analysis.js";
import {
  evaluateEthMarketSnapshot,
  formatEthChange,
} from "./eth-market-brief.js";

const state = vi.hoisted(() => ({ chinese: false }));
vi.mock("../opsis/copy", () => ({
  useCopy: () => (en, zh) => (state.chinese ? zh : en),
}));
vi.mock("../opsis/presentation", () => ({ OPSIS_PRESENTATION: true }));
afterEach(() => {
  state.chinese = false;
});

function render(overrides = {}) {
  const eth = evaluateEthMarketSnapshot(
    data.ethMarketBrief,
    Date.parse("2026-10-19T12:00:00Z"),
  );
  const props = {
    data,
    edition: "eth",
    setEdition: vi.fn(),
    events: data.news.events,
    visible: data.news.events.map((event, index) => ({ ...event, index })),
    selected: 0,
    select: vi.fn(),
    filter: "All",
    setFilter: vi.fn(),
    minutes: 30,
    setMinutes: vi.fn(),
    series: eventSeries(data.market, data.news.events[0], 30),
    enabled: ["weth", "cbbtc", "pons"],
    setEnabled: vi.fn(),
    ethBrief: eth,
    ethGlobal: eth,
    ethCandles: eth.hourlyCandles,
    ethPrice: eth.stats.last,
    ethDailyChange: formatEthChange(eth.statsChangePercent),
    ethHeadline: "ETH market brief",
    ethBriefTime: "11 Sept 2026, 14:43:01 UTC",
    ethStatusLabel: "NOT LIVE · STALE",
    ethSnapshotAge: "912h",
    ethUnavailableReason: "Captured snapshot unavailable",
    saved: [],
    setSaved: vi.fn(),
    download: vi.fn(),
    toast: "",
    marketUrl,
    newsUrl,
    ...overrides,
  };
  return renderToStaticMarkup(
    <MemoryRouter>
      <WorldWorkspace {...props} />
    </MemoryRouter>,
  );
}

it("keeps ETH snapshot values separate from complete hourly closes and preserves source dates and text", () => {
  const before = JSON.stringify(data);
  const html = render();
  expect(html).toContain("$2,606.31");
  expect(html).toContain("+6.67%");
  expect(html).toContain("2629.32");
  // The final, incomplete candle is excluded by the existing engine.
  expect(html).not.toContain("48053.4673317");
  expect(html).toContain("35524.54915358");
  expect(html).toContain("$2,434.52");
  expect(html).toContain("$2,629.32");
  expect(html).toContain("6,578.67");
  expect(html).toContain("First hourly close");
  expect(html).toContain("Avg. hourly volume");
  expect(html).toContain('class="world-ws-area"');
  expect(html).toContain('data-testid="latest-close-tag"');
  expect(html).toContain("Exact publication time unavailable");
  expect(html).not.toContain('data-testid="publication-marker"');
  expect(html).toContain(
    "Bitcoin ETF outflows accelerate as investors pull $449M in three days",
  );
  expect(html).toContain(
    "https://ct.com/markets/bitcoin-etfs-282m-biggest-outflow-july",
  );
  expect(html).toContain("2026-09-11");
  expect(html).toContain("Timing does not establish causation");
  expect(html).not.toContain("<img");
  expect(JSON.stringify(data)).toBe(before);
});

it("aligns a recorded archive publication with USDG observations and keeps the original excerpt", () => {
  const selected = data.news.events.findIndex((event) => event.id === "ecb");
  const event = data.news.events[selected];
  const html = render({
    edition: "archive",
    selected,
    series: eventSeries(data.market, event, 30),
  });
  expect(html).toContain('data-testid="publication-marker"');
  expect(html).toContain("2026-09-10 12:15:00 UTC");
  expect(html).toContain("European Central Bank");
  expect(html).toContain("USDG per token");
  expect(html).toContain("Instrument identities");
  expect(html).toContain(data.market.assets[0].contract);
  expect(html).toContain("Original excerpt unavailable in this capture");
  const withExcerpt = data.news.events.findIndex((event) => event.id === "sec");
  expect(render({ edition: "archive", selected: withExcerpt })).toContain(
    data.news.events[withExcerpt].sourceExcerpt
      .replaceAll("&", "&amp;")
      .replaceAll("'", "&#x27;")
      .replaceAll('"', "&quot;"),
  );
  expect(html).not.toContain("Network upgrade announcement");
  expect(html).toContain("Volume unavailable in this capture");
  expect(html).not.toContain('data-testid="volume-bar"');
});

it("keeps an empty chart frame without inventing zeros or dates when snapshot validation refuses the capture", () => {
  const html = render({
    ethBrief: { status: "invalid" },
    ethGlobal: null,
    ethCandles: [],
    ethPrice: null,
    ethDailyChange: "—",
    ethStatusLabel: "NOT LIVE · INVALID SNAPSHOT",
  });
  expect(html).toContain("Captured snapshot unavailable");
  expect(html).toContain("Source context unavailable in this capture");
  expect(html).toContain('class="world-ws-price"');
  expect(html).toContain("No accepted hourly candles");
  expect(html).not.toContain('data-testid="latest-close-tag"');
  expect(html).not.toContain('class="world-ws-area"');
  expect(html).not.toContain("$0.00");
  expect(html).not.toContain("1970-01-01");
});

it("makes missing archive baselines and a deselected series explicit", () => {
  const missing = eventSeries(data.market, data.news.events[0], 30).map(
    (asset) => ({
      ...asset,
      after: null,
      points: asset.points.map((point) => ({
        ...point,
        price: null,
        change: null,
      })),
    }),
  );
  expect(render({ edition: "archive", series: missing })).toContain(
    "Observed changes unavailable in this window",
  );
  const noBaseline = missing.map((asset) => ({
    ...asset,
    baseline: undefined,
  }));
  expect(render({ edition: "archive", series: noBaseline })).toContain(
    "T0 sample unavailable; changes unavailable",
  );
  const html = render({ edition: "archive", enabled: [] });
  expect(html).toContain("Choose an asset to compare its observed price");
  expect(html).toContain('class="world-ws-price"');
  expect(html).not.toContain('class="world-ws-area"');
});

it("localizes both editions while leaving publisher names and original text untouched", () => {
  state.chinese = true;
  const html = render();
  expect(html).toContain('lang="zh-CN"');
  expect(html).toContain("时间接近不代表因果关系");
  expect(html).toContain("此报道不能支持以 ETF 流入解释今日涨势");
  expect(html).toContain("Cointelegraph · Zoltan Vardai");
  expect(html).toContain(
    "Bitcoin ETF outflows accelerate as investors pull $449M in three days",
  );
  const archive = render({ edition: "archive" });
  expect(archive).toContain("精确市场观测数据");
  expect(archive).toContain("参议院投票前公布修订版《Clarity 法案》草案");
  expect(archive).toContain("CoinDesk");
});

it("mounts the Opsis branch with one plain shell heading in English and Chinese", () => {
  for (const chinese of [false, true]) {
    state.chinese = chinese;
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/research/events"]}>
        <ToolWorkspace>
          <App />
        </ToolWorkspace>
      </MemoryRouter>,
    );
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(chinese ? "世界与市场" : "World &amp; markets");
    expect(html).toContain(
      chinese
        ? "对照注明日期的报道及其来源"
        : "Explore captured market observations",
    );
    expect(html).toContain('class="world-ws-page"');
    expect(html).not.toContain('class="situation-room');
    expect(html).not.toContain("sr-globe");
  }
});

it("retains a page heading and recovery action if the captured workspace cannot load", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/research/events"]}>
      <ToolWorkspace>
        <LoadFailure />
      </ToolWorkspace>
    </MemoryRouter>,
  );
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  expect(html).toContain("World &amp; markets could not load");
  expect(html).toContain("Reload World &amp; markets");
});
