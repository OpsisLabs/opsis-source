import { workspaceLink } from "../opsis/model";
import { useCopy } from "../opsis/copy";
import { OPSIS_PRESENTATION } from "../opsis/presentation";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
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

const QuantityBars = lazy(() => import("../opsis/QuantityBars"));

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-[#63564c] px-4 py-2 text-sm text-[#e9e0d1] transition-colors hover:border-[#fa6c34] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff985e] disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} border-[#fa6c34] bg-[#fa6c34] !text-[#191817] hover:bg-[#ff8655]`;
const input =
  "mt-2 block min-h-11 w-full min-w-0 rounded-sm border border-[#63564c] bg-[#191817] px-3 py-2 text-base text-[#e9e0d1] focus:border-[#ff985e] focus:outline-none";
const panel =
  "min-w-0 rounded-sm border border-[#514a45] bg-[#23211f] p-5 sm:p-6";
type WatchSession = ReturnType<typeof useWatchVault>;
const sample = "0x9c34fb7b54f05eba5d28af3ff18f8dd9d66f7292";
const explorer = "https://robinhoodchain.blockscout.com";
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
  const [searchParams] = useSearchParams();
  // A Follow handoff must survive the locked/create states. The address lives in
  // the URL only; it is shown here as a guide and consumed after unlock.
  const requested = searchParams.get("address")?.trim() ?? "";
  const pendingAddress =
    requested && isAddress(requested, { strict: true }) ? requested : "";
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const create = session.phase === "empty";
  return (
    <section className={panel} aria-labelledby="watch-access-title">
      <LockKeyhole className="mb-3 text-[#fa6c34]" size={24} aria-hidden />
      <h2 id="watch-access-title" className="text-xl">
        {t("watch.accessTitle")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#bbb2a8]">
        {t("watch.accessBody")}
      </p>
      {pendingAddress && (
        <p
          role="status"
          className="mt-4 border-l-2 border-[#fa6c34] bg-[#241d18] px-3 py-2 text-sm text-[#ffd0a8]"
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
            setError("");
            if (create && (passphrase.length < 12 || passphrase !== confirm)) {
              setError(t("watch.error.confirm"));
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
        <p role="alert" className="mt-3 text-sm text-[#ffabbc]">
          {error}
        </p>
      )}
      <Link
        className="mt-3 inline-flex min-h-11 items-center text-sm text-[#ff985e] underline"
        to="/vault?view=assets"
      >
        {t("watch.manageVault")}
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
    <div className="mt-4 space-y-2 text-sm leading-relaxed text-[#bbb2a8]">
      <p>{t("watch.disclosure")}</p>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[#e9e0d1]">
        <input
          className="h-5 w-5 shrink-0 accent-[#fa6c34]"
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
  // Optional handoff from the Private Explorer: prefill a validated public
  // address only. Consent, lookup and saving stay explicit user actions.
  const [prefillAddress] = useState(() => {
    const requested = searchParams.get("address")?.trim() ?? "";
    return requested && isAddress(requested, { strict: true }) ? requested : "";
  });
  const [address, setAddress] = useState(prefillAddress);
  const [label, setLabel] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
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
              setError("");
            }}
          >
            {t("watch.sample")}
          </button>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError("");
              const normalized = address.trim();
              if (!isAddress(normalized, { strict: true })) {
                setError(t("watch.error.address"));
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
                    setError("");
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
              <p role="alert" className="mb-3 text-sm text-[#ffabbc]">
                {error}
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
            <span className="text-sm text-[#bbb2a8]">
              {t("watch.count", { count: session.watches.length })}
            </span>
          </div>
          {!session.watches.length ? (
            <div className={`${panel} border-dashed py-10 text-center`}>
              <Eye
                className="mx-auto mb-4 text-[#fa6c34]"
                size={30}
                aria-hidden
              />
              <h3 className="text-lg">{t("watch.empty")}</h3>
              <p className="mt-2 text-sm text-[#bbb2a8]">
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
                  className={`${panel} text-left transition-colors hover:border-[#fa6c34] ${row.id === item?.id ? "!border-[#fa6c34]" : ""}`}
                >
                  <span className="block truncate text-base font-medium">
                    {row.label}
                  </span>
                  <span className="mt-1 block font-mono text-xs text-[#bbb2a8]">
                    {short(row.address)}
                  </span>
                  <span className="mt-4 block break-all text-xl text-[#ff985e]">
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
      className="scroll-mt-24 space-y-5 outline-none"
      aria-label={t("watch.latest")}
    >
      <div className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-[#bbb2a8]">
              {t("watch.latest")}
            </p>
            <h2 className="mt-2 break-words text-2xl">{item.label}</h2>
            <p className="mt-2 break-all font-mono text-xs text-[#bbb2a8]">
              {item.address}
            </p>
            <p className="mt-2 text-sm text-[#bbb2a8]">
              {date(latest.anchor.fetchedAt)} ·{" "}
              {t("watch.block", { block: latest.anchor.blockNumber })}
            </p>
          </div>
          <Eye size={28} className="text-[#fa6c34]" aria-hidden />
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
          <a
            className={button}
            href={`${explorer}/address/${item.address}`}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            {t("watch.addressLink")}
          </a>
        </div>
      </div>
      {gaps.length > 0 && (
        <aside
          aria-label={t("watch.partialTitle")}
          className="border-l-2 border-[#ff985e] bg-[#2a231d] p-4 text-sm text-[#ffd0a8]"
        >
          <h3 className="font-semibold">{t("watch.partialTitle")}</h3>
          <p className="mt-2 leading-relaxed">{t("watch.partialBody")}</p>
        </aside>
      )}
      {comparison ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="flex items-center gap-3 text-2xl">
              <ArrowDownUp className="text-[#fa6c34]" size={23} aria-hidden />
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
                <p className="text-sm text-[#bbb2a8]">
                  {t(key as "watch.changed")}
                </p>
                <p className="mt-3 text-4xl text-[#ff985e]">{count}</p>
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
                  <p className="text-sm text-[#bbb2a8]">
                    {t(key as "watch.before")}
                  </p>
                  <p className="my-2 break-all text-xl">
                    {snapshot.nativeBalanceEth} ETH
                  </p>
                  <p className="text-xs text-[#bbb2a8]">
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
                  className="grid min-w-0 gap-3 border-t border-[#48413b] py-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr]"
                >
                  <div className="min-w-0">
                    <h4 className="break-words font-medium">{row.label}</h4>
                    {row.contract && (
                      <p className="mt-1 break-all font-mono text-[11px] text-[#bbb2a8]">
                        {row.contract}
                      </p>
                    )}
                    {OPSIS_PRESENTATION && tradeCheckEnabled && row.contract && /^0x[0-9a-f]{40}$/i.test(row.contract) && <Link className="opsis-text-link" to={workspaceLink("/check", row.contract)}>{c("Check a new amount →", "核查新数量 →")}</Link>}
                    <p className="mt-1 text-xs text-[#bbb2a8]">
                      {t(`watch.status.${row.status}`)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#bbb2a8]">
                      {t("watch.before")}
                    </p>
                    <p className="mt-1 break-all tabular-nums">
                      {row.before ?? t("watch.notReturned")}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#bbb2a8]">{t("watch.after")}</p>
                    <p className="mt-1 break-all tabular-nums">
                      {row.after ?? t("watch.notReturned")}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-[#bbb2a8]">{t("watch.delta")}</p>
                    <p
                      className={`mt-1 break-all font-medium tabular-nums ${row.delta?.startsWith("-") ? "text-[#ffabbc]" : "text-[#ffd0a8]"}`}
                    >
                      {row.delta ?? "—"}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section className={panel} aria-labelledby="watch-activity-title">
            <h3 id="watch-activity-title" className="mb-4 text-lg">
              {t("watch.activity")}
            </h3>
            {!comparison.observed.length && (
              <p className="text-sm leading-relaxed text-[#bbb2a8]">
                {t("watch.noActivity")}
              </p>
            )}
            {comparison.observed.map((tx) => (
              <article
                key={tx.hash}
                className="min-w-0 space-y-2 border-t border-[#48413b] py-4 text-sm"
              >
                <p>
                  <span className="text-[#ff985e]">
                    {t(`watch.flow.${tx.direction}`)}
                  </span>{" "}
                  · {t(`watch.tx.${tx.status}`)} ·{" "}
                  {t(
                    tx.afterBaseline
                      ? "watch.afterBaseline"
                      : "watch.olderDiscovered",
                  )}
                </p>
                <p className="break-all font-mono text-xs text-[#bbb2a8]">
                  {tx.hash}
                </p>
                <p className="text-[#bbb2a8]">
                  {t("watch.block", { block: tx.blockNumber })}
                </p>
                {latest.movements
                  .filter((movement) => movement.transactionHash === tx.hash)
                  .map((movement, index) => (
                    <p key={index} className="break-all">
                      {t(`watch.flow.${movement.direction}`)} ·{" "}
                      {movement.quantity} {movement.symbol || movement.kind}
                      {movement.contract && (
                        <span className="ml-2 font-mono text-xs text-[#bbb2a8]">
                          {short(movement.contract)}
                        </span>
                      )}
                    </p>
                  ))}
                <a
                  className="inline-flex min-h-11 items-center gap-2 text-[#ff985e] underline"
                  href={`${explorer}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  {t("watch.txLink")}
                  <ArrowRight size={14} aria-hidden />
                </a>
              </article>
            ))}
          </section>
        </>
      ) : (
        <div className={`${panel} !border-[#fa6c34]/60`}>
          <h2 className="text-2xl text-[#ff985e]">{t("watch.baseline")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#bbb2a8]">
            {t("watch.baselineBody")}
          </p>
          <h3 className="mt-6 text-base">{t("watch.currentHoldings")}</h3>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="break-all">{latest.nativeBalanceEth} ETH</li>
            {latest.tokens.map((token) => (
              <li className="break-all" key={token.contract}>
                {token.quantity} {token.symbol || token.name}
                <span className="ml-3 font-mono text-xs text-[#bbb2a8]">
                  {token.contract}
                </span>
              </li>
            ))}
            {latest.nfts.map((nft) => (
              <li className="break-all" key={`${nft.contract}:${nft.tokenId}`}>
                {nft.quantity} × {nft.name || nft.kind} #{nft.tokenId}
                <span className="ml-3 font-mono text-xs text-[#bbb2a8]">
                  {nft.contract}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={panel}>
        <h3 className="text-lg">{t("watch.history")}</h3>
        {import.meta.env.VITE_OPSIS_WORKSPACES_ENABLED === "true" && <Suspense fallback={null}><QuantityBars
          title={t("watch.history")} unit="ETH"
          rows={item.snapshots.map((row,index) => ({id: row.anchor.blockHash, label: String(index+1).padStart(2,"0"), value: row.nativeBalanceEth, detail: `${date(row.anchor.fetchedAt)} · ${t("watch.block", { block: row.anchor.blockNumber })}`}))}
          note={locale === "zh-CN" ? "每根柱代表一次独立保存的核查，而非等间隔时间。缺失历史不记为零。" : "Each bar is a separate saved check, not an equal time interval. Missing history is not zero."}
        /></Suspense>}
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {item.snapshots.map((row, index) => (
            <li
              key={row.anchor.blockHash}
              className="min-w-0 border-l-2 border-[#fa6c34] pl-3 text-sm"
            >
              <span className="text-xs text-[#ff985e]">0{index + 1}</span>
              <p className="my-2 break-all">{row.nativeBalanceEth} ETH</p>
              <p className="text-xs text-[#bbb2a8]">
                {date(row.anchor.fetchedAt)}
              </p>
              <p className="text-xs text-[#bbb2a8]">
                {t("watch.block", { block: row.anchor.blockNumber })}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-[#bbb2a8]">
          {t("watch.retention")}
        </p>
      </div>
      <details className={panel} open={gaps.length > 0}>
        <summary className="cursor-pointer text-base">
          {t("watch.coverage")}
        </summary>
        <p className="mt-4 text-sm leading-relaxed text-[#bbb2a8]">
          {t("watch.coverageBody")}
        </p>
        <p className="mt-3 text-sm text-[#bbb2a8]">{t("watch.blockNote")}</p>
        {gaps.length > 0 && (
          <div className="mt-4 border-l-2 border-[#ff985e] pl-3 text-sm text-[#ffd0a8]">
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
        <ul className="mt-2 space-y-2 text-xs text-[#bbb2a8]">
          {latest.citations.map((source) => (
            <li key={source.id} className="break-words">
              {source.provider}:{" "}
              {evidenceUrl(source.url) ? (
                <a
                  className="inline-flex min-h-11 items-center text-[#ff985e] underline"
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
            className="mt-4 space-y-3 border border-[#b97864] p-4"
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

export default function ScoutWatch({ tradeCheckEnabled = false }: { tradeCheckEnabled?: boolean }) {
  const { t } = useI18n();
  const session = useWatchVault();
  return (
    <main className={OPSIS_PRESENTATION ? "opsis-watch-board" : "mx-auto w-full max-w-[1240px] space-y-6 px-4 py-8 text-[#e9e0d1] sm:px-8 sm:py-12"}>
      {!OPSIS_PRESENTATION && (      <header className="border-b border-[#48413b] pb-7">
        <p className="flex items-center gap-2 text-xs tracking-wider text-[#ff985e]">
          <ShieldCheck size={16} aria-hidden />
          {t("watch.badge")}
        </p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-5xl">
          {t("watch.title")}
        </h1>
        <p className="mt-3 text-xl sm:text-2xl">{t("watch.headline")}</p>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#bbb2a8]">
          {t("watch.intro")}
        </p>
        <ol className="mt-6 flex flex-wrap gap-3 text-sm text-[#ddd3c4]">
          {["watch.step1", "watch.step2", "watch.step3"].map((key, index) => (
            <li key={key} className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center border border-[#7f503b] bg-[#30221a] text-xs text-[#ff985e]">
                {index + 1}
              </span>
              {t(key as "watch.step1")}
              {index < 2 && (
                <ArrowRight
                  className="ml-1 text-[#8c8076]"
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
          className="break-words rounded-sm border border-[#a76978] bg-[#2b2023] p-4 text-sm text-[#ffbbca]"
        >
          {session.error}
        </div>
      )}
      {session.notice && (
        <p
          role="status"
          className="rounded-sm border border-[#52634b] bg-[#20261e] p-4 text-sm text-[#d1dfc9]"
        >
          {t(session.notice)}
        </p>
      )}
      {session.recovery ? (
        <section className={panel}>
          <h2 className="text-xl">{t("watch.recoveryTitle")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#bbb2a8]">
            {t("watch.recoveryBody")}
          </p>
          <code className="my-5 block select-all break-all border border-[#63564c] bg-[#191817] p-4 text-sm">
            {session.recovery}
          </code>
          <button className={primary} onClick={session.acknowledgeRecovery}>
            {t("watch.recoverySaved")}
          </button>
        </section>
      ) : (
        session.phase === "unlocked" && <Workspace session={session} tradeCheckEnabled={tradeCheckEnabled} />
      )}
      <p className="text-xs leading-relaxed text-[#bbb2a8]">
        {t("watch.storageNote")}
      </p>
    </main>
  );
}
