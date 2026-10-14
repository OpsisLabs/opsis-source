import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { isAddress } from "viem";
import type { PortfolioSnapshot, PortfolioTokenHolding } from "@rh-chain/shared";
import { useCopy } from "../opsis/copy";
import { visibleTokenText } from "../opsis/explorer-facts";
import { useI18n } from "../i18n";
import { checkPublicWallet } from "./one-off";
import { orderTokens, tokenFlags } from "./holdings";

export function TokenTable({ tokens }: { tokens: PortfolioTokenHolding[] }) {
  const c = useCopy();
  return <>
    <div className="min-w-0 max-w-full overflow-x-auto">
      <table className="w-full table-fixed" data-testid="watch-token-table">
        <caption>{c("Observed token balances — bounded coverage", "观察到的代币余额 — 覆盖范围有限")}</caption>
        <thead><tr>
          <th className="w-3/4">{c("Token contract", "代币合约")}</th>
          <th>{c("Quantity", "数量")}</th>
        </tr></thead>
        <tbody>{orderTokens(tokens).map((token) => {
          const { reviewed, lookalike, wellKnown, hidden, scam } = tokenFlags(token);
          return <tr key={token.contract}>
            <td className="break-words align-top">
              <p>{visibleTokenText(token.name)} · {visibleTokenText(token.symbol)}
                {reviewed && <> · <span className="opsis-explorer-tag">{c("Reviewed asset", "已审核资产")}</span></>}</p>
              <p className="break-all font-mono text-xs">{token.contract}</p>
              {lookalike && <p className="text-sm">{c(`Uses the symbol ${lookalike.symbol}, but this is not the reviewed ${lookalike.symbol} contract.`, `使用符号 ${lookalike.symbol}，但这不是已审核的 ${lookalike.symbol} 合约。`)}</p>}
              {!lookalike && wellKnown && <p className="text-sm">{c(`Uses the symbol ${wellKnown}; this contract is not on the Opsis reviewed asset list.`, `使用符号 ${wellKnown}；此合约不在 Opsis 的已审核资产列表中。`)}</p>}
              {hidden && <p className="text-sm">{c("The name or symbol contains hidden characters, shown in brackets above.", "名称或符号含有隐藏字符，已在上方用方括号显示。")}</p>}
              {scam && <p className="text-sm">{c("Blockscout marks this token as a scam.", "Blockscout 将此代币标记为骗局。")}</p>}
            </td>
            <td className="break-all align-top">{token.quantity}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="text-sm">{c("Names and symbols are what each contract reports about itself.", "名称和符号由各合约自行报告。")}</p>
  </>;
}

export default function OneOffCheck({
  onSave,
}: {
  onSave: (snapshot: PortfolioSnapshot) => void;
}) {
  const c = useCopy();
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const [address, setAddress] = useState(() => {
    const value = params.get("address")?.trim() ?? "";
    return isAddress(value, { strict: true }) ? value : "";
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <section
      className="opsis-panel space-y-4"
      aria-label={c("One-off public wallet check", "单次公开钱包核查")}
    >
      <h2>{c("Check a public wallet", "核查公开钱包")}</h2>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!consent || busy) return;
          const abort = new AbortController();
          controller.current = abort;
          setBusy(true);
          setError("");
          setSnapshot(null);
          try {
            const result = await checkPublicWallet(address, abort.signal);
            if (!abort.signal.aborted) setSnapshot(result);
          } catch (cause) {
            if (!abort.signal.aborted)
              setError(
                cause instanceof Error
                  ? cause.message
                  : t("watch.error.refresh"),
              );
          } finally {
            if (!abort.signal.aborted) {
              setBusy(false);
              setConsent(false);
            }
          }
        }}
      >
        <label className="block">
          {t("watch.address")}
          <input
            id="watch-address-input"
            className="mt-2 block min-h-11 w-full min-w-0 border p-3 font-mono"
            value={address}
            maxLength={128}
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            disabled={busy}
            onChange={(event) => {
              setAddress(event.target.value);
              setConsent(false);
              setSnapshot(null);
              setError("");
            }}
          />
        </label>
        <p className="text-sm">{t("watch.disclosure")}</p>
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(event) => setConsent(event.target.checked)}
          />
          {t("watch.consent")}
        </label>
        <button
          className="opsis-primary"
          disabled={busy || !consent || !address.trim()}
        >
          {busy ? c("Checking…", "正在核查…") : c("Run a check", "运行核查")}
        </button>
      </form>
      <p className="text-sm">
        {c(
          "Run a check without a passphrase. The address and result stay in memory for this visit; nothing from this check is saved unless you choose to save it.",
          "无需口令即可核查。地址和结果仅在本次访问的内存中保留；只有选择保存后，才会保存本次核查。",
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {snapshot && (
        <div
          className="min-w-0 max-w-full space-y-3"
          role="region"
          aria-label={c("Public wallet snapshot", "公开钱包快照")}
        >
          <h3>{c("Public wallet snapshot", "公开钱包快照")}</h3>
          <p className="break-all font-mono">
            {snapshot.chain.name} · {snapshot.chain.id} · {snapshot.address}
          </p>
          <p>
            {c("Checked at", "核查时间")}:{" "}
            {new Date(snapshot.anchor.fetchedAt).toLocaleString(locale)} ·{" "}
            {t("watch.block", { block: snapshot.anchor.blockNumber })}
          </p>
          <p className="break-all">
            {snapshot.nativeBalanceEth} {snapshot.chain.nativeSymbol}
          </p>
          <p>{t("watch.blockNote")}</p>
          {(snapshot.reconciliation.degradedSources.length > 0 ||
            snapshot.reconciliation.truncatedSections.length > 0) && (
            <p role="note">{t("watch.partialBody")}</p>
          )}
          <TokenTable tokens={snapshot.tokens} />
          <details>
            <summary>
              {c("Sources and privacy receipt", "来源与隐私回执")}
            </summary>
            <p>
              {c(
                "Sent: this public address only. Server storage: none. This check has not been saved in this browser.",
                "发送内容：仅此公开地址。服务器存储：无。本次核查尚未在此浏览器中保存。",
              )}
            </p>
            <p>
              {c("Provider destinations", "提供方目的地")}:{" "}
              {snapshot.privacy.providerDestinations.join(", ")}
            </p>
            <ul>
              {snapshot.citations.map((source) => (
                <li key={source.id}>
                  {source.provider} · {source.description} · {source.fetchedAt}
                </li>
              ))}
            </ul>
            <p>{t("watch.coverageBody")}</p>
            <ul>
              {[
                ...snapshot.reconciliation.degradedSources,
                ...snapshot.reconciliation.truncatedSections,
              ].map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </details>
          <button className="opsis-primary" onClick={() => onSave(snapshot)}>
            {c("Save to encrypted watchlist", "保存到加密观察列表")}
          </button>
        </div>
      )}
    </section>
  );
}
