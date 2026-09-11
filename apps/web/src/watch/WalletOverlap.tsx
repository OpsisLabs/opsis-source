import { useMemo, useState } from "react";
import { ArrowUpRight, Layers3 } from "lucide-react";
import type { VaultWatch } from "../vault/types";
import { useI18n } from "../i18n";
import { walletOverlap } from "./overlap";

const panel =
  "min-w-0 rounded-sm border border-[#514a45] bg-[#23211f] p-5 sm:p-6";
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
export function WalletOverlap({
  watches,
  onWallet,
}: {
  watches: VaultWatch[];
  onWallet: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState(() => watches.map((w) => w.id));
  const [query, setQuery] = useState("");
  const result = useMemo(
    () => walletOverlap(watches, selected),
    [watches, selected],
  );
  const rows = result.rows.filter((row) =>
    `${row.symbol} ${row.contract}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const date = (value: string) => new Date(value).toLocaleString(locale);
  return (
    <section aria-labelledby="watch-overlap-title" className="space-y-5">
      <header className={`${panel} !border-[#936042]`}>
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#ff985e]">
          <Layers3 size={16} aria-hidden />
          {t("overlap.badge")}
        </p>
        <h2
          id="watch-overlap-title"
          className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl"
        >
          {t("overlap.title")}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#bbb2a8]">
          {t("overlap.intro")}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#514a45] pt-5">
          <p>
            <span className="block text-3xl text-[#ff985e]">
              {result.rows.length}
            </span>
            <span className="text-sm text-[#bbb2a8]">
              {t("overlap.shared")}
            </span>
          </p>
          <p>
            <span className="block text-3xl text-[#ff985e]">
              {result.wallets.length}
            </span>
            <span className="text-sm text-[#bbb2a8]">
              {t("overlap.selected")}
            </span>
          </p>
        </div>
        <p className="mt-4 border-l-2 border-[#936042] pl-3 text-sm leading-relaxed text-[#bbb2a8]">
          {t("overlap.boundary")}
        </p>
        {result.partial && (
          <p className="mt-3 text-sm text-[#ffd0a8]">{t("overlap.partial")}</p>
        )}
      </header>
      <fieldset className={panel}>
        <legend className="px-2 text-base">{t("overlap.choose")}</legend>
        <div className="flex flex-wrap gap-3">
          {watches.map((w) => (
            <label
              key={w.id}
              className={`flex min-h-12 min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-sm border px-4 py-3 ${selected.includes(w.id) ? "border-[#fa6c34] bg-[#30221a]" : "border-[#63564c]"}`}
            >
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[#fa6c34]"
                checked={selected.includes(w.id)}
                onChange={(e) =>
                  setSelected((ids) =>
                    e.target.checked
                      ? [...ids, w.id]
                      : ids.filter((id) => id !== w.id),
                  )
                }
              />
              <span className="min-w-0 text-sm">
                <span className="block break-words">{w.label}</span>
                <span className="block font-mono text-xs text-[#bbb2a8]">
                  {short(w.address)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-4">
          <button
            className="min-h-11 px-2 text-sm text-[#ff985e] underline"
            onClick={() => setSelected(watches.map((w) => w.id))}
          >
            {t("overlap.selectAll")}
          </button>
          <button
            className="min-h-11 px-2 text-sm text-[#ff985e] underline"
            onClick={() => setSelected([])}
          >
            {t("overlap.clear")}
          </button>
        </div>
      </fieldset>
      <label className="block text-sm">
        {t("overlap.search")}
        <input
          className="mt-2 min-h-12 w-full rounded-sm border border-[#63564c] bg-[#191817] px-4 py-3 text-base focus:outline focus:outline-2 focus:outline-[#ff985e]"
          value={query}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="0x…"
        />
      </label>
      <p role="status" className="text-sm text-[#bbb2a8]">
        {t("overlap.count", { count: rows.length })}
      </p>
      {result.wallets.length < 2 ? (
        <div className={`${panel} border-dashed`}>
          <h3 className="text-lg">{t("overlap.needTwo")}</h3>
          <p className="mt-2 text-sm text-[#bbb2a8]">
            {t("overlap.needTwoBody")}
          </p>
        </div>
      ) : !rows.length ? (
        <div className={`${panel} border-dashed`}>
          <h3 className="text-lg">{t("overlap.empty")}</h3>
          <p className="mt-2 text-sm text-[#bbb2a8]">
            {t(query ? "overlap.noMatch" : "overlap.emptyBody")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <article
              className={panel}
              key={row.contract}
              aria-label={row.contract}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="break-words text-2xl font-medium">
                    {row.symbol}
                  </h3>
                  <a
                    className="mt-2 inline-flex min-h-11 max-w-full items-center gap-2 break-all font-mono text-xs text-[#ff985e] underline"
                    href={`https://robinhoodchain.blockscout.com/token/${row.contract}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    <span className="min-w-0">{row.contract}</span>
                    <ArrowUpRight size={16} className="shrink-0" aria-hidden />
                  </a>
                </div>
                <span className="rounded-sm border border-[#936042] bg-[#30221a] px-3 py-2 text-sm text-[#ffb68b]">
                  {t("overlap.heldBy", {
                    count: row.holders.length,
                    total: result.wallets.length,
                  })}
                </span>
              </div>
              {row.incompatible && (
                <p className="my-3 text-sm text-[#ffd0a8]">
                  {t("overlap.incompatible")}
                </p>
              )}
              <ul className="mt-3 divide-y divide-[#514a45]">
                {row.holders.map((h) => (
                  <li
                    className="grid gap-3 py-4 sm:grid-cols-[1fr_1fr]"
                    key={h.wallet.id}
                  >
                    <div className="min-w-0">
                      <button
                        className="min-h-11 max-w-full text-left text-[#ff985e] underline"
                        onClick={() => onWallet(h.wallet.id)}
                      >
                        <span className="block break-words">
                          {h.wallet.label}
                        </span>
                        <span className="block font-mono text-xs">
                          {short(h.wallet.address)}
                        </span>
                      </button>
                      <p className="mt-2 text-xs text-[#bbb2a8]">
                        {date(h.captured.fetchedAt)} ·{" "}
                        {t("watch.block", { block: h.captured.blockNumber })}
                      </p>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <p className="break-all font-mono text-lg">
                        {h.quantity}
                      </p>
                      <p className="mt-1 break-all text-sm text-[#bbb2a8]">
                        {h.delta !== null && (
                          <span className="mr-2 font-mono text-[#ffb68b]">
                            {h.delta}
                          </span>
                        )}
                        {t(`overlap.change.${h.change}`)}
                      </p>
                      {h.previousAt && (
                        <p className="mt-1 text-xs text-[#bbb2a8]">
                          {t("overlap.since", { time: date(h.previousAt) })}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
      <details className={panel}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm">
          {t("overlap.how")}
        </summary>
        <p className="mt-3 text-sm leading-relaxed text-[#bbb2a8]">
          {t("overlap.method")}
        </p>
      </details>
    </section>
  );
}
