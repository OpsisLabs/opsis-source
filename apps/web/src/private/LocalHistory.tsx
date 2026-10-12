import { useState } from "react";
import { Link } from "react-router";
import type { useLocalHistory } from "./useLocalHistory";
import type { VaultConversation } from "../vault/types";
import { BackupDownloadLink } from "../vault/BackupDownloadLink";
import { useI18n } from "../i18n";

const button =
  "min-h-11 rounded-sm border border-[#63564c] px-3 py-2 text-sm text-[#e9e0d1] hover:border-[#fa6c34] disabled:opacity-50";

export function LocalHistory({
  history,
  selected,
  onSelect,
  onNew,
  pending,
  reports = false,
  labels,
}: {
  history: ReturnType<typeof useLocalHistory>;
  selected: string | null;
  onSelect: (conversation: VaultConversation) => void;
  onNew: () => void;
  pending: boolean;
  reports?: boolean;
  labels?: { title: string; description: string; unlocked: string; empty: string };
}) {
  const { t } = useI18n();
  const [passphrase, setPassphrase] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  return (
    <aside
      aria-label={labels?.title ?? t("cloud.history.ariaLabel")}
      className="mb-6 space-y-4 rounded-sm border border-[#514a45] bg-[#242424] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg text-[#e9e0d1]">{labels?.title ?? (reports ? t("cloud.history.title.reports") : t("cloud.history.title.chats"))}</h2>
          <p className="mt-1 text-sm text-[#b8b0a7]">
            {labels?.description ?? (reports ? t("cloud.history.desc.reports") : history.phase === "unlocked"
              ? t("cloud.history.desc.unlocked")
              : t("cloud.history.desc.locked"))}
          </p>
        </div>
        {history.phase === "unlocked" && (
          <button
            type="button"
            className={button}
            onClick={() => history.lock()}
          >
            {t("cloud.history.lock")}
          </button>
        )}
      </div>
      {history.phase === "loading" && (
        <p role="status">{t("cloud.history.checking")}</p>
      )}
      {history.phase === "empty" && (
        <Link
          className={`${button} inline-flex items-center bg-[#fa6c34] !text-[#1d1d1d]`}
          to="/saved?view=assets"
        >
          {reports ? t("cloud.history.createForReports") : t("cloud.history.createForChats")}
        </Link>
      )}
      {history.phase === "locked" && (
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const value = passphrase;
            setPassphrase("");
            void history.unlock(value);
          }}
        >
          <label className="grow text-sm text-[#d6ccba]">
            {t("cloud.history.passphrase")}
            <input
              aria-label={t("cloud.history.passphraseAria")}
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              className="mt-1 block min-h-11 w-full border border-[#63564c] bg-[#1d1d1d] px-3 text-base"
            />
          </label>
          <button
            className={`${button} self-end bg-[#fa6c34] !text-[#1d1d1d]`}
            disabled={history.busy || !passphrase || pending}
          >
            {reports ? t("cloud.history.unlockReports") : t("cloud.history.unlockChats")}
          </button>
        </form>
      )}
      {history.error && (
        <p role="alert" className="text-sm text-[#ffabbc]">
          {history.error}
        </p>
      )}
      {history.notice && (
        <p role="status" className="text-sm text-[#c7d7b8]">
          {reports && history.notice === t("cloud.history.notice.autosave") ? (labels?.unlocked ?? t("cloud.history.reportNotice")) : history.notice}
        </p>
      )}
      {history.phase === "unlocked" && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              className={button}
              disabled={pending || history.busy}
              onClick={onNew}
            >
              {reports ? t("cloud.history.closeReport") : t("cloud.history.newConversation")}
            </button>
            <button
              className={button}
              disabled={pending || history.busy}
              onClick={() => void history.backup()}
            >
              {t("cloud.history.exportBackup")}
            </button>
          </div>
          <BackupDownloadLink download={history.download} />
          <nav
            aria-label={t("cloud.history.savedConversations")}
            className="max-h-72 space-y-2 overflow-y-auto"
          >
            {!history.conversations.length && (
              <p className="text-sm text-[#b8b0a7]">
                {labels?.empty ?? (reports ? t("cloud.history.noReports") : t("cloud.history.noChats"))}
              </p>
            )}
            {history.conversations.map((item) => (
              <div key={item.id} className="flex gap-2">
                <button
                  disabled={pending || history.busy}
                  aria-current={selected === item.id ? "true" : undefined}
                  className={`${button} min-w-0 flex-1 text-left ${selected === item.id ? "border-[#fa6c34]" : ""}`}
                  onClick={() => onSelect(item)}
                >
                  <span className="block truncate">{item.title}</span>
                  <span className="text-xs text-[#b8b0a7]">
                    {item.turns.length === 1 ? t("cloud.history.answers.one", { count: item.turns.length }) : t("cloud.history.answers.other", { count: item.turns.length })} ·{" "}
                    {new Date(item.updatedAt).toLocaleString()}
                  </span>
                </button>
                <button
                  className={button}
                  aria-label={t("cloud.history.deleteAria", { title: item.title })}
                  disabled={pending || history.busy}
                  onClick={() => setDeleteId(item.id)}
                >
                  {t("cloud.history.delete")}
                </button>
              </div>
            ))}
          </nav>
          {deleteId && (
            <div
              role="group"
              aria-label={t("cloud.history.confirmDeletionAria")}
              className="space-y-2 border border-[#b97864] p-3"
            >
              <p className="text-sm">
                {t("cloud.history.confirmDeletionBody")}
              </p>
              <button
                className={button}
                disabled={pending || history.busy}
                onClick={async () => {
                  const id = deleteId;
                  setDeleteId(null);
                  await history.remove(id);
                  if (selected === id) onNew();
                }}
              >
                {t("cloud.history.confirmDelete")}
              </button>{" "}
              <button className={button} onClick={() => setDeleteId(null)}>
                {t("cloud.history.cancel")}
              </button>
            </div>
          )}
        </>
      )}
      <p className="text-xs leading-relaxed text-[#b8b0a7]">
        {t("cloud.history.footnote")}
      </p>
      <Link
        className="inline-flex min-h-11 items-center text-sm text-[#ff985e] underline"
        to="/saved?view=assets"
      >
        {t("cloud.history.setupLink")}
      </Link>
    </aside>
  );
}

