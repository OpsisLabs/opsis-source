import { Fragment, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { isAddress } from "viem";
import type {
  PortfolioSnapshot,
  PortfolioTokenHolding,
} from "@rh-chain/shared";
import { useCopy } from "../opsis/copy";
import { compactAmount } from "../opsis/transactionTimeline";
import { visibleTokenText } from "../opsis/explorer-facts";
import { useI18n } from "../i18n";
import { checkPublicWallet } from "./one-off";
import { orderTokens, tokenFlags, watchTimeline } from "./holdings";
import "./watch.css";

function CopyAddress({ address }: { address: string }) {
  const c = useCopy();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <span className="watch-copy">
      <button
        type="button"
        className="opsis-text-link"
        title={address}
        aria-label={`${c("Copy address", "复制地址")} ${address}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setFailed(false);
          } catch {
            setFailed(true);
          }
        }}
      >
        {address.slice(0, 8)}…{address.slice(-4)} <span aria-hidden>⧉</span>
      </button>
      {copied && !failed && <span role="status">{c("Copied", "已复制")}</span>}
      {failed && (
        <span role="status">
          {c("Select the address to copy it.", "请选择地址并复制。")}{" "}
          <code className="watch-selectable">{address}</code>
        </span>
      )}
    </span>
  );
}

export function TokenTable({
  tokens,
  native,
}: {
  tokens: PortfolioTokenHolding[];
  native?: { quantity: string; symbol: string };
}) {
  const c = useCopy();
  return (
    <>
      <div className="watch-table-wrap min-w-0 max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={c("Observed token balances", "观察到的代币余额")}>
        <table
          className="watch-holdings w-full table-fixed"
          data-testid="watch-token-table"
        >
          <caption>
            {c(
              "Observed token balances — bounded coverage",
              "观察到的代币余额 — 覆盖范围有限",
            )}
          </caption>
          <thead>
            <tr>
              <th>{c("Asset", "资产")}</th>
              <th>{c("Quantity", "数量")}</th>
              <th>{c("Token contract", "代币合约")}</th>
            </tr>
          </thead>
          <tbody>
            {native && (
              <tr className="watch-holding-row">
                <td>
                  <span className="watch-letter" aria-hidden>
                    {native.symbol[0]}
                  </span>
                  {native.symbol}
                </td>
                <td>{native.quantity}</td>
                <td>{c("Native", "原生资产")}</td>
              </tr>
            )}
            {orderTokens(tokens).map((token) => {
              const { reviewed, lookalike, wellKnown, hidden, scam } =
                tokenFlags(token);
              const warnings = [
                lookalike &&
                  c(
                    `Uses the symbol ${lookalike.symbol}, but this is not the reviewed ${lookalike.symbol} contract.`,
                    `使用符号 ${lookalike.symbol}，但这不是已审核的 ${lookalike.symbol} 合约。`,
                  ),
                !lookalike &&
                  wellKnown &&
                  c(
                    `Uses the symbol ${wellKnown}; this contract is not on the Opsis reviewed asset list.`,
                    `使用符号 ${wellKnown}；此合约不在 Opsis 的已审核资产列表中。`,
                  ),
                hidden &&
                  c(
                    "The name or symbol contains hidden characters, shown in brackets above.",
                    "名称或符号含有隐藏字符，已在上方用方括号显示。",
                  ),
                scam &&
                  c(
                    "Blockscout marks this token as a scam.",
                    "Blockscout 将此代币标记为骗局。",
                  ),
              ].filter(Boolean);
              return (
                <Fragment key={token.contract}>
                  <tr className="watch-holding-row">
                    <td>
                      <span className="watch-letter" aria-hidden>
                        {visibleTokenText(token.symbol).slice(0, 1) || "?"}
                      </span>
                      <span>
                        {visibleTokenText(token.name)} ·{" "}
                        {visibleTokenText(token.symbol)}
                        {lookalike && (
                          <> · {c("Lookalike", "同符号不同合约")}</>
                        )}
                      </span>{" "}
                      {reviewed && (
                        <span className="watch-tag">
                          {c("Reviewed asset", "已审核资产")}
                        </span>
                      )}
                    </td>
                    <td>{token.quantity}</td>
                    <td>
                      <CopyAddress address={token.contract} />
                    </td>
                  </tr>
                  {warnings.length > 0 && (
                    <tr className="watch-warning-row">
                      <td colSpan={3}>
                        <div role="note">
                          <span aria-hidden>△ </span>
                          {warnings.map((warning, index) => (
                            <p key={index}>{warning}</p>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="watch-small">
        {c(
          "Names and symbols are what each contract reports about itself.",
          "名称和符号由各合约自行报告。",
        )}
      </p>
    </>
  );
}

export function WatchTimeline({ snapshot }: { snapshot: PortfolioSnapshot }) {
  const c = useCopy();
  const { locale } = useI18n();
  const entries = watchTimeline(snapshot);
  const direction = (value: string) =>
    value === "out"
      ? c("Sent", "已发送")
      : value === "in"
        ? c("Received", "已收到")
        : value === "self"
          ? c("Self transfer", "自身转账")
          : c("Mixed activity", "混合活动");
  return (
    <section
      className="watch-panel watch-activity"
      aria-label={c("Recent changes", "最近变化")}
    >
      <p className="watch-kicker">{c("Observed activity", "已观察活动")}</p>
      <h3>{c("Recent changes", "最近变化")}</h3>
      {!entries.length && (
        <p className="watch-small">
          {c(
            "No activity returned in this bounded check. Missing coverage is not an empty history.",
            "此次有限核查未返回活动。覆盖缺失不代表历史为空。",
          )}
        </p>
      )}
      <ol className="watch-timeline">
        {entries.map((entry) => (
          <li key={entry.hash}>
            <p>
              {entry.transaction?.status === "failed"
                ? c("Failed transaction", "交易失败")
                : entry.approvals.length ||
                    /approve|setApproval/i.test(entry.transaction?.method ?? "")
                  ? c("Approval activity", "授权活动")
                  : entry.movements.length
                    ? c("Observed transfer", "已观察转账")
                    : entry.transaction
                      ? direction(entry.transaction.direction)
                      : c("Observed activity", "已观察活动")}
            </p>
            {entry.transaction?.status !== "failed" && (
              <>
                {entry.movements.map((movement, index) => (
                  <p key={index} className="watch-movement">
                    {direction(movement.direction)} {movement.quantity}{" "}
                    {visibleTokenText(movement.symbol) || movement.kind}
                    {movement.contract && (
                      <>
                        {" "}
                        · <CopyAddress address={movement.contract} />
                      </>
                    )}
                    {movement.tokenId && (
                      <> #{visibleTokenText(movement.tokenId)}</>
                    )}
                  </p>
                ))}
                {!entry.movements.length &&
                  entry.transaction &&
                  entry.transaction.nativeValueEth !== "0" && (
                    <p>
                      {direction(entry.transaction.direction)}{" "}
                      {entry.transaction.nativeValueEth}{" "}
                      {snapshot.chain.nativeSymbol}
                    </p>
                  )}
                {entry.approvals.map((approval, index) => (
                  <p key={index} className="watch-small">
                    {visibleTokenText(approval.symbol)} ·{" "}
                    {approval.active
                      ? c("Active approval", "当前授权")
                      : c("Inactive approval", "非当前授权")}{" "}
                    ·{" "}
                    {approval.unlimited
                      ? c("Unlimited", "无限额")
                      : approval.currentAmount}{" "}
                    · <CopyAddress address={approval.contract} /> ·{" "}
                    {c("Spender", "被授权方")}{" "}
                    <CopyAddress address={approval.spender} />
                  </p>
                ))}
              </>
            )}
            <p className="watch-small">
              {entry.timestamp
                ? new Date(entry.timestamp).toLocaleString(locale)
                : c("Transaction time unknown", "交易时间未知")}
              {entry.blockNumber !== null && (
                <>
                  {" "}
                  · {c("Block", "区块")} {entry.blockNumber}
                </>
              )}
            </p>
            {entry.transaction?.movementCoverage === "partial" && (
              <p className="watch-small">
                {c("Movement coverage is partial.", "转移记录覆盖不完整。")}
              </p>
            )}
            <a
              className="opsis-text-link"
              href={`https://robinhoodchain.blockscout.com/tx/${entry.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              {c("Open transaction evidence ↗", "查看交易证据 ↗")}
            </a>
          </li>
        ))}
      </ol>
      <div className="watch-sources">
        <h3>{c("Sources & read times", "来源与读取时间")}</h3>
        <ul>
          {snapshot.citations.map((source) => {
            let url: string | null = null;
            try {
              const parsed = new URL(source.url);
              if (
                parsed.protocol === "https:" &&
                !parsed.username &&
                !parsed.password
              )
                url = parsed.href;
            } catch {
              /* Keep the source readable when a link is unavailable. */
            }
            const label =
              source.id === "reviewed-asset-sample"
                ? c("Reviewed asset sample", "已审核资产样本")
                : source.provider === "blockscout"
                  ? "Blockscout"
                  : source.id.startsWith("drpc")
                    ? "dRPC"
                    : c("Chain RPC", "链 RPC");
            return (
              <li key={source.id}>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    {label} ↗
                  </a>
                ) : (
                  label
                )}{" "}
                · {c("Read", "读取于")}{" "}
                {new Date(source.fetchedAt).toLocaleString(locale)}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export function WalletSnapshot({
  snapshot,
  onSave,
}: {
  snapshot: PortfolioSnapshot;
  onSave: (snapshot: PortfolioSnapshot) => void;
}) {
  const c = useCopy();
  const { t, locale } = useI18n();
  const partial =
    snapshot.reconciliation.degradedSources.length > 0 ||
    snapshot.reconciliation.truncatedSections.length > 0;
  const activityKnown = snapshot.transactions.length > 0 || !partial;
  const facts = [
    [
      c("ETH balance", "ETH 余额"),
      `${compactAmount(snapshot.nativeBalanceEth) ?? snapshot.nativeBalanceEth} ${snapshot.chain.nativeSymbol}`,
    ],
    [
      c("Tokens checked", "已核查代币"),
      c(
        `${snapshot.reconciliation.tokenConfirmed} of ${snapshot.reconciliation.tokenCandidates}`,
        `${snapshot.reconciliation.tokenCandidates} 个中的 ${snapshot.reconciliation.tokenConfirmed} 个`,
      ),
    ],
    [
      c("Recent transactions", "最近交易"),
      activityKnown
        ? String(snapshot.transactions.length)
        : c("Unknown", "未知"),
    ],
    [
      c("Failed", "失败"),
      activityKnown
        ? String(
            snapshot.transactions.filter((tx) => tx.status === "failed").length,
          )
        : c("Unknown", "未知"),
    ],
  ];
  return (
    <div
      className="watch-result"
      role="region"
      aria-label={c("Public wallet snapshot", "公开钱包快照")}
    >
      <section className="watch-panel watch-identity">
        <header>
          <div>
            <h3>
              {c("Wallet", "钱包")} <CopyAddress address={snapshot.address} />
            </h3>
            <p className="watch-small">
              {c("Checked at block", "核查区块")} {snapshot.anchor.blockNumber}{" "}
              · {new Date(snapshot.anchor.fetchedAt).toLocaleString(locale)}
            </p>
          </div>
          <span className="watch-kicker">
            {c("Public wallet", "公开钱包")} · {snapshot.chain.name} ·{" "}
            {snapshot.chain.id}
          </span>
        </header>
        <dl className="watch-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="watch-small">{t("watch.blockNote")}</p>
      {partial && (
        <p className="watch-notice" role="note">
          {t("watch.partialBody")}
        </p>
      )}
      <div className="watch-result-columns">
        <div>
          <section className="watch-panel">
            <h3>{c("Holdings", "持仓")}</h3>
            <TokenTable
              tokens={snapshot.tokens}
              native={{
                quantity: snapshot.nativeBalanceEth,
                symbol: snapshot.chain.nativeSymbol,
              }}
            />
          </section>
          <div className="watch-save">
            <button className="opsis-action" onClick={() => onSave(snapshot)}>
              {c("Save to encrypted watchlist", "保存到加密观察列表")}
            </button>
            <span className="watch-small">
              {c("Encrypted on this device", "在此设备上加密")}
            </span>
          </div>
        </div>
        <WatchTimeline snapshot={snapshot} />
      </div>
      <details className="watch-receipt">
        <summary>{c("Sources and privacy receipt", "来源与隐私回执")}</summary>
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
        <p>{t("watch.coverageBody")}</p>
        <p>
          {c("Block hash", "区块哈希")}:{" "}
          <code>{snapshot.anchor.blockHash}</code>
        </p>
      </details>
    </div>
  );
}

export default function OneOffCheck({
  onSave,
}: {
  onSave: (snapshot: PortfolioSnapshot) => void;
}) {
  const c = useCopy();
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [address, setAddress] = useState(() => {
    const value = params.get("address")?.trim() ?? "";
    return isAddress(value, { strict: true }) ? value : "";
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"watch.error.address" | "watch.error.refresh" | null>(null);
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return (
    <section
      className="watch-check"
      aria-label={c("One-off public wallet check", "单次公开钱包核查")}
    >
      <h2 className="sr-only">{c("Check a public wallet", "核查公开钱包")}</h2>
      <form
        className="watch-check-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!consent || busy) return;
          if (!isAddress(address.trim(), { strict: true })) {
            setError("watch.error.address");
            return;
          }
          const abort = new AbortController();
          controller.current = abort;
          setBusy(true);
          setError(null);
          setSnapshot(null);
          try {
            const result = await checkPublicWallet(address, abort.signal);
            if (!abort.signal.aborted) setSnapshot(result);
          } catch {
            if (!abort.signal.aborted) setError("watch.error.refresh");
          } finally {
            if (!abort.signal.aborted) {
              setBusy(false);
              setConsent(false);
            }
          }
        }}
      >
        <div className="watch-check-band">
          <label>
            {t("watch.address")}
            <input
              id="watch-address-input"
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
                setError(null);
              }}
            />
          </label>
          <button
            className="opsis-action"
            disabled={busy || !consent || !address.trim()}
          >
            {busy ? c("Checking…", "正在核查…") : c("Run a check", "运行核查")}
          </button>
        </div>
        <label className="watch-consent">
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(event) => setConsent(event.target.checked)}
          />
          {t("watch.consent")}
        </label>
        <p className="watch-small">{t("watch.disclosure")}</p>
      </form>
      <p className="watch-small">
        {c(
          "Run a check without a passphrase. The address and result stay in memory for this visit; nothing from this check is saved unless you choose to save it.",
          "无需口令即可核查。地址和结果仅在本次访问的内存中保留；只有选择保存后，才会保存本次核查。",
        )}
      </p>
      {error && (
        <p role="alert" className="watch-notice">
          {t(error)}
        </p>
      )}
      {snapshot && <WalletSnapshot snapshot={snapshot} onSave={onSave} />}
    </section>
  );
}
