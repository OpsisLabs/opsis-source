import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowRight,
  AlertTriangle,
  ChartNoAxesCombined,
  Upload,
  Info,
  Search,
} from "lucide-react";
import { isAddress } from "viem";
import { useCopy } from "../opsis/copy";
import { useI18n, type TranslationKey } from "../i18n";
import type { RwaCheck, RwaVerification } from "./api";
import RwaHistory, { type HistoryTab } from "./RwaHistory";
import { useStockGapImport } from "../opsis/useStockGapImport";
import type { StockGapSeries } from "../opsis/stock-gap-series";
import { historyMatches } from "./history";
import "./rwa-workspace.css";

type Props = {
  address: string;
  loading: boolean;
  error: string;
  result: RwaVerification | null;
  setAddress: (value: string) => void;
  prepare: (event: FormEvent) => void;
  verifyButton: RefObject<HTMLButtonElement | null>;
  morphoDetails: ReactNode;
  desk?: ReactNode;
  consent: ReactNode;
};
const statusKeys: Record<RwaCheck["status"], TranslationKey> = {
  confirmed: "rwa.evidence.status.confirmed",
  claim: "rwa.evidence.status.claim",
  warning: "rwa.evidence.status.warning",
  missing: "rwa.evidence.status.missing",
  conflict: "rwa.evidence.status.conflict",
  unsupported: "rwa.evidence.status.unsupported",
};

