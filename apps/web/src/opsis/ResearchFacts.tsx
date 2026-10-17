import { useState, useEffect, type ReactNode } from "react";
import type { SourceCitation } from "../dashboard/types";
import { safeHttpUrl } from "../dashboard/adapters";
import type { DecodedAction, Leg, PrivateAnalysis, ResearchFacts } from "../private/api";
import { useCopy } from "./copy";
import {
  explorerCount, explorerNumber, hasHiddenCharacters, holderShares, isBurnAddress,
  latestTimestamp, lookalikeAsset, relativeTime, reviewedAsset,
  researchEvidenceGroups, walletActivity, sharePercent, transactionDirection, transactionMethod, visibleTokenText, wellKnownUnreviewedSymbol,
} from "./explorer-facts";
import { compactAmount, actionAmount, feePercent, formatExactAmount, orderActions, scaleRawAmount, transactionReceiptOutcome, transactionTimelineRows } from "./transactionTimeline";

export function PublicAddress({ address }: { address: string }) {
  const c = useCopy();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return <span className="opsis-address-control">
    <span title={address}>{address.slice(0, 6)}…{address.slice(-4)}</span>
    <button type="button" title={address} aria-label={`${c("Copy address", "复制地址")} ${address}`} onClick={async () => {
      try {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setFailed(false);
      } catch { setFailed(true); }
    }}>{copied ? c("Copied", "已复制") : c("Copy", "复制")}</button>
    {failed && <span role="status">{c("Copy unavailable; select the exact address below.", "无法复制；请选中下方的完整地址。")}</span>}
    {failed && <code>{address}</code>}
  </span>;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** A transfer from or to the zero address is how tokens are issued or removed; say so instead of showing zeros. */
function Party({ address, role }: { address: string; role: "from" | "to" }) {
  const c = useCopy();
  if (address.toLowerCase() !== ZERO_ADDRESS) return <PublicAddress address={address} />;
  return <span>{role === "from"
    ? c("the zero address (newly issued tokens)", "零地址（新发行的代币）")
    : c("the zero address (tokens removed from supply)", "零地址（从供应量中移除的代币）")}</span>;
}

function Amount({ leg }: { leg: Leg }) {
  const c = useCopy();
  const amount = actionAmount(leg);
  return <span>{amount ?? c("Amount unknown", "数量未知")} {leg.token.symbol ?? c("Unknown token", "未知代币")}</span>;
}

function Action({ action }: { action: DecodedAction }) {
  const c = useCopy();
  if (action.kind === "uniswap_v3_swap") {
    const fee = feePercent(action.feeBps);
    return <li>
      <p>{c("Swapped", "兑换了")} <Amount leg={action.sold} /> {c("for", "换得")} <Amount leg={action.bought} />.</p>
      <p className="opsis-small">{c("Sender", "发送方")}: <PublicAddress address={action.sender} /> · {c("Recipient", "接收方")}: <PublicAddress address={action.recipient} /></p>
      <p className="opsis-small">{c("Pool", "资金池")}: <PublicAddress address={action.pool} /> · {c("Fee tier", "费率档位")}: {fee === null ? c("Unknown", "未知") : `${fee}%`}</p>
      <details><summary>{c("Exact amounts and contracts", "精确数量与合约")}</summary>
        <p>{c("Sold raw amount", "卖出原始数量")}: <code>{action.sold.rawAmount}</code></p>
        <p>{c("Bought raw amount", "买入原始数量")}: <code>{action.bought.rawAmount}</code></p>
        <p>{action.sold.token.symbol ?? c("Sold token", "卖出代币")}: <code>{action.sold.token.address}</code></p>
        <p>{action.bought.token.symbol ?? c("Bought token", "买入代币")}: <code>{action.bought.token.address}</code></p>
      </details>
    </li>;
  }
  return <li>
    <p>{action.kind === "erc20_transfer" ? <>
      {c("Transferred", "转移了")} <Amount leg={action} /> {c("from", "从")} <Party address={action.from} role="from" /> {c("to", "至")} <Party address={action.to} role="to" />.
    </> : <>
      <PublicAddress address={action.owner} /> {action.unlimited ? c("granted unlimited spending permission for", "授予无限支出权限，代币为") : c("set spending permission for", "设置支出权限，数量为")} {action.unlimited ? action.token.symbol ?? c("Unknown token", "未知代币") : <Amount leg={action} />} {c("to", "给")} <PublicAddress address={action.spender} />.
    </>}</p>
    <details><summary>{c("Exact amount and contract", "精确数量与合约")}</summary>
      <p>{c("Raw amount", "原始数量")}: <code>{action.rawAmount}</code></p>
      <p>{c("Token contract", "代币合约")}: <code>{action.token.address}</code></p>
    </details>
  </li>;
}

export function DecodedActions({ actions, coverage }: { actions: DecodedAction[]; coverage: ResearchFacts["decodeCoverage"] }) {
  const c = useCopy();
  return <section className="opsis-decoded-actions" data-testid="decoded-actions">
    <h3>{c("What happened", "发生了什么")}</h3>
    <ol>{orderActions(actions).map((action) => <Action key={`${action.logIndex}:${action.kind}`} action={action} />)}</ol>
    {coverage === "partial" && <p className="opsis-small">{c("Some receipt logs were not decoded; this view covers only the decoded actions.", "部分收据日志未能解码；此视图仅涵盖已解码的操作。")}</p>}
  </section>;
}

function ObservedTime({ value }: { value: unknown }) {
  const c = useCopy();
  const [exact, setExact] = useState(false);
  const time = relativeTime(value);
  return time ? <span className="opsis-explorer-time">
    <button type="button" aria-expanded={exact} aria-label={`${c("Show exact time", "显示精确时间")} ${c(time.en, time.zh)}`} onClick={() => setExact(!exact)}>
      <time dateTime={time.exact} title={time.exact}>{c(time.en, time.zh)}</time>
    </button>{exact && <> · <code>{time.exact}</code></>}
  </span> : <span>{c("Time unknown", "时间未知")}</span>;
}

/** Why explorer data is missing, placed next to the part that is missing. A plain failure needs no extra words. */
function ExplorerReason({ reason }: { reason: ResearchFacts["explorerUnavailableReason"] }) {
  const c = useCopy();
  if (reason === "daily_limit") return <>{c("Opsis has used today's Blockscout allowance; this data returns after 00:00 UTC.", "Opsis 已用完今日的 Blockscout 配额；此数据在 00:00 UTC 后恢复。")}</>;
  if (reason === "rate_limited") return <>{c("Blockscout was busy during this lookup; try again in a minute.", "本次查询时 Blockscout 繁忙；请在一分钟后重试。")}</>;
  return null;
}

function Share({ value }: { value: unknown }) {
  const c = useCopy();
  return <>{sharePercent(value) ?? c("Unknown", "未知")}</>;
}

export function TokenFacts({ facts, showTiles = true }: { facts: ResearchFacts; showTiles?: boolean }) {
  const c = useCopy();
  const decimals = explorerCount(facts.decimals);
  const supply = scaleRawAmount(facts.totalSupply, decimals);
  const distribution = facts.holderCoverage === "top_holders" || (facts.holderCoverage !== "unavailable" && Array.isArray(facts.topHolders));
  const history = facts.activityCoverage === "indexed_window" || (facts.activityCoverage !== "unavailable" && Array.isArray(facts.recentTransfers));
  const rows = facts.recentTransfers ?? [];
  const shares = holderShares(facts);
  const largestBar = Math.max(0, ...(facts.topHolders ?? []).slice(0, 10).map((holder) => {
    const share = explorerNumber(holder.share);
    return share !== null && share <= 100 ? share : 0;
  }));
  const rpc = facts.sourceCoverage === "rpc_sample_only" || facts.metadataCoverage === "rpc_partial" || facts.metadataCoverage === "rpc_insufficient";
  return <div data-testid="token-facts" className="opsis-explorer-facts">
    {showTiles && <TokenNameOrigin address={facts.address} />}
    {showTiles && <ResearchTiles facts={facts} type="token" />}
    <dl className="research-token-metadata">
      <div><dt>{c("Decimals", "小数位")}</dt><dd>{decimals !== null && decimals <= 255 ? decimals : c("Unknown", "未知")}</dd></div>
      <div><dt>{c("Total supply", "总供应量")}</dt><dd>{formatExactAmount(supply) ?? c("Unknown", "未知")}</dd></div>
    </dl>
    {typeof facts.totalSupply === "string" && <details><summary>{c("Exact supply", "精确供应量")}</summary>
      {supply !== null && <p>{c("Total supply", "总供应量")}: <code>{supply}</code></p>}
      <p>{c("Raw supply", "原始供应量")}: <code>{facts.totalSupply}</code></p>
    </details>}
    {facts.explorerReputation === "scam" && <p className="opsis-small">{c("Blockscout marks this token as a scam.", "Blockscout 将此代币标记为骗局。")}</p>}
    {(distribution || facts.holderCoverage === "unavailable") && <section className="research-card research-holders" data-testid="token-holders">
      <div className="research-card-heading"><h3>{c("Who holds it", "谁持有它")}</h3><span>{c("Top 10 hold", "前十大持有")} <Share value={shares.ten} />*</span></div>
      {facts.holderCoverage === "unavailable" ? <p>{c("Holder data could not be read from Blockscout.", "无法从 Blockscout 读取持有人数据。")} <ExplorerReason reason={facts.explorerUnavailableReason} /></p> : <>
        <p className="opsis-small">{c("These are the largest", "这些是从 Blockscout 读取的最大的")} {explorerCount(facts.holdersAnalyzed) ?? facts.topHolders?.length ?? c("Unknown", "未知")} {c("holders read from Blockscout. Shares are percentages of total supply.", "个持有人。占比均以总供应量为基准。")}</p>
        {!!facts.topHolders?.length && <ol className="research-holder-list">{facts.topHolders.slice(0, 10).map((holder, index) => {
          const share = explorerNumber(holder.share);
          const valid = share !== null && share <= 100;
          return <li key={holder.address} data-testid="holder-bar">
            <span className="research-rank">{String(index + 1).padStart(2, "0")}</span>
            <PublicAddress address={holder.address} />
            <span className="research-bar-track" aria-hidden="true"><span style={{ width: valid && largestBar > 0 ? String(share / largestBar * 100) + "%" : "0%" }} /></span>
            <span className="research-share"><Share value={holder.share} /></span>
            <span className="opsis-explorer-tags">
              {holder.label && <span>{visibleTokenText(holder.label)}</span>}
              {holder.isPool && <span>{c("Trading pool", "交易池")}</span>}
              {holder.isContract && <span>{c("Contract", "合约")}</span>}
              {(holder.isBurn || isBurnAddress(holder.address)) && <span>{c("Burn address", "销毁地址")}</span>}
              {holder.flaggedScam && <span>{c("Flagged by the explorer", "被区块浏览器标记")}</span>}
            </span>
          </li>;
        })}</ol>}
        <p className="research-share-summary">{c("In trading pools", "交易池中的占比")}: <Share value={facts.liquidityPoolShare} /> · {c("Burned share", "销毁地址占比")}: <Share value={shares.burned} /></p>
        <details><summary>{c("Concentration, pools and burns", "集中度、交易池与销毁地址")}</summary>
        <dl className="opsis-metrics">
          <div><dt>{c("Largest holder, excluding trading pools and burn addresses", "最大持有人，不含交易池和销毁地址")}</dt><dd><Share value={shares.largest} /></dd></div>
          <div><dt>{c("Ten largest, excluding trading pools and burn addresses", "前十大持有人，不含交易池和销毁地址")}</dt><dd><Share value={shares.ten} /></dd></div>
          <div><dt>{c("In trading pools", "交易池中的占比")}</dt><dd><Share value={facts.liquidityPoolShare} /></dd></div>
          {(explorerNumber(shares.burned) ?? 0) > 0 && <div><dt>{c("Burned share", "销毁地址占比")}</dt><dd><Share value={shares.burned} /></dd></div>}
          {explorerNumber(facts.deployerStillHolds) !== null && !isBurnAddress(facts.deployer) && <div><dt>{c("Deployer still holds", "部署者仍持有")}{typeof facts.deployer === "string" && <> · <PublicAddress address={facts.deployer} /></>}</dt><dd><Share value={facts.deployerStillHolds} /></dd></div>}
        </dl>
        </details>
        <p className="opsis-small">{c("* Top 10 excludes trading pools and burn addresses. Bars scale to the largest returned holder; numbers are shares of total supply. Observed balances · Blockscout", "* 前十大不含交易池和销毁地址。条形以返回的最大持有人为比例基准；数字为总供应量占比。观察到的余额 · Blockscout")}</p>
      </>}
    </section>}
    {(history || facts.activityCoverage === "unavailable") && <section className="research-card" data-testid="token-transfers">
      <h3>{c("Recent transfers", "近期转移")}</h3>
      {facts.activityCoverage === "unavailable" ? <p>{c("Recent transfers could not be read from Blockscout.", "无法从 Blockscout 读取近期转移。")} <ExplorerReason reason={facts.explorerUnavailableReason} /></p> : <>
        <p className="opsis-small">{rows.length} {c("transfers in this Blockscout window.", "笔转移记录在此 Blockscout 窗口中。")}{rows.length > 0 && <> {c("Latest", "最近一笔")}: <ObservedTime value={latestTimestamp(rows)} /></>}</p>
        {rows.length > 0 && <table className="research-table">
          <thead><tr><th>{c("Time", "时间")}</th><th>{c("From → to", "发送方 → 接收方")}</th><th>{c("Amount", "数量")}</th></tr></thead>
          <tbody>{rows.slice(0, 5).map((row, index) => <tr key={String(row.transactionHash) + ":" + index}>
            <td><ObservedTime value={row.timestamp} /></td>
            <td><Party address={row.from} role="from" /> <span aria-hidden="true">→</span> <Party address={row.to} role="to" /></td>
            <td>{formatExactAmount(row.formattedValue) ?? c("Amount unknown", "数量未知")} {visibleTokenText(row.tokenSymbol ?? "")}</td>
          </tr>)}</tbody>
        </table>}
      </>}
    </section>}
    {facts.explorerObservedAt && <p className="opsis-small" data-testid="explorer-read-time">{c("Blockscout data read", "Blockscout 数据读取于")}: <ObservedTime value={facts.explorerObservedAt} />{facts.explorerCached && <> · {c("Reused from that read.", "复用了该次读取的数据。")}</>}</p>}
    {rpc ? <p className="opsis-small" data-testid="research-token-rpc-coverage">
      {c("Opsis could not see holders, indexed activity or contract verification. Available metadata is sampled from independent latest-state RPC reads, with no shared block anchor; proxy status and sellability remain unknown.", "Opsis 无法查看持有人、索引活动或合约验证状态。可用元数据来自独立的最新状态 RPC 读取，未锚定至同一区块；代理状态和可售性仍未知。")}
      {facts.explorerUnavailableReason && <> <ExplorerReason reason={facts.explorerUnavailableReason} /></>}
    </p> : null}
  </div>;
}

function Balance({ balance }: { balance: NonNullable<ResearchFacts["tokenBalances"]>[number] }) {
  const c = useCopy();
  const reviewed = reviewedAsset(balance.tokenAddress);
  const lookalike = lookalikeAsset(balance.tokenSymbol, balance.tokenAddress);
  const wellKnown = wellKnownUnreviewedSymbol(balance.tokenSymbol, balance.tokenAddress);
  const hidden = hasHiddenCharacters(balance.tokenName) || hasHiddenCharacters(balance.tokenSymbol);
  return <li>
    <p>{typeof balance.tokenName === "string" ? visibleTokenText(balance.tokenName) : c("Unknown token", "未知代币")} · {typeof balance.tokenSymbol === "string" ? visibleTokenText(balance.tokenSymbol) : c("Symbol unknown", "符号未知")}
      {reviewed && <> · <span className="opsis-explorer-tag">{c("Reviewed asset", "已审核资产")}</span></>}</p>
    <strong>{formatExactAmount(balance.formattedValue) ?? c("Amount unknown", "数量未知")}</strong>
    <p className="opsis-identity">{typeof balance.tokenAddress === "string" ? <PublicAddress address={balance.tokenAddress} /> : c("Contract unknown", "合约未知")}</p>
    {lookalike && <p className="opsis-small">{c(`Uses the symbol ${lookalike.symbol}, but this is not the reviewed ${lookalike.symbol} contract.`, `使用符号 ${lookalike.symbol}，但这不是已审核的 ${lookalike.symbol} 合约。`)}</p>}
    {!lookalike && wellKnown && <p className="opsis-small">{c(`Uses the symbol ${wellKnown}; this contract is not on the Opsis reviewed asset list.`, `使用符号 ${wellKnown}；此合约不在 Opsis 的已审核资产列表中。`)}</p>}
    {hidden && <p className="opsis-small">{c("The name or symbol contains hidden characters, shown in brackets above.", "名称或符号含有隐藏字符，已在上方用方括号显示。")}</p>}
    {balance.reputation === "scam" && <p className="opsis-small">{c("Blockscout marks this token as a scam.", "Blockscout 将此代币标记为骗局。")}</p>}
  </li>;
}

export function WalletBalances({ facts }: { facts: ResearchFacts }) {
  const c = useCopy();
  const [showAll, setShowAll] = useState(false);
  const balances = facts.tokenBalanceCoverage === "unavailable" ? [] : (facts.tokenBalances ?? []).filter((balance) => balance && typeof balance === "object");
  const reviewed = balances.filter((balance) => reviewedAsset(balance.tokenAddress));
  // Tokens that borrow a known symbol, hide characters or carry the explorer's
  // scam flag come first, so a lookalike is never folded away behind the limit.
  const flagged = (balance: (typeof balances)[number]) => Boolean(lookalikeAsset(balance.tokenSymbol, balance.tokenAddress)
    || wellKnownUnreviewedSymbol(balance.tokenSymbol, balance.tokenAddress)
    || hasHiddenCharacters(balance.tokenName) || hasHiddenCharacters(balance.tokenSymbol)
    || balance.reputation === "scam");
  const unreviewed = balances.filter((balance) => !reviewedAsset(balance.tokenAddress));
  const other = [...unreviewed.filter(flagged), ...unreviewed.filter((balance) => !flagged(balance))];
  return <section data-testid="wallet-balances" className="opsis-explorer-facts research-card">
    <h3>{c("Holdings", "持仓")}</h3>
    <p>{c("Native balance", "原生余额")}: {formatExactAmount(facts.nativeBalanceEth) ?? c("Unknown", "未知")} ETH</p>
    {reviewed.length > 0 && <ul className="opsis-balance-list" data-testid="reviewed-balances">{reviewed.map((balance, index) => <Balance key={index} balance={balance} />)}</ul>}
    {other.length > 0 && <>
      <h4>{c("Other tokens", "其他代币")}</h4>
      <p className="opsis-small">{c("Names and symbols are what each contract reports about itself. Balances are reported by Blockscout.", "名称和符号由各合约自行报告。余额由 Blockscout 报告。")}</p>
      <ul className="opsis-balance-list" data-testid="other-balances">{(showAll ? other : other.slice(0, 10)).map((balance, index) => <Balance key={index} balance={balance} />)}</ul>
      {other.length > 10 && <button type="button" onClick={() => setShowAll(!showAll)}>{showAll ? c("Show fewer tokens", "收起代币") : c("Show all other tokens", "显示所有其他代币")}</button>}
    </>}
    {facts.tokenBalanceCoverage === "unavailable" ? <p>{c("Token balances could not be read from Blockscout.", "无法从 Blockscout 读取代币余额。")} <ExplorerReason reason={facts.explorerUnavailableReason} /></p>
      : balances.length === 0 && <p>{c("No token balances were returned in this sample.", "此采样未返回代币余额。")}</p>}
    {facts.tokenBalanceCoverage === "reviewed_asset_sample" && <p className="opsis-small">{c("This is a reviewed sample of contracts checked; other tokens may be held.", "这是已核查合约的审核采样；还可能持有其他代币。")}</p>}
    {reviewed.length > 0 && facts.tokenBalanceCoverage !== "reviewed_asset_sample" && <p className="opsis-small">{c("Observed balances · Blockscout", "观察到的余额 · Blockscout")}</p>}
  </section>;
}

export function WalletTransactions({ facts, address }: { facts: ResearchFacts; address: string }) {
  const c = useCopy();
  const rows = facts.recentTransactions ?? [];
  const failed = walletActivity(facts).failed;
  return <section data-testid="wallet-transactions" className="opsis-explorer-facts research-card">
    <h3>{c("Recent transactions", "近期交易")}</h3>
    {facts.activityCoverage === "unavailable" || !Array.isArray(facts.recentTransactions) ? <p>{c("Recent transactions could not be read from Blockscout.", "无法从 Blockscout 读取近期交易。")} <ExplorerReason reason={facts.explorerUnavailableReason} /></p> : <>
      <p className="opsis-small">{rows.length} {c("transactions in this Blockscout window.", "笔交易记录在此 Blockscout 窗口中。")}{failed !== null && failed > 0 && <> {failed} {failed === 1 ? c("failed transaction in this window.", "笔交易在此窗口中失败。") : c("failed transactions in this window.", "笔交易在此窗口中失败。")}</>}</p>
      {rows.length > 0 && <table className="research-table research-wallet-table">
        <thead><tr><th>{c("Time", "时间")}</th><th>{c("Direction", "方向")}</th><th>{c("Counterparty", "交易对方")}</th><th>{c("Method / value", "方法／金额")}</th></tr></thead><tbody>{rows.slice(0, 10).map((row) => {
        const direction = transactionDirection(row.from, row.to, address);
        const counterparty = direction === "sent" ? row.to : direction === "received" ? row.from : direction === "self" ? address : null;
        const method = transactionMethod(row);
        const value = scaleRawAmount(row.value, 18);
        return <tr key={row.hash}>
          <td><ObservedTime value={row.timestamp} /></td><td>{direction === "sent" ? c("Sent", "发送") : direction === "received" ? c("Received", "接收") : direction === "self" ? c("Self", "自身") : c("Direction unknown", "方向未知")}</td>
          <td>{counterparty ? <PublicAddress address={counterparty} /> : c("Unknown", "未知")}</td>
          <td>{method.kind === "decoded" ? method.text : method.kind === "transfer" ? c("Transfer", "转账") : <>{c("Contract call", "合约调用")}{method.text && <> · <code>{method.text}</code></>}</>}
            {value !== null && /[1-9]/.test(value) && <> · {formatExactAmount(value)} ETH</>}
            {value === null && <> · {c("Amount unknown", "数量未知")}</>}
            {transactionReceiptOutcome(row.status) === "failed" && <> · <span className="opsis-explorer-tag">{c("Failed", "失败")}</span></>}
            {transactionReceiptOutcome(row.status) === "unknown" && <> · {c("Status unknown", "状态未知")}</>}
          </td>
        </tr>;
      })}</tbody></table>}
    </>}
  </section>;
}

function Tile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return <div className="research-tile" data-testid="research-fact-tile"><dt>{label}</dt><dd>{value}</dd>{detail && <dd className="research-tile-detail">{detail}</dd>}</div>;
}

