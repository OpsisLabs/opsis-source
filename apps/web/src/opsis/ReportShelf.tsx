import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useLocalHistory } from "../private/useLocalHistory";
import { LocalHistory, SavedConversation } from "../private/LocalHistory";
import type { VaultConversationTurn } from "../vault/types";
import { useCopy } from "./copy";
import { workspaceLink, type Capabilities } from "./model";

/** Shares the existing encrypted report store; no network requests or implicit saves. */
export default function ReportShelf({
  draft,
  onLock,
  capabilities,
}: {
  draft?: VaultConversationTurn | null;
  onLock?: () => void;
  capabilities: Capabilities;
}) {
  const c = useCopy();
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const clear = useCallback(() => {
    setSelected(null);
    setNotes("");
    setSaved(false);
    setError("");
    onLock?.();
  }, [onLock]);
  const history = useLocalHistory(clear);
  const [previousDraft, setPreviousDraft] = useState(draft);
  const currentDraft = useRef(draft);
  useEffect(() => {
    currentDraft.current = draft;
  }, [draft]);
  if (previousDraft !== draft) {
    setPreviousDraft(draft);
    setSaved(false);
    setError("");
    setNotes("");
  }
  const report = history.conversations.find((r) => r.id === selected);
  const turn = report?.turns.at(-1);
  async function save() {
    if (!draft || saving || saved) return;
    const epoch = history.generation.current;
    setSaving(true);
    setError("");
    try {
      await history.save(
        {
          ...draft,
          savedAt: new Date().toISOString(),
          bullets: [
            ...draft.bullets,
            ...(notes.trim()
              ? [
                  `${c("My notes / conditions", "我的笔记／条件")}: ${notes.trim()}`,
                ]
              : []),
          ],
        },
        null,
        epoch,
      );
      if (
        history.generation.current === epoch &&
        currentDraft.current === draft
      ) {
        setSaved(true);
        setNotes("");
      }
    } catch {
      if (
        history.generation.current === epoch &&
        currentDraft.current === draft
      )
        setError(
          c(
            "Could not save. Unlock your Vault again and retry; this report is not confirmed saved.",
            "无法保存。请重新解锁保险库后重试；尚未确认保存此报告。",
          ),
        );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="opsis-report-shelf">
      {draft && (
        <div className="opsis-panel">
          <h2>{c("Keep this observation", "保留此次观察")}</h2>
          <p>
            {c(
              "Save the evidence and your conditions in this browser's encrypted Vault. Notes stay local. Saving does not create a background alert.",
              "将证据和条件保存在此浏览器的加密保险库中。笔记仅保存在本地。保存不会创建后台提醒。",
            )}
          </p>
          {history.phase === "unlocked" && (
            <>
              <label htmlFor="report-notes">
                {c(
                  "Notes or conditions to revisit (optional)",
                  "稍后复查的笔记或条件（可选）",
                )}
              </label>
              <textarea
                id="report-notes"
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={saving || saved}
              />
              <button
                className="opsis-action"
                disabled={saving || saved || history.busy}
                onClick={() => void save()}
              >
                {saved
                  ? c("Saved on this device", "已保存在此设备")
                  : saving
                    ? c("Saving…", "正在保存…")
                    : c("Save observation", "保存观察")}
              </button>
              {saved && (
                <Link className="opsis-text-link" to="/saved?view=reports">
                  {c("Open saved reports →", "打开已保存报告 →")}
                </Link>
              )}
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      <div className="opsis-legacy opsis-engine-content">
        <LocalHistory
          key={history.lockEpoch}
          history={history}
          reports
          labels={{
            title: c("Saved research & checks", "已保存研究与核查"),
            description: c(
              "Unlock to read or save encrypted observations on this device. No cloud sync or automatic saving.",
              "解锁后可在此设备上读取或保存加密观察。无云同步或自动保存。",
            ),
            unlocked: c(
              "Unlocked. Choose Save observation to keep the current result.",
              "已解锁。选择保存观察以保留当前结果。",
            ),
            empty: c(
              "No observations saved yet. Run Research or Trade Check, then save the result.",
              "尚无已保存观察。运行研究或交易核查后保存结果。",
            ),
          }}
          selected={selected}
          onSelect={(r) => setSelected(r.id)}
          onNew={() => setSelected(null)}
          pending={saving}
        />
        {report && (
          <>
            <SavedConversation conversation={report} />
            <div className="opsis-tool-links">
              {turn?.opsis?.chainId === 4663 && capabilities.research && (
                <Link to={workspaceLink("/research", turn.entity)}>
                  {c("Research this identifier again →", "再次研究此标识符 →")}
                </Link>
              )}
              {turn?.opsis?.token &&
                capabilities.exitCheck &&
                import.meta.env.VITE_EXIT_CHECK_ENABLED === "true" && (
                  <Link to={workspaceLink("/check", turn.entity)}>
                    {c("Run a new trade check →", "运行新的交易核查 →")}
                  </Link>
                )}
            </div>
            <p className="opsis-small">
              {c(
                "Only the public identifier is carried over. Enter your amount again and choose when to request fresh data.",
                "仅传递公开标识符。请重新输入数量，并自行选择何时请求新数据。",
              )}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
