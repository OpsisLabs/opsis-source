import { savedCheckComparisonsEnabled } from "./saved-checks";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  EXIT_CHECK_TOKENS,
  isValidExitAmount,
  type ExitCheckQuote,
  type ExitCheckOutputSymbol,
} from "../exit-check/api";
import {
  KNOWN_ASSETS,
  resolveKnownAsset,
  type KnownAsset,
} from "./known-assets";
import { differentOutput, observeTradeQuote } from "./trade-check";
import {
  tradeRefusal,
  tradeRefusalCopy,
  type TradeRefusal,
} from "./trade-refusal";
import { useCopy } from "./copy";
import {
  publicIdentity,
  workspaceIdentity,
  workspaceLink,
  type Capabilities,
} from "./model";

import { publicSession } from "./public-session";
import { tradeToolPaths, routeNames } from "./shell-model";

import ReportShelf from "./ReportShelf";
import { tradeReport } from "./reports";
import ExitSizeCurve from "./ExitSizeCurve";
// Imported, not lazy, so the quote and its comparison appear together and the
// save controls below do not move after the result is shown.
import PoolComparison from "./PoolComparison";
import "./check.css";

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
  const [amount, setAmount] = useState(
    remembered ? publicSession.check.amount : "",
  );
  const [output, setOutput] = useState<ExitCheckOutputSymbol>(() =>
    differentOutput(
      incoming || publicSession.check.token,
      remembered ? publicSession.check.output : "WETH",
    ),
  );
  const [curveEnabled, setCurveEnabled] = useState(
    remembered && publicSession.check.curveEnabled,
  );
  const [result, setResult] = useState<ExitCheckQuote | null>(
    remembered ? publicSession.check.result : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<
    (TradeRefusal & { message: string }) | null
  >(null);
  const [resolved, setResolved] = useState<KnownAsset | null>(null);
  const known = resolveKnownAsset(token);
  const tokenIdentity = known?.address ?? token.trim();
  const resolvedAsset =
    resolved ??
    known ??
    KNOWN_ASSETS.find(
      (asset) => asset.address.toLowerCase() === tokenIdentity.toLowerCase(),
    );
  const selectedOutput = differentOutput(tokenIdentity, output);
  const [now, setNow] = useState(Date.now);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!result) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [result]);
  useEffect(() => {
    publicSession.check = {
      token: publicIdentity(token),
      amount,
      output,
      curveEnabled,
      result,
    };
  }, [token, amount, output, curveEnabled, result]);
  useEffect(() => {
    if (incoming && incoming !== token) {
      pending.current?.abort();
      // Synchronize explicit router context; amounts never come from a URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(incoming);
      setResolved(null);
      setOutput(differentOutput(incoming, "WETH"));
      setAmount("");
      setResult(null);
      setBusy(false);
      setError(null);
    }
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const path = workspaceLink("/check", incoming || publicSession.check.token);
    if (`/check${location.search}` !== path) navigate(path, { replace: true });
  }, [incoming, location.search, navigate]);
  const valid =
    /^0x[a-fA-F0-9]{40}$/.test(tokenIdentity) && isValidExitAmount(amount, 36);
  function clear() {
    pending.current?.abort();
    setBusy(false);
    setResult(null);
    setError(null);
  }
  function resolveInput() {
    if (known) {
      setToken(known.address);
      setResolved(known);
    }
    setOutput(selectedOutput);
  }
  async function run() {
    if (!valid) return;
    if (known) {
      setToken(known.address);
      setResolved(known);
    }
    setOutput(selectedOutput);
    clear();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    navigate(workspaceLink("/check", tokenIdentity), { replace: true });
    try {
      const { quote, receivedAt } = await observeTradeQuote(
        {
          token: tokenIdentity,
          amount,
          outputToken: selectedOutput,
          curve: curveEnabled,
        },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setNow(receivedAt);
        setResult(quote);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError({
          ...tradeRefusal(error),
          message: error instanceof Error ? error.message : "",
        });
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const report = useMemo(
    () => (result ? tradeReport(result, output, savedCheckComparisonsEnabled(capabilities)) : null),
    [result, output, capabilities],
  );
  const invalidAmount =
    error?.status === 400 && error.code === "EXIT_CHECK_INVALID_AMOUNT";
  const refusalReason =
    invalidAmount && error.message
      ? c(
          error.message,
          error.message
            .replace(
              /^Enter a positive amount with no more than (\d+) decimal places$/,
              "请输入正数数量，小数最多 $1 位",
            )
            .replace(/^Enter a positive decimal amount$/, "请输入正的小数数量"),
        )
      : error
        ? c(...tradeRefusalCopy(error))
        : "";
  const inputSymbol =
    result?.input.symbol ??
    KNOWN_ASSETS.find(
      (asset) =>
        asset.address.toLowerCase() === result?.input.contract.toLowerCase(),
    )?.symbol ??
    c("input token", "输入代币");
  const stale = result ? now >= Date.parse(result.expiresAt) : true;
  return (
    <div className="opsis-check-page">
      <header className="opsis-heading opsis-check-heading">
        <h1>{c("Trade Check", "交易核查")}</h1>
        <p>
          {c("Estimate the output. See the costs.", "估算输出，查看成本。")}
        </p>
      </header>
      <div
        className={`opsis-check-columns${result?.curve ? " opsis-check-with-curve" : ""}`}
      >
        <form
          className="opsis-panel opsis-check-input"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) void run();
          }}
        >
          <h2 className="sr-only">{c("YOUR CHECK", "您的核查")}</h2>
          <div className="opsis-check-asset-field">
          <label htmlFor="check-token">
            {c(
              "Reviewed symbol or token contract · chain 4663",
              "已审核符号或代币合约 · 链 4663",
            )}
          </label>
          <input
            id="check-token"
            value={token}
            onChange={(e) => {
              clear();
              setToken(e.target.value);
              setResolved(null);
              setOutput(differentOutput(e.target.value, output));
            }}
            onBlur={resolveInput}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
          />
          {resolvedAsset && (
            <p className="opsis-small opsis-resolved-asset" role="status">
              {c("Resolved", "已识别")}: {resolvedAsset.name} ·{" "}
              {resolvedAsset.symbol} ·{" "}
              {c("Token · chain 4663", "代币 · 链 4663")}
              <br />
              <code>{resolvedAsset.address}</code>
            </p>
          )}
          {token.trim() && !known && !token.trim().startsWith("0x") && (
            <p role="alert" className="opsis-small">
              {c(
                "Only reviewed symbols are recognised. Enter a token contract address.",
                "仅识别已审核的符号。请输入代币合约地址。",
              )}
            </p>
          )}
          <div
            className="opsis-asset-examples"
            aria-label={c("Trade Check examples", "交易核查示例")}
          >
            <span>{c("Examples", "示例")}:</span>
            {KNOWN_ASSETS.filter((asset) =>
              ["WETH", "AAPL"].includes(asset.symbol),
            ).map((asset) => (
              <button
                key={asset.symbol}
                type="button"
                disabled={busy}
                onClick={() => {
                  clear();
                  setToken(asset.address);
                  setResolved(asset);
                  setAmount(asset.symbol === "WETH" ? "0.1" : "1");
                  setOutput(differentOutput(asset.address, "WETH"));
                }}
              >
                {asset.symbol}
              </button>
            ))}
          </div>
          </div>
          <div className="opsis-form-row">
            <div>
              <label htmlFor="check-amount">
                {c("Amount to check", "核查数量")}
              </label>
              <div className="opsis-check-amount">
                <input
                  id="check-amount"
                  aria-invalid={invalidAmount || undefined}
                  aria-describedby={
                    invalidAmount ? "check-amount-error" : undefined
                  }
                  value={amount}
                  onChange={(e) => {
                    clear();
                    setAmount(e.target.value);
                  }}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.0"
                />
                {resolvedAsset && <span>{resolvedAsset.symbol}</span>}
              </div>
              {invalidAmount && (
                <p
                  id="check-amount-error"
                  className="opsis-field-error"
                  role="alert"
                >
                  {error.code}: {refusalReason}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="check-output">
                {c("Output asset", "输出资产")}
              </label>
              <select
                id="check-output"
                value={selectedOutput}
                onChange={(e) => {
                  clear();
                  setOutput(e.target.value as ExitCheckOutputSymbol);
                }}
              >
                {(["WETH", "USDG"] as const)
                  .filter(
                    (symbol) =>
                      EXIT_CHECK_TOKENS[symbol].address.toLowerCase() !==
                      tokenIdentity.toLowerCase(),
                  )
                  .map((symbol) => (
                    <option key={symbol}>{symbol}</option>
                  ))}
              </select>
            </div>
          </div>
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
          <button className="opsis-action" disabled={busy || !valid}>
            {busy ? c("Checking…", "正在核查…") : c("Run a check", "运行核查")}
          </button>
          {curveEnabled && (
            <p className="opsis-small">
              {c(
                "Before this request, Opsis derives up to three exact raw-unit sizes: half rounded down, the entered amount, and double. A duplicate at the smallest unit or a uint256 overflow is omitted. The actual accepted sizes are shown only after the response; all points share one block and a bounded RPC budget.",
                "请求前说明：Opsis 以精确原始单位推导最多三个数量：向下取整的一半、输入数量和两倍。最小单位重复或 uint256 溢出时会省略。响应后显示实际接受的数量；所有点共享一个区块并受 RPC 预算限制。",
              )}
            </p>
          )}
          <p className="opsis-receipt">
            {c(
              "Sends this contract, entered amount and output asset to Opsis and the configured Robinhood RPC. Saved holdings are never filled automatically. No wallet connection or transaction is requested.",
              "向 Opsis 和配置的 Robinhood RPC 发送此合约、输入数量和输出资产。不会自动填入已保存持仓。不请求钱包连接或交易。",
            )}
          </p>
        </form>
        <div className="opsis-panel opsis-check-receipt" aria-live="polite">
          <h2 className="opsis-kicker">{c("ESTIMATED OUTPUT", "估算输出")}</h2>
          {busy && (
            <p role="status">
              {c("Reading pools at one block…", "正在读取同一区块的资金池…")}
            </p>
          )}
          {error && !invalidAmount && (
            <section role="alert">
              <h2>{c("Quote unavailable", "报价不可用")}</h2>
              <p>{refusalReason}</p>
            </section>
          )}
          {!result && !busy && !error && (
            <p className="opsis-check-placeholder">
              {c(
                "Run a check to see estimated output, price impact and pool fees at your entered amount.",
                "运行核查，查看输入数量的估算输出、价格影响及池费用。",
              )}
            </p>
          )}
          {result && (
            <section data-testid="opsis-quote">
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
              {result.supported && result.quote && result.output ? (
                <>
                  <p className="opsis-check-caption">
                    {c("You send", "您送出")}
                  </p>
                  <p className="opsis-check-send">
                    {result.input.amount} {inputSymbol}
                  </p>
                  <p className="opsis-check-arrow" aria-hidden="true">
                    ↓
                  </p>
                  <p className="opsis-check-caption">
                    {c("You’d receive about", "您大约收到")}
                  </p>
                  <h3 className="opsis-number opsis-check-output">
                    {result.quote.amountOutDisplay}{" "}
                    <span>{result.output.symbol}</span>
                  </h3>
                  <dl className="opsis-check-rows">
                    <div>
                      <dt>{c("Pool", "资金池")}</dt>
                      <dd>
                        Uniswap V3{" "}
                        <span>
                          {result.quote.feePercent}% {c("fee tier", "费率档位")}
                        </span>
                      </dd>
                    </div>
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
                      <dd>
                        {result.quote.feeAmountDisplay} {inputSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>{c("Quoted pools", "已报价池")}</dt>
                      <dd>{result.coverage.poolsQuoted.length}</dd>
                    </div>
                    <div>
                      <dt>{c("Gas not included", "不含 Gas")}</dt>
                      <dd>—</dd>
                    </div>
                  </dl>
                  <p className="opsis-small">
                    {c("Checked at", "核查时间")}: {result.quotedAt} ·{" "}
                    {c("Block", "区块")} {result.anchor.blockNumber} ·{" "}
                    {Math.max(
                      0,
                      Math.floor((now - Date.parse(result.quotedAt)) / 1000),
                    )}{" "}
                    {c("s ago", "秒前")}
                  </p>
                  <p className="opsis-check-note">
                    {c(
                      "Estimate, not an executable quote.",
                      "估算，并非可执行报价。",
                    )}
                  </p>
                  <details className="opsis-check-pools">
                    <summary>
                      {c("Compare observed pools", "比较已观察资金池")}
                    </summary>
                    <PoolComparison key={result.quotedAt} result={result} />
                  </details>
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
                </>
              ) : (
                <>
                  <p className="opsis-small">
                    {c("Checked at", "核查时间")}: {result.quotedAt} ·{" "}
                    {c("Block", "区块")} {result.anchor.blockNumber}
                  </p>
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
                    <li key={i}>
                      {c(limit, quoteLimitChinese[limit] ?? limit)}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
        </div>
        {result?.curve && (
          <div className="opsis-panel opsis-check-curve">
            <ExitSizeCurve
              key={result.quotedAt}
              result={result}
              outputSymbol={output}
            />
          </div>
        )}
      </div>
      {result?.supported && result.quote && result.output && (
        <div className="opsis-panel opsis-check-handoff">
          <a
            className="opsis-action"
            href={`https://app.uniswap.org/swap?chain=robinhood&inputCurrency=${result.input.contract}&outputCurrency=${result.output.address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c("Open Uniswap ↗", "打开 Uniswap ↗")}
          </a>
          <p className="opsis-small">
            {c(
              "Leaves Opsis. Only public asset identities are passed; re-enter your amount and obtain a new quote. Network and protocol costs apply.",
              "离开 Opsis。仅传递公开资产标识；请重新输入数量并获取新报价。需承担网络和协议费用。",
            )}
          </p>
        </div>
      )}
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
              {c("Research this token →", "研究此代币 →")}
            </Link>
          )}
          {tradeToolPaths(capabilities)
            .filter((path) => path !== "/check")
            .map((path) => (
              <Link key={path} to={path}>
                {c(...routeNames[path])} →
              </Link>
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
    </div>
  );
}

const quoteLimitChinese: Record<string, string> = {
  "This is a read-only single-pool estimate from the official Uniswap V3 factory and QuoterV2 on Robinhood Chain, captured at one block.":
    "这是来自 Robinhood Chain 官方 Uniswap V3 工厂和 QuoterV2 的只读单池估算，捕获于同一区块。",
  "It is not a guaranteed fill, a maximum slippage, or proof that the token can be transferred or sold. Token transfer restrictions, paused contracts, allowlists, taxes, and hooks are not checked.":
    "这不保证成交，不代表最大滑点，也不证明代币可转移或卖出。未检查代币转账限制、暂停合约、白名单、税费和钩子。",
  "Only standard Uniswap V3 fee-tier pools created by the official factory are tested. Uniswap v4 and other venues are not included.":
    "仅测试官方工厂创建的标准 Uniswap V3 费率档位池。不包含 Uniswap v4 及其他场所。",
  "Pleiades and other non-admitted venues are excluded from this estimate.":
    "此估算不包含 Pleiades 及其他未获准接入的场所。",
  "Price impact is the exact BigInt gap between the quote and the same-block pre-fee spot price, so it already includes the pool fee; it is not slippage.":
    "价格影响是报价与同区块扣费前现货价格之间的精确 BigInt 差值，已包含池费用；它不是滑点。",
  "The fee amount shown is a floor estimate of the input-side pool fee and can differ from the exact charge because V3 rounding and the actual tick path are not reproduced.":
    "显示的费用是输入侧池费用的向下取整估算；由于未复现 V3 取整和实际跨越的价格刻度路径，可能与实际收费不同。",
  "Only a QuoterV2 result that did not end at a price-boundary is shown. A boundary result can indicate a partial fill, so full execution is never proven.":
    "仅显示未在价格边界结束的 QuoterV2 结果。边界结果可能表示部分成交，因此从不证明可完全执行。",
  "Active V3 liquidity (L) is a raw pool parameter, not the dollar amount you can sell without moving the price.":
    "活跃 V3 流动性（L）是原始池参数，不是您可以在不影响价格的情况下卖出的美元金额。",
  "Network gas is paid separately and is not included in this estimate.":
    "网络 Gas 另行支付，不包含在此估算中。",
  "Opsis does not sign, approve, submit, or broadcast anything. The official Uniswap app independently requotes and owns execution.":
    "Opsis 不签名、授权、提交或广播任何内容。官方 Uniswap 应用独立重新报价并负责执行。",
  "This is not a guaranteed fill, a maximum slippage, or proof that the token can be transferred or sold.":
    "这不保证成交，不代表最大滑点，也不证明代币可转移或卖出。",
};
