import type { PortfolioSnapshot } from "@rh-chain/shared";
import OneOffCheck, { TokenTable, WatchTimeline } from "./OneOffCheck";
import { visibleTokenText } from "../opsis/explorer-facts";
import { ExplorerLink } from "../opsis/ExplorerLink";
import "./watch.css";
import { workspaceLink } from "../opsis/model";
import { useCopy } from "../opsis/copy";
import { OPSIS_PRESENTATION } from "../opsis/presentation";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { isAddress } from "viem";
import {
  ArrowDownUp,
  ArrowRight,
  Eye,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { VaultWatch } from "../vault/types";
import { BackupDownloadLink } from "../vault/BackupDownloadLink";
import { useWatchVault } from "./useWatchVault";
import { compareSnapshots } from "./model";
import { ActivityFeed } from "./ActivityFeed";
import { WalletOverlap } from "./WalletOverlap";
import { WatchBriefing } from "./WatchBriefing";
import WatchInbox from "./WatchInbox";
// Rendered with the result: a panel revealed later would push the page down under the pointer.
import QuantityBars from "../opsis/QuantityBars";


const button = "watch-button";
const primary = "opsis-action watch-primary";
const input = "watch-input";
const panel = "watch-panel";
type WatchSession = ReturnType<typeof useWatchVault>;
const sample = "0x9c34fb7b54f05eba5d28af3ff18f8dd9d66f7292";
const short = (address: string) =>
  `${address.slice(0, 8)}…${address.slice(-6)}`;

function evidenceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function Access({ session }: { session: WatchSession }) {
  const { t } = useI18n();
  const c = useCopy();
  const [searchParams] = useSearchParams();
  // A Follow handoff must survive the locked/create states. The address lives in
  // the URL only; it is shown here as a guide and consumed after unlock.
  const requested = searchParams.get("address")?.trim() ?? "";
  const pendingAddress =
    requested && isAddress(requested, { strict: true }) ? requested : "";
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<"watch.error.confirm" | "watch.error.address" | null>(null);
  const create = session.phase === "empty";
  return (
    <section className={panel} aria-labelledby="watch-access-title">
      <LockKeyhole className="mb-3 text-[var(--accent)]" size={24} aria-hidden />
      <h2 id="watch-access-title" className="text-xl">
        {t("watch.accessTitle")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft)]">
        {t("watch.accessBody")}
      </p>
      {pendingAddress && (
        <p
          role="status"
          className="mt-4 border-l-2 border-[var(--accent)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--soft)]"
        >
          {t("watch.prefill.waiting", { address: short(pendingAddress) })}
        </p>
      )}
      {session.phase === "loading" ? (
        <p role="status" className="mt-4">
          {t("watch.checking")}
        </p>
      ) : (
        <form
          className="mt-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (create && (passphrase.length < 12 || passphrase !== confirm)) {
              setError("watch.error.confirm");
              return;
            }
            const value = passphrase;
            setPassphrase("");
            setConfirm("");
            void session.enter(value, create);
          }}
        >
          <label className="min-w-0 flex-[1_1_220px] text-sm">
            {t("watch.passphrase")}
            <input
              className={input}
              type="password"
              autoComplete="off"
              required
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          {create && (
            <label className="min-w-0 flex-[1_1_220px] text-sm">
              {t("watch.confirmPassphrase")}
              <input
                className={input}
                type="password"
                autoComplete="off"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
          )}
          <button className={primary} disabled={session.busy || !passphrase}>
            {t(create ? "watch.create" : "watch.unlock")}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--soft)]">
          {t(error)}
        </p>
      )}
      <Link
        className="mt-3 inline-flex min-h-11 items-center text-sm text-[var(--accent)] underline"
        to="/saved?view=assets"
      >
        {c("Saved", "已保存")}
      </Link>
    </section>
  );
}

function LookupConsent({
  consent,
  setConsent,
}: {
  consent: boolean;
  setConsent: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-4 space-y-2 text-sm leading-relaxed text-[var(--soft)]">
      <p>{t("watch.disclosure")}</p>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[var(--ink)]">
        <input
          className="h-5 w-5 shrink-0 accent-[var(--accent)]"
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        {t("watch.consent")}
      </label>
    </div>
  );
}