export default function RwaWorkspace({
  address,
  loading,
  error,
  result,
  setAddress,
  prepare,
  verifyButton,
  morphoDetails,
  desk,
  consent,
}: Props) {
  const c = useCopy();
  const imported = useStockGapImport();
  const upload = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<HistoryTab>("overview");
  const identity = result
    ? { chainId: result.anchor.chainId, address: result.address }
    : isAddress(address.trim(), { strict: false })
      ? { chainId: 4663, address: address.trim() }
      : null;
  const series =
    imported.series && historyMatches(imported.series, identity)
      ? imported.series
      : null;
  const tabs: Array<[HistoryTab, string]> = [
    ["overview", c("Overview", "概览")],
    ["prices", c("Price & gap", "价格与价差")],
    ...(series || result?.stock
      ? [
          ["actions", c("Corporate actions", "公司行动")] as [
            HistoryTab,
            string,
          ],
        ]
      : []),
    ...(series || result
      ? [["sources", c("Sources", "来源")] as [HistoryTab, string]]
      : []),
    ["documents", c("Documents", "文件")],
  ];
  const activeTab = tabs.some(([key]) => key === tab) ? tab : "overview";
  const importAction = () => upload.current?.click();
  return (
    <div className="rwa-ws-page">
      <form
        className="rwa-ws-lookup"
        onSubmit={prepare}
        aria-label={c("Stock-token lookup", "股票代币查询")}
      >
        <div className="rwa-ws-input-row">
          <div className="rwa-ws-input-wrap">
            <Search size={17} aria-hidden="true" />
            <input
              id="rwa-workspace-address"
              aria-label={c("Token or vault contract", "代币或金库合约")}
              value={address}
              disabled={loading}
              onChange={(event) => setAddress(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
            />
          </div>
          <button
            ref={verifyButton}
            className="rwa-ws-primary"
            type="submit"
            disabled={!address.trim() || loading}
          >
            {loading ? c("Checking…", "正在核查…") : c("Run check", "运行核查")}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        <span className="rwa-ws-lookup-hint">
          {c("Exact contract · Robinhood Chain", "确切合约 · Robinhood Chain")}
        </span>
      </form>
      {error && (
        <p role="alert" className="rwa-ws-panel rwa-ws-error">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="rwa-ws-loading">
          <Info size={16} aria-hidden="true" />
          {c(
            "Reconciling registry, direct contract and source evidence…",
            "正在核对注册表、直接合约及来源证据…",
          )}
        </p>
      )}
      <div className="rwa-ws-grid">
        <div className="rwa-ws-main">
          {desk}
          <section className="rwa-ws-panel rwa-ws-intro">
            <header className="rwa-ws-title-row">
              <span className="rwa-ws-instrument-icon">
                <ChartNoAxesCombined
                  size={28}
                  strokeWidth={1.3}
                  aria-hidden="true"
                />
              </span>
              <div className="rwa-ws-title-copy">
                <h1>
                  {series?.instrument.symbol ||
                    result?.stock?.symbol ||
                    c("Stock-token check", "股票代币核查")}
                </h1>
                <p>
                  {series
                    ? c(
                        "Local import · unverified source · not live",
                        "本地导入 · 来源未经验证 · 非实时",
                      )
                    : c("Stock-token research", "股票代币研究")}
                </p>
              </div>
              <label className="rwa-ws-upload">
                <Upload size={15} aria-hidden="true" />
                <span>{c("Import paired prices", "导入配对价格")}</span>
                <input
                  ref={upload}
                  aria-label={c(
                    "Import paired prices · Paired stock-token gap JSON",
                    "导入配对价格 · 股票代币配对价差 JSON",
                  )}
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => {
                    void imported.load(event.currentTarget.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </header>
            <nav
              className="rwa-ws-tabs"
              aria-label={c("Research views", "研究视图")}
            >
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-current={activeTab === key ? "page" : undefined}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <RwaFacts series={series} />
          </section>
          {imported.busy && (
            <p role="status">
              {c("Calculating locally…", "正在本地计算…")}{" "}
              <button type="button" onClick={imported.cancel}>
                {c("Cancel import", "取消导入")}
              </button>
            </p>
          )}
          {imported.error && (
            <p role="alert" className="rwa-ws-panel rwa-ws-error">
              {imported.cancelled
                ? c("Local import cancelled.", "已取消本地导入。")
                : c(
                    "Import unavailable. Check the JSON format, the 512 KB limit, increasing dates and matching quote currencies; then choose the file again.",
                    "无法导入。请检查 JSON 格式、512 KB 限制、递增日期及一致的报价货币，然后重新选择文件。",
                  )}
            </p>
          )}
          {imported.series && !series && (
            <p role="alert" className="rwa-ws-panel rwa-ws-error">
              {c(
                "History hidden: its chain or contract differs from the lookup. Import prices for the exact contract above.",
                "历史已隐藏：链或合约与查询不一致。请导入上方确切合约的价格。",
              )}
            </p>
          )}
          <RwaHistory
            key={
              series
                ? `${series.observedAt}:${series.instrument.address}`
                : "empty"
            }
            series={series}
            tab={activeTab}
            result={result}
            importAction={importAction}
          />
        </div>
        <EvidenceDock
          result={result}
          series={series}
          morphoDetails={morphoDetails}
        />
      </div>
      <p className="rwa-ws-footer">
        {c("Research only · source dates govern", "仅供研究 · 以来源日期为准")}
      </p>
      {consent}
    </div>
  );
}

function EvidenceDock({
  result,
  series,
  morphoDetails,
}: {
  result: RwaVerification | null;
  series: StockGapSeries | null;
  morphoDetails: ReactNode;
  desk?: ReactNode;
}) {
  const c = useCopy();
  const { locale } = useI18n();
  const stock = result?.stock;
  const redemption = result?.checks.find((check) => check.id === "redemption");
  const custody = result?.checks.find((check) => check.id === "custody");
  const quote = stock?.underlyingQuote,
    oracle = stock?.oracle;
  const state = (value: string | undefined) =>
    value === "current"
      ? c("Current at lookup", "查询时为当前值")
      : value === "paused"
        ? c("Paused", "已暂停")
        : value === "stale_or_market_closed"
          ? c("Stale or market closed", "陈旧或休市")
          : value === "invalid"
            ? c("Invalid", "无效")
            : value === "stale"
              ? c("Stale", "陈旧")
              : c("Unavailable", "不可用");
  return (
    <aside
      className="rwa-ws-panel rwa-ws-dock"
      aria-label={c("Identity and evidence", "身份及证据")}
      data-testid={result ? "rwa-result" : undefined}
    >
      <details open>
        <summary>{c("Token identity", "代币身份")}</summary>
        {result ? (
          <>
            <dl className="rwa-ws-dock-facts">
              <Fact label={c("Contract", "合约")} value={result.address} mono />
              <Fact
                label={c("Network", "网络")}
                value={`Robinhood Chain · ${result.anchor.chainId}`}
              />
              {stock && (
                <>
                  <Fact
                    label={c("Identifier", "标识符")}
                    value={stock.symbol}
                    mono
                  />
                  <Fact label={c("Name", "名称")} value={stock.name} />
                  <Fact
                    label={c("Decimals", "小数位")}
                    value={String(stock.decimals)}
                    mono
                  />
                </>
              )}
            </dl>
            {stock && (
              <details>
                <summary>
                  {c(
                    "Registry, multiplier and pause evidence",
                    "注册表、乘数及暂停证据",
                  )}
                </summary>
                <dl className="rwa-ws-dock-facts">
                  <Fact label={c("UID", "UID")} value={stock.uid} mono />
                  <Fact
                    label={c("Registry status", "注册表状态")}
                    value={stock.registryStatus}
                  />
                  <Fact
                    label={c("UI multiplier", "显示乘数")}
                    value={stock.currentMultiplier}
                    mono
                  />
                  <Fact
                    label={c("Pending multiplier", "待生效乘数")}
                    value={
                      stock.pendingMultiplier ??
                      c("None reported; see checks", "未报告；请查看核查项")
                    }
                    mono
                  />
                  {stock.pendingEffectiveAt && (
                    <Fact
                      label={c("Effective at", "生效时间")}
                      value={stock.pendingEffectiveAt}
                      mono
                    />
                  )}
                  <Fact
                    label={c("Token pause", "代币暂停")}
                    value={
                      stock.tokenPaused === null
                        ? c("Unknown", "未知")
                        : stock.tokenPaused
                          ? c("Paused", "已暂停")
                          : c(
                              "Not paused at captured block",
                              "捕获区块时未暂停",
                            )
                    }
                  />
                </dl>
              </details>
            )}
            <details className="rwa-ws-secondary-details">
              <summary>
                {c("Captured block and finality", "捕获区块及最终性")}
              </summary>
              <p className="rwa-ws-mono">
                {result.anchor.blockNumber.toLocaleString(locale)} ·{" "}
                {result.anchor.capturedAt}
              </p>
              <p>
                {c(
                  "Current, not final · hash rechecked",
                  "当前，未最终确认 · 已重新核对哈希",
                )}
              </p>
              <p className="rwa-ws-mono">{result.anchor.blockHash}</p>
            </details>
          </>
        ) : series ? (
          <>
            <dl className="rwa-ws-dock-facts">
              <Fact
                label={c("Identifier", "标识符")}
                value={series.instrument.symbol ?? c("Unsupplied", "未提供")}
                mono
              />
              <Fact
                label={c("Network", "网络")}
                value={`Robinhood Chain · ${series.instrument.chainId}`}
              />
              <Fact
                label={c("Contract", "合约")}
                value={series.instrument.address}
                mono
              />
              <Fact
                label={c("Identity", "身份")}
                value={c("File-stated · unverified", "文件声称 · 未验证")}
              />
            </dl>
            <p>
              {c(
                "Run a lookup to check this exact contract.",
                "运行查询以核查此确切合约。",
              )}
            </p>
          </>
        ) : (
          <p>
            {c(
              "Not checked. Exact contract, instrument type and capture time appear after a lookup.",
              "尚未核查。查询后显示确切合约、标的类型及捕获时间。",
            )}
          </p>
        )}
      </details>
      <details open>
        <summary>{c("Reference source", "参考来源")}</summary>
        {stock ? (
          <>
            {series && <ImportedReference series={series} />}
            <details className="rwa-ws-snapshot" open={!series}>
              <summary>{c("Lookup snapshot", "查询快照")}</summary>
              <p>
                {c("Lookup sources", "查询来源")}:{" "}
                {[
                  ...new Set(result?.sources.map((source) => source.provider)),
                ].join(" · ") || c("Unavailable", "不可用")}
              </p>
              <dl className="rwa-ws-dock-facts">
                <Fact
                  label={c("Underlying bid / ask", "标的买价／卖价")}
                  value={
                    quote
                      ? `${quote.bid} / ${quote.ask} ${quote.currency}`
                      : c("Unavailable", "不可用")
                  }
                  mono
                />
                {quote && (
                  <>
                    <Fact
                      label={c("Quote state", "报价状态")}
                      value={
                        quote.tradingHalted
                          ? c("Trading halted", "交易已暂停")
                          : state(quote.state)
                      }
                    />
                    <Fact
                      label={c("Generated at", "生成时间")}
                      value={quote.generatedAt}
                      mono
                    />
                  </>
                )}
                <Fact
                  label={c("Per-token oracle", "每枚代币预言机")}
                  value={
                    oracle?.state === "current"
                      ? oracle.value !== null
                        ? `${oracle.value} USD`
                        : c("Unavailable", "不可用")
                      : state(oracle?.state)
                  }
                  mono
                />
                <Fact
                  label={c("Oracle state", "预言机状态")}
                  value={state(oracle?.state)}
                />
                {oracle?.updatedAt && (
                  <Fact
                    label={c("Oracle updated at", "预言机更新时间")}
                    value={oracle.updatedAt}
                    mono
                  />
                )}

                {oracle &&
                  oracle.state !== "current" &&
                  oracle.value !== null && (
                    <Fact
                      label={c(
                        "Last returned; not current",
                        "上次返回值；非当前值",
                      )}
                      value={`${oracle.value} USD`}
                      mono
                    />
                  )}
              </dl>
              <details>
                <summary>
                  {c("Quote timing and oracle feed", "报价时距及预言机数据源")}
                </summary>
                <dl className="rwa-ws-dock-facts">
                  {quote && (
                    <Fact
                      label={c("Age at lookup (seconds)", "查询时距（秒）")}
                      value={String(quote.ageSeconds)}
                      mono
                    />
                  )}{" "}
                  {oracle && (
                    <>
                      <Fact
                        label={c("Heartbeat (seconds)", "心跳间隔（秒）")}
                        value={String(oracle.heartbeatSeconds)}
                        mono
                      />
                      <Fact
                        label={c("Oracle feed", "预言机数据源")}
                        value={oracle.feed}
                        mono
                      />
                    </>
                  )}
                </dl>
              </details>
              <p className="rwa-ws-note">
                {c(
                  "Raw equity bid / ask is not token value. The per-token oracle already includes the multiplier. A snapshot does not establish historical gap coverage.",
                  "原始股票买卖价并非代币价值。每枚代币预言机已含乘数。快照不能证明历史价差覆盖率。",
                )}
              </p>
            </details>
          </>
        ) : series ? (
          <ImportedReference series={series} />
        ) : (
          <p>
            {c(
              "Unavailable. No reference price or source frequency is assumed.",
              "不可用。不假设参考价格或来源更新频率。",
            )}
          </p>
        )}
      </details>
      <details open>
        <summary>{c("Redemption", "赎回")}</summary>
        <div className="rwa-ws-caution">
          <AlertTriangle size={17} aria-hidden="true" />
          <div>
            <h3>{c("Redemption unverified", "赎回未经验证")}</h3>
            <p>
              {redemption?.detail ??
                c(
                  "This check does not independently verify redeemability or your eligibility. A registry match does not prove backing.",
                  "此核查不独立验证可赎回性或您的资格。注册表匹配不证明支持资产。",
                )}
            </p>
          </div>
        </div>
        {redemption && (
          <CheckSources check={redemption} sources={result?.sources ?? []} />
        )}
      </details>
      <details open>
        <summary>{c("Backing documents", "支持资产文件")}</summary>
        {custody && (
          <>
            <p>{custody.detail}</p>
            <CheckSources check={custody} sources={result?.sources ?? []} />
          </>
        )}
        <p className="rwa-ws-document-status">
          {c("No documents available", "无可用文件")}
        </p>
        <p>
          {c(
            "Document retrieval unavailable. This lookup does not return prospectuses or custody documents. Issuer statements are not an independent custody audit.",
            "文件检索不可用。此查询不返回招股说明书或托管文件。发行方声明并非独立托管审计。",
          )}
        </p>
        {stock?.termsUrl && (
          <a
            className="rwa-ws-document"
            href={stock.termsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c("Issuer terms", "发行方条款")} ↗
          </a>
        )}
      </details>
      {result && (
        <>
          <details className="rwa-ws-result-summary">
            <summary>{c("Lookup receipt", "查询回执")}</summary>
            <span>
              {result.kind === "stock_token"
                ? c("Stock token", "股票代币")
                : result.kind === "morpho_vault"
                  ? c("Morpho vault", "Morpho 金库")
                  : c("Unsupported contract", "不支持的合约")}
            </span>
            <h2>{result.headline}</h2>
            <p>{result.summary}</p>
            {locale === "zh-CN" && (
              <p>
                {c(
                  "Source text remains in its original language.",
                  "来源文本保留原文。",
                )}
              </p>
            )}
          </details>
          {stock && (
            <details>
              <summary>{c("Corporate actions", "公司行动")}</summary>
              <p>
                {c(
                  "Process dates are not necessarily payment dates. Empty rows do not establish complete coverage; see the checks below. These snapshot actions are not overlaid on unverified imported history.",
                  "处理日期不一定是支付日期。空行不证明覆盖完整；请查看下方核查项。这些快照行动不会叠加在未经验证的导入历史上。",
                )}
              </p>
              {stock.corporateActions.map((action) => (
                <article className="rwa-ws-action" key={action.id}>
                  <h3>
                    {action.type} · {action.status}
                  </h3>
                  <p>
                    {action.processDate ?? c("Date unsupplied", "未提供日期")}
                  </p>
                  <p>{action.detail}</p>
                </article>
              ))}
            </details>
          )}
          {morphoDetails && (
            <details className="rwa-ws-morpho">
              <summary>
                {c(
                  "Vault details and indexed liquidity",
                  "金库详情及索引流动性",
                )}
              </summary>
              {morphoDetails}
            </details>
          )}
          <details>
            <summary>
              {c("All evidence checks", "全部证据核查")} ·{" "}
              {result.checks.length}
            </summary>
            {result.checks.map((check) => (
              <Check key={check.id} check={check} sources={result.sources} />
            ))}
          </details>
          <details>
            <summary>
              {c("Sources and read times", "来源及读取时间")} ·{" "}
              {result.sources.length}
            </summary>
            {result.sources.map((source) => (
              <article className="rwa-ws-source" key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.provider} ↗
                </a>
                <p>{source.description}</p>
                <time dateTime={source.fetchedAt}>{source.fetchedAt}</time>
              </article>
            ))}
            {result.sources.length === 0 && (
              <p>{c("No supported source returned.", "未返回支持的来源。")}</p>
            )}
          </details>
          <details>
            <summary>
              {c("Limits and privacy receipt", "限制及隐私回执")}
            </summary>
            <ul>
              {result.limitations.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
            <p>{result.privacy.disclosure}</p>
            <p>
              {c("Destinations", "目标")}:{" "}
              {result.privacy.providerDestinations.join(" · ")}
            </p>
          </details>
          <p className="rwa-ws-note">
            {c("Captured at", "捕获时间")} {result.anchor.capturedAt}
          </p>
        </>
      )}
    </aside>
  );
}

function ImportedReference({ series }: { series: StockGapSeries }) {
  const c = useCopy();
  return (
    <dl className="rwa-ws-dock-facts">
      <Fact label={c("Source", "来源")} value={series.sourceName} />
      <Fact
        label={c("Reference", "参考")}
        value={
          series.referenceType === "oracle"
            ? c("Per-token oracle", "每枚代币预言机")
            : c("Underlying × multiplier", "标的 × 乘数")
        }
      />
      <Fact label={c("Currency", "货币")} value={series.quoteCurrency} />
      <Fact
        label={c("Coverage", "覆盖率")}
        value={c("Imported sample · unverified", "导入样本 · 未验证")}
      />
      <Fact
        label={c("File observed at", "文件观察时间")}
        value={series.observedAt
          .replace("T", " ")
          .replace(/\.000Z$|Z$/, " UTC")}
      />
    </dl>
  );
}

function RwaFacts({ series }: { series: StockGapSeries | null }) {
  const c = useCopy();
  const rows = series?.observations ?? [],
    latest = rows.at(-1);
  const values = rows.map((row) => row.chartGapPercent);
  return (
    <dl className="rwa-ws-facts">
      <div>
        <dt>
          {c("Latest token-to-reference gap", "最近代币与参考价差")}{" "}
          <Info size={13} aria-hidden="true" />
        </dt>
        <dd>
          <span data-testid={latest ? "rwa-gap-latest" : undefined}>
            {latest ? `${latest.gapPercent}%` : "—"}
          </span>
          <small>
            {latest && series
              ? `${c("Token", "代币")} ${latest.dexPrice} · ${series.referenceType === "underlying" ? c("Raw reference", "原始参考") : c("Reference", "参考")} ${latest.referencePrice} ${series.quoteCurrency}`
              : c("Paired prices required", "需要配对价格")}
          </small>
          {latest && (
            <small>
              {latest.timestamp.replace("T", " ").replace("Z", " UTC")}
            </small>
          )}
        </dd>
      </div>
      <div>
        <dt>{c("Observed range", "观察范围")}</dt>
        <dd className="rwa-ws-range">
          {latest
            ? `${Math.min(...values).toFixed(2)}% ${c("to", "至")} ${Math.max(...values).toFixed(2)}%`
            : "—"}
          <small>
            {latest
              ? `${rows.length} ${c("paired observations", "个配对观察值")}`
              : c("Import dated observations", "导入注明日期的观察值")}
          </small>
        </dd>
      </div>
      <div>
        <dt>
          {c("Data coverage", "数据覆盖率")}{" "}
          <Info size={13} aria-hidden="true" />
        </dt>
        <dd className="rwa-ws-coverage">
          {c("Unknown", "未知")}
          <small>
            {c("Expected count unknown", "预期数量未知")}
            {latest ? ` · ${rows.length} ${c("observed", "已观察")}` : ""}
          </small>
          <small>{c("No expected cadence supplied", "未提供预期频率")}</small>
        </dd>
      </div>
    </dl>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={mono ? "rwa-ws-mono" : undefined}>{value}</dd>
    </div>
  );
}
function CheckSources({
  check,
  sources,
}: {
  check: RwaCheck;
  sources: RwaVerification["sources"];
}) {
  const c = useCopy();
  return (
    <p className="rwa-ws-check-sources">
      {c("Sources", "来源")}:{" "}
      {check.sourceIds
        .map((id) => sources.find((source) => source.id === id)?.provider ?? id)
        .join(" · ") || c("No supported source", "无支持的来源")}
    </p>
  );
}
function Check({
  check,
  sources,
}: {
  check: RwaCheck;
  sources: RwaVerification["sources"];
}) {
  const { t } = useI18n();
  return (
    <article className={`rwa-ws-check rwa-check-${check.status}`}>
      <span>{t(statusKeys[check.status])}</span>
      <h3>{check.label}</h3>
      <p>{check.detail}</p>
      <CheckSources check={check} sources={sources} />
    </article>
  );
}
