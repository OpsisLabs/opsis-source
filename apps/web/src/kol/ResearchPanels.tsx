import { lazy, Suspense, useState } from "react";
import { ArrowUpRight, Check, Plus, X } from "lucide-react";
import { profiles, profileFor, type Call } from "./model";
import {
  profilePerformance,
  formatPercent,
  scoringSummary,
  priceEdition,
  type ScoringFilter,
} from "./performance";
import { activityDays, distribution, topicCounts } from "./research";
const PerformanceChart = lazy(() => import("./PerformanceChart"));
type Translate = (en: string, zh: string) => string;

export function ScoringSummary({
  items,
  active,
  onSelect,
  L,
}: {
  items: Call[];
  active: ScoringFilter;
  onSelect: (filter: ScoringFilter) => void;
  L: Translate;
}) {
  const counts = scoringSummary(items);
  const metrics = [
    {
      id: "all",
      label: L("Posts tracked", "已收集帖子"),
      count: counts.tracked,
      hint: L("All selected source posts", "全部选定来源帖子"),
    },
    {
      id: "eligible",
      label: L("Eligible calls", "符合条件的观点"),
      count: counts.eligible,
      hint: L("Verified directional asset legs", "已核验方向和资产"),
    },
    {
      id: "pending",
      label: L("Awaiting results", "等待结果"),
      count: counts.pending,
      hint: L(
        "Seven-day window still open at capture",
        "收集时七日观察尚未结束",
      ),
    },
    {
      id: "scored",
      label: L("Scored calls", "已评分观点"),
      count: counts.scored,
      hint: L("Complete, validated 7-day prices", "完整且已验证的七日价格"),
    },
  ] as const;
  return (
    <section
      className="kol-scoring-summary"
      aria-label={L("Scoring coverage", "评分覆盖")}
    >
      <div className="kol-scoring-counts">
        {metrics.map((metric) => (
          <button
            key={metric.id}
            data-status={metric.id}
            aria-pressed={active === metric.id}
            onClick={() => onSelect(metric.id)}
          >
            <span>{metric.label}</span>
            <strong>{metric.count}</strong>
            <small>{metric.hint}</small>
          </button>
        ))}
      </div>
      <details className="kol-scoring-explanation">
        <summary>
          {L("Why aren't all posts scored?", "为什么不是所有帖子都有评分？")}
        </summary>
        <p>
          {L(
            `${counts.eligible} of ${counts.tracked} tracked posts qualify for a directional paper checkpoint. Of those, ${counts.scored} are scored and ${counts.pending} are awaiting the full seven-day window. Tracking a post does not make it a trade call.`,
            `${counts.tracked} 篇已收集帖子中，${counts.eligible} 条符合方向性模拟观察条件，其中 ${counts.scored} 条已评分，${counts.pending} 条仍等待完整七日观察。收集帖子不代表将其认定为交易观点。`,
          )}
        </p>
        <p>
          {L(
            `${counts.excluded} posts are outside the current scoring set: neutral commentary, contradictory or unverified conditions, incomplete source context, or unresolved asset identity. Clear bearish views use a separately identified paper-short leg. Each receipt explains its own exclusion.`,
            `${counts.excluded} 篇不在当前评分范围：中性评论、矛盾或未经核验的条件、原文不完整、或资产身份未确认。明确的看空观点使用单独标注的模拟做空方向。每条凭据均说明具体原因。`,
          )}
        </p>
        {counts.unavailable > 0 && (
          <p role="status">
            {L(
              `${counts.unavailable} eligible calls lack valid price evidence. They are neither pending windows nor zero returns.`,
              `${counts.unavailable} 条符合条件的观点缺少有效价格证据；不属于等待期，也不代表零收益。`,
            )}
          </p>
        )}
        <div>
          <button
            className="kol-text-button"
            onClick={() => onSelect("unscored")}
          >
            {L("Inspect unscored posts", "查看未评分帖子")}{" "}
            <ArrowUpRight size={14} />
          </button>
          <small>
            {L("Dated edition", "历史版本")} ·{" "}
            {priceEdition.asOf.replace("T", " ").slice(0, 16)} UTC ·{" "}
            {L("Selected history, not a live feed", "选定历史，非实时动态")}
          </small>
        </div>
      </details>
    </section>
  );
}