export function ResearchTiles({ facts, type }: { facts: ResearchFacts; type: "token" | "wallet" }) {
  const c = useCopy();
  const unknown = c("Unknown", "未知");
  const notRead = c("Counter not read", "未读取计数");
  const count = (value: unknown) => {
    const number = explorerCount(value);
    return number === null ? unknown : <span className="research-number">{formatExactAmount(String(number))}</span>;
  };
  const activity = walletActivity(facts);
  const tokenCount = facts.tokenBalanceCoverage === "unavailable" || !Array.isArray(facts.tokenBalances) ? null : facts.tokenBalances.length;
  return <dl className="research-tiles" data-testid="research-fact-tiles">
    {type === "token" ? <>
      <Tile label={c("Holders · Blockscout", "持有人 · Blockscout")} value={count(facts.holders)} detail={explorerCount(facts.holders) === null ? notRead : undefined} />
      <Tile label={c("Transfers (lifetime) · Blockscout", "转移（累计）· Blockscout")} value={count(facts.lifetimeTransfers)} detail={explorerCount(facts.lifetimeTransfers) === null ? notRead : undefined} />
      <Tile label={c("Source code · Blockscout", "源代码 · Blockscout")} value={facts.verified === true ? c("Verified", "已验证") : facts.verified === false ? c("Not verified", "未验证") : unknown} detail={facts.verified == null ? c("Contract record not read", "未读取合约记录") : undefined} />
      <Tile label={c("Contract", "合约")} value={facts.proxy === true ? c("Upgradeable proxy", "可升级代理") : facts.proxy === false ? c("Not a proxy", "非代理合约") : unknown} detail={<>
        {facts.proxy == null && c("Proxy record not read", "未读取代理记录")}
        {facts.proxy === true && facts.proxyType && visibleTokenText(facts.proxyType)}
        {facts.proxy === true && facts.implementations?.map((implementation) => <p key={implementation.address}>{c("Implementation", "实现合约")}: <PublicAddress address={implementation.address} />{implementation.name && <> · {visibleTokenText(implementation.name)}</>}</p>)}
      </>} />
    </> : <>
      <Tile label={c("ETH balance", "ETH 余额")} value={compactAmount(facts.nativeBalanceEth) === null ? unknown : <span title={formatExactAmount(facts.nativeBalanceEth) ?? undefined}>{compactAmount(facts.nativeBalanceEth)}</span>} detail={formatExactAmount(facts.nativeBalanceEth) === null ? c("Native balance not read", "未读取原生余额") : c("Observed sample", "观察采样")} />
      <Tile label={c("Tokens", "代币")} value={tokenCount ?? unknown} detail={tokenCount === null ? c("Token balances not read", "未读取代币余额") : c("In the returned sample", "返回采样中的数量")} />
      <Tile label={c("Recent transactions", "近期交易")} value={activity.count ?? unknown} detail={activity.count === null ? c("Transaction window not read", "未读取交易窗口") : c("In this window", "此窗口中的数量")} />
      <Tile label={c("Failed", "失败")} value={activity.failed ?? unknown} detail={activity.failed === null ? c("Transaction statuses not fully read", "未完整读取交易状态") : c("In this window", "此窗口中的数量")} />
    </>}
  </dl>;
}

