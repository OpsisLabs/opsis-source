import { useMemo, useState } from "react";
import { ListFilter, Radio } from "lucide-react";
import { ExplorerLink } from "../opsis/ExplorerLink";
import type { VaultWatch } from "../vault/types";
import { useI18n } from "../i18n";
import { filterActivity, savedActivity, type ActivityKind } from "./activity";

const panel =
  "min-w-0 rounded-sm border border-[#514a45] bg-[#23211f] p-5 sm:p-6";
const field =
  "mt-2 min-h-11 w-full min-w-0 rounded-sm border border-[#63564c] bg-[#191817] px-3 py-2 text-base text-[#e9e0d1] focus:outline focus:outline-2 focus:outline-[#ff985e]";
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

export function ActivityFeed({
  watches,
  onWallet,
}: {
  watches: VaultWatch[];
  onWallet: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [wallet, setWallet] = useState("");
  const [kind, setKind] = useState<ActivityKind>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const events = useMemo(() => savedActivity(watches), [watches]);
  const rows = filterActivity(events, wallet, kind, query);
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale) : t("feed.timeUnknown");
  const reset = () => {
    setWallet("");
    setKind("all");
    setQuery("");
    setLimit(12);
  };
  return (
    <section aria-labelledby="watch-feed-title" className="space-y-5">
      <header className={`${panel} !border-[#936042]`}>
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#ff985e]">
          <Radio size={16} aria-hidden />
          {t("feed.badge")}
        </p>
        <h2
          id="watch-feed-title"
          className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl"
        >
          {t("feed.title")}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#bbb2a8]">
          {t("feed.intro")}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#514a45] pt-5">
          <p>
            <span className="block text-3xl text-[#ff985e]">
              {events.length}
            </span>
            <span className="text-sm text-[#bbb2a8]">
              {t("feed.transactions")}
            </span>
          </p>
          <p>
            <span className="block text-3xl text-[#ff985e]">
              {watches.length}
            </span>
            <span className="text-sm text-[#bbb2a8]">{t("feed.wallets")}</span>
          </p>
        </div>
        <details className="mt-4 text-sm text-[#bbb2a8]">
          <summary className="min-h-11 cursor-pointer py-3 text-[#e9e0d1]">
            {t("feed.coverage")}
          </summary>
          <p className="leading-relaxed">{t("feed.limits")}</p>
          <ul className="mt-3 space-y-2">
            {watches.map((w) => (
              <li key={w.id} className="break-words">
                {w.label} · {date(w.snapshots.at(-1)!.anchor.fetchedAt)} ·{" "}
                {t("watch.block", {
                  block: w.snapshots.at(-1)!.anchor.blockNumber,
                })}
              </li>
            ))}
          </ul>
        </details>
      </header>
      <div
        className={`${panel} grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]`}
      >
        <label className="min-w-0 text-sm">
          {t("feed.walletFilter")}
          <select
            className={field}
            value={wallet}
            onChange={(e) => {
              setWallet(e.target.value);
              setLimit(12);
            }}
          >
            <option value="">{t("feed.allWallets")}</option>
            {watches.map((w) => (
              <option value={w.id} key={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm">
          {t("feed.typeFilter")}
          <select
            className={field}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ActivityKind);
              setLimit(12);
            }}
          >
            {(["all", "native", "tokens", "nfts"] as const).map((value) => (
              <option key={value} value={value}>
                {t(`feed.kind.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-sm">
          {t("feed.search")}
          <input
            className={field}
            value={query}
            maxLength={128}
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(12);
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p role="status" className="text-[#bbb2a8]">
          {t("feed.showing", {
            count: Math.min(rows.length, limit),
            total: rows.length,
          })}
        </p>
        <button
          className="inline-flex min-h-11 items-center gap-2 px-2 text-[#ff985e] underline"
          onClick={reset}
        >
          <ListFilter size={16} aria-hidden />
          {t("feed.reset")}
        </button>
      </div>
      {!rows.length && (
        <div className={`${panel} border-dashed`}>
          <h3 className="text-lg">{t("feed.empty")}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[#bbb2a8]">
            {t(events.length ? "feed.noMatch" : "feed.noEvidence")}
          </p>
        </div>
      )}
      <ol className="space-y-4">
        {rows.slice(0, limit).map((event) => (
          <li className={panel} key={event.hash}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#514a45] pb-3">
              <span className="font-mono text-sm text-[#ff985e]">
                {short(event.hash)}<ExplorerLink kind="tx" value={event.hash} />
              </span>
              <p className="text-xs text-[#bbb2a8]">
                {t("watch.block", { block: event.block })} ·{" "}
                {t("feed.seenIn", { count: event.observations.length })}
              </p>
            </div>
            {event.conflict && (
              <p className="mt-3 border-l-2 border-[#ff985e] pl-3 text-sm text-[#ffd0a8]">
                {t("feed.conflict")}
              </p>
            )}
            <div className="divide-y divide-[#514a45]">
              {event.observations.map((row) => (
                <article key={row.wallet.id} className="py-4 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      className="min-h-11 min-w-0 max-w-full text-left text-base text-[#ff985e] underline"
                      onClick={() => onWallet(row.wallet.id)}
                    >
                      <span className="block break-words">
                        {row.wallet.label}
                      </span>
                      <span className="block font-mono text-xs">
                        {short(row.wallet.address)}
                      </span>
                    </button>
                    <ExplorerLink kind="address" value={row.wallet.address} />
                    <p className="text-right text-sm">
                      {t(`watch.flow.${row.transaction.direction}`)} ·{" "}
                      {t(`watch.tx.${row.transaction.status}`)}
                      <span className="mt-1 block text-xs text-[#bbb2a8]">
                        {date(row.transaction.timestamp)}
                      </span>
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-[#bbb2a8]">
                    {t(`feed.discovery.${row.discovery}`)}
                  </p>
                  {row.movements.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {row.movements.slice(0, 3).map((m, i) => (
                        <li key={i} className="break-words text-sm">
                          <span className="text-[#ff985e]">
                            {t(`watch.flow.${m.direction}`)}
                          </span>{" "}
                          ·{" "}
                          <span className="break-all font-mono">
                            {m.quantity}
                          </span>{" "}
                          {m.symbol || m.kind}
                          {m.tokenId !== null ? ` #${m.tokenId}` : ""}
                          {m.contract && (
                            <span className="ml-2 font-mono text-xs text-[#bbb2a8]">
                              {short(m.contract)}<ExplorerLink kind="token" value={m.contract} />
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[#bbb2a8]">
                      {t(
                        row.transaction.status === "failed"
                          ? "feed.failed"
                          : "feed.noMovements",
                      )}
                    </p>
                  )}
                  <details className="mt-3 text-sm">
                    <summary className="min-h-11 cursor-pointer py-3 text-[#e9e0d1]">
                      {t("feed.details")}
                    </summary>
                    <p className="break-all text-xs text-[#bbb2a8]">
                      {row.transaction.hash}<ExplorerLink kind="tx" value={row.transaction.hash} />
                    </p>
                    <p className="mt-2 text-xs text-[#bbb2a8]">
                      {t("feed.captured", {
                        time: date(row.captured.fetchedAt),
                        block: row.captured.blockNumber,
                      })}
                    </p>
                    {row.partial && (
                      <p className="mt-3 text-[#ffd0a8]">{t("feed.partial")}</p>
                    )}
                    <ul className="mt-3 space-y-3">
                      {row.movements.map((m, i) => (
                        <li
                          key={i}
                          className="break-all border-l border-[#63564c] pl-3"
                        >
                          {t(`watch.flow.${m.direction}`)} · {m.quantity}{" "}
                          {m.symbol || m.kind}
                          {m.tokenId !== null ? ` #${m.tokenId}` : ""}
                          <span className="block font-mono text-xs text-[#bbb2a8]">
                            {m.contract ?? "ETH"}{m.contract && <ExplorerLink kind="token" value={m.contract} />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {row.partial && (
                    <p className="text-xs text-[#ffd0a8]">
                      {t("feed.partialShort")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {rows.length > limit && (
        <button
          className="min-h-11 border border-[#fa6c34] px-5 py-3 text-[#ff985e]"
          onClick={() => setLimit((n) => n + 12)}
        >
          {t("feed.more")}
        </button>
      )}
    </section>
  );
}