export function SavedConversation({
  conversation,
}: {
  conversation: VaultConversation;
}) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t("cloud.history.transcriptAria")}
      className="mb-6 space-y-4"
    >
      <h2 className="text-lg text-[#e9e0d1]">{conversation.title}</h2>
      <p className="text-sm text-[#c9bfae]">
        {t("cloud.history.transcriptBody")}
      </p>
      {conversation.turns.map((turn, index) => (
        <article
          key={`${index}-${turn.savedAt}`}
          className="space-y-3 break-words border border-[#514a45] bg-[#242424] p-5"
        >
          <p className="text-xs text-[#b8b0a7]">
            {t("cloud.history.savedLabel", { date: new Date(turn.savedAt).toLocaleString() })}
          </p>
          <h3 className="text-[#ff985e]">
            {turn.question || t("cloud.history.defaultQuestion")}
          </h3>
          <p className="break-all font-mono text-xs text-[#b8b0a7]">
            {turn.entity}
          </p>
          <p className="whitespace-pre-wrap text-[#e9e0d1]">{turn.answer}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[#d6ccba]">
            {turn.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
          <details>
            <summary className="cursor-pointer py-3 text-sm text-[#ff985e]">
              {t("cloud.history.savedSources", { count: turn.sources.length })}
            </summary>
            <ul className="space-y-2 text-sm">
              {turn.sources.map((source, i) => (
                <li key={i}>
                  {source.url ? (
                    <a
                      className="text-[#ff985e] underline"
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      {source.label}
                    </a>
                  ) : (
                    source.label
                  )}{" "}
                  · {new Date(source.fetchedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </details>
        </article>
      ))}
    </section>
  );
}