function Workspace({ session, tradeCheckEnabled }: { session: WatchSession; tradeCheckEnabled: boolean }) {
  const { t } = useI18n();
  const c = useCopy();
  const [searchParams] = useSearchParams();
  // Optional handoff from the Research: prefill a validated public
  // address only. Consent, lookup and saving stay explicit user actions.
  const [prefillAddress] = useState(() => {
    const requested = searchParams.get("address")?.trim() ?? "";
    return requested && isAddress(requested, { strict: true }) ? requested : "";
  });
  const [address, setAddress] = useState(prefillAddress);
  const [label, setLabel] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<"watch.error.confirm" | "watch.error.address" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const opsisWorkspaces = import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true";
  const [view, setView] = useState<"wallets" | "inbox" | "feed" | "overlap">(opsisWorkspaces ? "inbox" : "wallets");
  const item =
    session.watches.find((row) => row.id === selected) ?? session.watches[0];
  const addDetails = useRef<HTMLDetailsElement | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const openWallet = (id: string) => {
    setSelected(id);
    setView("wallets");
    setFocusRequest((current) => ({
      id,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  };
  const focusAdd = () => {
    if (addDetails.current) addDetails.current.open = true;
    window.requestAnimationFrame(() => {
      const node = document.getElementById("watch-address-input");
      if (node instanceof HTMLElement) {
        node.scrollIntoView({ block: "center" });
        node.focus({ preventScroll: true });
      }
    });
  };
  useEffect(() => {
    if (!focusRequest || view !== "wallets") return;
    const node = document.getElementById(
      `watch-detail-${focusRequest.id}`,
    );
    if (!node) return;
    node.scrollIntoView({ block: "start" });
    node.focus({ preventScroll: true });
  }, [focusRequest, view]);
  return (
    <div className="min-w-0 space-y-6">
      <div
        role="group"
        aria-label={t("feed.views")}
        className="flex flex-wrap gap-3"
      >
        {opsisWorkspaces && <button
          className={view === "inbox" ? primary : button}
          aria-pressed={view === "inbox"}
          onClick={() => setView("inbox")}
        >
          {c("Inbox", "收件箱")}
        </button>}
        <button
          className={view === "wallets" ? primary : button}
          aria-pressed={view === "wallets"}
          onClick={() => setView("wallets")}
        >
          {t("feed.walletDetails")}
        </button>
        <button
          className={view === "feed" ? primary : button}
          aria-pressed={view === "feed"}
          onClick={() => setView("feed")}
        >
          {t("feed.open")}
        </button>
        <button
          className={view === "overlap" ? primary : button}
          aria-pressed={view === "overlap"}
          onClick={() => setView("overlap")}
        >
          {t("overlap.open")}
        </button>
      </div>
      {view === "inbox" && (
        <WatchInbox
          watches={session.watches}
          onAcknowledge={(entry) => void session.acknowledge(entry.watchId, entry.evidenceId)}
          onSnooze={(entry, until) => void session.snooze(entry.watchId, entry.evidenceId, until)}
          onRestore={(entry) => void session.restore(entry.watchId, entry.evidenceId)}
          onSaveCondition={(watchId, condition) => void session.saveConditions(watchId, [...(session.watches.find((watch) => watch.id === watchId)?.conditions ?? []), condition])}
          onRemoveCondition={(watchId, conditionId) => void session.saveConditions(watchId, (session.watches.find((watch) => watch.id === watchId)?.conditions ?? []).filter((condition) => condition.id !== conditionId))}
          busy={session.busy}
        />
      )}
      <section
        className={`${panel} scroll-mt-24`}
        aria-labelledby="watch-add-title"
      >
        <details ref={addDetails} open={session.watches.length === 0 || Boolean(prefillAddress)}>
          <summary className="min-h-11 cursor-pointer py-2">
            <h2 id="watch-add-title" className="inline text-xl">
              {t("watch.add")}
            </h2>
          </summary>
          <button
            className={`${button} mt-3`}
            disabled={session.busy}
            onClick={() => {
              setAddress(sample);
              setLabel(t("watch.sampleLabel"));
              setConsent(false);
              setError(null);
            }}
          >
            {t("watch.sample")}
          </button>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              const normalized = address.trim();
              if (!isAddress(normalized, { strict: true })) {
                setError("watch.error.address");
                return;
              }
              if (!consent) return;
              setSelected(
                session.watches.find(
                  (row) => row.address === normalized.toLowerCase(),
                )?.id ?? null,
              );
              void session.refresh(normalized.toLowerCase(), label);
            }}
          >
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <label className="min-w-0 text-sm">
                {t("watch.address")}
                <input
                  id="watch-address-input"
                  className={`${input} font-mono text-sm`}
                  value={address}
                  maxLength={128}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x…"
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setConsent(false);
                    setError(null);
                  }}
                />
              </label>
              <label className="min-w-0 text-sm">
                {t("watch.label")}
                <input
                  className={input}
                  value={label}
                  maxLength={80}
                  autoComplete="off"
                  onChange={(event) => setLabel(event.target.value)}
                />
              </label>
            </div>
            <LookupConsent consent={consent} setConsent={setConsent} />
            {error && (
              <p role="alert" className="mb-3 text-sm text-[var(--soft)]">
                {t(error)}
              </p>
            )}
            <button
              className={primary}
              disabled={
                session.busy ||
                !consent ||
                !address ||
                session.watches.length >= 10
              }
            >
              <Eye size={17} aria-hidden />
              {t(session.busy ? "watch.working" : "watch.save")}
            </button>
          </form>
        </details>
      </section>
      <WatchBriefing
        key={view}
        watches={session.watches}
        onWallet={openWallet}
        onAdd={focusAdd}
        compact={view !== "wallets"}
      />
      {view === "wallets" && (
        <section aria-labelledby="watch-list-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="watch-list-title" className="text-xl">
              {t("watch.list")}
            </h2>
            <span className="text-sm text-[var(--soft)]">
              {t("watch.count", { count: session.watches.length })}
            </span>
          </div>
          {!session.watches.length ? (
            <div className={`${panel} border-dashed py-10 text-center`}>
              <Eye
                className="mx-auto mb-4 text-[var(--accent)]"
                size={30}
                aria-hidden
              />
              <h3 className="text-lg">{t("watch.empty")}</h3>
              <p className="mt-2 text-sm text-[var(--soft)]">
                {t("watch.emptyDetail")}
              </p>
            </div>
          ) : (
            <nav
              aria-label={t("watch.list")}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {session.watches.map((row) => (
                <button
                  key={row.id}
                  disabled={session.busy}
                  onClick={() => setSelected(row.id)}
                  aria-current={row.id === item?.id ? "true" : undefined}
                  className={`${panel} text-left transition-colors hover:border-[var(--accent)] ${row.id === item?.id ? "!border-[var(--accent)]" : ""}`}
                >
                  <span className="block truncate text-base font-medium">
                    {row.label}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-[var(--soft)]">
                    {short(row.address)}
                  </span>
                  <span className="mt-4 block break-all text-xl text-[var(--accent)]">
                    {row.snapshots.at(-1)!.nativeBalanceEth}{" "}
                    <span className="text-xs">ETH</span>
                  </span>
                </button>
              ))}
            </nav>
          )}
        </section>
      )}
      {view === "feed" && (
        <ActivityFeed watches={session.watches} onWallet={openWallet} />
      )}
      {view === "overlap" && (
        <WalletOverlap watches={session.watches} onWallet={openWallet} />
      )}
      {item && view === "wallets" && (
        <WatchDetail
          key={`${item.id}:${item.snapshots.at(-1)!.anchor.blockHash}`}
          item={item}
          tradeCheckEnabled={tradeCheckEnabled}
          session={session}
        />
      )}
    </div>
  );
}

