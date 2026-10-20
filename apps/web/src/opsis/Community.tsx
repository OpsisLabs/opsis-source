import { useState } from "react";
import { Download, Search, ExternalLink } from "lucide-react";
import { useI18n } from "../i18n";
import { useCopy } from "./copy";
import {
  deriveChangelog,
  emptySuggestionFields,
  saveSuggestionDraft,
  suggestionExport,
  suggestionMarkdown,
  validateSuggestion,
  reviewedChangelogEvidence,
  type SuggestionDraft,
  type SuggestionFields,
} from "./community-model";
import {
  changelogExcerpt,
  changelogDateLabel,
  filterChangelog,
} from "./community-workspace-model";
import "./utility-workspace.css";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Community() {
  const c = useCopy();
  const { locale } = useI18n();
  const [draft, setDraft] = useState<SuggestionDraft | null>(null);
  const [fields, setFields] = useState<SuggestionFields>(emptySuggestionFields);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [topic, setTopic] = useState("feedback");
  const topics: Record<string, string> = {
    feedback: c("Feedback", "反馈"),
    feature: c("Feature request", "功能建议"),
    issue: c("Issue", "问题"),
  };
  const [format, setFormat] = useState("markdown");
  const entries = deriveChangelog(reviewedChangelogEvidence);
  const filtered = filterChangelog(entries, query, workspace, locale);
  const visible = showAll ? filtered : filtered.slice(0, 5);
  const workspaceNames = {
    research: c("Research", "研究"),
    check: c("Trade Check", "交易核查"),
    watch: c("Watch", "观察"),
    lab: c("Quant Lab", "量化实验室"),
  };

  function update(name: keyof SuggestionFields, value: string | boolean) {
    setFields((current) => ({ ...current, [name]: value }));
    setDraft(null);
    setMessage("");
  }

  function save() {
    const error = validateSuggestion(fields);
    if (error) {
      const errors: Record<string, string> = {
        "Tell us what you were trying to do.": "请告诉我们您尝试做什么。",
        "Tell us what stopped you.": "请告诉我们您遇到的问题。",
        "Contact details are too long.": "联系方式过长。",
        "The credit name is too long.": "署名过长。",
        "Use a valid email address or leave contact blank.":
          "请使用有效电子邮件地址，或将联系方式留空。",
      };
      setMessage(c(error, errors[error]));
      return;
    }
    const next = saveSuggestionDraft({ ...fields, topic }, draft);
    setDraft(next);
    setMessage(
      c(
        "Saved for this session. Nothing was sent.",
        "已保存在此会话中。没有发送任何内容。",
      ),
    );
  }

  return (
    <div className="utility-ws community-ws">
      <div className="community-ws-searchbar">
        {" "}
        <label className="utility-ws-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">
            {c("Search changelog", "搜索更新日志")}
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowAll(false);
            }}
            placeholder={c("Search changelog…", "搜索更新日志…")}
          />
        </label>
      </div>
      <div className="community-ws-layout">
        <form
          className="utility-ws-panel community-ws-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <header>
            <h2>{c("What were you trying to do?", "您尝试做什么？")}</h2>
            <p>
              {c(
                "Share feedback, ideas or issues. This is a private draft.",
                "分享反馈、想法或问题。这是一份私密草稿。",
              )}
            </p>
          </header>
          <div className="community-ws-field community-ws-topic">
            <label htmlFor="community-topic">{c("Topic", "主题")}</label>
            <select
              id="community-topic"
              value={topic}
              onChange={(event) => {
                setTopic(event.target.value);
                setDraft(null);
                setMessage("");
              }}
            >
              {Object.entries(topics).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="community-ws-field">
            <label htmlFor="community-attempt">{c("Summary", "摘要")}</label>
            <div>
              <input
                id="community-attempt"
                value={fields.whatWereYouTrying}
                onChange={(event) =>
                  update("whatWereYouTrying", event.target.value)
                }
                maxLength={120}
                minLength={10}
                required
                aria-describedby="community-attempt-count"
              />
              <span id="community-attempt-count" className="community-ws-count">
                {fields.whatWereYouTrying.length}/120
              </span>
            </div>
          </div>
          <div className="community-ws-field">
            <label htmlFor="community-blocker">
              {c("Details (optional)", "详情（可选）")}
            </label>
            <div>
              <textarea
                id="community-blocker"
                rows={5}
                value={fields.whatStoppedYou}
                onChange={(event) =>
                  update("whatStoppedYou", event.target.value)
                }
                maxLength={1000}
                aria-describedby="community-blocker-count"
              />
              <span id="community-blocker-count" className="community-ws-count">
                {fields.whatStoppedYou.length}/1,000
              </span>
            </div>
          </div>
          <section
            className="community-ws-preview"
            aria-labelledby="community-preview-title"
          >
            <div className="utility-ws-toolbar">
              <h3 id="community-preview-title">{c("Preview", "预览")}</h3>
              <span className="utility-ws-state">
                {draft
                  ? c("Saved for this session", "已保存在此会话中")
                  : c("Private draft", "私密草稿")}
              </span>
            </div>
            <div className="community-ws-preview-paper">
              <span className="utility-ws-state">{topics[topic]}</span>
              <h3>
                {fields.whatWereYouTrying ||
                  c(
                    "Your task or question appears here",
                    "您的任务或问题会显示在这里",
                  )}
              </h3>
              <p>
                {fields.whatStoppedYou ||
                  c(
                    "Describe what stopped you to preview your feedback.",
                    "描述您遇到的问题，以预览反馈。",
                  )}
              </p>
              {fields.contact && (
                <p>
                  {c("Contact", "联系方式")}: {fields.contact}
                </p>
              )}
              {fields.creditName && (
                <p>
                  {c("Credit name", "署名")}: {fields.creditName}
                </p>
              )}
              {(fields.creditName || fields.creditOptIn) && (
                <p className="community-ws-consent">
                  {c(
                    "Ask before using this name in a changelog",
                    "在更新日志中使用此名称前请先征得我的同意",
                  )}
                  : {fields.creditOptIn ? c("Yes", "是") : c("No", "否")}
                </p>
              )}
            </div>
          </section>
          <details className="community-ws-optional">
            <summary>
              {c("Contact & credit (optional)", "联系方式与署名（可选）")}
            </summary>
            <div className="community-ws-field">
              <label htmlFor="community-contact">
                {c("Contact (optional)", "联系方式（可选）")}
              </label>
              <input
                id="community-contact"
                type="email"
                value={fields.contact}
                onChange={(event) => update("contact", event.target.value)}
                maxLength={320}
                autoComplete="off"
              />
            </div>
            <div className="community-ws-field">
              <label htmlFor="community-credit">
                {c("Credit name (optional)", "署名（可选）")}
              </label>
              <input
                id="community-credit"
                value={fields.creditName}
                onChange={(event) => update("creditName", event.target.value)}
                maxLength={160}
                autoComplete="off"
              />
            </div>
            <label className="community-ws-check">
              <input
                type="checkbox"
                checked={fields.creditOptIn}
                onChange={(event) =>
                  update("creditOptIn", event.target.checked)
                }
              />
              <span>
                {c(
                  "Ask me before using this name in a changelog.",
                  "在更新日志中使用此名称前请先征得我的同意。",
                )}
              </span>
            </label>
          </details>
          <div className="community-ws-export">
            <button className="utility-ws-secondary" type="submit">
              {c("Save local draft", "保存本地草稿")}
            </button>
            <label>
              <span className="sr-only">{c("Export format", "导出格式")}</span>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              >
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
              </select>
            </label>
            <button
              className="opsis-action"
              type="button"
              disabled={!draft}
              onClick={() => {
                if (draft)
                  download(
                    format === "json"
                      ? "opsis-suggestion.json"
                      : "opsis-suggestion.md",
                    format === "json"
                      ? suggestionExport(draft)
                      : suggestionMarkdown(draft, locale),
                    format === "json" ? "application/json" : "text/markdown",
                  );
              }}
            >
              <Download size={17} aria-hidden="true" />
              {c("Export draft", "导出草稿")}
            </button>
          </div>
          {message && (
            <p role="status" className="community-ws-message">
              {message}
            </p>
          )}
          <p className="community-ws-help">
            {c(
              "Save to enable export. Review the preview and destination before sharing. JSON includes every field shown, even a credit name without consent; Markdown includes the name only when selected. Nothing is posted or sent. The draft clears when you leave or reload this page.",
              "保存后可导出。分享前请检查预览和目的地。JSON 包含所有显示的字段，包括未勾选同意时的署名；Markdown 仅在勾选时包含署名。不会发布或发送任何内容。离开或重新加载此页面时草稿将清除。",
            )}
          </p>
        </form>
        <section
          className="utility-ws-panel community-ws-changelog"
          aria-labelledby="community-changelog-title"
        >
          <header>
            <h2 id="community-changelog-title">
              {c("Product changelog", "产品更新日志")}
            </h2>
            <p>
              {c(
                "Shipped updates backed by dated, reviewed evidence.",
                "由带日期的已审核证据支持的已发布更新。",
              )}
            </p>
          </header>
          <div className="utility-ws-toolbar">
            <label>
              <span className="sr-only">
                {c("Changelog topic", "更新日志主题")}
              </span>
              <select
                value={workspace}
                onChange={(event) => {
                  setWorkspace(event.target.value);
                  setShowAll(false);
                }}
              >
                <option value="all">{c("All topics", "所有主题")}</option>
                {Object.entries(workspaceNames).map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ol className="community-ws-timeline">
            {visible.map((entry) => {
              const summary = c(
                entry.summary,
                entry.summaryZh ?? entry.summary,
              );
              const excerpt = changelogExcerpt(summary, 85);
              return (
                <li key={entry.id}>
                  <article>
                    <div className="community-ws-entry-meta">
                      <time dateTime={entry.date}>
                        {changelogDateLabel(entry.date, locale)}
                      </time>
                      <span className="utility-ws-state">
                        {workspaceNames[entry.workspace]}
                      </span>
                    </div>
                    <div className="community-ws-entry-body">
                      <h3>{c(entry.title, entry.titleZh ?? entry.title)}</h3>
                      <p>{excerpt}</p>
                      <details>
                        <summary>
                          <ExternalLink size={13} aria-hidden="true" />{" "}
                          {c("View details", "查看详情")}
                        </summary>
                        {excerpt !== summary && <p>{summary}</p>}
                        <dl className="utility-ws-facts">
                          <div>
                            <dt>{c("Observed", "观测时间")}</dt>
                            <dd className="utility-ws-mono">
                              {entry.observedAt}
                            </dd>
                          </div>
                          <div>
                            <dt>{c("Verified", "验证时间")}</dt>
                            <dd className="utility-ws-mono">
                              {entry.verifiedAt}
                            </dd>
                          </div>
                        </dl>
                        <p>
                          {entry.sourceUrl ? (
                            <a
                              href={entry.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {entry.sourceLabel} ↗
                            </a>
                          ) : (
                            entry.sourceLabel
                          )}
                        </p>
                        {!entry.sourceUrl && (
                          <p className="community-ws-help">
                            {c(
                              "Public source link unavailable; the reviewed release reference is shown above.",
                              "公开来源链接不可用；上方显示已审核的发布参考。",
                            )}
                          </p>
                        )}
                      </details>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
          {!filtered.length && (
            <p role="status" className="utility-ws-empty">
              {c(
                "No reviewed updates match these filters.",
                "没有已审核更新符合这些筛选条件。",
              )}
            </p>
          )}
          {filtered.length > 5 && (
            <button
              className="utility-ws-secondary"
              type="button"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll
                ? c("Show recent updates", "显示近期更新")
                : c(
                    `Show all ${filtered.length} updates`,
                    `显示全部 ${filtered.length} 条更新`,
                  )}
            </button>
          )}
          <p className="community-ws-help">
            {c(
              "Only shipped work with an observation, verification and named source appears here.",
              "此处仅显示具备观测、验证和明确来源的已发布工作。",
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
