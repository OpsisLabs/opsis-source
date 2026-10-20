import { useState } from "react";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { useCopy } from "../opsis/copy";
import type { StockGapSeries } from "../opsis/stock-gap-series";
import type { RwaVerification } from "./api";
import { gapHistogram, gapMedian } from "./history";
import {
  EmptyHistoryChart,
  RwaHistogram,
  RwaHistoryChart,
} from "./RwaHistoryChart";

export type HistoryTab =
  "overview" | "prices" | "actions" | "sources" | "documents";
type Row = StockGapSeries["observations"][number];

export default function RwaHistory({
  series,
  tab,
  result,
  importAction,
}: {
  series: StockGapSeries | null;
  tab: HistoryTab;
  result: RwaVerification | null;
  importAction: () => void;
}) {
  const c = useCopy();
  const [selected, setSelected] = useState(
    (series?.observations.length ?? 1) - 1,
  );
  const rows = series?.observations ?? [],
    row = rows[selected];
  const session = (value: Row["session"]) =>
    value === "open"
      ? c("Open", "开市")
      : value === "closed"
        ? c("Closed", "休市")
        : c("Unknown", "未知");
  const action = (value: Row["corporateAction"]) => {
    const state =
      value.state === "effective"
        ? c("Effective", "已生效")
        : value.state === "announced"
          ? c("Announced", "已公布")
          : value.state === "none_reported"
            ? c("None reported", "报告无行动")
            : c("Unknown", "未知");
    return value.description ? `${state} · ${value.description}` : state;
  };
  return (
    <div className="rwa-ws-history">
      {(tab === "overview" || tab === "prices") && (
        <>
          <section
            className="rwa-ws-panel rwa-ws-line-panel"
            aria-labelledby="rwa-gap-title"
          >
            <div className="rwa-ws-section-head">
              <h2 id="rwa-gap-title">
                {c("Token-to-reference gap (%)", "代币与参考价差（%）")}{" "}
                <Info size={14} aria-hidden="true" />
              </h2>
              <span className="rwa-ws-date-range">
                {series
                  ? `${rows[0].timestamp.slice(0, 10)} — ${rows.at(-1)!.timestamp.slice(0, 10)} · UTC`
                  : c("History unavailable", "历史不可用")}
              </span>
            </div>
            {series ? (
              <>
                <RwaHistoryChart
                  series={series}
                  selected={selected}
                  select={setSelected}
                />
                <div className="rwa-ws-chart-footer">
                  <div className="rwa-ws-legend">
                    <span>
                      <i />
                      {c("Observed gap", "观察价差")}
                    </span>
                    <span>
                      <i className="rwa-legend-break" />
                      {c("Interval break", "间隔断线")}
                    </span>
                    <span>
                      <i className="rwa-legend-action" />
                      {c("Corporate action", "公司行动")}
                    </span>
                  </div>
                  <div className="rwa-ws-observation-controls">
                    <button
                      type="button"
                      aria-label={c("Previous observation", "上一个观察值")}
                      disabled={selected === 0}
                      onClick={() => setSelected(Math.max(0, selected - 1))}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <label>
                      <span>
                        {c("Observation", "观察值")} {selected + 1} /{" "}
                        {rows.length}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={rows.length - 1}
                        step={1}
                        value={selected}
                        aria-label={c("Selected observation", "选定观察值")}
                        aria-valuetext={`${row.timestamp}: ${row.gapPercent}%`}
                        onChange={(event) =>
                          setSelected(Number(event.target.value))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={c("Next observation", "下一个观察值")}
                      disabled={selected === rows.length - 1}
                      onClick={() =>
                        setSelected(Math.min(rows.length - 1, selected + 1))
                      }
                    >
                      <ArrowRight size={15} />
                    </button>
                    <span className="rwa-ws-selected-value">
                      {row.gapPercent}%
                    </span>
                  </div>
                </div>
                <div
                  className="rwa-ws-selection"
                  role="status"
                  data-testid="rwa-gap-selection"
                >
                  <span>
                    {row.timestamp} · <strong>{row.gapPercent}%</strong> ·{" "}
                    {session(row.session)}
                  </span>
                  <span>
                    {c("Corporate action", "公司行动")}:{" "}
                    {action(row.corporateAction)}
                  </span>
                  <span>
                    {c("Source age", "来源时距")}:{" "}
                    {row.oracleAgeMinutes === null
                      ? c(
                          "Unavailable for underlying references",
                          "标的参考价无时距数据",
                        )
                      : `${row.oracleAgeMinutes} ${c("minutes", "分钟")}`}
                  </span>
                </div>
              </>
            ) : (
              <>
                <EmptyHistoryChart importAction={importAction} />
                <p className="rwa-ws-age-empty">
                  {c(
                    "Data source age · unavailable without historical timestamps",
                    "数据来源时距 · 缺少历史时间戳，无法提供",
                  )}
                </p>
              </>
            )}
          </section>
          <section className="rwa-ws-panel rwa-ws-distribution-panel">
            <div className="rwa-ws-section-head">
              <h2>{c("Gap distribution", "价差分布")}</h2>
              <span>
                {series
                  ? c("Imported sample · count", "导入样本 · 计数")
                  : c("No paired observations", "无配对观察值")}
              </span>
            </div>
            {series ? (
              <RwaHistogram series={series} />
            ) : (
              <EmptyHistoryChart histogram importAction={importAction} />
            )}
          </section>
        </>
      )}
      {tab === "actions" && (
        <section className="rwa-ws-panel">
          <h2>{c("Corporate actions", "公司行动")}</h2>
          <p>
            {c(
              "File-stated events are unverified. Snapshot actions are listed separately and never joined to imported history by symbol. Process dates are not necessarily payment dates. Missing events do not establish a complete schedule.",
              "文件声称的事件未经验证。快照行动单独列出，绝不按简称与导入历史关联。处理日期不一定是支付日期。事件缺失不代表完整日程。",
            )}
          </p>
          {series && (
            <>
              <h3>{c("Imported event markers", "导入事件标记")}</h3>
              {rows
                .filter(
                  (point) =>
                    point.corporateAction.state === "announced" ||
                    point.corporateAction.state === "effective",
                )
                .map((point) => (
                  <article className="rwa-ws-action" key={point.timestamp}>
                    <time>{point.timestamp}</time>
                    <p>{action(point.corporateAction)}</p>
                  </article>
                ))}
              {!rows.some(
                (point) =>
                  point.corporateAction.state === "announced" ||
                  point.corporateAction.state === "effective",
              ) && (
                <p>
                  {c(
                    "No announced or effective events supplied.",
                    "未提供已公布或已生效的事件。",
                  )}
                </p>
              )}
            </>
          )}
          {result?.stock && (
            <>
              <h3>{c("Lookup snapshot actions", "查询快照行动")}</h3>
              {result.stock.corporateActions.map((event) => (
                <article className="rwa-ws-action" key={event.id}>
                  <h3>
                    {event.type} · {event.status}
                  </h3>
                  <p>
                    {event.processDate ?? c("Date unsupplied", "未提供日期")}
                  </p>
                  <p>{event.detail}</p>
                </article>
              ))}
              {result.stock.corporateActions.length === 0 && (
                <p>
                  {c(
                    "No snapshot actions returned; coverage may be incomplete.",
                    "未返回快照行动；覆盖可能不完整。",
                  )}
                </p>
              )}
            </>
          )}
        </section>
      )}
      {tab === "sources" && (
        <section className="rwa-ws-panel">
          <h2>{c("Sources and read times", "来源及读取时间")}</h2>
          {series && (
            <>
              <h3>
                {c(
                  "Imported series · unverified source",
                  "导入序列 · 未验证来源",
                )}
              </h3>
              <p>{series.sourceName}</p>
              <p>
                {series.observedAt} · {series.quoteCurrency}
              </p>
              <p className="rwa-ws-mono">
                {series.instrument.chainId} · {series.instrument.address}
              </p>
            </>
          )}
          {result?.sources.map((source) => (
            <article className="rwa-ws-source" key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.provider} ↗
              </a>
              <p>{source.description}</p>
              <time>{source.fetchedAt}</time>
            </article>
          ))}
        </section>
      )}
      {tab === "documents" && (
        <section className="rwa-ws-panel">
          <h2>{c("Backing documents", "支持资产文件")}</h2>
          <p>
            {c(
              "Document retrieval unavailable. This lookup does not return prospectuses or custody documents. Issuer statements are not an independent custody audit.",
              "文件检索不可用。此查询不返回招股说明书或托管文件。发行方声明并非独立托管审计。",
            )}
          </p>
          {result?.stock?.termsUrl && (
            <a
              href={result.stock.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c("Issuer terms", "发行方条款")} ↗
            </a>
          )}
        </section>
      )}
      {series && (tab === "overview" || tab === "prices") && (
        <>
          <details
            className="rwa-ws-panel rwa-ws-exact"
            id="rwa-observations"
            open={tab === "prices"}
          >
            <summary>
              {c("Exact observations", "精确观察值")} · {rows.length}
            </summary>
            <div
              className="rwa-ws-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={c("Paired observations", "配对观察")}
            >
              <table>
                <caption>
                  {c(
                    "All imported inputs, in the stated quote currency. Select a date to inspect its chart point.",
                    "全部导入输入，单位为声明的报价货币。选择日期以检查图中对应观察点。",
                  )}
                </caption>
                <thead>
                  <tr>
                    {[
                      c("Observed at (UTC)", "观察时间（UTC）"),
                      c("Token price", "代币价格"),
                      c("Reference price", "参考价格"),
                      c("Multiplier", "乘数"),
                      c("Gap (%)", "价差（%）"),
                      c("Session", "时段"),
                      c("Corporate action", "公司行动"),
                      c("Oracle age (min)", "预言机时距（分钟）"),
                    ].map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((point, index) => (
                    <tr
                      key={point.timestamp}
                      aria-current={selected === index ? "true" : undefined}
                    >
                      <th scope="row">
                        <button
                          type="button"
                          onClick={() => setSelected(index)}
                        >
                          {point.timestamp}
                        </button>
                      </th>
                      <td>{point.dexPrice}</td>
                      <td>{point.referencePrice}</td>
                      <td>
                        {point.multiplier ?? c("Not applicable", "不适用")}
                      </td>
                      <td>{point.gapPercent}</td>
                      <td>{session(point.session)}</td>
                      <td>{action(point.corporateAction)}</td>
                      <td>
                        {point.oracleAgeMinutes ??
                          c("Not applicable", "不适用")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="rwa-ws-panel">
            <summary>
              {c("Distribution counts and median", "分布计数及中位数")}
            </summary>
            <p>
              {c("Median", "中位数")}: {gapMedian(series)}%.{" "}
              {c(
                "Thirty equal-width bins; the final bin includes its upper edge. Counts describe only the imported sample.",
                "三十个等宽区间；最后一个包含上界。计数仅描述导入样本。",
              )}
            </p>
            <div
              className="rwa-ws-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={c("Distribution counts", "分布计数")}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">
                      {c("Gap interval (%)", "价差区间（%）")}
                    </th>
                    <th scope="col">{c("Count", "计数")}</th>
                  </tr>
                </thead>
                <tbody>
                  {gapHistogram(series, 30).map((bin, index) => (
                    <tr key={index}>
                      <th scope="row">
                        {bin.from.toFixed(4)} – {bin.to.toFixed(4)}
                      </th>
                      <td>{bin.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="rwa-ws-panel">
            <summary>{c("Import limitations", "导入限制")}</summary>
            <p>
              {c(
                "Local import · unverified source · not live. Source, instrument match, sessions and corporate-action basis are supplied by the file. Percentages are truncated to four decimals; costs, execution and trading eligibility are excluded. Lines connect adjacent observed points only when their spacing is no more than three times the median observed interval. This display rule does not establish an expected cadence or missing coverage. Oracle-age heights show relative age, not a freshness verdict.",
                "本地导入 · 来源未经验证 · 非实时。来源、标的匹配、时段及公司行动基准由文件提供。百分比截断至四位小数；不含成本、执行或交易资格。仅当相邻观察值的间距不超过观察间隔中位数三倍时连线。此显示规则不建立预期频率或缺失覆盖率。预言机时距高度表示相对时距，不代表新鲜度判断。",
              )}
            </p>
            {series.warnings.includes("session_unknown") && (
              <p>
                {c(
                  "At least one market session is unknown.",
                  "至少有一个市场时段未知。",
                )}
              </p>
            )}
            {series.warnings.includes("corporate_action_state_unknown") && (
              <p>
                {c(
                  "At least one corporate-action state is unknown; observations across actions may not be comparable.",
                  "至少有一个公司行动状态未知；行动前后的观察值可能无法比较。",
                )}
              </p>
            )}
          </details>
        </>
      )}
      <details className="rwa-ws-format rwa-ws-panel">
        <summary>{c("Import format and limits", "导入格式及限制")}</summary>
        <p>
          {c(
            "Uses the existing Lab stock-gap format: schemaVersion 1; instrument {chainId: 4663, address, symbol}; quoteCurrency and matching referenceQuoteCurrency (USD or USDG); referenceType underlying or oracle; sourceName; observedAt; 2–730 observations. Each row needs timestamp, dexPrice, referencePrice, session (open, closed, unknown). Underlying rows need multiplier. Oracle rows need oracleObservedAt and must omit multiplier. Optional corporateAction has state none_reported, announced, effective or unknown; announced/effective require description. Timestamps use ISO UTC. USDG is not assumed to equal USD.",
            "使用现有量化实验室股票价差格式：schemaVersion 为 1；instrument 包含 chainId: 4663、address、symbol；quoteCurrency 与 referenceQuoteCurrency 一致（USD 或 USDG）；referenceType 为 underlying 或 oracle；sourceName；observedAt；2–730 个 observations。每行需 timestamp、dexPrice、referencePrice、session（open、closed、unknown）。标的价格行需 multiplier。预言机行需 oracleObservedAt，且不可包含 multiplier。可选 corporateAction 的 state 为 none_reported、announced、effective 或 unknown；announced/effective 需 description。时间戳使用 ISO UTC。USDG 不被视为 USD。",
          )}
        </p>
        <p>
          {c(
            "File contents remain in memory and are never sent to lookup providers. Imported identity is not proof of a registry match. No observation cadence or expected sample count is supplied, so missing-sample coverage cannot be calculated.",
            "文件内容仅保留在内存中，不会发送给查询提供商。导入标识不证明注册表匹配。文件未提供观察频率或预期样本数，因此无法计算缺失样本覆盖率。",
          )}
        </p>
      </details>
    </div>
  );
}