export function CoveragePanel({
  items,
  date,
  token,
  onDate,
  onToken,
  L,
}: {
  items: Call[];
  date: string;
  token: string;
  onDate: (date: string) => void;
  onToken: (token: string) => void;
  L: Translate;
}) {
  const days = activityDays(items),
    topics = topicCounts(items),
    maximum = Math.max(1, ...days.map((d) => d.count));
  return (
    <section
      className="kol-coverage-panel"
      aria-label={L("Source activity", "来源活动")}
    >
      <div className="kol-activity-section">
        <div className="kol-mini-heading">
          <h3>{L("Activity in the archive", "档案活动")}</h3>
          <span>{L("Last 31 days · UTC", "最近 31 天 · UTC")}</span>
        </div>
        <div className="kol-activity-bars">
          {days.map((d) => (
            <button
              key={d.date}
              disabled={!d.count}
              aria-pressed={date === d.date}
              aria-label={`${d.date}: ${d.count} ${L("posts", "篇帖子")}, ${d.chain} Robinhood Chain`}
              title={`${d.date} · ${d.count} ${L("posts", "篇帖子")}`}
              onClick={() => onDate(date === d.date ? "" : d.date)}
            >
              <span
                style={{ height: `${Math.max(7, (d.count / maximum) * 100)}%` }}
              />
            </button>
          ))}
        </div>
        <div className="kol-activity-axis">
          <span>{days[0].date.slice(5)}</span>
          <span>{L("Click a date to filter history", "点击日期筛选历史")}</span>
          <span>{days[30].date.slice(5)}</span>
        </div>
      </div>
      <div className="kol-topic-section">
        <div className="kol-mini-heading">
          <h3>{L("Topics mentioned", "提及主题")}</h3>
          <span>{L("Selected sources", "选定来源")}</span>
        </div>
        <div className="kol-topic-list">
          {topics.length ? (
            topics.slice(0, 8).map(([symbol, count]) => (
              <button
                key={symbol}
                aria-pressed={token === symbol}
                onClick={() => onToken(token === symbol ? "" : symbol)}
              >
                <strong>{symbol}</strong>
                <span>{count}</span>
              </button>
            ))
          ) : (
            <p>
              {L(
                "Ecosystem reporting; no specific coin identified.",
                "生态报道；未确认具体代币。",
              )}
            </p>
          )}
        </div>
        <small>
          {L(
            "Mentions are not endorsements or verified token identities.",
            "提及不代表推荐或已核验代币身份。",
          )}
        </small>
      </div>
    </section>
  );
}

