import { useState } from "react";
import { Link } from "react-router";
import type { useLocalHistory } from "./useLocalHistory";
import type { VaultConversation } from "../vault/types";
import { BackupDownloadLink } from "../vault/BackupDownloadLink";

const button =
  "min-h-11 rounded-sm border border-[#63564c] px-3 py-2 text-sm text-[#e9e0d1] hover:border-[#fa6c34] disabled:opacity-50";

export function LocalHistory({
  history,
  selected,
  onSelect,
  onNew,
  pending,
}: {
  history: ReturnType<typeof useLocalHistory>;
  selected: string | null;
  onSelect: (conversation: VaultConversation) => void;
  onNew: () => void;
  pending: boolean;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  return (
    <aside
      aria-label="Encrypted local chat history"
      className="mb-6 space-y-4 rounded-sm border border-[#514a45] bg-[#242424] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg text-[#e9e0d1]">Your chats, on this device</h2>
          <p className="mt-1 text-sm text-[#b8b0a7]">
            {history.phase === "unlocked"
              ? "Encrypted autosave is on. No cloud history or wallet connection."
              : "Unlock local history to keep new conversations. Otherwise, lookups are unsaved."}
          </p>
        </div>
        {history.phase === "unlocked" && (
          <button
            type="button"
            className={button}
            onClick={() => history.lock()}
          >
            Lock history
          </button>
        )}
      </div>
      {history.phase === "loading" && (
        <p role="status">Checking local storage…</p>
      )}
      {history.phase === "empty" && (
        <Link
          className={`${button} inline-flex items-center bg-[#fa6c34] !text-[#1d1d1d]`}
          to="/vault?view=assets"
        >
          Create encrypted Vault to save chats
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
            Vault passphrase
            <input
              aria-label="History Vault passphrase"
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
            Unlock & enable local autosave
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
          {history.notice}
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
              New conversation
            </button>
            <button
              className={button}
              disabled={pending || history.busy}
              onClick={() => void history.backup()}
            >
              Export encrypted backup
            </button>
          </div>
          <BackupDownloadLink download={history.download} />
          <nav
            aria-label="Saved conversations"
            className="max-h-72 space-y-2 overflow-y-auto"
          >
            {!history.conversations.length && (
              <p className="text-sm text-[#b8b0a7]">
                No saved chats yet. Your next successful lookup will be saved
                automatically.
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
                    {item.turns.length} {item.turns.length === 1 ? "answer" : "answers"} ·{" "}
                    {new Date(item.updatedAt).toLocaleString()}
                  </span>
                </button>
                <button
                  className={button}
                  aria-label={`Delete conversation ${item.title}`}
                  disabled={pending || history.busy}
                  onClick={() => setDeleteId(item.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </nav>
          {deleteId && (
            <div
              role="group"
              aria-label="Confirm conversation deletion"
              className="space-y-2 border border-[#b97864] p-3"
            >
              <p className="text-sm">
                Delete this saved conversation from this browser? Recovery
                requires a previously exported backup. Other Vault records are
                unchanged.
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
                Confirm delete conversation
              </button>{" "}
              <button className={button} onClick={() => setDeleteId(null)}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}
      <p className="text-xs leading-relaxed text-[#b8b0a7]">
        Same browser profile and site address only. Unlock again after
        restarting or leaving this page. Clearing site data, private browsing,
        browser eviction, or a lost passphrase can lose access. Export backups
        regularly; storage permission is not a guarantee.
      </p>
      <Link
        className="inline-flex min-h-11 items-center text-sm text-[#ff985e] underline"
        to="/vault?view=assets"
      >
        Vault setup, backup restore & recovery
      </Link>
    </aside>
  );
}

export function SavedConversation({
  conversation,
}: {
  conversation: VaultConversation;
}) {
  return (
    <section
      aria-label="Saved conversation transcript"
      className="mb-6 space-y-4"
    >
      <h2 className="text-lg text-[#e9e0d1]">{conversation.title}</h2>
      <p className="text-sm text-[#c9bfae]">
        Saved snapshots—not live balances, prices, or safety checks. Ask again
        below for a fresh lookup. Each question is an independent lookup; your
        saved transcript is never uploaded as context.
      </p>
      {conversation.turns.map((turn, index) => (
        <article
          key={`${index}-${turn.savedAt}`}
          className="space-y-3 break-words border border-[#514a45] bg-[#242424] p-5"
        >
          <p className="text-xs text-[#b8b0a7]">
            Saved {new Date(turn.savedAt).toLocaleString()}
          </p>
          <h3 className="text-[#ff985e]">
            {turn.question || "Explain this public identifier"}
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
              {turn.sources.length} saved sources
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