export function ResearchIdentity({ entity, checkedAt }: { entity: PrivateAnalysis["entity"]; checkedAt?: string }) {
  const c = useCopy();
  const facts = entity.facts;
  const symbol = typeof facts.symbol === "string" ? visibleTokenText(facts.symbol) : c("Token", "代币");
  const name = typeof facts.name === "string" ? visibleTokenText(facts.name) : "";
  const outcome = transactionReceiptOutcome(facts.status);
  const block = transactionTimelineRows(facts).find((row) => row.key === "block")?.value;
  return <header className="research-identity" data-testid="research-identity">
    <div className="research-identity-title"><h2>{entity.type === "token" ? symbol : entity.type === "wallet" ? c("Wallet", "钱包") : entity.type === "transaction" ? c("Transaction", "交易") : c("Contract", "合约")}</h2>
      {entity.type === "token" && name && name !== symbol && <span>{name}</span>}
      {entity.type === "wallet" && <span className="research-identity-short">{entity.value.slice(0, 8)}…{entity.value.slice(-4)}</span>}
    </div>
    <p className="opsis-identity"><PublicAddress address={entity.value} /> · {c("Chain", "链")} {entity.chainId} · {entity.type === "token" ? c("Token", "代币") : entity.type === "wallet" ? c("Wallet", "钱包") : entity.type === "transaction" ? c("Transaction", "交易") : c("Contract", "合约")}</p>
    <details className="research-exact-identity"><summary>{c("Exact identifier", "完整标识符")}</summary><code>{entity.value}</code></details>
    {entity.type === "transaction" && <p className="opsis-identity">{outcome === "success" ? c("Success", "成功") : outcome === "failed" ? c("Failed", "失败") : outcome === "pending" ? c("Pending", "待处理") : c("Status unknown", "状态未知")} · {c("Block", "区块")} {block ?? c("Unknown", "未知")} · <ObservedTime value={facts.timestamp} /></p>}
    <p className="opsis-small" data-testid={entity.type !== "token" ? "explorer-read-time" : undefined}>{c("Read", "读取于")} <ObservedTime value={facts.explorerObservedAt ?? checkedAt} /> · {facts.explorerObservedAt ? "Blockscout" : c("Chain data", "链上数据")}</p>
    {entity.type === "token" && <TokenNameOrigin address={entity.value} />}
  </header>;
}

