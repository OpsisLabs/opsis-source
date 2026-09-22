import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { analyzePrivate, type PrivateAnalysis } from "../private/api";
import { safeHttpUrl } from "../dashboard/adapters";
import type { ExplorerAnswerTask } from "../dashboard/types";
import {
  toFollowableWallet,
  classificationFromAddressObject,
} from "../watch/followWallet";
import ResearchIntro from "./ResearchIntro";
import { useCopy } from "./copy";
import { publicIdentity, workspaceLink, type Capabilities } from "./model";

import ReportShelf from "./ReportShelf";
import { researchReport } from "./reports";

const ContractControls = lazy(() => import("./ContractControls"));
const EvidenceMap = lazy(() => import("./EvidenceMap"));

export default function Research({
  capabilities,
}: {
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const location = useLocation();
  const [entity, setEntity] = useState(() =>
    publicIdentity(new URLSearchParams(location.search).get("entity")),
  );
  const [task, setTask] = useState<ExplorerAnswerTask>("overview");
  const [result, setResult] = useState<PrivateAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
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
    try {
      const next = await analyzePrivate(
        { entity: entity.trim(), task },
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
            if (publicIdentity(entity)) void run();
          }}
        >
          <label htmlFor="research-entity">
            {c("Public address or transaction hash", "公开地址或交易哈希")}
          </label>
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
            disabled={busy || !publicIdentity(entity)}
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
                import.meta.env.VITE_SCOUT_WATCH_ENABLED === "true" ? (
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
            {c("Detailed Explorer", "详细浏览器")}
          </Link>
          {capabilities.rwa && (
            <Link to="/rwa">
              {c("Verify a stock token or vault", "验证股票代币或金库")}
            </Link>
          )}
          {capabilities.observedTrades &&
            import.meta.env.VITE_OBSERVED_TRADES_ENABLED === "true" && (
              <Link to="/biggest-trades">
                {c("Largest observed V3 trades", "已观察到的最大 V3 交易")}
              </Link>
            )}
        </div>
      </details>
    </>
  );
}
