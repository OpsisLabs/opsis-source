import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  getExitCheckQuote,
  isValidExitAmount,
  type ExitCheckQuote,
  type ExitCheckOutputSymbol,
} from "../exit-check/api";
import { useCopy } from "./copy";
import { publicIdentity, workspaceIdentity, workspaceLink, type Capabilities } from "./model";

import { publicSession } from "./public-session";
import { tradeToolPaths, routeNames } from "./shell-model";

import ReportShelf from "./ReportShelf";
import { tradeReport } from "./reports";
import ExitSizeCurve from "./ExitSizeCurve";

const PoolComparison = lazy(() => import("./PoolComparison"));

export default function TradeCheck({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = workspaceIdentity("/check", location.search);
  const remembered = !incoming || incoming === publicSession.check.token;
  const [token, setToken] = useState(incoming || publicSession.check.token);
  const [amount, setAmount] = useState(remembered ? publicSession.check.amount : "");
  const [output, setOutput] = useState<ExitCheckOutputSymbol>(remembered ? publicSession.check.output : "WETH");
  const [curveEnabled, setCurveEnabled] = useState(remembered && publicSession.check.curveEnabled);
  const [result, setResult] = useState<ExitCheckQuote | null>(remembered ? publicSession.check.result : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!result) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [result]);
  useEffect(() => {
    publicSession.check = { token: publicIdentity(token), amount, output, curveEnabled, result };
  }, [token, amount, output, curveEnabled, result]);
  useEffect(() => {
    if (incoming && incoming !== token) {
      pending.current?.abort();
      // Synchronize explicit router context; amounts never come from a URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(incoming);
      setAmount("");
      setResult(null);
      setBusy(false);
      setError(false);
    }
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const path = workspaceLink("/check", incoming || publicSession.check.token);
    if (`/check${location.search}` !== path) navigate(path, { replace: true });
  }, [incoming, location.search, navigate]);
  const valid =
    /^0x[a-fA-F0-9]{40}$/.test(token.trim()) && isValidExitAmount(amount, 36);
  function clear() {
    pending.current?.abort();
    setBusy(false);
    setResult(null);
    setError(false);
  }
  async function run() {
    clear();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    navigate(workspaceLink("/check", token), { replace: true });
    try {
      const quote = await getExitCheckQuote(
        {
          token: token.trim(),
          amount,
          outputToken: output,
          curve: curveEnabled,
        },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setNow(Date.now());
        setResult(quote);
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const report = useMemo(
    () => (result ? tradeReport(result, output) : null),
    [result, output],
  );
  const stale = result ? now >= Date.parse(result.expiresAt) : true;
  return (
    <>
      <header className="opsis-heading">
        <p className="opsis-kicker">02 / {c("TRADE CHECK", "交易核查")}</p>
        <h1>{c("What comes out at this size?", "这个数量能换出多少？")}</h1>
        <p>
          {c(
            "An observed V3 quote on Robinhood Chain. Excluded: gas. This does not prove a trade can execute.",
            "Robinhood Chain 上观察到的 V3 报价。不含 Gas 费用。这不证明交易可执行。",
          )}
        </p>
      </header>
      <div className="opsis-two-column">
        <form
          className="opsis-panel"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) void run();
          }}
        >
          <label htmlFor="check-token">
            {c("Token contract · chain 4663", "代币合约 · 链 4663")}
          </label>
          <input
            id="check-token"
            value={token}
            onChange={(e) => {
              clear();
              setToken(e.target.value);
            }}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
          />
          <label htmlFor="check-amount">
            {c("Amount to check", "核查数量")}
          </label>
          <input
            id="check-amount"
            value={amount}
            onChange={(e) => {
              clear();
              setAmount(e.target.value);
            }}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.0"
          />
          <label htmlFor="check-output">{c("Output asset", "输出资产")}</label>
          <select
            id="check-output"
            value={output}
            onChange={(e) => {
              clear();
              setOutput(e.target.value as ExitCheckOutputSymbol);
            }}
          >
            <option>WETH</option>
            <option>USDG</option>
          </select>
          <p className="opsis-receipt">
            {c(
              "Sends this contract, entered amount and output asset to Opsis and the configured Robinhood RPC. Saved holdings are never filled automatically. No wallet connection or transaction is requested.",
              "向 Opsis 和配置的 Robinhood RPC 发送此合约、输入数量和输出资产。不会自动填入已保存持仓。不请求钱包连接或交易。",
            )}
          </p>
          <label className="opsis-curve-optin">
            <input
              type="checkbox"
              checked={curveEnabled}
              onChange={(e) => {
                clear();
                setCurveEnabled(e.target.checked);
              }}
            />
            {c(
              "Also quote a size curve (half, entered amount, double)",
              "同时核查数量曲线（半数、输入数量、两倍）",
            )}
          </label>
          {curveEnabled && (
            <p className="opsis-small">
              {c(
                "Before this request, Opsis derives up to three exact raw-unit sizes: half rounded down, the entered amount, and double. A duplicate at the smallest unit or a uint256 overflow is omitted. The actual accepted sizes are shown only after the response; all points share one block and a bounded RPC budget.",
                "请求前说明：Opsis 以精确原始单位推导最多三个数量：向下取整的一半、输入数量和两倍。最小单位重复或 uint256 溢出时会省略。响应后显示实际接受的数量；所有点共享一个区块并受 RPC 预算限制。",
              )}
            </p>
          )}
          <button className="opsis-action" disabled={busy || !valid}>
            {busy ? c("Checking…", "正在核查…") : c("Run a check", "运行核查")}
          </button>
        </form>
        <div aria-live="polite">
          {busy && (
            <p role="status">
              {c("Reading pools at one block…", "正在读取同一区块的资金池…")}
            </p>
          )}
          {error && (
            <section className="opsis-panel" role="alert">
              <h2>{c("Quote unavailable", "报价不可用")}</h2>
              <p>
                {c(
                  "The request failed, was limited, or returned inconsistent evidence. Check the contract and amount, then retry.",
                  "请求失败、受限或返回了不一致的证据。请检查合约和数量后重试。",
                )}
              </p>
            </section>
          )}
          {!result && !busy && !error && (
            <section className="opsis-panel opsis-empty">
              <p className="opsis-kicker">
                {c("OBSERVATION, NOT EXECUTION", "观察，并非执行")}
              </p>
              <h2>
                {c(
                  "A price is only part of the picture.",
                  "价格只是信息的一部分。",
                )}
              </h2>
              <p>
                {c(
                  "Compare output, price impact and pool fees at your entered amount. Unknown coverage stays visible.",
                  "按输入数量比较输出、价格影响和池费用。未知覆盖范围始终可见。",
                )}
              </p>
            </section>
          )}
          {result && (
            <section className="opsis-panel" data-testid="opsis-quote">
              <p className="opsis-kicker">
                {stale
                  ? c("STALE QUOTE", "报价已过期")
                  : c("CURRENT, NOT FINAL", "当前状态，尚未最终确认")}
              </p>
              <p className="opsis-identity">
                {result.chain.name} · {result.chain.id}
                <br />
                {result.input.contract}
              </p>
              <p className="opsis-small">
                {c("Checked at", "核查时间")}: {result.quotedAt} ·{" "}
                {c("Block", "区块")} {result.anchor.blockNumber}
              </p>
              {result.supported && result.quote && result.output ? (
                <>
                  <p className="opsis-small">
                    {c("Observed output", "观察到的输出")}
                  </p>
                  <h2 className="opsis-number">
                    {result.quote.amountOutDisplay}{" "}
                    <span>{result.output.symbol}</span>
                  </h2>
                  <dl className="opsis-metrics">
                    <div>
                      <dt>{c("Price impact", "价格影响")}</dt>
                      <dd>
                        {result.quote.priceImpactPercent === null
                          ? c("Unknown", "未知")
                          : `${result.quote.priceImpactPercent}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>{c("Included pool fee", "已计入的池费用")}</dt>
                      <dd>{result.quote.feePercent}%</dd>
                    </div>
                    <div>
                      <dt>{c("Quoted pools", "已报价池")}</dt>
                      <dd>{result.coverage.poolsQuoted.length}</dd>
                    </div>
                  </dl>
                  <Suspense fallback={null}>
                    <PoolComparison key={result.quotedAt} result={result} />
                  </Suspense>
                  <p className="opsis-receipt">
                    {c(
                      "Partial scope: single-hop V3 pools only. Excluded: gas, approvals, transfer taxes, execution failure and other routes. A quote is not sellability proof.",
                      "部分覆盖：仅单跳 V3 池。不含 Gas、授权、转账税、执行失败和其他路径。报价不是可卖出的证明。",
                    )}
                  </p>
                  {stale && (
                    <p role="status">
                      {c(
                        "Run a new check before using these values. Cached quotes keep their original expiry.",
                        "使用这些数值前请重新核查。缓存报价保留原始到期时间。",
                      )}
                    </p>
                  )}
                  <a
                    className="opsis-action"
                    href={`https://app.uniswap.org/swap?chain=robinhood&inputCurrency=${result.input.contract}&outputCurrency=${result.output.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c("Open Uniswap ↗", "打开 Uniswap ↗")}
                  </a>
                  <p className="opsis-small">
                    {c(
                      "Leaves Opsis. Only public asset identities are passed; re-enter your amount and obtain a new quote. Network and protocol costs apply.",
                      "离开 Opsis。仅传递公开资产标识；请重新输入数量并获取新报价。需承担网络和协议费用。",
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h2>
                    {c(
                      "No observed quote at this size",
                      "此数量下未观察到报价",
                    )}
                  </h2>
                  <p>
                    {result.reason === "unknown_decimals"
                      ? c("Token precision is unknown.", "代币精度未知。")
                      : result.reason === "quote_failed"
                        ? c(
                            "Pool quoting failed; coverage is unknown.",
                            "池报价失败；覆盖范围未知。",
                          )
                        : c(
                            "No supported V3 pool was observed in this scope.",
                            "在此范围内未观察到支持的 V3 池。",
                          )}
                  </p>
                </>
              )}
              <ExitSizeCurve
                key={result.quotedAt}
                result={result}
                outputSymbol={output}
              />
              <details>
                <summary>
                  {c("Sources, time and limits", "来源、时间和限制")}
                </summary>
                <p className="opsis-small">
                  {result.provider.name} ·{" "}
                  {result.provider.cached
                    ? c("Cached", "已缓存")
                    : c("Live lookup", "实时查询")}
                </p>
                <p className="opsis-identity">{result.anchor.blockHash}</p>
                <p>
                  {c("Block time", "区块时间")}: {result.anchor.timestamp}
                  <br />
                  {c("Expires at", "到期时间")}: {result.expiresAt}
                </p>
                {result.quote && (
                  <p className="opsis-identity">
                    {c("Pool", "资金池")}: {result.quote.pool.pool}
                  </p>
                )}
                <p>
                  {c("Failed quotes / discovery", "报价失败／发现失败")}:{" "}
                  {result.coverage.poolsFailed.length} /{" "}
                  {result.coverage.poolsDiscoveryFailed.length}
                </p>
                <ul>
                  {result.limitations.map((limit, i) => (
                    <li key={i}>{limit}</li>
                  ))}
                </ul>
              </details>
            </section>
          )}
        </div>
      </div>
      <details className="opsis-panel">
        <summary>
          {c("Save this check / revisit conditions", "保存此核查／复查条件")}
        </summary>
        <ReportShelf
          draft={report}
          onLock={clear}
          capabilities={capabilities}
        />
      </details>
      <details className="opsis-panel">
        <summary>{c("More trade tools", "更多交易工具")}</summary>
        <div className="opsis-tool-links">
          {capabilities.research && (
            <Link to={workspaceLink("/research", token)}>
              {c("Research this token", "研究此代币")}
            </Link>
          )}
          {tradeToolPaths(capabilities).filter((path) => path !== "/check").map((path) => (
            <Link key={path} to={path}>{c(...routeNames[path])}</Link>
          ))}
        </div>
      </details>
      <details className="opsis-panel">
        <summary>
          {c("Perp tools and opening / closing", "永续合约工具与开仓／平仓")}
        </summary>
        <p>
          {c(
            "Planned in the product bible. Execution is unavailable: venue eligibility, Canada/US access, margin, order reconciliation and cost disclosures still require implementation and review. No order or wallet signature can be submitted here.",
            "已纳入产品规划。执行功能不可用：交易场所准入、加拿大／美国访问、保证金、订单核对及费用披露仍需实现和审核。此处无法提交订单或钱包签名。",
          )}
        </p>
      </details>
    </>
  );
}
