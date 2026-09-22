import { useState } from "react";
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
  const [draft, setDraft] = useState<SuggestionDraft | null>(null);
  const [fields, setFields] = useState<SuggestionFields>(emptySuggestionFields);
  const [message, setMessage] = useState("");
  const entries = deriveChangelog(reviewedChangelogEvidence);

  function update(name: keyof SuggestionFields, value: string | boolean) {
    setFields((current) => ({ ...current, [name]: value }));
    setMessage("");
  }

  function save() {
    const error = validateSuggestion(fields);
    if (error) {
      setMessage(c(error, "请告诉我们您尝试做什么以及遇到了什么问题。"));
      return;
    }
    const next = saveSuggestionDraft(fields, draft);
    setDraft(next);
    setMessage(c("Saved for this session. Nothing was sent.", "已保存在此会话中。没有发送任何内容。"));
  }

  return (
    <section className="opsis-tool-workspace opsis-tool-workspace-native" data-tool="community">
      <header className="opsis-studio-heading">
        <div>
          <p className="opsis-kicker">COMMUNITY / LOCAL INTAKE</p>
          <h1>{c("Help shape what ships.", "一起决定接下来做什么。")}</h1>
        </div>
        <p>{c("Suggest an improvement in a private draft, then export it for a destination you have reviewed.", "在私密草稿中提出改进建议，然后导出到您已核实的目的地。")}</p>
      </header>
      <div className="opsis-two-column community-layout">
        <form className="opsis-panel" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <p className="opsis-kicker">SUGGEST AN IMPROVEMENT</p>
          <h2>{c("What were you trying to do?", "您尝试做什么？")}</h2>
          <label htmlFor="community-attempt">{c("The task or question", "任务或问题")}</label>
          <textarea id="community-attempt" value={fields.whatWereYouTrying} onChange={(event) => update("whatWereYouTrying", event.target.value)} maxLength={2000} required />
          <label htmlFor="community-blocker">{c("What stopped you?", "什么阻止了您？")}</label>
          <textarea id="community-blocker" value={fields.whatStoppedYou} onChange={(event) => update("whatStoppedYou", event.target.value)} maxLength={2000} required />
          <label htmlFor="community-contact">{c("Contact (optional)", "联系方式（可选）")}</label>
          <input id="community-contact" type="email" value={fields.contact} onChange={(event) => update("contact", event.target.value)} maxLength={320} autoComplete="email" />
          <label htmlFor="community-credit">{c("Credit name (optional)", "署名（可选）")}</label>
          <input id="community-credit" value={fields.creditName} onChange={(event) => update("creditName", event.target.value)} maxLength={160} />
          <label className="community-check">
            <input type="checkbox" checked={fields.creditOptIn} onChange={(event) => update("creditOptIn", event.target.checked)} />
            <span>{c("Ask me before using this name in a changelog.", "在更新日志中使用此名称前请先征得我的同意。")}</span>
          </label>
          <button className="opsis-action" type="submit">{c("Save local draft", "保存本地草稿")}</button>
          {message && <p role="status" className="opsis-small community-message">{message}</p>}
          <p className="opsis-small">{c("Anonymous is fine. This draft is cleared when the page session ends. It does not post, call an API, or require a wallet.", "可以匿名提交。页面会话结束后草稿将清除。此表单不会发布、调用 API 或要求连接钱包。")}</p>
        </form>
        <div className="community-side">
          <section className="opsis-panel">
            <p className="opsis-kicker">LOCAL EXPORT</p>
            <h2>{c("Choose the destination yourself.", "由您自己选择目的地。")}</h2>
            <p className="opsis-muted">{c("Review the destination before sharing. Exported files contain only the fields shown above. Nothing is saved after this session.", "分享前请核实目的地。导出文件只包含上面显示的字段。会话结束后不会保留任何内容。")}</p>
            <div className="community-actions">
              <button className="opsis-action" disabled={!draft} onClick={() => draft && download("opsis-suggestion.json", suggestionExport(draft), "application/json")}>{c("Export JSON", "导出 JSON")}</button>
              <button className="opsis-action" disabled={!draft} onClick={() => draft && download("opsis-suggestion.md", suggestionMarkdown(draft), "text/markdown")}>{c("Export Markdown", "导出 Markdown")}</button>
            </div>
            {draft && <p className="opsis-small">{c(`Draft saved ${new Date(draft.updatedAt).toLocaleString()}.`, `草稿保存于 ${new Date(draft.updatedAt).toLocaleString()}。`)}</p>}
          </section>
          <section className="opsis-panel">
            <p className="opsis-kicker">SHIPPED / EVIDENCE</p>
            <h2>{c("A changelog built from proof.", "基于证据的更新日志。")}</h2>
            <p className="opsis-muted">{c("Only shipped work with a dated observation, verification and named source appears here.", "只有具备日期观察、验证和明确来源的已发布工作才会显示在这里。")}</p>
            {entries.length ? entries.map((entry) => <article className="community-entry" key={entry.id}><p className="opsis-kicker">{entry.date} · {entry.workspace.toUpperCase()}</p><h3>{entry.title}</h3><p>{entry.summary}</p><p className="opsis-small">{entry.sourceLabel}</p></article>) : <p className="opsis-small">{c("No reviewed release evidence is available in this preview yet.", "此预览中暂时没有可用的已审核发布证据。")}</p>}
          </section>
        </div>
      </div>
    </section>
  );
}