export function ResearchEvidence({ sources }: { sources: SourceCitation[] }) {
  const c = useCopy();
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 901px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return <details className="research-evidence research-card" data-testid="research-evidence" open={desktop || undefined}>
    <summary><span>{c("Sources & read times", "来源与读取时间")}</span><small>{sources.length} {c("observations", "条观察记录")}</small></summary>
    <div className="research-evidence-groups">
      {sources.length === 0 && <p>{c("No source receipts returned.", "未返回来源记录。")}</p>}
      {researchEvidenceGroups(sources).map((group) => <section key={group.sources[0].id}>
        <h4>{visibleTokenText(group.label) || c("Source", "来源")}</h4>
        {group.sources.map((source) => <p key={source.id}>
          {safeHttpUrl(source.url) ? <a href={safeHttpUrl(source.url)!} target="_blank" rel="noopener noreferrer">{visibleTokenText(source.provider ?? c("Unknown source", "来源未知"))} ↗</a> : visibleTokenText(source.provider ?? c("Unknown source", "来源未知"))}
          <span>{c("Read", "读取于")} <ObservedTime value={source.fetchedAt} /></span>
        </p>)}
      </section>)}
      <p className="opsis-small">{c("Public data. Time-stamped.", "公开数据，附有时间戳。")}</p>
    </div>
  </details>;
}

function TokenNameOrigin({ address }: { address: unknown }) {
  const c = useCopy();
  return <p className="opsis-small" data-testid="token-name-origin">{reviewedAsset(address)
      ? c("This contract is on the Opsis reviewed asset list.", "此合约在 Opsis 的已审核资产列表中。")
      : c("Name and symbol are what this contract reports about itself. Anyone can deploy a token with any name, so identify it by the contract address above.", "名称和符号由该合约自行报告。任何人都可以用任意名称部署代币，请以上方的合约地址为准。")}</p>;
}