function WatchDetail({
  item,
  session,
  tradeCheckEnabled,
}: {
  item: VaultWatch;
  session: WatchSession;
  tradeCheckEnabled: boolean;
}) {
  const { t, locale } = useI18n();
  const c = useCopy();
  const [consent, setConsent] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [deleting, setDeleting] = useState(false);
  const [baseline, setBaseline] = useState(item.snapshots.length - 2);
  const latest = item.snapshots.at(-1)!;
  const before = item.snapshots[baseline];
  const comparison = before ? compareSnapshots(before, latest) : null;
  const gaps = comparison?.gaps ?? [
    ...latest.reconciliation.degradedSources,
    ...latest.reconciliation.truncatedSections,
  ];
  const date = (value: string) => new Date(value).toLocaleString(locale);
  return (
    <section
      id={`watch-detail-${item.id}`}
      tabIndex={-1}
      className="watch-detail scroll-mt-24 space-y-5 outline-none"
      aria-label={t("watch.latest")}
    >
      <div className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-[var(--soft)]">
              {t("watch.latest")}
            </p>
            <h2 className="mt-2 break-words text-2xl">{item.label}</h2>
            <p className="mt-2 break-all font-mono text-xs text-[var(--soft)]">
              {item.address}<ExplorerLink kind="address" value={item.address} />
            </p>
            <p className="mt-2 text-sm text-[var(--soft)]">
              {date(latest.anchor.fetchedAt)} ·{" "}
              {t("watch.block", { block: latest.anchor.blockNumber })}
            </p>
          </div>
          <Eye size={28} className="text-[var(--accent)]" aria-hidden />
        </div>
        <LookupConsent consent={consent} setConsent={setConsent} />
        <div className="mt-2 flex flex-wrap gap-3">
          <button
            className={primary}
            disabled={session.busy || !consent}
            onClick={() => {
              setConsent(false);
              void session.refresh(item.address, item.label, item.id);
            }}
          >
            <RefreshCw
              size={16}
              className={session.busy ? "motion-safe:animate-spin" : ""}
              aria-hidden
            />
            {t(session.busy ? "watch.working" : "watch.refresh")}
          </button>
        </div>
      </div>
      {gaps.length > 0 && (
        <aside
          aria-label={t("watch.partialTitle")}
          className="border-l-2 border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--soft)]"
        >
          <h3 className="font-semibold">{t("watch.partialTitle")}</h3>
          <p className="mt-2 leading-relaxed">{t("watch.partialBody")}</p>
        </aside>
      )}
      {comparison ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="flex items-center gap-3 text-2xl">
              <ArrowDownUp className="text-[var(--accent)]" size={23} aria-hidden />
              {t("watch.compare")}
            </h2>
            <label className="text-sm">
              {t("watch.compareWith")}
              <select
                className={input}
                value={baseline}
                onChange={(event) => setBaseline(Number(event.target.value))}
              >
                {item.snapshots.slice(0, -1).map((row, index) => (
                  <option key={row.anchor.blockHash} value={index}>
                    {t("watch.block", { block: row.anchor.blockNumber })} ·{" "}
                    {date(row.anchor.fetchedAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["watch.changed", comparison.changed],
              ["watch.observed", comparison.observed.length],
              ["watch.unknown", comparison.unknown],
            ].map(([key, count]) => (
              <div key={key} className={panel}>
                <p className="text-sm text-[var(--soft)]">
                  {t(key as "watch.changed")}
                </p>
                <p className="mt-3 text-4xl text-[var(--accent)]">{count}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["watch.before", before],
              ["watch.after", latest],
            ].map(([key, row]) => {
              const snapshot = row as typeof latest;
              return (
                <div key={String(key)} className={panel}>
                  <p className="text-sm text-[var(--soft)]">
                    {t(key as "watch.before")}
                  </p>
                  <p className="my-2 break-all text-xl">
                    {snapshot.nativeBalanceEth} ETH
                  </p>
                  <p className="text-xs text-[var(--soft)]">
                    {t("watch.block", { block: snapshot.anchor.blockNumber })} ·{" "}
                    {date(snapshot.anchor.fetchedAt)}
                  </p>
                </div>
              );
            })}
          </div>
          <section className={panel} aria-labelledby="watch-balances-title">
            <h3 id="watch-balances-title" className="mb-4 text-lg">
              {t("watch.balances")}
            </h3>
            <div className="space-y-3">
              {comparison.rows.map((row) => (
                <article
                  key={row.key}
                  className="grid min-w-0 gap-3 border-t border-[var(--line)] py-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]"
                >
                  <div className="min-w-0">
                    <h4 className="break-words font-medium">{row.label}</h4>
                    {row.contract && (
                      <p className="mt-1 break-all font-mono text-[11px] text-[var(--soft)]">
                        {row.contract}<ExplorerLink kind="token" value={row.contract} />
                      </p>
                    )}
                    {OPSIS_PRESENTATION && tradeCheckEnabled && row.contract && /^0x[0-9a-f]{40}$/i.test(row.contract) && <Link className="opsis-text-link" to={workspaceLink("/check", row.contract)}>{c("Check a new amount →", "核查新数量 →")}</Link>}
                    <p className="mt-1 text-xs text-[var(--soft)]">
                      {t(`watch.status.${row.status}`)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--soft)]">
                      {t("watch.before")}
                    </p>
                    <p className="mt-1 break-all tabular-nums">
                      {row.before ?? t("watch.notReturned")}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--soft)]">{t("watch.after")}</p>
                    <p className="mt-1 break-all tabular-nums">
                      {row.after ?? t("watch.notReturned")}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--soft)]">{t("watch.delta")}</p>
                    <p
                      className="mt-1 break-all font-medium tabular-nums text-[var(--ink)]"
                    >
                      {row.delta ?? "—"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className={`${panel} watch-saved-activity`} aria-labelledby="watch-activity-title">
            <h3 id="watch-activity-title" className="mb-4 text-lg">
              {t("watch.activity")}
            </h3>
            {!comparison.observed.length && (
              <p className="text-sm leading-relaxed text-[var(--soft)]">
                {t("watch.noActivity")}
              </p>
            )}
            {[...comparison.observed].sort((a, b) => b.blockNumber - a.blockNumber).map((tx) => (
              <article
                key={tx.hash}
                className="watch-timeline-item min-w-0 space-y-2 text-sm"
              >
                <p>
                  <span className="text-[var(--accent)]">
                    {t(`watch.flow.${tx.direction}`)}
                  </span>{" "}
                  · {t(`watch.tx.${tx.status}`)} ·{" "}
                  {t(
                    tx.afterBaseline
                      ? "watch.afterBaseline"
                      : "watch.olderDiscovered",
                  )}
                </p>
                <p className="break-all font-mono text-xs text-[var(--soft)]">
                  {tx.hash}<ExplorerLink kind="tx" value={tx.hash} />
                </p>
                <p className="text-[var(--soft)]">
                  {t("watch.block", { block: tx.blockNumber })}
                </p>
                {latest.movements
                  .filter((movement) => movement.transactionHash === tx.hash)
                  .map((movement, index) => (
                    <p key={index} className="break-all">
                      {t(`watch.flow.${movement.direction}`)} ·{" "}
                      {movement.quantity} {visibleTokenText(movement.symbol) || movement.kind}
                      {movement.contract && (
                        <span className="ml-2 font-mono text-xs text-[var(--soft)]">
                          {short(movement.contract)}<ExplorerLink kind="token" value={movement.contract} />
                        </span>
                      )}
                    </p>
                  ))}
              </article>
            ))}
          </section>
        </>
      ) : (
        <div className={`${panel} !border-[var(--accent)]`}>
          <h2 className="text-2xl text-[var(--accent)]">{t("watch.baseline")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--soft)]">
            {t("watch.baselineBody")}
          </p>
          <h3 className="mt-6 text-base">{t("watch.currentHoldings")}</h3>
          <TokenTable tokens={latest.tokens} native={{ quantity: latest.nativeBalanceEth, symbol: latest.chain.nativeSymbol }} />
          <ul className="mt-3 space-y-3 text-sm">
            {latest.nfts.map((nft) => (
              <li className="break-all" key={`${nft.contract}:${nft.tokenId}`}>
                {nft.quantity} × {nft.name || nft.kind} #{nft.tokenId}
                <span className="ml-3 font-mono text-xs text-[var(--soft)]">
                  {nft.contract}<ExplorerLink kind="token" value={nft.contract} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!comparison && <WatchTimeline snapshot={latest} />}
      <div className={panel}>
        <h3 className="text-lg">{t("watch.history")}</h3>
        {import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && <QuantityBars
          title={t("watch.history")} unit="ETH"
          rows={item.snapshots.map((row,index) => ({id: row.anchor.blockHash, label: String(index+1).padStart(2,"0"), value: row.nativeBalanceEth, detail: `${date(row.anchor.fetchedAt)} · ${t("watch.block", { block: row.anchor.blockNumber })}`}))}
          note={locale === "zh-CN" ? "每根柱代表一次独立保存的核查，而非等间隔时间。缺失历史不记为零。" : "Each bar is a separate saved check, not an equal time interval. Missing history is not zero."}
        />}
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {item.snapshots.map((row, index) => (
            <li
              key={row.anchor.blockHash}
              className="min-w-0 border-l-2 border-[var(--accent)] pl-3 text-sm"
            >
              <span className="text-xs text-[var(--accent)]">0{index + 1}</span>
              <p className="my-2 break-all">{row.nativeBalanceEth} ETH</p>
              <p className="text-xs text-[var(--soft)]">
                {date(row.anchor.fetchedAt)}
              </p>
              <p className="text-xs text-[var(--soft)]">
                {t("watch.block", { block: row.anchor.blockNumber })}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-[var(--soft)]">
          {t("watch.retention")}
        </p>
      </div>
      <details className={panel} open={gaps.length > 0}>
        <summary className="cursor-pointer text-base">
          {t("watch.coverage")}
        </summary>
        <p className="mt-4 text-sm leading-relaxed text-[var(--soft)]">
          {t("watch.coverageBody")}
        </p>
        <p className="mt-3 text-sm text-[var(--soft)]">{t("watch.blockNote")}</p>
        {gaps.length > 0 && (
          <div className="mt-4 border-l-2 border-[var(--line)] pl-3 text-sm text-[var(--soft)]">
            <p>{t("watch.coverageGaps")}</p>
            <ul className="mt-2 list-disc space-y-1 break-words pl-5">
              {gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        )}
        <h4 className="mt-4 text-sm">
          {t("watch.sourceCount", { count: latest.citations.length })}
        </h4>
        <ul className="mt-2 space-y-2 text-xs text-[var(--soft)]">
          {latest.citations.map((source) => (
            <li key={source.id} className="break-words">
              {source.provider}:{" "}
              {evidenceUrl(source.url) ? (
                <a
                  className="inline-flex min-h-11 items-center text-[var(--accent)] underline"
                  href={evidenceUrl(source.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  {source.description}
                </a>
              ) : (
                source.description
              )}{" "}
              · {date(source.fetchedAt)}
            </li>
          ))}
        </ul>
      </details>
      <details className={panel}>
        <summary className="cursor-pointer text-sm">
          {t("watch.rename")} / {t("watch.remove")}
        </summary>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void session.rename(item.id, label);
          }}
        >
          <label className="min-w-0 grow text-sm">
            {t("watch.renameLabel")}
            <input
              className={input}
              maxLength={80}
              value={label}
              required
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <button className={button} disabled={session.busy || !label.trim()}>
            {t("watch.rename")}
          </button>
        </form>
        <button
          className={`${button} mt-4`}
          disabled={session.busy}
          onClick={() => setDeleting(true)}
        >
          {t("watch.remove")}
        </button>
        {deleting && (
          <div
            role="group"
            aria-label={t("watch.remove")}
            className="mt-4 space-y-3 border border-[var(--line)] p-4"
          >
            <p className="text-sm">{t("watch.confirmRemove")}</p>
            <div className="flex flex-wrap gap-3">
              <button
                className={button}
                disabled={session.busy}
                onClick={() => void session.remove(item.id)}
              >
                {t("watch.confirmDelete")}
              </button>
              <button className={button} onClick={() => setDeleting(false)}>
                {t("watch.cancel")}
              </button>
            </div>
          </div>
        )}
      </details>
    </section>
  );
}

export default function WatchPage({ tradeCheckEnabled = false }: { tradeCheckEnabled?: boolean }) {
  // The one-off check comes first in Opsis; the legacy build keeps its vault-first flow.
  if (!OPSIS_PRESENTATION) return <SavedWatch tradeCheckEnabled={tradeCheckEnabled} pending={null} onSaved={() => {}} />;
  return <OpsisWatch tradeCheckEnabled={tradeCheckEnabled} />;
}

function OpsisWatch({ tradeCheckEnabled }: { tradeCheckEnabled: boolean }) {
  const c = useCopy();
  const [opened, setOpened] = useState(false);
  const [pending, setPending] = useState<PortfolioSnapshot | null>(null);
  return <div className="watch-workspace space-y-6">
    {!opened ? <>
      <OneOffCheck onSave={(snapshot) => { setPending(snapshot); setOpened(true); }} />
      <button className="opsis-secondary" onClick={() => setOpened(true)}>{c("Open encrypted watchlist", "打开加密观察列表")}</button>
    </> : <>
      <button className="opsis-secondary" onClick={() => { setOpened(false); setPending(null); }}>{c("Run another one-off check", "运行另一次单次核查")}</button>
      <SavedWatch tradeCheckEnabled={tradeCheckEnabled} pending={pending} onSaved={() => setPending(null)} />
    </>}
  </div>;
}

function SavedWatch({ tradeCheckEnabled, pending, onSaved }: { tradeCheckEnabled: boolean; pending: PortfolioSnapshot | null; onSaved: () => void }) {
  const c = useCopy();
  const { t } = useI18n();
  const session = useWatchVault();
  return (
    <main className={OPSIS_PRESENTATION ? "opsis-watch-board watch-workspace" : "watch-legacy-tokens mx-auto w-full max-w-[1240px] space-y-6 px-4 py-8 text-[var(--ink)] sm:px-8 sm:py-12"}>
      {!OPSIS_PRESENTATION && (      <header className="border-b border-[var(--line)] pb-7">
        <p className="flex items-center gap-2 text-xs tracking-wider text-[var(--accent)]">
          <ShieldCheck size={16} aria-hidden />
          {t("watch.badge")}
        </p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
          {t("watch.title")}
        </h1>
        <p className="mt-3 text-xl sm:text-2xl">{t("watch.headline")}</p>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--soft)]">
          {t("watch.intro")}
        </p>
        <ol className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--soft)]">
          {["watch.step1", "watch.step2", "watch.step3"].map((key, index) => (
            <li key={key} className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center border border-[var(--line)] bg-[var(--panel)] text-xs text-[var(--accent)]">
                {index + 1}
              </span>
              {t(key as "watch.step1")}
              {index < 2 && (
                <ArrowRight
                  className="ml-1 text-[var(--soft)]"
                  size={15}
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ol>
      </header>)}
      {session.phase !== "unlocked" ? (
        <Access key={session.epoch} session={session} />
      ) : (
        <div className="flex flex-wrap gap-3">
          <button className={button} onClick={() => session.lock()}>
            <LockKeyhole size={16} aria-hidden />
            {t("watch.lock")}
          </button>
          <button
            className={button}
            disabled={session.busy || Boolean(session.recovery)}
            onClick={() => void session.backup()}
          >
            {t("watch.backup")}
          </button>
          <BackupDownloadLink download={session.download} />
        </div>
      )}
      {session.error && (
        <div
          role="alert"
          className="break-words border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--soft)]"
        >
          {session.error}
        </div>
      )}
      {session.notice && (
        <p
          role="status"
          className="border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--soft)]"
        >
          {t(session.notice)}
        </p>
      )}
      {session.recovery ? (
        <section className={panel}>
          <h2 className="text-xl">{t("watch.recoveryTitle")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft)]">
            {t("watch.recoveryBody")}
          </p>
          <code className="my-5 block select-all break-all border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
            {session.recovery}
          </code>
          <button className={primary} onClick={session.acknowledgeRecovery}>
            {t("watch.recoverySaved")}
          </button>
        </section>
      ) : (
        session.phase === "unlocked" && <>
          {pending && <section className={panel}>
            <p className="break-all">{pending.address}<ExplorerLink kind="address" value={pending.address} /></p>
            <p>{c("Save the snapshot you just checked. No additional public lookup is sent.", "保存刚刚核查的快照，不发送额外的公开查询。")}</p>
            <button className={primary} disabled={session.busy} onClick={() => void session.saveSnapshot(pending, onSaved)}>{c("Save checked snapshot", "保存已核查快照")}</button>
          </section>}
          <Workspace session={session} tradeCheckEnabled={tradeCheckEnabled} />
        </>
      )}
      <p className="text-xs leading-relaxed text-[var(--soft)]">
        {t("watch.storageNote")}
      </p>
    </main>
  );
}
