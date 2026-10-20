import { useId, useState } from "react";
import type { VaultConversation, VaultConversationTurn } from "../vault/types";
import {
  formatCheckUnits,
  parseSavedCheck,
  type SavedCheck,
} from "../vault/saved-check";
import {
  compareSavedChecks,
  type CheckComparison,
  type ComparisonReason,
  type ComparisonRow,
} from "./saved-checks";
import { useCopy } from "./copy";
import "./saved-check-comparison.css";

export default function SavedCheckComparison({
  current,
  candidates,
  pending = false,
}: {
  current: VaultConversationTurn;
  candidates: VaultConversation[];
  pending?: boolean;
}) {
  const c = useCopy(),
    selectId = useId();
  const [selected, setSelected] = useState("");
  const earlier = candidates
    .find((candidate) => candidate.id === selected)
    ?.turns.at(-1);
  const comparison = earlier
    ? compareSavedChecks(earlier.comparison, current.comparison)
    : null;
  return (
    <section
      className="saved-check-comparison"
      aria-label={c("Saved-check comparison", "已保存核查对比")}
    >
      <h3>
        {c(
          "What changed between these checks?",
          "两次核查之间发生了什么变化？",
        )}
      </h3>
      <p>
        {c(
          "Compare saved observations on this device. Nothing is fetched or uploaded. These are historical results, not current quotes.",
          "在此设备上对比已保存的观测。不获取或上传任何内容。这些是历史结果，不是当前报价。",
        )}
      </p>
      {!current.comparison && (
        <p>
          {c(
            "This report has no typed comparison evidence. It remains readable; save two new checks with comparisons enabled to compare them.",
            "此报告没有用于对比的结构化证据。它仍可阅读；启用对比后保存两次新的核查即可进行对比。",
          )}
        </p>
      )}
      <label htmlFor={selectId}>
        {c(
          "Compare with an earlier saved check",
          "选择较早的已保存核查进行对比",
        )}
      </label>
      <select
        id={selectId}
        className="watch-input"
        value={selected}
        disabled={pending || !candidates.length}
        onChange={(event) => setSelected(event.target.value)}
      >
        <option value="">
          {c("Choose a saved check", "选择已保存的核查")}
        </option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.title} · {candidate.updatedAt}
          </option>
        ))}
      </select>
      {!candidates.length && (
        <p>
          {c(
            "Save another observation to compare two checks.",
            "再保存一条观测，即可对比两次核查。",
          )}
        </p>
      )}
      {comparison && (
        <ComparisonResult
          comparison={comparison}
          earlier={earlier!}
          later={current}
        />
      )}
    </section>
  );
}

