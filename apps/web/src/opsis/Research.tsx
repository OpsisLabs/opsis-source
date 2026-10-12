import { isWatchEnabled } from "../product/availability";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { analyzePrivate, type PrivateAnalysis } from "../private/api";
import { safeHttpUrl } from "../dashboard/adapters";
import type { ExplorerAnswerTask } from "../dashboard/types";
import {
  toFollowableWallet,
  classificationFromAddressObject,
} from "../watch/followWallet";
import ResearchIntro from "./ResearchIntro";
import { useCopy } from "./copy";
import { publicIdentity, workspaceIdentity, researchInputMatchesChoice, workspaceLink, type Capabilities } from "./model";

import { publicSession } from "./public-session";

import ReportShelf from "./ReportShelf";
import { researchReport } from "./reports";
import { receiptTransferObservations, transactionReceiptOutcome, transactionTimelineRows } from "./transactionTimeline";

const ContractControls = lazy(() => import("./ContractControls"));
const EvidenceMap = lazy(() => import("./EvidenceMap"));

export default function Research({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = workspaceIdentity("/research", location.search);
  const remembered = !incoming || incoming === publicSession.research.entity;
  const [entity, setEntity] = useState(() =>
    incoming || publicSession.research.entity,
  );
  const [task, setTask] = useState<ExplorerAnswerTask>(remembered ? publicSession.research.task : "overview");
  const [entityType, setEntityType] = useState<"unknown" | "token">(remembered ? publicSession.research.entityType : "unknown");
  const [result, setResult] = useState<PrivateAnalysis | null>(remembered ? publicSession.research.result : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const trimmedEntity = entity.trim();
  const inputMatchesChoice = researchInputMatchesChoice(trimmedEntity, entityType);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    publicSession.research = { entity: publicIdentity(entity), task, entityType, result };
  }, [entity, task, entityType, result]);
  useEffect(() => {
    if (incoming && incoming !== entity) {
      pending.current?.abort();
      // Synchronize explicit router context without initiating a lookup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEntity(incoming);
      setResult(null);
      setBusy(false);
      setError(false);
    }
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const path = workspaceLink("/research", incoming || publicSession.research.entity);
    if (`/research${location.search}` !== path) navigate(path, { replace: true });
  }, [incoming, location.search, navigate]);
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
    navigate(workspaceLink("/research", trimmedEntity), { replace: true });
    try {
      const next = await analyzePrivate(
        { entity: trimmedEntity, entityType, task },
        controller.signal,
      );
      if (!controller.signal.aborted) setResult(next);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const report = useMemo(
    () => (result ? researchReport(result) : null),
    [result],
  );
  const follow =
    result?.entity.type === "wallet"
      ? toFollowableWallet({
          address: result.entity.value,
          chainId: result.entity.chainId,
          classification: classificationFromAddressObject(result.entity.facts),
        })
      : null;
  const token =
    result?.entity.type === "token" && result.entity.chainId === 4663
      ? publicIdentity(result.entity.value)
      : "";
  return (
    <>
      <header className="opsis-heading">
        <p className="opsis-kicker">01 / {c("RESEARCH", "研究")}</p>
        <h1>{c("What does the evidence show?", "证据表明了什么？")}</h1>
        <p>
          {c(
            "Deterministic findings for a public token, wallet, contract or transaction.",
            "公开代币、钱包、合约或交易的确定性分析。",
          )}
        </p>
      </header>
      <div className="opsis-two-column">
        <form
          className="opsis-panel"
          onSubmit={(e) => {
            e.preventDefault();
            if (publicIdentity(entity) && inputMatchesChoice) void run();
          }}
        >
          <label htmlFor="research-entity">
            {c("Public address or transaction hash", "公开地址或交易哈希")}
          </label>
          <label htmlFor="research-entity-type">{c("Look up as", "查询类型")}</label>
          <select
            id="research-entity-type"
            value={entityType}
            onChange={(e) => {
              clear();
              setEntityType(e.target.value as "unknown" | "token");
            }}
          >
            <option value="unknown">{c("Auto", "自动")}</option>
            <option value="token">{c("Token", "代币")}</option>
          </select>
          <input
            id="research-entity"
            value={entity}
            onChange={(e) => {
              clear();
              setEntity(e.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
          />
          {!inputMatchesChoice && trimmedEntity.length > 0 && (
            <p role="alert" className="opsis-small">
              {entityType === "token"
                ? c("Token lookup requires a 0x contract address.", "代币查询需要 0x 合约地址。")
                : c("Enter a 0x address or transaction hash.", "请输入 0x 地址或交易哈希。")}
            </p>
          )}
          <label htmlFor="research-task">
            {c("Your question", "您的问题")}
          </label>
          <select
            id="research-task"
            value={task}
            onChange={(e) => {
              clear();
              setTask(e.target.value as ExplorerAnswerTask);
            }}
          >
            <option value="overview">{c("What is this?", "这是什么？")}</option>
            <option value="risk">
              {c(
                "Which controls and limits were found?",
                "发现了哪些控制机制和限制？",
              )}
            </option>
            <option value="activity">
              {c("What activity was observed?", "观察到了哪些活动？")}
            </option>
            <option value="evidence">
              {c("What are the sources?", "有哪些来源？")}
            </option>
          </select>
          <p className="opsis-receipt">
            {c(
              "Sends this public identifier, question selection and language to Opsis and its configured chain-data providers. No account, wallet connection, saved holdings or AI model request. Results stay in memory unless you explicitly save an encrypted observation.",
              "向 Opsis 及其配置的链上数据提供商发送此公开标识符、所选问题和语言。不涉及账户、钱包连接、已保存持仓或 AI 模型请求。除非您主动保存加密观察，否则结果仅存于内存。",
            )}
          </p>
          <button
            className="opsis-action"
            disabled={busy || !publicIdentity(entity) || !inputMatchesChoice}
          >
            {busy
              ? c("Looking up…", "正在查询…")
              : c("Run research", "运行研究")}
          </button>
        </form>
        <div aria-live="polite">
          {error && (
            <section className="opsis-panel" role="alert">
              <h2>{c("Research unavailable", "研究不可用")}</h2>
              <p>
                {c(
                  "The lookup failed or reached a provider limit. Check the identifier and retry. No findings are implied by this failure.",
                  "查询失败或达到提供商限制。请检查标识符后重试。此次失败不代表任何分析结论。",
                )}
              </p>
            </section>
          )}
          {!result && !busy && !error && (
            <ResearchIntro
              task={task}
              onSelect={(next) => {
                clear();
                setTask(next);
              }}
            />
          )}
          {busy && (
            <p role="status">
              {c("Checking public evidence…", "正在核查公开证据…")}
            </p>
          )}
          {result && (
            <section
              className="opsis-panel"
              data-testid="opsis-research-result"
            >
              <p className="opsis-kicker">
                {c("OBSERVED / PARTIAL COVERAGE", "已观察 / 部分覆盖")}
              </p>
              <h2>{result.answer.card?.title ?? result.entity.type}</h2>
              <p className="opsis-identity">
                {c("Chain", "链")} {result.entity.chainId} ·{" "}
                {result.entity.type}
                <br />
                {result.entity.value}
              </p>
              <p className="opsis-small">
                {c("Checked at", "核查时间")}:{" "}
                {result.answer.citations[0]?.fetchedAt ?? c("Unknown", "未知")}
              </p>
              <p className="opsis-result-copy">{result.answer.answer}</p>
              {result.entity.type === "transaction" && (() => {
                const rows = transactionTimelineRows(result.entity.facts);
                const receiptTransfers = receiptTransferObservations(result.entity.facts);
                const outcome = transactionReceiptOutcome(result.entity.facts.status);
                const coverage = result.entity.facts.transactionEvidenceCoverage;
                const finality = result.entity.facts.observationFinality;
                const source = result.answer.citations[0];
                const receiptSource = result.answer.citations.find((citation) => citation.fieldsUsed.includes("result.logs"));
                return (
                  <section className="opsis-panel" aria-labelledby="transaction-timeline-title" data-testid="transaction-timeline">
                    <h3 id="transaction-timeline-title">{c("Transaction observations", "交易观察")}</h3>
                    {(receiptTransfers.events.length > 0 ||
                      receiptTransfers.coverage === "complete" ||
                      receiptTransfers.coverage === "capped" ||
                      receiptTransfers.coverage === "partial") && (
                      <section className="opsis-panel" aria-labelledby="receipt-log-observations-title" data-testid="receipt-transfer-observations">
                        <h4 id="receipt-log-observations-title">{c("Receipt log observations", "收据日志观察")}</h4>
                        <p className="opsis-small">
                          {receiptTransfers.coverage === "complete"
                            ? receiptTransfers.events.length === 0
                              ? c("No matching Transfer-shaped event reported in this receipt.", "此收据未报告匹配的 Transfer 形状事件。")
                              : c("All returned receipt logs were checked for this event shape.", "已检查返回的所有收据日志是否符合此事件形状。")
                            : receiptTransfers.coverage === "capped"
                              ? c("Receipt log observations are capped; additional matching logs may be omitted.", "收据日志观察数量受限；可能省略了其他匹配日志。")
                              : receiptTransfers.coverage === "partial"
                                ? c("Some receipt logs could not be validated; coverage is partial and absence cannot be concluded.", "部分收据日志无法验证；覆盖不完整，不能据此判断事件不存在。")
                                : c("Receipt log coverage is unavailable.", "收据日志覆盖不可用。")}
                        </p>
                        {receiptTransfers.events.length > 0 && (
                          <dl>
                            {receiptTransfers.events.map((event) => (
                              <div key={`${event.logIndex}:${event.emitter}`}>
                                <dt>{c("Log index", "日志索引")}</dt>
                                <dd style={{ overflowWrap: "anywhere" }}>{event.logIndex}</dd>
                                <dt>{c("Emitter", "发出合约")}</dt>
                                <dd style={{ overflowWrap: "anywhere" }}>{event.emitter}</dd>
                                <dt>{c("From", "发送方")}</dt>
                                <dd style={{ overflowWrap: "anywhere" }}>{event.from}</dd>
                                <dt>{c("To", "接收方")}</dt>
                                <dd style={{ overflowWrap: "anywhere" }}>{event.to}</dd>
                                <dt>{c("Raw amount", "原始数量")}</dt>
                                <dd style={{ overflowWrap: "anywhere" }}>{event.rawAmount}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        <p className="opsis-small">
                          {receiptSource ? <>
                            {c("Source", "来源")}: {safeHttpUrl(receiptSource.url) ? (
                              <a href={safeHttpUrl(receiptSource.url)!} target="_blank" rel="noreferrer">{receiptSource.label}</a>
                            ) : receiptSource.label}
                            {" · "}{c("Observed", "观察时间")}: {receiptSource.fetchedAt}
                          </> : <>{c("Source", "来源")}: {c("Unknown", "未知")} · {c("Observed", "观察时间")}: {c("Unknown", "未知")}</>}
                        </p>
                        <p className="opsis-small">
                          {c(
                            "These are source-reported Transfer-shaped log observations only. They do not verify ERC-20 token movement, token identity, value, balance changes, NFT meaning or internal transfers.",
                            "这些仅是来源报告的 Transfer 形状日志观察，不能验证 ERC-20 代币转移、代币身份、价值、余额变化、NFT 含义或内部转账。",
                          )}
                        </p>
                      </section>
                    )}
                    <p className="opsis-small">
                      {c("Selected fields grouped by observation stage; this is not a complete transaction sequence.", "按观察阶段归类的部分字段；这不是完整的交易序列。")}
                    </p>
                    <p className="opsis-small">
                      {coverage === "rpc_pair_block_matched"
                        ? c("Transaction and receipt RPC evidence present", "存在交易与收据 RPC 证据")
                        : coverage === "partial"
                          ? c("Partial transaction evidence", "交易证据不完整")
                          : c("Transaction evidence coverage unknown", "交易证据覆盖情况未知")}
                      {" · "}
                      {finality === "current_not_final"
                        ? c("Current, not final", "当前观察，尚未最终确认")
                        : c("Finality unknown", "最终性未知")}
                    </p>
                    {(["submitted", "inclusion", "receipt"] as const).map((stage) => {
                      const stageRows = rows.filter((row) => row.stage === stage);
                      const stageTitle = stage === "submitted"
                        ? c("Submitted fields", "提交字段")
                        : stage === "inclusion"
                          ? c("Block inclusion", "区块收录")
                          : c("Receipt observation", "收据观察");
                      return (
                        <div key={stage}>
                          <h4>{stageTitle}</h4>
                          {stageRows.length ? (
                            <dl>
                              {stageRows.map(({ key, value }) => {
                                const label = ({
                                  from: c("Sender", "发送方"), to: c("Receiver", "接收方"),
                                  value: c("Native value", "原生价值"), status: c("Outcome", "结果"),
                                  block: c("Block number", "区块高度"), blockHash: c("Block hash", "区块哈希"),
                                  gas: c("Gas used", "已用 Gas"),
                                } as Record<string, string>)[key];
                                const display = key === "status"
                                  ? outcome === "success" ? c("Success", "成功")
                                    : outcome === "failed" ? c("Failed", "失败")
                                      : outcome === "pending" ? c("Pending", "待处理")
                                        : c("Unknown", "未知")
                                  : value;
                                return (
                                  <div key={key}>
                                    <dt>{label}</dt>
                                    <dd style={{ overflowWrap: "anywhere" }}>{display}</dd>
                                  </div>
                                );
                              })}
                            </dl>
                          ) : (
                            <p className="opsis-small">{c("No source-reported fields returned for this stage.", "此阶段未返回来源报告的字段。")}</p>
                          )}
                        </div>
                      );
                    })}
                    <p className="opsis-small">
                      {source ? <>
                        {c("Sources", "来源记录")}: {result.answer.citations.length} · {safeHttpUrl(source.url) ? (
                          <a href={safeHttpUrl(source.url)!} target="_blank" rel="noreferrer">{source.label}</a>
                        ) : source.label}
                        {" · "}{c("Observed", "观察时间")}: {source.fetchedAt}
                      </> : <>{c("Source", "来源")}: {c("Unknown", "未知")} · {c("Observed", "观察时间")}: {c("Unknown", "未知")}</>}
                    </p>
                    <p className="opsis-small">{c("These are transaction-level observations only; they do not trace internal transfers or token movements.", "这些仅是交易级观察；不会追踪内部转账或代币变动。")}</p>
                  </section>
                );
              })()}
              {result.entity.type === "contract" &&
                result.entity.facts.observation === "latest_rpc_sample" &&
                result.entity.facts.sourceCoverage === "unavailable" && (
                  <section
                    className="opsis-panel"
                    data-testid="research-rpc-coverage"
                  >
                    <p className="opsis-kicker">
                      {c("LIMITED RPC COVERAGE", "有限 RPC 覆盖")}
                    </p>
                    <p>
                      {c(
                        "Direct RPC returned code evidence. Any returned native balance is a separate latest-state sample. Contract metadata and indexed history are shown only when available. These observations are not finalized or anchored to one shared block.",
                        "直接 RPC 返回了代码证据。若返回原生余额，则该余额是独立的最新状态采样。合约元数据和索引历史仅在可用时显示。这些观察尚未最终确认，也未锚定至同一个区块。",
                      )}
                    </p>
                  </section>
                )}
              {result.entity.type === "token" &&
                result.entity.facts.metadataCoverage === "rpc_partial" && (
                  <section className="opsis-panel" data-testid="research-token-rpc-coverage">
                    <p className="opsis-kicker">{c("LIMITED RPC TOKEN SAMPLE", "有限 RPC 代币采样")}</p>
                    <p>
                      {c(
                        "Available name, symbol, decimals and supply fields are independent latest-state RPC samples, not verified identity and not anchored to one block. Holder count, transfers, verification, proxy status, sellability and indexed activity are unknown.",
                        "可用的名称、符号、小数位和供应量字段是独立的最新状态 RPC 采样，并非已验证身份，也未锚定至同一区块。持有人数量、转账、验证状态、代理状态、可售性及索引活动均未知。",
                      )}
                    </p>
                  </section>
                )}
              <Suspense fallback={null}>
                <EvidenceMap
                  key={result.entity.value}
                  findings={[
                    ...result.answer.riskNotes
                      .filter((note) => note.severity === "high")
                      .map((note) => ({
                        fact: `${note.severity}: ${note.note}`,
                        sourceIds: note.sourceIds,
                      })),
                    ...result.answer.confirmedFacts,
                  ].slice(0, 3)}
                  sources={result.answer.citations}
                />
              </Suspense>
              <p className="opsis-receipt">
                {c(
                  "Provider scope may be incomplete. Freshness and finality are unknown unless the evidence explicitly supplies them.",
                  "提供商覆盖范围可能不完整。除非证据明确提供，否则新鲜度和最终性未知。",
                )}
              </p>
              {token &&
              capabilities.exitCheck &&
              import.meta.env.VITE_EXIT_CHECK_ENABLED === "true" ? (
                <Link
                  className="opsis-action"
                  to={workspaceLink("/check", token)}
                >
                  {c("Check an amount →", "核查数量 →")}
                </Link>
              ) : follow &&
                capabilities.watch &&
                isWatchEnabled() ? (
                <Link
                  className="opsis-action"
                  to={`/watch?address=${encodeURIComponent(follow.address)}`}
                >
                  {c("Follow this public address →", "观察此公开地址 →")}
                </Link>
              ) : null}
              <details>
                <summary>
                  {c("Sources, findings and limitations", "来源、分析与限制")} (
                  {result.answer.citations.length})
                </summary>
                <ul>
                  {result.answer.riskNotes.map((note, i) => (
                    <li key={i}>
                      {note.severity}: {note.note} [{note.sourceIds.join(", ")}]
                    </li>
                  ))}
                </ul>
                <ul>
                  {result.answer.confirmedFacts.slice(3).map((fact, i) => (
                    <li key={i}>
                      {fact.fact} [{fact.sourceIds.join(", ")}]
                    </li>
                  ))}
                </ul>
                {result.answer.citations.map((source) => (
                  <p key={source.id} className="opsis-small">
                    [{source.id}]{" "}
                    {safeHttpUrl(source.url) ? (
                      <a
                        href={safeHttpUrl(source.url)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.label}
                      </a>
                    ) : (
                      source.label
                    )}{" "}
                    · {source.provider} · {source.fetchedAt}
                  </p>
                ))}
                <p className="opsis-small">{result.privacy.disclosure}</p>
              </details>
            </section>
          )}
        </div>
      </div>
      {capabilities.tokenControls &&
        /^0x[a-fA-F0-9]{40}$/.test(entity.trim()) && (
          <Suspense fallback={null}>
            <ContractControls
              key={entity.trim().toLowerCase()}
              contract={entity.trim()}
            />
          </Suspense>
        )}
      <details className="opsis-panel">
        <summary>
          {c("Save research / open saved reports", "保存研究／打开已保存报告")}
        </summary>
        <ReportShelf
          draft={report}
          onLock={clear}
          capabilities={capabilities}
        />
      </details>
      <details className="opsis-panel">
        <summary>{c("More research tools", "更多研究工具")}</summary>
        <div className="opsis-tool-links">
          <Link
            to={workspaceLink(
              "/research/details",
              result?.entity.value ?? entity,
            )}
          >
            {c("Detailed research", "详细研究")}
          </Link>
          {capabilities.rwa && (
            <Link to="/rwa">
              {c("Stock-token check", "股票代币核查")}
            </Link>
          )}
          {capabilities.observedTrades &&
            import.meta.env.VITE_OBSERVED_TRADES_ENABLED === "true" && (
              <Link to="/biggest-trades">
                {c("Big trades", "大额交易")}
              </Link>
            )}
        </div>
      </details>
    </>
  );
}
