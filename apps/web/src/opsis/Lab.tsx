import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { parseLabView } from "./lab-view";
import { useCopy } from "./copy";
import TokenComparison from "./TokenComparison";
import SpatialPlot from "./SpatialPlot";
import {
  change,
  compactMoney,
  eligiblePools,
  money,
  poolPoints,
  portfolioScenario,
  scenarioPoints,
  type LabData,
} from "./lab-data";
import { safeHttpUrl } from "../dashboard/adapters";
import StockGap from "./StockGap";
import "./quant/quant.css";

const QuantWorkbench = lazy(() => import("./quant/QuantWorkbench"));
const StockGapSeriesPanel = lazy(() => import("./StockGapSeriesPanel"));
const FundingWorkbench = lazy(() => import("./quant/FundingWorkbench"));
const BasisWorkbench = lazy(() => import("./quant/BasisWorkbench"));

export default function Lab() {
  const c = useCopy();
  const [data, setData] = useState<LabData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = parseLabView(searchParams.get("view"));
  const setMode = (view: typeof mode) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set("view", view);
    return next;
  });
  const [token, setToken] = useState("all");
  const [minimum, setMinimum] = useState(10000);
  const [selection, setSelection] = useState("");
  const [core, setCore] = useState(-12),
    [other, setOther] = useState(-30),
    [weight, setWeight] = useState(40),
    [fee, setFee] = useState(0.3);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/quant/crypto-data.json", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Dataset unavailable");
        return r.json();
      })
      .then((d: LabData) => {
        if (d.chainId !== 4663 || !Array.isArray(d.tokens) || !d.tokens.length)
          throw new Error("Invalid capture");
        setData(d);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [attempt]);
  const pools = useMemo(
    () => (data ? eligiblePools(data, token, minimum) : []),
    [data, token, minimum],
  );
  const pool = pools.find((p) => p.pairAddress === selection) ?? pools[0];
  const focused = data?.tokens.find((t) => t.id === pool?.tokenId);
  const points = useMemo(
    () =>
      mode === "atlas"
        ? poolPoints(pools, data?.tokens ?? [])
        : [
            ...scenarioPoints(weight, fee),
            {
              id: "selection",
              x: core / 40,
              y: portfolioScenario(core, other, weight, fee).pl / 5500,
              z: other / 60,
              color: "#ffffff",
              label: "Selected scenario",
            },
          ],
    [mode, pools, data, weight, fee, core, other],
  );
  const scenario = portfolioScenario(core, other, weight, fee);
  const selectedPoint = mode === "atlas" ? pool?.pairAddress : "selection";
  return (
    <section className="opsis-native-lab">
      <header className="opsis-studio-heading">
        <div>
          <h1>{c("Quant Lab", "量化实验室")}</h1>
        </div>
        <p>
          {c(
            "Explore the structure. Change the assumptions. Follow the evidence.",
            "探索结构，调整假设，追溯证据。",
          )}
        </p>
      </header>
      <div
        className="opsis-lab-mode"
        role="group"
        aria-label={c("Lab view", "实验室视图")}
      >
        <button
          aria-pressed={mode === "atlas"}
          onClick={() => setMode("atlas")}
        >
          <span>01</span>
          {c("Pool atlas", "资金池图谱")}
        </button>
        <button
          aria-pressed={mode === "surface"}
          onClick={() => setMode("surface")}
        >
          <span>02</span>
          {c("Portfolio surface", "投资组合曲面")}
        </button>
        <button
          aria-pressed={mode === "research"}
          onClick={() => setMode("research")}
        >
          <span>03</span>
          {c("Quant research", "量化研究")}
        </button>
      </div>
      {mode !== "research" && (
        <div className="opsis-dataset-strip">
          <span className="opsis-status-dot" />
          {c("CAPTURED / 10 SEP 2026", "已采集 / 2026 年 9 月 10 日")}
          <span>ROBINHOOD CHAIN · 4663</span>
          <span>{c("Not live market data", "非实时市场数据")}</span>
        </div>
      )}
      {mode === "research" ? (
        <Suspense fallback={<p role="status">{c("Loading Quant research…", "正在加载量化研究…")}</p>}>
          <QuantWorkbench />
          <details className="opsis-lab-methods">
            <summary>
              {c("Stock-token reference gap", "股票代币参考价差")}
            </summary>
            <StockGap />
            <StockGapSeriesPanel />
          </details>
          <details className="opsis-lab-methods">
            <summary>{c("Funding record analysis", "资金费率记录分析")}</summary>
            <FundingWorkbench />
          </details>
          <details className="opsis-lab-methods">
            <summary>{c("Mark / index basis dataset", "标记价 / 指数价基差数据集")}</summary>
            <BasisWorkbench />
          </details>
        </Suspense>
      ) : failed ? (
        <div className="opsis-panel" role="alert">
          <h2>{c("The capture could not load.", "无法加载历史数据。")}</h2>
          <button
            onClick={() => {
              setFailed(false);
              setAttempt((v) => v + 1);
            }}
          >
            {c("Retry dataset", "重试数据集")}
          </button>
        </div>
      ) : !data ? (
        <p role="status">
          {c("Loading captured observations…", "正在加载历史观察…")}
        </p>
      ) : (
        <>
          <div className="opsis-lab-workbench">
            <div className="opsis-lab-plot">
              <div className="opsis-plot-heading">
                <h2>
                  {mode === "atlas"
                    ? c(
                        "Where activity meets liquidity.",
                        "活动与流动性的交汇。",
                      )
                    : c("Shape the scenario.", "调整情景。")}
                </h2>
                <span>
                  {mode === "atlas"
                    ? c("OBSERVED / BOUNDED SAMPLE", "已观察 / 有限样本")
                    : c("HYPOTHETICAL / $10,000", "假设 / $10,000")}
                </span>
              </div>
              <SpatialPlot
                points={points}
                selected={selectedPoint}
                surface={mode === "surface"}
                onSelect={(id) => {
                  if (mode === "atlas") setSelection(id);
                  else if (id !== "selection") {
                    const [x, z] = id.split("-").map(Number);
                    setCore(-40 + (x * 80) / 60);
                    setOther(-60 + (z * 120) / 40);
                  }
                }}
              />
              <p className="opsis-plot-note">
                {mode === "atlas"
                  ? c(
                      "Volume and liquidity use logarithmic axes; price change uses a symmetric log. Color identifies the token. Indexed liquidity is not an executable quote.",
                      "交易量和流动性采用对数轴，价格变化采用对称对数轴。颜色表示代币。索引流动性不是可执行报价。",
                    )
                  : c(
                      "Each point is a pair of user-set shocks. The surface has no probabilities, historical paths or Monte Carlo forecast.",
                      "每个点是一组用户设定的冲击。此曲面不包含概率、历史路径或蒙特卡洛预测。",
                    )}
              </p>
            </div>
            <aside
              className="opsis-lab-inspector"
              aria-label={c("Plot inspector", "图表详情")}
            >
              {mode === "atlas" ? (
                <>
                  <p className="opsis-kicker">
                    {c("FOCUS THE VIEW", "聚焦视图")}
                  </p>
                  <label htmlFor="lab-token">{c("Token", "代币")}</label>
                  <select
                    id="lab-token"
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setSelection("");
                    }}
                  >
                    <option value="all">
                      {c("All captured tokens", "全部历史代币")}
                    </option>
                    {data.tokens.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="lab-minimum">
                    {c("Minimum pool liquidity", "最低资金池流动性")}
                  </label>
                  <select
                    id="lab-minimum"
                    value={minimum}
                    onChange={(e) => setMinimum(Number(e.target.value))}
                  >
                    {[1000, 10000, 100000].map((n) => (
                      <option key={n} value={n}>
                        {compactMoney(n)}
                      </option>
                    ))}
                  </select>
                  <div className="opsis-pool-inspector" aria-live="polite">
                    {pool && focused ? (
                      <>
                        <p className="opsis-kicker">
                          {c("SELECTED POOL", "选中资金池")}
                        </p>
                        <h3>
                          {focused.symbol}
                          <span> / {pool.quoteToken.symbol}</span>
                        </h3>
                        <strong>{compactMoney(pool.liquidity.usd)}</strong>
                        <p>
                          {c("Captured pool liquidity", "历史资金池流动性")}
                        </p>
                        <dl>
                          <div>
                            <dt>
                              {c("24h pool volume", "24 小时资金池交易量")}
                            </dt>
                            <dd>{compactMoney(pool.volume.h24!)}</dd>
                          </div>
                          <div>
                            <dt>{c("24h price change", "24 小时价格变化")}</dt>
                            <dd>{change(pool.priceChange.h24)}</dd>
                          </div>
                          <div>
                            <dt>{c("Venue", "交易场所")}</dt>
                            <dd>{pool.dexId}</dd>
                          </div>
                        </dl>
                        <p className="opsis-identity">{pool.pairAddress}</p>
                        {safeHttpUrl(pool.url) && (
                          <a
                            href={safeHttpUrl(pool.url)!}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {c("Inspect source pool", "查看来源资金池")} ↗
                          </a>
                        )}
                      </>
                    ) : (
                      <p>
                        {c(
                          "No captured pools meet these filters.",
                          "没有符合筛选条件的历史资金池。",
                        )}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="opsis-kicker">
                    {c("CHANGE THE ASSUMPTIONS", "调整假设")}
                  </p>
                  {[
                    [
                      c("WETH + cbBTC shock", "WETH + cbBTC 冲击"),
                      core,
                      setCore,
                      -40,
                      40,
                      1,
                    ],
                    [
                      c("Other crypto shock", "其他加密资产冲击"),
                      other,
                      setOther,
                      -60,
                      60,
                      1,
                    ],
                    [
                      c("WETH weight", "WETH 权重"),
                      weight,
                      setWeight,
                      10,
                      55,
                      1,
                    ],
                    [
                      c("Assumed selling costs", "假设卖出成本"),
                      fee,
                      setFee,
                      0,
                      3,
                      0.05,
                    ],
                  ].map(([label, value, set, min, max, step]) => (
                    <label
                      className="opsis-scenario-slider"
                      key={String(label)}
                    >
                      {String(label)}
                      <output>
                        {Number(value).toFixed(Number(step) < 1 ? 2 : 1)}%
                      </output>
                      <input
                        type="range"
                        aria-label={String(label)}
                        min={Number(min)}
                        max={Number(max)}
                        step={Number(step)}
                        value={Number(value)}
                        onChange={(e) =>
                          (set as (v: number) => void)(Number(e.target.value))
                        }
                      />
                    </label>
                  ))}
                  <div className="opsis-scenario-result" aria-live="polite">
                    <p className="opsis-kicker">
                      {c("SCENARIO P/L", "情景盈亏")}
                    </p>
                    <output data-testid="lab-scenario-pl">
                      {money(scenario.pl)}
                    </output>
                    <p>
                      {c("Net portfolio value", "投资组合净值")}{" "}
                      <strong>{money(scenario.net)}</strong>
                    </p>
                  </div>
                  <p className="opsis-small">
                    {c(
                      "cbBTC 15%, PONS 20%, CASHCAT 10%; USDG receives the remaining weight and is assumed unchanged at its captured price. Costs are assumptions, not quotes.",
                      "cbBTC 15%、PONS 20%、CASHCAT 10%；剩余权重为 USDG，假设其历史价格不变。成本为假设，非报价。",
                    )}
                  </p>
                </>
              )}
            </aside>
          </div>
          {mode === "atlas" ? (
            <section className="opsis-lab-data">
              <div className="opsis-section-label">
                <span>03 / {c("INSPECT THE CAPTURE", "检查历史数据")}</span>
                <span>
                  {pools.length} {c("POOLS IN VIEW", "个资金池")}
                </span>
              </div>
              <div className="opsis-table-scroll">
                <table>
                  <caption>
                    {c(
                      "Exact captured pool observations",
                      "确切的历史资金池观察",
                    )}
                  </caption>
                  <thead>
                    <tr>
                      <th>{c("Pool / token", "资金池 / 代币")}</th>
                      <th>{c("Liquidity", "流动性")}</th>
                      <th>{c("Volume · 24h", "交易量 · 24 小时")}</th>
                      <th>{c("Change · 24h", "变化 · 24 小时")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pools.map((p) => (
                      <tr
                        key={p.pairAddress}
                        data-selected={p.pairAddress === pool?.pairAddress}
                      >
                        <td>
                          <button
                            aria-pressed={p.pairAddress === pool?.pairAddress}
                            onClick={() => setSelection(p.pairAddress)}
                          >
                            <b>
                              {
                                data.tokens.find((t) => t.id === p.tokenId)
                                  ?.symbol
                              }{" "}
                              / {p.quoteToken.symbol}
                            </b>
                            <small>{p.pairAddress}</small>
                          </button>
                        </td>
                        <td>{money(p.liquidity.usd)}</td>
                        <td>{money(p.volume.h24!)}</td>
                        <td>{change(p.priceChange.h24)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : mode === "surface" ? (
            <section className="opsis-lab-data">
              <div className="opsis-section-label">
                03 / {c("THE SELECTED SCENARIO", "所选情景")}
              </div>
              <div className="opsis-table-scroll">
                <table>
                  <caption>
                    {c("Exact inputs and derived values", "精确输入和派生值")}
                  </caption>
                  <tbody>
                    <tr>
                      <th>{c("Core / other shock", "核心 / 其他冲击")}</th>
                      <td>
                        {core.toFixed(4)}% / {other.toFixed(4)}%
                      </td>
                    </tr>
                    <tr>
                      <th>{c("Gross value", "总值")}</th>
                      <td>{money(scenario.gross)}</td>
                    </tr>
                    <tr>
                      <th>{c("Assumed costs", "假设成本")}</th>
                      <td>{money(scenario.gross - scenario.net)}</td>
                    </tr>
                    <tr>
                      <th>{c("Net value", "净值")}</th>
                      <td>{money(scenario.net)}</td>
                    </tr>
                    <tr>
                      <th>{c("P/L", "盈亏")}</th>
                      <td>{money(scenario.pl)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          <>
            <TokenComparison data={data} />
            <details className="opsis-lab-methods">
              <summary>
                {c("Sources, selection and calculation", "来源、筛选和计算")}
              </summary>
              <p>{data.selection}</p>
              <p>{data.poolScope}</p>
              <p>{data.priceMethod}</p>
              <p>
                {c(
                  "Scenario gross value = $10,000 × [1 + (WETH weight + 15%) × core shock + 30% × other shock]. Net = gross × (1 − selling-cost rate). Gas, taxes, slippage and actual venue fees may differ.",
                  "情景总值 = $10,000 × [1 + (WETH 权重 + 15%) × 核心冲击 + 30% × 其他冲击]。净值 = 总值 × (1 − 卖出成本率)。Gas、税费、滑点和实际场所费用可能不同。",
                )}
              </p>
              <p>{data.capturedAt}</p>
            </details>
          </>
        </>
      )}
    </section>
  );
}