export function ComparePanel({
  items,
  initial = [],
  onOpen,
  L,
}: {
  items: Call[];
  initial?: string[];
  onOpen: (id: string) => void;
  L: Translate;
}) {
  const [selected, setSelected] = useState(initial);
  const summaries = selected.map((id) => ({
    person: profileFor(id),
    stats: profilePerformance(id, items),
    range: distribution(items.filter((c) => c.profile === id)),
  }));
  function toggle(id: string) {
    setSelected((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : s.length < 3
          ? [...s, id]
          : s,
    );
  }
  return (
    <section
      className="kol-compare-panel"
      aria-label={L("Compare selected KOLs", "比较已选 KOL")}
    >
      <div className="kol-section-heading">
        <div>
          <h2>{L("Build your comparison", "创建比较")}</h2>
          <p>
            {L(
              "Choose up to 3 KOLs. Every number follows the same date, chain and coin filters.",
              "最多选择 3 位 KOL；所有数字遵循相同日期、公链及代币筛选。",
            )}
          </p>
        </div>
        <span className="kol-muted">{selected.length} / 3</span>
      </div>
      <div className="kol-compare-picker">
        {profiles.map((p) => (
          <button
            key={p.id}
            aria-pressed={selected.includes(p.id)}
            disabled={selected.length === 3 && !selected.includes(p.id)}
            onClick={() => toggle(p.id)}
            aria-label={L("Compare ", "比较 ") + p.name}
          >
            {selected.includes(p.id) ? <Check size={13} /> : <Plus size={13} />}{" "}
            {p.name}
          </button>
        ))}
      </div>
      {summaries.length ? (
        <>
          <div className="kol-comparison-cards">
            {summaries.map(({ person, stats, range }, i) => (
              <article
                key={person.id}
                style={{ borderTopColor: ["#fa783f", "#80c6b1", "#b7a6db"][i] }}
              >
                <div className="kol-comparison-person">
                  <img src={person.avatar} alt="" />
                  <button
                    className="kol-text-button"
                    onClick={() => onOpen(person.id)}
                  >
                    {person.name}
                    <ArrowUpRight size={13} />
                  </button>
                  <button
                    className="kol-icon"
                    onClick={() => toggle(person.id)}
                    aria-label={L("Remove ", "移除 ") + person.name}
                  >
                    <X size={14} />
                  </button>
                </div>
                <strong
                  className={
                    stats.percent === null
                      ? ""
                      : stats.percent >= 0
                        ? "is-positive"
                        : "is-negative"
                  }
                >
                  {formatPercent(stats.percent)}
                </strong>
                <p>{L("Average 7D call return", "平均 7 日观点收益")}</p>
                <dl>
                  <div>
                    <dt>{L("Scored calls", "已评分观点")}</dt>
                    <dd>{stats.complete.length}</dd>
                  </div>
                  <div>
                    <dt>{L("Median call", "观点中位数")}</dt>
                    <dd>{formatPercent(range.median)}</dd>
                  </div>
                  <div>
                    <dt>{L("Worst → best", "最差 → 最佳")}</dt>
                    <dd>
                      {formatPercent(range.worst)} → {formatPercent(range.best)}
                    </dd>
                  </div>
                  <div>
                    <dt>{L("Robinhood posts", "Robinhood 帖子")}</dt>
                    <dd>{stats.history.filter((c) => c.chainTopic).length}</dd>
                  </div>
                </dl>
                {!stats.curve && (
                  <small>
                    {L(
                      "Coverage only in this selection. No complete price observations.",
                      "本次筛选仅有内容覆盖，暂无完整价格观察。",
                    )}
                  </small>
                )}
              </article>
            ))}
          </div>
          {summaries.some((s) => s.stats.curve) && (
            <Suspense
              fallback={
                <div className="kol-chart-loading">
                  {L("Loading chart…", "加载图表…")}
                </div>
              }
            >
              <PerformanceChart
                series={summaries.flatMap(({ person, stats }, i) =>
                  stats.curve
                    ? [
                        {
                          name: person.name,
                          values: stats.curve,
                          color: ["#fa783f", "#80c6b1", "#b7a6db"][i],
                        },
                      ]
                    : [],
                )}
                label={L("Selected KOL comparison", "所选 KOL 比较")}
              />
            </Suspense>
          )}
          <p className="kol-comparison-note">
            {L(
              "Different publication dates and sample sizes. Gross paper returns, not wallet P&L or prediction accuracy. A small selected sample cannot establish a reliable win rate.",
              "发布日期与样本量各不相同。毛模拟收益不代表钱包盈亏或预测准确率；少量选定样本不足以证明可靠胜率。",
            )}
          </p>
        </>
      ) : (
        <div className="kol-empty">
          <h3>{L("Who do you want to compare?", "你想比较谁？")}</h3>
          <p>
            {L(
              "Select a name above to inspect returns, sample size and source coverage together.",
              "在上方选择账号，综合查看收益、样本量及来源覆盖。",
            )}
          </p>
        </div>
      )}
    </section>
  );
}

export function ScoutBrief({
  items,
  name,
  onInspect,
  L,
}: {
  items: Call[];
  name: string;
  onInspect: (id: string) => void;
  L: Translate;
}) {
  const [section, setSection] = useState("focus");
  const topics = topicCounts(items),
    range = distribution(items),
    partial = items.filter(
      (c) =>
        c.sourceTextStatus === "excerpt" ||
        c.sourceTextStatus === "article-preview",
    );
  const evidence = section === "gaps" ? partial.slice(0, 3) : items.slice(0, 3);
  return (
    <section
      className="kol-profile-insight kol-brief"
      aria-label={L("Scout research brief", "Scout 研究简报")}
    >
      <div className="kol-mini-heading">
        <strong>{L("Scout research brief", "Scout 研究简报")}</strong>
        <small>{L("Computed from selected sources", "根据选定来源计算")}</small>
      </div>
      <div className="kol-brief-tabs">
        {[
          ["focus", "What do they cover?", "关注什么？"],
          ["returns", "What can I measure?", "能衡量什么？"],
          ["gaps", "What is missing?", "缺少什么？"],
        ].map(([id, en, zh]) => (
          <button
            key={id}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
          >
            {L(en, zh)}
          </button>
        ))}
      </div>
      {section === "focus" ? (
        <p>
          {L(
            `${name} has ${items.length} tracked posts in this view; ${items.filter((c) => c.chainTopic).length} discuss Robinhood Chain. ${
              topics.length
                ? `The most-mentioned topics are ${topics
                    .slice(0, 3)
                    .map(([t, n]) => `${t} (${n})`)
                    .join(", ")}.`
                : "The selection focuses on ecosystem commentary."
            }`,
            `${name} 在当前视图有 ${items.length} 篇已审阅帖子，其中 ${items.filter((c) => c.chainTopic).length} 篇讨论 Robinhood Chain。主要主题：${
              topics
                .slice(0, 3)
                .map(([t, n]) => `${t}（${n}）`)
                .join("、") || "生态评论"
            }。`,
          )}
        </p>
      ) : section === "returns" ? (
        <p>
          {L(
            `${range.count} calls have complete seven-day price observations. Median return: ${formatPercent(range.median)}; observed range: ${formatPercent(range.worst)} to ${formatPercent(range.best)}. This sample is too small and selective to establish a reliable win rate. Open each receipt to check the entry assumption and exact assets.`,
            `${range.count} 条观点有完整七日价格观察。中位数：${formatPercent(range.median)}；范围：${formatPercent(range.worst)} 至 ${formatPercent(range.best)}。样本太少且经过筛选，无法证明可靠胜率。请打开记录核验入场假设和具体资产。`,
          )}
        </p>
      ) : (
        <p>
          {L(
            `${items.length - range.count} posts do not have a complete scored result. ${partial.length} sources have partial text. Conditional entries, ambiguous token identities, commentary and unfinished windows require different treatment; none is a zero return. This archive does not establish every call the author made.`,
            `${items.length - range.count} 篇帖子没有完整评分结果，${partial.length} 个来源仅有部分文字。条件入场、代币身份不明、评论及未完成窗口分别处理；这些都不等于零收益。本档案并非作者全部观点记录。`,
          )}
        </p>
      )}
      <div className="kol-brief-evidence">
        {evidence.map((c) => (
          <button key={c.id} onClick={() => onInspect(c.id)}>
            <span>{c.publishedAt.slice(0, 10)}</span>
            {c.summary}
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </section>
  );
}
