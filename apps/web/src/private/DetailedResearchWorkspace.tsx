import { useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  ArrowLeftRight,
  Braces,
  Database,
  FileText,
  Info,
  Layers,
  Search,
} from "lucide-react";
import { Link } from "react-router";
import { workspaceLink } from "../opsis/model";
import { AnswerCard } from "../dashboard/ChatPage";
import { safeHttpUrl } from "../dashboard/adapters";
import type { SourceCitation } from "../dashboard/types";
import { useCopy } from "../opsis/copy";
import {
  explorerNumber,
  holderShares,
  visibleTokenText,
} from "../opsis/explorer-facts";
import {
  formatExactAmount,
  scaleRawAmount,
} from "../opsis/transactionTimeline";
import type { PrivateAnalysis } from "./api";
import { detailedWidgets } from "./detailedWidgets";
import { HolderChart, TransferChart } from "./ResearchCharts";
import {
  holderObservations,
  sourceReadTimeline,
  transferObservations,
} from "./researchWorkspace";

type Section = "findings" | "sources" | "contract" | "transfers" | "raw";
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

function CopyAddress({ value }: { value: string }) {
  const c = useCopy();
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span className="details-ws-copy-control">
      <button
        type="button"
        className="details-ws-copy"
        title={value}
        aria-label={c("Copy address", "复制地址") + ` ${value}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setStatus("copied");
          } catch {
            setStatus("failed");
          }
        }}
      >
        {status === "copied" ? (
          <Check size={13} aria-hidden />
        ) : (
          <Copy size={13} aria-hidden />
        )}
      </button>
      <span
        role="status"
        className={status === "failed" ? "details-ws-copy-error" : "sr-only"}
      >
        {status === "copied"
          ? c("Copied", "已复制")
          : status === "failed"
            ? c(
                "Copy unavailable. Select the address below.",
                "无法复制。请选择下方地址。",
              )
            : ""}
      </span>
      {status === "failed" && (
        <textarea
          readOnly
          aria-label={c("Address to copy manually", "供手动复制的地址")}
          value={value}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </span>
  );
}

export function DetailedResearchWorkspace({
  result,
  loading,
  error,
  history,
  saved,
  follow,
  nextQuestions,
  privacyReceipt,
  onPivot,
}: {
  result: PrivateAnalysis | null;
  loading: boolean;
  error: boolean;
  history: ReactNode;
  saved: ReactNode;
  follow: ReactNode;
  nextQuestions: ReactNode;
  privacyReceipt: ReactNode;
  onPivot: (value: string) => void;
}) {
  const c = useCopy();
  const [section, setSection] = useState<Section>("findings");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [findingIndex, setFindingIndex] = useState<number | null>(null);
  const [dockTab, setDockTab] = useState<"source" | "evidence">("source");
  const facts = result?.entity.facts ?? {};
  const sources = result?.answer.citations ?? [];
  const source =
    sources.find((item) => item.id === sourceId) ??
    sources.find((item) =>
      item.fieldsUsed.some((field) =>
        /share|holders|items\[\]\.value/.test(field),
      ),
    ) ??
    sources[0];
  const findings = result?.answer.confirmedFacts ?? [];
  const finding = findingIndex === null ? undefined : findings[findingIndex];
  const linked = finding
    ? sources.filter((item) => finding.sourceIds.includes(item.id))
    : [];
  const holders = holderObservations(facts);
  const transfers = transferObservations(facts);
  const reads = sourceReadTimeline(sources);
  const shares = holderShares(facts);
  const ten =
    facts.holderCoverage === "unavailable" ? null : explorerNumber(shares.ten);
  const concentration =
    ten !== null && ten <= 100 ? `${shares.ten}%` : c("Unavailable", "不可用");
  const unknown = c("Unknown", "未知");
  const text = (value: unknown) =>
    typeof value === "string" || typeof value === "number"
      ? visibleTokenText(String(value))
      : unknown;
  const yesNo = (value: unknown) =>
    value === true ? c("Yes", "是") : value === false ? c("No", "否") : unknown;
  const percent = (value: unknown) => {
    const number = explorerNumber(value);
    return number !== null && number <= 100 ? `${value}%` : unknown;
  };
  const coverage =
    facts.sourceCoverage === "rpc_sample_only"
      ? c("Partial · RPC sample only", "部分 · 仅 RPC 样本")
      : facts.sourceCoverage === "explorer_metadata"
        ? c("Partial · explorer metadata", "部分 · 浏览器元数据")
        : facts.sourceCoverage === "unavailable"
          ? c("Unavailable", "不可用")
          : c("Unknown scope", "范围未知");
  const holderCoverage =
    facts.holderCoverage === "unavailable"
      ? c("Holder coverage unavailable", "持有者覆盖不可用")
      : holders.length
        ? c(
            "Reported holder sample only; not all holders.",
            "仅报告的持有者样本；非全部持有者。",
          )
        : c("No holder observations supplied.", "未提供持有者观察记录。");
  const sections = [
    ["findings", c("Findings", "发现"), FileText],
    ["sources", c("Sources", "来源"), Database],
    ["contract", c("Contract", "合约"), Layers],
    ["transfers", c("Transfers", "转账"), ArrowLeftRight],
    ["raw", c("Raw records", "原始记录"), Braces],
  ] as const;
  const sourceButton = (item: SourceCitation) => (
    <button
      type="button"
      className="details-ws-source-link"
      key={item.id}
      aria-pressed={source?.id === item.id}
      onClick={() => {
        setSourceId(item.id);
        setDockTab("source");
      }}
    >
      <span>{item.id}</span>
      <span>{item.label || item.provider}</span>
    </button>
  );
  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "source"
        : event.key === "End"
          ? "evidence"
          : dockTab === "source"
            ? "evidence"
            : "source";
    setDockTab(next);
    document.getElementById(`details-tab-${next}`)?.focus();
  };
  const supply = scaleRawAmount(
    facts.totalSupply ?? undefined,
    explorerNumber(facts.decimals),
  );
  const scope = (
    <dl className="details-ws-facts">
      <div>
        <dt>{c("Token / identity", "代币 / 标识")}</dt>
        <dd>
          <span title={result?.entity.value}>
            {facts.symbol
              ? `${text(facts.symbol)} · ${text(facts.type)}`
              : result
                ? short(result.entity.value)
                : unknown}
          </span>
        </dd>
      </div>
      <div>
        <dt>{c("Network", "网络")}</dt>
        <dd>
          {result?.entity.chainId === 4663
            ? "Robinhood Chain · 4663"
            : result
              ? text(result.entity.chainId)
              : unknown}
        </dd>
      </div>
      <div>
        <dt>{c("Observed time", "观察时间")}</dt>
        <dd>{text(facts.explorerObservedAt ?? facts.observedAt)}</dd>
      </div>
      <div>
        <dt>{c("Block", "区块")}</dt>
        <dd>
          <code>{text(facts.blockNumber)}</code>
        </dd>
      </div>
      <div>
        <dt>{c("Total supply (observed)", "总供应量（已观察）")}</dt>
        <dd>
          <code>
            {supply !== null
              ? `${formatExactAmount(supply)} ${text(facts.symbol)}`
              : unknown}
          </code>
        </dd>
      </div>
    </dl>
  );
  const raw = (
    <details className="details-ws-raw">
      <summary>{c("Raw response facts", "原始响应事实")}</summary>
      <pre
        tabIndex={0}
        role="region"
        aria-label={c("Raw response facts", "原始响应事实")}
      >
        {JSON.stringify(facts, null, 2)}
      </pre>
    </details>
  );
  const evidenceRows = (limit: boolean) =>
    (limit ? findings.slice(0, 3) : findings).map((item, index) => (
      <li key={index}>
        <button
          type="button"
          aria-pressed={findingIndex === index}
          onClick={() => {
            setFindingIndex(index);
            setDockTab("evidence");
          }}
        >
          <span className="details-ws-record-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{item.fact}</span>
          <span aria-hidden>→</span>
        </button>
      </li>
    ));

  return (
    <>
      <div className="details-ws-layout">
        <nav
          className="details-ws-nav"
          aria-label={c("Research sections", "研究分区")}
        >
          <h1>
            <ArrowLeft size={15} aria-hidden />
            {c("Detailed research", "详细研究")}
          </h1>
          {sections.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
            >
              <Icon size={16} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <div className="details-ws-center" aria-busy={loading}>
          {loading && (
            <section
              className="details-ws-panel details-ws-empty"
              role="status"
            >
              <Search size={22} aria-hidden />
              <h2>{c("Reading public evidence…", "正在读取公开证据…")}</h2>
              <p>
                {c(
                  "Values remain unknown until the lookup completes.",
                  "查询完成前，数值保持未知。",
                )}
              </p>
            </section>
          )}
          {!result && !loading && (
            <section className="details-ws-panel details-ws-empty">
              <Search size={24} aria-hidden />
              <h2>
                {error
                  ? c("Evidence unavailable", "证据不可用")
                  : c("Start with a public identifier", "从公开标识开始")}
              </h2>
              <p>
                {error
                  ? c(
                      "Review the lookup error above and try again. No result is inferred from a failed read.",
                      "查看上方的查询错误后重试。不会根据读取失败推断结果。",
                    )
                  : c(
                      "Paste a token, contract, wallet or transaction above, choose a question, then run the lookup.",
                      "在上方粘贴代币、合约、钱包或交易标识，选择问题，然后运行查询。",
                    )}
              </p>
              <p className="details-ws-note">
                {c(
                  "Findings, sources and exact scope appear here. Nothing is queried automatically.",
                  "发现、来源和确切范围显示在此处。不会自动查询。",
                )}
              </p>
            </section>
          )}
          {saved}
          {result && (
            <>
              {section === "findings" && (
                <>
                  <section
                    className="details-ws-finding"
                    aria-labelledby="details-finding-title"
                  >
                    <div className="details-ws-panel-head">
                      <h2 id="details-finding-title">
                        {result.entity.type === "token"
                          ? c("Holder concentration", "持有者集中度")
                          : c("Research findings", "研究发现")}
                      </h2>
                      <span className="details-ws-badge">
                        {c("Finding", "发现")}
                      </span>
                    </div>
                    <p>
                      {result.entity.type === "token"
                        ? c(
                            "Reported wallet share, with burn addresses and pools kept separate.",
                            "报告的钱包占比，销毁地址与池单独列出。",
                          )
                        : c(
                            "Findings for the exact public identity you requested.",
                            "您查询的确切公开标识的发现。",
                          )}
                    </p>
                    <div className="details-ws-observation details-ws-panel">
                      <div className="details-ws-main-value">
                        <span>
                          {result.entity.type === "token"
                            ? c("Top 10 wallets", "前十大钱包")
                            : c("Entity type", "实体类型")}
                        </span>
                        <output>
                          {result.entity.type === "token"
                            ? concentration
                            : result.entity.type === "transaction"
                              ? c("Transaction", "交易")
                              : result.entity.type === "contract"
                                ? c("Contract", "合约")
                                : result.entity.type === "wallet"
                                  ? c("Wallet", "钱包")
                                  : c("Public record", "公开记录")}
                        </output>
                        <span>
                          {result.entity.type === "token"
                            ? c(
                                "of total supply · excludes pools and burns",
                                "占总供应量 · 不含池和销毁地址",
                              )
                            : coverage}
                        </span>
                      </div>
                      {scope}
                    </div>
                    <p className="details-ws-note">
                      <Info size={15} aria-hidden />
                      {result.entity.type === "token"
                        ? holderCoverage
                        : coverage}
                    </p>
                  </section>
                  {result.entity.type === "token" && (
                    <>
                      <HolderChart
                        facts={facts}
                        topTen={ten !== null && ten <= 100 ? ten : null}
                      />
                      <section
                        className="details-ws-panel details-ws-holders"
                        aria-labelledby="details-holders-title"
                      >
                        <div className="details-ws-panel-head">
                          <h2 id="details-holders-title">
                            {c("Top holders", "主要持有者")}
                          </h2>
                          <span>
                            {c("Reported records", "报告记录")} ·{" "}
                            {holders.length}
                          </span>
                        </div>
                        <div
                          className="details-ws-table-wrap"
                          tabIndex={0}
                          role="region"
                          aria-label={c(
                            "Exact holder observations",
                            "精确持有者观察记录",
                          )}
                        >
                          <table>
                            <thead>
                              <tr>
                                <th scope="col">#</th>
                                <th scope="col">{c("Address", "地址")}</th>
                                <th scope="col">
                                  {c("Balance", "余额")} ({text(facts.symbol)})
                                </th>
                                <th scope="col">
                                  {c("Share of supply", "供应量占比")}
                                </th>
                                <th scope="col">{c("Type", "类型")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {holders.map((row, index) => (
                                <tr key={`${row.address}:${index}`}>
                                  <td>{index + 1}</td>
                                  <td>
                                    <div className="details-ws-address-cell">
                                      <Link
                                        className="details-ws-address"
                                        title={row.address}
                                        to={workspaceLink(
                                          "/research/details",
                                          row.address,
                                        )}
                                        onClick={(event) => {
                                          if (
                                            event.button === 0 &&
                                            !event.metaKey &&
                                            !event.ctrlKey &&
                                            !event.shiftKey &&
                                            !event.altKey
                                          ) {
                                            event.preventDefault();
                                            onPivot(row.address);
                                          }
                                        }}
                                      >
                                        {short(row.address)}
                                      </Link>
                                      <CopyAddress value={row.address} />
                                    </div>
                                  </td>
                                  <td>
                                    <code>{unknown}</code>
                                  </td>
                                  <td>
                                    <code>{row.shareText ?? unknown}</code>
                                  </td>
                                  <td>
                                    {row.classification === "burn"
                                      ? c("Burn address", "销毁地址")
                                      : row.classification === "pool"
                                        ? c("Pool", "池")
                                        : row.classification === "contract"
                                          ? c("Contract", "合约")
                                          : unknown}
                                    {row.label && (
                                      <small>
                                        {visibleTokenText(row.label)}
                                      </small>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {!holders.length && (
                          <p className="details-ws-note">{holderCoverage}</p>
                        )}
                        <dl className="details-ws-support">
                          <div>
                            <dt>{c("Burned supply", "已销毁供应量")}</dt>
                            <dd>
                              {facts.holderCoverage === "unavailable"
                                ? unknown
                                : percent(shares.burned)}
                            </dd>
                          </div>
                          <div>
                            <dt>{c("Pool share", "池占比")}</dt>
                            <dd>
                              {facts.holderCoverage === "unavailable"
                                ? unknown
                                : percent(facts.liquidityPoolShare)}
                            </dd>
                          </div>
                          <div>
                            <dt>{c("Holder balances", "持有者余额")}</dt>
                            <dd>{c("Not supplied", "未提供")}</dd>
                          </div>
                        </dl>
                      </section>
                    </>
                  )}
                  <details
                    className="details-ws-panel details-ws-evidence"
                    open={result.entity.type !== "token" || undefined}
                  >
                    <summary>
                      {c("Linked evidence", "关联证据")} · {findings.length}
                    </summary>
                    <div className="details-ws-panel-head">
                      <h2 id="details-evidence-title">
                        {c("Linked evidence", "关联证据")}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setSection("sources")}
                      >
                        {c("All sources →", "全部来源 →")}
                      </button>
                    </div>
                    {findings.length ? (
                      <ul className="details-ws-evidence-list">
                        {evidenceRows(true)}
                      </ul>
                    ) : (
                      <p>
                        {c(
                          "No structured findings supplied. Consult the full answer and source records below.",
                          "未提供结构化发现。请查看下方完整回答和来源记录。",
                        )}
                      </p>
                    )}
                    {findings.length > 3 && (
                      <details>
                        <summary>
                          {c("All structured findings", "全部结构化发现")} ·{" "}
                          {findings.length}
                        </summary>
                        <ul className="details-ws-evidence-list">
                          {evidenceRows(false)}
                        </ul>
                      </details>
                    )}
                  </details>
                  <section
                    className="details-ws-panel details-ws-receipts"
                    aria-labelledby="details-timeline-title"
                  >
                    <div className="details-ws-panel-head">
                      <h2 id="details-timeline-title">
                        {c("Source read timeline", "来源读取时间线")}
                      </h2>
                      <span>
                        {c(
                          "Read receipts, not holder history",
                          "读取记录，非持有者历史",
                        )}
                      </span>
                    </div>
                    <ol className="details-ws-timeline">
                      {reads.slice(0, 3).map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSourceId(item.id);
                              setDockTab("source");
                            }}
                          >
                            <span>
                              {item.provider} · {item.id}
                            </span>
                            <time dateTime={item.fetchedAt}>
                              {item.fetchedAt}
                            </time>
                          </button>
                        </li>
                      ))}
                    </ol>
                    {!reads.length && (
                      <p>
                        {c(
                          "Source read times unavailable.",
                          "来源读取时间不可用。",
                        )}
                      </p>
                    )}
                    {reads.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setSection("sources")}
                      >
                        {c("Inspect all read receipts →", "查看全部读取记录 →")}
                      </button>
                    )}
                  </section>
                </>
              )}
              {section === "sources" && (
                <section className="details-ws-panel">
                  <h2>{c("Sources", "来源")}</h2>
                  <p>
                    {c(
                      "Each record keeps its own fields and read time. Select a source to inspect it in the dock.",
                      "每条记录保留各自的字段及读取时间。选择来源以在侧栏检查。",
                    )}
                  </p>
                  {sources.map((item) => (
                    <article className="details-ws-source-row" key={item.id}>
                      {sourceButton(item)}
                      <p>{item.provider}</p>
                      <time dateTime={item.fetchedAt}>
                        {item.fetchedAt || unknown}
                      </time>
                      <p>
                        <code>{item.fieldsUsed.join(" · ") || unknown}</code>
                      </p>
                    </article>
                  ))}
                  {!sources.length && (
                    <p>
                      {c(
                        "No citations supplied. Source coverage is unknown.",
                        "未提供引用。来源覆盖范围未知。",
                      )}
                    </p>
                  )}
                </section>
              )}
              {section === "contract" && (
                <section className="details-ws-panel">
                  <h2>{c("Contract and identity", "合约与标识")}</h2>
                  {scope}
                  <dl className="details-ws-facts">
                    <div>
                      <dt>
                        {c(
                          "Name / symbol (self-reported)",
                          "名称 / 符号（自行报告）",
                        )}
                      </dt>
                      <dd>
                        {text(facts.name)} / {text(facts.symbol)}
                      </dd>
                    </div>
                    <div>
                      <dt>{c("Standard", "标准")}</dt>
                      <dd>{text(facts.type)}</dd>
                    </div>
                    <div>
                      <dt>{c("Decimals", "小数位数")}</dt>
                      <dd>{text(facts.decimals)}</dd>
                    </div>
                    <div>
                      <dt>
                        {c(
                          "Total supply (token units)",
                          "总供应量（代币单位）",
                        )}
                      </dt>
                      <dd>
                        <code>
                          {supply !== null
                            ? formatExactAmount(supply)
                            : unknown}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>{c("Verified source code", "已验证源代码")}</dt>
                      <dd>{yesNo(facts.verified)}</dd>
                    </div>
                    <div>
                      <dt>{c("Proxy", "代理")}</dt>
                      <dd>{yesNo(facts.proxy)}</dd>
                    </div>
                  </dl>
                  <p className="details-ws-note">
                    {c(
                      "Verification does not establish ownership or a safety verdict. Missing metadata remains unknown.",
                      "验证不代表所有权或安全结论。缺失的元数据保持未知。",
                    )}
                  </p>
                </section>
              )}
              {section === "transfers" && (
                <section className="details-ws-panel">
                  <h2>{c("Reported recent transfers", "报告的近期转账")}</h2>
                  <p>
                    {c(
                      "Only the supplied sample. Amounts retain their token units and exact precision.",
                      "仅显示所提供样本。数量保留代币单位和精确精度。",
                    )}
                  </p>
                  <TransferChart facts={facts} />
                  {transfers.length ? (
                    <ol className="details-ws-transfers">
                      {transfers.map((row, index) => (
                        <li key={index}>
                          <div>
                            <button
                              type="button"
                              title={row.from}
                              onClick={() => onPivot(row.from)}
                            >
                              {short(row.from)}
                            </button>
                            <span aria-hidden> → </span>
                            <button
                              type="button"
                              title={row.to}
                              onClick={() => onPivot(row.to)}
                            >
                              {short(row.to)}
                            </button>
                          </div>
                          <p>
                            <code>
                              {row.amount !== null
                                ? `${row.amount} ${row.symbol || c("token units (symbol unknown)", "代币单位（符号未知）")}`
                                : c(
                                    "Token amount unavailable",
                                    "代币数量不可用",
                                  )}
                            </code>
                          </p>
                          <time dateTime={row.timestamp}>
                            {row.timestamp || unknown}
                          </time>
                          {row.transactionHash && (
                            <button
                              type="button"
                              onClick={() => onPivot(row.transactionHash!)}
                            >
                              {c("Inspect transaction →", "检查交易 →")}
                            </button>
                          )}
                          {row.rawValue && (
                            <details>
                              <summary>{c("Raw amount", "原始数量")}</summary>
                              <code>{row.rawValue}</code>
                            </details>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="details-ws-unavailable">
                      {c(
                        "No recent-transfer sample supplied. This does not establish that no transfers occurred. Transaction receipt details, when present, remain in the full answer below.",
                        "未提供近期转账样本。这不代表未发生转账。如有交易收据详情，仍保留在下方完整回答中。",
                      )}
                    </p>
                  )}
                </section>
              )}
              {section === "raw" && (
                <section className="details-ws-panel">
                  <h2>{c("Raw records", "原始记录")}</h2>
                  <p>
                    {c(
                      "Facts from this response, without inferred identities or missing fields filled in.",
                      "此响应中的事实，不推断身份或填补缺失字段。",
                    )}
                  </p>
                  {raw}
                </section>
              )}
              <details className="details-ws-panel details-ws-full-answer">
                <summary>
                  {c("Full answer & supporting facts", "完整回答与支持事实")}
                </summary>
                <AnswerCard
                  ai={{
                    ...result.answer,
                    widgets: detailedWidgets(facts, result.entity.type),
                  }}
                  onPivot={onPivot}
                  layout="answer-first"
                  eyebrow={c("Public evidence", "公开证据")}
                />
              </details>
              <details className="details-ws-panel details-ws-actions">
                <summary>
                  {c("Next questions & privacy receipt", "后续问题与隐私收据")}
                </summary>
                <div className="details-ws-existing">
                  {follow}
                  {nextQuestions}
                  {privacyReceipt}
                </div>
              </details>
            </>
          )}
        </div>
        <aside
          className="details-ws-panel details-ws-dock"
          aria-label={c("Research evidence dock", "研究证据侧栏")}
        >
          <div
            className="details-ws-tabs"
            role="tablist"
            aria-label={c("Evidence inspection", "证据检查")}
          >
            {(["source", "evidence"] as const).map((tab) => (
              <button
                key={tab}
                id={`details-tab-${tab}`}
                role="tab"
                type="button"
                aria-selected={dockTab === tab}
                aria-controls={`details-panel-${tab}`}
                tabIndex={dockTab === tab ? 0 : -1}
                onClick={() => setDockTab(tab)}
                onKeyDown={tabKeys}
              >
                {tab === "source" ? c("Source", "来源") : c("Evidence", "证据")}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id="details-panel-source"
            aria-labelledby="details-tab-source"
            hidden={dockTab !== "source"}
          >
            <h2>{c("Selected source", "选定来源")}</h2>
            {source ? (
              <>
                <div className="details-ws-selected-source">
                  <Database size={22} aria-hidden />
                  <div>
                    <span>{source.label || source.provider}</span>
                    <p>
                      {source.provider} · {source.fetchedAt}
                    </p>
                  </div>
                </div>
                <dl className="details-ws-facts">
                  <div>
                    <dt>{c("Read time", "读取时间")}</dt>
                    <dd>
                      <time dateTime={source.fetchedAt}>
                        {source.fetchedAt || unknown}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>{c("Response observed time", "响应观察时间")}</dt>
                    <dd>
                      {text(facts.explorerObservedAt ?? facts.observedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt>{c("Block height", "区块高度")}</dt>
                    <dd>
                      <code>{text(facts.blockNumber)}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>{c("Response coverage", "响应覆盖范围")}</dt>
                    <dd>{coverage}</dd>
                  </div>
                  <div>
                    <dt>{c("Excluded fields", "排除字段")}</dt>
                    <dd>{c("Not specified by this source", "此来源未说明")}</dd>
                  </div>
                </dl>
                {safeHttpUrl(source.url) && (
                  <a
                    href={safeHttpUrl(source.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    {c("Inspect source ↗", "查看来源 ↗")}
                  </a>
                )}
                <section
                  className="details-ws-contract-box"
                  aria-labelledby="details-dock-contract"
                >
                  <div className="details-ws-panel-head">
                    <h2 id="details-dock-contract">{c("Contract", "合约")}</h2>
                    {safeHttpUrl(
                      typeof facts.explorerUrl === "string"
                        ? facts.explorerUrl
                        : undefined,
                    ) && (
                      <a
                        href={safeHttpUrl(
                          typeof facts.explorerUrl === "string"
                            ? facts.explorerUrl
                            : undefined,
                        )!}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                        aria-label={c("Open contract source", "打开合约来源")}
                      >
                        <ExternalLink size={14} aria-hidden />
                      </a>
                    )}
                  </div>
                  <dl className="details-ws-facts">
                    <div>
                      <dt>{c("Token", "代币")}</dt>
                      <dd>{text(facts.symbol)}</dd>
                    </div>
                    <div>
                      <dt>{c("Address", "地址")}</dt>
                      <dd className="details-ws-address-cell">
                        <code title={result?.entity.value}>
                          {result ? short(result.entity.value) : unknown}
                        </code>
                        {result && <CopyAddress value={result.entity.value} />}
                      </dd>
                    </div>
                    <div>
                      <dt>{c("Standard", "标准")}</dt>
                      <dd>{text(facts.type)}</dd>
                    </div>
                    <div>
                      <dt>{c("Decimals", "小数位数")}</dt>
                      <dd>{text(facts.decimals)}</dd>
                    </div>
                    <div>
                      <dt>
                        {c("Total supply (observed)", "总供应量（已观察）")}
                      </dt>
                      <dd>
                        <code>
                          {supply !== null
                            ? `${formatExactAmount(supply)} ${text(facts.symbol)}`
                            : unknown}
                        </code>
                      </dd>
                    </div>
                  </dl>
                </section>
                <div className="details-ws-raw-preview">
                  <h3>{c("Raw source preview", "原始来源预览")}</h3>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label={c("Raw source preview", "原始来源预览")}
                  >
                    {JSON.stringify(
                      {
                        provider: source.provider,
                        fetchedAt: source.fetchedAt,
                        fieldsUsed: source.fieldsUsed,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
                <details className="details-ws-raw">
                  <summary>{c("Raw source record", "原始来源记录")}</summary>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label={c("Raw source record", "原始来源记录")}
                  >
                    {JSON.stringify(source, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <p>
                {c(
                  "Run a lookup to inspect its cited sources. Missing source records remain unavailable.",
                  "运行查询以检查引用来源。缺失的来源记录保持不可用。",
                )}
              </p>
            )}
          </div>
          <div
            role="tabpanel"
            id="details-panel-evidence"
            aria-labelledby="details-tab-evidence"
            hidden={dockTab !== "evidence"}
          >
            <h2>{c("Finding evidence", "发现的证据")}</h2>
            {finding ? (
              <>
                <p>{finding.fact}</p>
                <h3>{c("Linked sources", "关联来源")}</h3>
                {linked.map(sourceButton)}
                {(!linked.length ||
                  finding.sourceIds.some(
                    (id) => !sources.some((item) => item.id === id),
                  )) && (
                  <p className="details-ws-note">
                    {c(
                      "Some referenced sources are unavailable. Evidence is incomplete.",
                      "部分引用来源不可用。证据不完整。",
                    )}
                  </p>
                )}
              </>
            ) : (
              <p>
                {c(
                  "Select a linked evidence row to inspect its source references. A source is linked only when the response supplies its ID.",
                  "选择关联证据行以检查其来源引用。仅当响应提供来源标识时才建立关联。",
                )}
              </p>
            )}
          </div>
          <p className="details-ws-note">
            <Info size={15} aria-hidden />
            {c(
              "On-chain records do not establish off-chain identities. Unknown coverage is not a clean result.",
              "链上记录不能确立链外身份。未知覆盖范围不代表无异常结果。",
            )}
          </p>
          <details id="local-history" className="details-ws-history">
            <summary>{c("Encrypted local history", "加密本地历史")}</summary>
            {history}
          </details>
        </aside>
      </div>
      <p className="details-ws-footer">
        {c(
          facts.synthetic === true
            ? "Design preview · illustrative values"
            : "Read-only research · Source times retained",
          facts.synthetic === true
            ? "设计预览 · 示例数值"
            : "只读研究 · 保留来源时间",
        )}
      </p>
    </>
  );
}
