import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, ScrollText } from "lucide-react";
import type { VaultWatch } from "../vault/types";
import { useI18n, type TranslationKey } from "../i18n";
import {
  buildBriefing,
  type Briefing,
  type BriefingCategory,
  type BriefingFinding,
  type BriefingUnknown,
  type BriefingWalletState,
} from "./briefing";

const panel =
  "min-w-0 rounded-sm border border-[#514a45] bg-[#23211f] p-5 sm:p-6";
const field =
  "mt-2 min-h-11 w-full min-w-0 rounded-sm border border-[#63564c] bg-[#191817] px-3 py-2 text-base text-[#e9e0d1] focus:border-[#ff985e] focus:outline-none";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-[#63564c] px-4 py-2 text-sm text-[#e9e0d1] transition-colors hover:border-[#fa6c34] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff985e]";
const explorer = "https://robinhoodchain.blockscout.com";
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function categoryKey(category: BriefingCategory): TranslationKey {
  return `watch.briefing.category.${category}`;
}

function observeKey(category: BriefingCategory): TranslationKey {
  switch (category) {
    case "new-activity":
      return "watch.briefing.observe.new-activity";
    case "failed-activity":
      return "watch.briefing.observe.failed-activity";
    case "older-activity":
      return "watch.briefing.observe.older-activity";
    default:
      return "watch.briefing.observe.balance";
  }
}

function whyKey(category: BriefingCategory): TranslationKey {
  switch (category) {
    case "new-activity":
      return "watch.briefing.why.new-activity";
    case "failed-activity":
      return "watch.briefing.why.failed-activity";
    case "older-activity":
      return "watch.briefing.why.older-activity";
    default:
      return "watch.briefing.why.balance";
  }
}

function unknownKey(status: BriefingUnknown["status"]): TranslationKey {
  switch (status) {
    case "newly-observed":
      return "watch.briefing.unknown.newly-observed";
    case "unavailable":
      return "watch.briefing.unknown.unavailable";
    default:
      return "watch.briefing.unknown.metadata-changed";
  }
}

function stateReason(state: BriefingWalletState): TranslationKey {
  return `watch.briefing.reason.${state.reason}`;
}

function FindingCard({
  finding,
  onWallet,
}: {
  finding: BriefingFinding;
  onWallet: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(locale)
      : t("watch.briefing.notReturned");
  const observation =
    finding.category === "balance-increase" ||
    finding.category === "balance-decrease"
      ? t("watch.briefing.observe.balance", {
          label: finding.label,
          direction: t(
            finding.category === "balance-increase"
              ? "watch.briefing.increased"
              : "watch.briefing.decreased",
          ),
          delta: finding.delta?.replace(/^[+-]/, "") ?? "",
        })
      : t(observeKey(finding.category));
  const txUrl =
    finding.transactionHash &&
    safeUrl(`${explorer}/tx/${finding.transactionHash}`);
  return (
    <article className={panel} aria-label={t(categoryKey(finding.category))}>
      <p className="text-xs uppercase tracking-wider text-[#ff985e]">
        {t(categoryKey(finding.category))}
      </p>
      <p className="mt-2 text-base leading-relaxed">{observation}</p>
      <p className="mt-2 break-words text-sm text-[#bbb2a8]">
        {finding.wallets
          .map((wallet) =>
            t("watch.briefing.walletContext", {
              label: wallet.label,
              address: short(wallet.address),
            }),
          )
          .join(" · ")}
      </p>
      {finding.beforeAt &&
        finding.afterAt &&
        finding.observations.length <= 1 && (
        <p className="mt-1 text-xs text-[#bbb2a8]">
          {t("watch.briefing.between", {
            before: date(finding.beforeAt),
            after: date(finding.afterAt),
            beforeBlock: finding.beforeBlock ?? 0,
            afterBlock: finding.afterBlock ?? 0,
          })}
        </p>
      )}
      {finding.category === "balance-increase" ||
      finding.category === "balance-decrease" ? (
        finding.shared && finding.shared.length > 0 ? (
          <p className="mt-2 text-sm text-[#ffd0a8]">
            {t("watch.briefing.shared.note", {
              count: finding.shared.length,
            })}
          </p>
        ) : null
      ) : null}
      {finding.incompatible && (
        <p className="mt-2 text-sm text-[#ffd0a8]">
          {t("watch.briefing.shared.incompatible")}
        </p>
      )}
      {finding.conflict && (
        <p className="mt-2 border-l-2 border-[#ff985e] pl-3 text-sm text-[#ffd0a8]">
          {t("watch.briefing.conflict")}
        </p>
      )}
      {finding.windowMixed && !finding.conflict && (
        <p className="mt-2 border-l-2 border-[#936042] pl-3 text-sm text-[#ffd0a8]">
          {t("watch.briefing.windowMixed")}
        </p>
      )}
      {(finding.partial || finding.gaps.length > 0) && (
        <p className="mt-2 text-sm text-[#ffd0a8]">
          {t("watch.briefing.partial")}
        </p>
      )}
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-3 text-[#e9e0d1]">
          {t("watch.briefing.evidence")}
        </summary>
        <div className="space-y-4 border-t border-[#514a45] pt-4">
          <div>
            <h4 className="text-sm">{t("watch.briefing.why")}</h4>
            <p className="mt-1 leading-relaxed text-[#bbb2a8]">
              {t(whyKey(finding.category))}
            </p>
          </div>
          {finding.asset === "transaction" ? (
            <div className="space-y-4">
              <p className="break-all font-mono text-xs text-[#bbb2a8]">
                {finding.transactionHash}
              </p>
              {finding.observations.map((row) => (
                <div
                  key={row.wallet.id}
                  className="border-l border-[#63564c] pl-3"
                >
                  <p className="break-words">
                    {t("watch.briefing.walletContext", {
                      label: row.wallet.label,
                      address: short(row.wallet.address),
                    })}
                  </p>
                  <p className="mt-1 text-xs text-[#bbb2a8]">
                    {t("watch.briefing.observation.window", {
                      before: date(row.beforeAt),
                      after: date(row.afterAt),
                      beforeBlock: row.beforeBlock,
                      afterBlock: row.afterBlock,
                    })}
                  </p>
                  <p className="mt-1 text-[#bbb2a8]">
                    {t(`watch.tx.${row.status}`)} ·{" "}
                    {t(
                      row.afterBaseline
                        ? "watch.afterBaseline"
                        : "watch.olderDiscovered",
                    )}
                  </p>
                  {row.movements.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {row.movements.map((movement, index) => (
                        <li key={index} className="break-words">
                          {t(`watch.flow.${movement.direction}`)} ·{" "}
                          <span className="break-all font-mono">
                            {movement.quantity}
                          </span>{" "}
                          {movement.symbol || movement.kind}
                          {movement.tokenId !== null
                            ? ` #${movement.tokenId}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              {finding.observations.every(
                (row) => row.movements.length === 0,
              ) && (
                <p className="text-[#bbb2a8]">
                  {t("watch.briefing.noMovements")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    ["watch.briefing.before", finding.before],
                    ["watch.briefing.after", finding.after],
                    ["watch.briefing.delta", finding.delta],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-xs text-[#bbb2a8]">{t(key)}</p>
                    <p className="mt-1 break-all tabular-nums">
                      {value ?? t("watch.briefing.notReturned")}
                    </p>
                  </div>
                ))}
              </div>
              {finding.shared && finding.shared.length > 0 && (
                <div>
                  <h4 className="text-sm">{finding.label}</h4>
                  <p className="mt-1 break-all font-mono text-xs text-[#bbb2a8]">
                    {finding.contract}
                  </p>
                  <ul className="mt-2 divide-y divide-[#514a45]">
                    {finding.shared.map((holder) => (
                      <li key={holder.wallet.id} className="space-y-1 py-3">
                        <p className="break-words">
                          {holder.wallet.label} ·{" "}
                          <span className="font-mono text-xs text-[#bbb2a8]">
                            {short(holder.wallet.address)}
                          </span>
                        </p>
                        <p className="break-all tabular-nums">
                          {holder.before ?? t("watch.briefing.notReturned")} →{" "}
                          {holder.after}
                          {holder.delta !== null && (
                            <span className="ml-2 text-[#ffb68b]">
                              {holder.delta}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[#bbb2a8]">
                          {t("watch.briefing.between", {
                            before: date(holder.beforeAt),
                            after: date(holder.afterAt),
                            beforeBlock: holder.beforeBlock ?? 0,
                            afterBlock: holder.afterBlock,
                          })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div>
            <h4 className="text-sm">{t("watch.briefing.sources")}</h4>
            <ul className="mt-2 space-y-2 text-xs text-[#bbb2a8]">
              {finding.sources.map((source) => {
                const href = source.url ? safeUrl(source.url) : null;
                return (
                  <li
                    key={`${source.id}|${source.fetchedAt}|${source.url ?? ""}`}
                    className="break-words"
                  >
                    {href ? (
                      <a
                        className="inline-flex min-h-11 items-center text-[#ff985e] underline"
                        href={href}
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
                );
              })}
            </ul>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className={button}
              onClick={() => {
                const wallet = finding.wallets[0];
                if (wallet) onWallet(wallet.id);
              }}
            >
              {t("watch.briefing.openWallet")}
            </button>
            {txUrl && (
              <a
                className={button}
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                {t("watch.briefing.openTx")}
                <ArrowRight size={14} aria-hidden />
              </a>
            )}
          </div>
        </div>
      </details>
    </article>
  );
}

function summaryLine(briefing: Briefing, t: ReturnType<typeof useI18n>["t"]) {
  if (briefing.phase === "empty") return t("watch.briefing.emptyTitle");
  if (briefing.phase === "unsupported")
    return t("watch.briefing.unsupported", {
      count: briefing.unsupported,
    });
  if (briefing.phase === "baseline")
    return t("watch.briefing.baselineTitle");
  return t("watch.briefing.showing", {
    shown: Math.min(3, briefing.findings.length),
    total: briefing.findings.length,
  });
}

export function WatchBriefing({
  watches,
  onWallet,
  onAdd,
  compact = false,
}: {
  watches: VaultWatch[];
  onWallet: (id: string) => void;
  onAdd: () => void;
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const [walletId, setWalletId] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [openCompact, setOpenCompact] = useState(false);
  const options = useMemo(() => {
    const seen = new Set<string>();
    return watches.filter((wallet) => {
      const key = wallet.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [watches]);
  const selectedFilter = options.some((wallet) => wallet.id === walletId)
    ? walletId
    : "";
  const briefing = useMemo(
    () => buildBriefing(watches, selectedFilter || null),
    [watches, selectedFilter],
  );
  const shown = expanded ? briefing.findings : briefing.findings.slice(0, 3);
  const date = (value: string) => new Date(value).toLocaleString(locale);
  const unsupported = briefing.wallets.filter(
    (state) => state.status === "unsupported",
  );
  const baselineWallet = briefing.wallets.find(
    (state) => state.status === "baseline",
  )?.wallet;
  const isCompact = compact && !openCompact;
  const filterPanel =
    options.length > 0 ? (
      <div className={`${panel} grid gap-4 sm:grid-cols-[2fr_1fr]`}>
        <label className="min-w-0 text-sm">
          {t("watch.briefing.filter")}
          <select
            className={field}
            value={selectedFilter}
            onChange={(event) => {
              setWalletId(event.target.value);
              setExpanded(false);
            }}
          >
            <option value="">{t("watch.briefing.filterAll")}</option>
            {options.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.label}
              </option>
            ))}
          </select>
        </label>
        <p className="self-end text-sm text-[#bbb2a8]">{summaryLine(briefing, t)}</p>
      </div>
    ) : null;
  const limitationsPanel =
    briefing.partial || briefing.gaps.length > 0 ? (
      <aside
        aria-label={t("watch.briefing.partial")}
        className="border-l-2 border-[#ff985e] bg-[#2a231d] p-4 text-sm text-[#ffd0a8]"
      >
        <h3 className="font-medium">{t("watch.briefing.partial")}</h3>
        {briefing.gaps.length > 0 && (
          <>
            <p className="mt-2">{t("watch.briefing.gaps")}</p>
            <ul className="mt-2 list-disc space-y-1 break-words pl-5">
              {briefing.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </>
        )}
      </aside>
    ) : null;
  const unknownsPanel =
    briefing.unknowns.length > 0 ? (
      <div className={`${panel} !border-[#936042]`}>
        <h3 className="text-lg">{t("watch.briefing.unknown.title")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#bbb2a8]">
          {t("watch.briefing.unknown.body")}
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {briefing.unknowns.map((unknown) => (
            <li
              key={`${unknown.wallet.id}:${unknown.key}`}
              className="break-words"
            >
              <span>{unknown.label}</span> ·{" "}
              <span className="text-[#ffd0a8]">{t(unknownKey(unknown.status))}</span>
              {unknown.contract && (
                <span className="ml-2 font-mono text-xs text-[#bbb2a8]">
                  {short(unknown.contract)}
                  {unknown.tokenId ? ` #${unknown.tokenId}` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  const statusPanel =
    unsupported.length > 0 ||
    (briefing.baselineOnly > 0 && briefing.phase === "ready") ? (
      <div className={`${panel} !border-[#936042]`}>
        {unsupported.length > 0 && (
          <>
            <h3 className="text-base">
              {t("watch.briefing.unsupported", {
                count: unsupported.length,
              })}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#bbb2a8]">
              {t("watch.briefing.unsupportedBody")}
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {unsupported.map((state) => (
                <li key={state.wallet.id} className="break-words">
                  <span>{state.wallet.label}</span> ·{" "}
                  <span className="text-[#bbb2a8]">{t(stateReason(state))}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {briefing.baselineOnly > 0 && briefing.phase === "ready" && (
          <p className="mt-3 text-sm leading-relaxed text-[#bbb2a8]">
            {t("watch.briefing.baselineBody", {
              count: briefing.baselineOnly,
            })}
          </p>
        )}
      </div>
    ) : null;
  return (
    <section aria-labelledby="watch-briefing-title" className="space-y-4">
      <header className={`${panel} !border-[#936042]`}>
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#ff985e]">
          <ScrollText size={16} aria-hidden />
          {t(
            briefing.phase === "ready"
              ? "watch.briefing.eyebrow"
              : "watch.briefing.badge",
          )}
        </p>
        <h2
          id="watch-briefing-title"
          className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl"
        >
          {t("watch.briefing.title")}
        </h2>
        {!isCompact && (
          <>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#bbb2a8]">
              {t("watch.briefing.intro")}
            </p>
            {briefing.window && (
              <p className="mt-3 text-sm text-[#bbb2a8]">
                {t("watch.briefing.window", {
                  fromBlock: briefing.window.fromBlock,
                  toBlock: briefing.window.toBlock,
                  from: date(briefing.window.fromAt),
                  to: date(briefing.window.toAt),
                })}
              </p>
            )}
          </>
        )}
        <p className="mt-4 border-l-2 border-[#936042] pl-3 text-sm leading-relaxed text-[#bbb2a8]">
          {t("watch.briefing.limits")}
        </p>
      </header>

      {isCompact ? (
        <div className={panel}>
          <p className="text-sm text-[#bbb2a8]">{summaryLine(briefing, t)}</p>
          {briefing.partial && (
            <p className="mt-2 text-sm text-[#ffd0a8]">
              {t("watch.briefing.partial")}
            </p>
          )}
          <button className={`${button} mt-4`} onClick={() => setOpenCompact(true)}>
            {t("watch.briefing.compact.show")}
          </button>
        </div>
      ) : (
        <>
          {compact && (
            <button
              className={button}
              onClick={() => setOpenCompact(false)}
            >
              {t("watch.briefing.compact.hide")}
            </button>
          )}
          {filterPanel}
          {briefing.phase === "empty" ? (
            <div className={`${panel} border-dashed`}>
              <h3 className="text-lg">{t("watch.briefing.emptyTitle")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#bbb2a8]">
                {t("watch.briefing.emptyBody")}
              </p>
              <button className={`${button} mt-4`} onClick={onAdd}>
                {t("watch.briefing.emptyAction")}
              </button>
            </div>
          ) : briefing.phase === "unsupported" ? (
            <div className={`${panel} border-dashed`}>
              <h3 className="text-lg">
                {t("watch.briefing.unsupported", {
                  count: briefing.unsupported,
                })}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#bbb2a8]">
                {t("watch.briefing.unsupportedBody")}
              </p>
            </div>
          ) : briefing.phase === "baseline" ? (
            <div className={`${panel} border-dashed`}>
              <h3 className="text-lg">{t("watch.briefing.baselineTitle")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#bbb2a8]">
                {t("watch.briefing.baselineBody", {
                  count: briefing.baselineOnly,
                })}
              </p>
              <button
                className={`${button} mt-4`}
                onClick={() => {
                  if (baselineWallet) onWallet(baselineWallet.id);
                }}
              >
                {t("watch.briefing.baselineAction")}
              </button>
            </div>
          ) : (
            <>
              {!briefing.findings.length ? (
                <div className={`${panel} border-dashed`}>
                  <h3 className="text-lg">{t("watch.briefing.noChanges")}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#bbb2a8]">
                    {t("watch.briefing.noChangesBody")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {shown.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      onWallet={onWallet}
                    />
                  ))}
                </div>
              )}
              {briefing.findings.length > 3 && (
                <button
                  className={button}
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? (
                    <ChevronUp size={16} aria-hidden />
                  ) : (
                    <ChevronDown size={16} aria-hidden />
                  )}
                  {t(
                    expanded
                      ? "watch.briefing.showFewer"
                      : "watch.briefing.viewAll",
                    { count: briefing.findings.length },
                  )}
                </button>
              )}
              {unknownsPanel}
              {limitationsPanel}
              {statusPanel}
            </>
          )}
        </>
      )}
    </section>
  );
}
