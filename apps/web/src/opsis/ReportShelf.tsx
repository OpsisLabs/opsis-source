import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useLocalHistory } from "../private/useLocalHistory";
import { SavedConversation } from "../private/LocalHistory";
import type { VaultConversation, VaultConversationTurn } from "../vault/types";
import { useCopy } from "./copy";
import { workspaceLink, type Capabilities } from "./model";
import "../watch/watch.css";
import { useI18n } from "../i18n";
import { BackupDownloadLink } from "../vault/BackupDownloadLink";

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
      <p className="saved-vault-state watch-kicker" role="status">
        {history.phase === "unlocked"
          ? c("Vault unlocked · this device", "保险库已解锁 · 此设备")
          : history.phase === "loading"
            ? c("Checking Vault…", "正在检查保险库…")
            : history.phase === "empty"
              ? c("No Vault on this device", "此设备上尚无保险库")
              : c("Vault locked", "保险库已锁定")}
      </p>
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
      <div className="saved-report-grid opsis-legacy opsis-engine-content">
        <SavedReportList
          key={history.lockEpoch}
          history={history}
          selected={selected}
          onSelect={(r) => setSelected(r.id)}
          onNew={() => setSelected(null)}
          pending={saving}
        />
        <div className="saved-report-detail watch-panel">
          {report ? (
            <>
              <p className="watch-kicker">
                {turn?.opsis?.workspace === "check"
                  ? c("Trade check", "交易核查")
                  : c("Saved research", "已保存研究")}
              </p>
              <SavedConversation conversation={report} />
              {turn?.opsis?.chainId === 4663 &&
                (capabilities.research ||
                  (turn.opsis.token &&
                    capabilities.exitCheck &&
                    import.meta.env.VITE_EXIT_CHECK_ENABLED === "true")) && (
                  <h3>{c("Recheck now", "重新核查")}</h3>
                )}
              <div className="opsis-tool-links">
                {turn?.opsis?.chainId === 4663 && capabilities.research && (
                  <Link to={workspaceLink("/research", turn.entity)}>
                    {c(
                      "Research this identifier again →",
                      "再次研究此标识符 →",
                    )}
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
          ) : (
            <div className="saved-report-empty">
              <h2>{c("Your saved perspective", "您保存的视角")}</h2>
              <p>
                {c(
                  "Choose a saved item to read its evidence and source times.",
                  "选择已保存项目以查看证据及来源时间。",
                )}
              </p>
            </div>
          )}
          {history.phase === "unlocked" && (
            <div className="watch-save">
              <button
                type="button"
                className="watch-button"
                disabled={saving || history.busy}
                onClick={() => void history.backup()}
              >
                {c("Export encrypted backup", "导出加密备份")}
              </button>
              <BackupDownloadLink download={history.download} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function SavedReportList({
  history,
  selected,
  onSelect,
  onNew,
  pending,
}: {
  history: ReturnType<typeof useLocalHistory>;
  selected: string | null;
  onSelect: (report: VaultConversation) => void;
  onNew: () => void;
  pending: boolean;
}) {
  const c = useCopy();
  const { t, locale } = useI18n();
  const [passphrase, setPassphrase] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  return (
    <aside
      className="saved-report-list"
      aria-label={c("Saved research & checks", "已保存研究与核查")}
    >
      <header>
        <div>
          <p className="watch-kicker">{c("Local Vault", "本地保险库")}</p>
          <h2>{c("Encrypted on this device", "在此设备上加密")}</h2>
        </div>
        {history.phase === "unlocked" && (
          <button
            className="watch-button"
            type="button"
            onClick={() => history.lock()}
          >
            {c("Lock history", "锁定记录")}
          </button>
        )}
      </header>
      <p className="watch-small">
        {c(
          "Unlock to read or save encrypted observations on this device. No cloud sync or automatic saving.",
          "解锁后可在此设备上读取或保存加密观察。无云同步或自动保存。",
        )}
      </p>
      {history.phase === "loading" && (
        <p role="status">{c("Checking local storage…", "正在检查本地存储…")}</p>
      )}
      {history.phase === "empty" && (
        <Link className="opsis-action" to="/saved?view=assets">
          {c(
            "Create encrypted Vault to save reports",
            "创建加密保险库以保存报告",
          )}
        </Link>
      )}
      {history.phase === "locked" && (
        <form
          className="saved-unlock"
          onSubmit={(event) => {
            event.preventDefault();
            const value = passphrase;
            setPassphrase("");
            void history.unlock(value);
          }}
        >
          <label>
            {c("Vault passphrase", "保险库口令")}
            <input
              aria-label={c("History Vault passphrase", "记录保险库口令")}
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              className="watch-input"
            />
          </label>
          <button
            className="opsis-action"
            disabled={history.busy || !passphrase || pending}
          >
            {c("Unlock report history", "解锁报告记录")}
          </button>
        </form>
      )}
      {history.error && <p role="alert">{history.error}</p>}
      {history.notice && (
        <p role="status" className="watch-small">
          {history.notice === t("cloud.history.notice.autosave")
            ? c(
                "Unlocked. Choose Save observation to keep the current result.",
                "已解锁。选择保存观察以保留当前结果。",
              )
            : history.notice}
        </p>
      )}
      {history.phase === "unlocked" && (
        <>
          <nav aria-label={c("Saved conversations", "已保存的对话")}>
            {!history.conversations.length && (
              <p className="watch-small">
                {c(
                  "No observations saved yet. Run Research or Trade Check, then save the result.",
                  "尚无已保存观察。运行研究或交易核查后保存结果。",
                )}
              </p>
            )}
            {history.conversations.map((item) => {
              const turn = item.turns.at(-1);
              const entity = turn?.entity ?? "";
              return (
                <div className="saved-report-row" key={item.id}>
                  <button
                    type="button"
                    className="saved-report-select"
                    disabled={pending || history.busy}
                    aria-current={selected === item.id ? "true" : undefined}
                    onClick={() => onSelect(item)}
                  >
                    <span className="saved-report-name">{item.title}</span>
                    <span className="watch-tag">
                      {turn?.opsis?.workspace === "check"
                        ? c("Trade check", "交易核查")
                        : turn?.opsis?.workspace === "research"
                          ? c("Research", "研究")
                          : c("Note", "笔记")}
                    </span>
                    <span className="saved-report-date">
                      {new Date(item.updatedAt).toLocaleDateString(locale)}
                      <br />
                      {entity.length > 20
                        ? `${entity.slice(0, 8)}…${entity.slice(-4)}`
                        : entity}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="opsis-text-link saved-report-delete"
                    aria-label={c(
                      `Delete conversation ${item.title}`,
                      `删除对话 ${item.title}`,
                    )}
                    disabled={pending || history.busy}
                    onClick={() => setDeleteId(item.id)}
                  >
                    {c("Delete", "删除")}
                  </button>
                </div>
              );
            })}
          </nav>
          {deleteId && (
            <div
              className="watch-notice"
              role="group"
              aria-label={c("Confirm conversation deletion", "确认删除对话")}
            >
              <p>
                {c(
                  "Delete this saved conversation from this browser? Recovery requires a previously exported backup. Other Vault records are unchanged.",
                  "要从此浏览器删除这条已保存的对话吗？恢复需要先前导出的备份。其他保险库记录不受影响。",
                )}
              </p>
              <button
                type="button"
                className="watch-button"
                disabled={pending || history.busy}
                onClick={async () => {
                  const id = deleteId;
                  setDeleteId(null);
                  await history.remove(id);
                  if (selected === id) onNew();
                }}
              >
                {c("Confirm delete conversation", "确认删除对话")}
              </button>{" "}
              <button
                type="button"
                className="watch-button"
                onClick={() => setDeleteId(null)}
              >
                {c("Cancel", "取消")}
              </button>
            </div>
          )}
          <div className="watch-save">
            <button
              type="button"
              className="watch-button"
              disabled={pending || history.busy}
              onClick={onNew}
            >
              {c("Close saved report", "关闭已保存报告")}
            </button>
          </div>
        </>
      )}
      <p className="watch-small">
        {c(
          "Same browser profile and site address only. Unlock again after restarting or leaving this page. Clearing site data, private browsing, browser eviction, or a lost passphrase can lose access. Export backups regularly; storage permission is not a guarantee.",
          "仅限同一浏览器配置文件和站点地址。重启或离开此页面后需重新解锁。清除站点数据、隐私浏览、浏览器驱逐或丢失口令都可能导致无法访问。请定期导出备份；存储权限并非保证。",
        )}
      </p>
      <Link className="opsis-text-link" to="/saved?view=assets">
        {c(
          "Vault setup, backup restore & recovery",
          "保险库设置、备份还原与恢复",
        )}
      </Link>
    </aside>
  );
}