export function ComparisonResult({
  comparison,
  earlier,
  later,
}: {
  comparison: CheckComparison;
  earlier: VaultConversationTurn;
  later: VaultConversationTurn;
}) {
  const c = useCopy();
  const reasons: Record<ComparisonReason, [string, string]> = {
    legacy: [
      "A report lacks typed comparison evidence. Older reports remain readable; no values are inferred from their text.",
      "某份报告缺少结构化对比证据。旧报告仍可阅读；不会从文字中推断数值。",
    ],
    invalid: [
      "The saved evidence is invalid or unsupported. No change was calculated.",
      "已保存证据无效或不受支持。未计算变化。",
    ],
    different_subject: [
      "These checks describe different tokens or chains.",
      "这些核查对应不同的代币或链。",
    ],
    different_tool: [
      "Choose two Research observations or two Trade Checks.",
      "请选择两条研究观测，或两次交易核查。",
    ],
    different_source: [
      "The source or source scope changed. This is not a measured market change.",
      "来源或来源范围发生变化。这不是测得的市场变化。",
    ],
    different_units: [
      "Token decimals or the output asset differ. The units cannot be compared.",
      "代币精度或输出资产不同，无法比较其单位。",
    ],
    different_size: [
      "The entered amounts differ. Run and save a check at the same amount to compare outputs.",
      "输入数量不同。请以相同数量运行并保存核查，才能比较输出。",
    ],
    different_pool: [
      "The selected pool or fee tier changed. This is a different quote context.",
      "所选池或费率层发生变化，报价条件不同。",
    ],
    different_coverage: [
      "Available coverage changed. Missing evidence is not a zero value or a market move.",
      "可用覆盖范围发生变化。缺失证据不代表零值或市场变化。",
    ],
    nonchronological: [
      "Choose an earlier observation. Save order does not establish evidence order.",
      "请选择较早的观测。保存顺序并不代表证据的时间顺序。",
    ],
    same_observation: [
      "These checks reuse the same observation time or block. They do not establish a later change.",
      "这些核查使用相同的观测时间或区块，无法证明之后的变化。",
    ],
    conflicting_anchor: [
      "The block identities conflict. No change was calculated.",
      "区块标识冲突。未计算变化。",
    ],
  };
  const labels: Record<ComparisonRow["key"], [string, string]> = {
    holders: ["Reported holder addresses", "报告的持有人地址数"],
    concentration: [
      "Largest holder share, excluding identified pools and burn addresses",
      "最大持有人占比，不含已识别的池和销毁地址",
    ],
    verified: ["Explorer source verification", "浏览器源码验证"],
    proxy: ["Explorer proxy finding", "浏览器代理检测结果"],
    quotedOutput: ["Observed output", "观测输出"],
    impact: ["Price impact (basis points)", "价格影响（基点）"],
  };
  const value = (v: ComparisonRow["before"]) =>
    v === null
      ? c("Unknown", "未知")
      : typeof v === "boolean"
        ? v
          ? c("Reported true", "报告为真")
          : c("Reported false", "报告为假")
        : v;
  const status = (row: ComparisonRow) =>
    row.status === "changed"
      ? c("Changed", "已变化")
      : row.status === "unchanged"
        ? c("Unchanged within this evidence", "在此证据范围内未变化")
        : c("Unknown / not comparable", "未知／无法比较");
  return (
    <div data-testid="saved-check-comparison-result">
      <div className="saved-check-contexts">
        <EvidenceContext
          check={parseSavedCheck(earlier.comparison)}
          label={c("Earlier check", "较早核查")}
        />
        <EvidenceContext
          check={parseSavedCheck(later.comparison)}
          label={c("Selected check", "所选核查")}
        />
      </div>
      {comparison.state === "unavailable" ? (
        <p role="status">{c(...reasons[comparison.reason])}</p>
      ) : (
        <>
          <div
            className="saved-check-table"
            role="region"
            aria-label={c("Before and after values", "前后数值")}
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">{c("Finding", "发现")}</th>
                  <th scope="col">{c("Earlier", "较早")}</th>
                  <th scope="col">{c("Selected", "所选")}</th>
                  <th scope="col">{c("Change", "变化")}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row.key} data-state={row.status}>
                    <th scope="row">{c(...labels[row.key])}</th>
                    <td>
                      {value(row.before)}
                      {row.key === "concentration" && row.before !== null
                        ? "%"
                        : ""}
                    </td>
                    <td>
                      {value(row.after)}
                      {row.key === "concentration" && row.after !== null
                        ? "%"
                        : ""}
                    </td>
                    <td>
                      {status(row)}
                      {row.delta !== null && (
                        <>
                          <br />
                          {row.delta}
                          {row.unit === "percentage_points"
                            ? c(" percentage points", " 个百分点")
                            : row.unit === "bps"
                              ? c(" basis points", " 个基点")
                              : ""}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {comparison.after.kind === "research" && (
            <p className="opsis-small">
              {c(
                "Concentration uses the reported sample and rounding; a changed or missing sample size stays unknown. Addresses are not people. Research sources can be captured at different blocks. A change does not establish its cause or a safety verdict.",
                "集中度采用来源报告的样本和舍入值；样本数量改变或缺失时保持未知。地址不等于人数。研究来源可能采集于不同区块。变化不能证明其原因，也不是安全结论。",
              )}
            </p>
          )}
        </>
      )}
      {later.comparison?.kind === "check" && (
        <p className="opsis-small">
          {c(
            "Saved quotes keep their original expiry. Gas is excluded; execution and saleability are not proven. Choose a recheck link to request new data yourself.",
            "已保存报价保留原到期时间。不含网络费；不证明可成交或可出售。请自行选择重新核查链接来请求新数据。",
          )}
        </p>
      )}
    </div>
  );
}

function EvidenceContext({
  check,
  label,
}: {
  check: SavedCheck | null;
  label: string;
}) {
  const c = useCopy();
  return (
    <div>
      <h4>{label}</h4>
      {!check ? (
        <p>{c("Typed evidence unavailable", "结构化证据不可用")}</p>
      ) : (
        <dl>
          <dt>{c("Token / chain", "代币／链")}</dt>
          <dd>
            {check.identifier} · {check.chainId}
          </dd>
          <dt>{c("Observed at", "观测时间")}</dt>
          <dd>{check.observedAt}</dd>
          <dt>{c("Sources", "来源")}</dt>
          <dd>{check.providers.join(", ")}</dd>
          {check.kind === "check" ? (
            <>
              <dt>{c("Input amount", "输入数量")}</dt>
              <dd>{formatCheckUnits(check.inputRaw, check.inputDecimals)}</dd>
              <dt>{c("Output token", "输出代币")}</dt>
              <dd>
                {check.output.address} · {c("Decimals", "小数位数")}:{" "}
                {check.output.decimals}
              </dd>
              <dt>{c("Pool / fee tier", "池／费率层")}</dt>
              <dd>
                {check.pool
                  ? `${check.pool.address} · ${check.pool.fee}`
                  : c("Unavailable", "不可用")}
              </dd>
              <dt>{c("Block (not final)", "区块（非最终）")}</dt>
              <dd>
                {check.anchor.height} · {check.anchor.hash}
              </dd>
              <dt>{c("Original expiry", "原到期时间")}</dt>
              <dd>{check.expiresAt}</dd>
            </>
          ) : (
            <>
              <dt>{c("Holder sample size", "持有人样本数量")}</dt>
              <dd>{check.holdersAnalyzed ?? c("Unknown", "未知")}</dd>
              <dt>{c("Holder coverage", "持有人覆盖")}</dt>
              <dd>
                {check.holderCoverage === "top_holders"
                  ? c("Top-holder sample", "主要持有人样本")
                  : c("Unavailable", "不可用")}
              </dd>
              <dt>{c("Activity coverage", "活动覆盖")}</dt>
              <dd>
                {check.activityCoverage === "indexed_window"
                  ? c("Indexed window", "已索引窗口")
                  : c("Unavailable", "不可用")}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
