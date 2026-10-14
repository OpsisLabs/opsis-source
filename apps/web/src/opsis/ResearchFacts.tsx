import { useState } from "react";
import type { DecodedAction, Leg, ResearchFacts } from "../private/api";
import { useCopy } from "./copy";
import {
  explorerCount, explorerNumber, hasHiddenCharacters, holderShares, isBurnAddress,
  latestTimestamp, lookalikeAsset, relativeTime, reviewedAsset,
  sharePercent, transactionDirection, transactionMethod, visibleTokenText, wellKnownUnreviewedSymbol,
} from "./explorer-facts";
import { actionAmount, feePercent, formatExactAmount, orderActions, scaleRawAmount } from "./transactionTimeline";

function PublicAddress({ address }: { address: string }) {
  const c = useCopy();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return <span className="opsis-address-control">
    <span title={address}>{address.slice(0, 8)}…{address.slice(-6)}</span>
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

function ExplorerReason({ reason }: { reason: ResearchFacts["explorerUnavailableReason"] }) {
  const c = useCopy();
  if (reason === "daily_limit") return <>{c("Opsis has used today's Blockscout allowance. Holder and history data return after 00:00 UTC.", "Opsis 已用完今日的 Blockscout 配额。持有人和历史数据在 00:00 UTC 后恢复。")}</>;
  if (reason === "rate_limited") return <>{c("Blockscout was busy, so holder and history data were skipped for this lookup. Try again in a minute.", "Blockscout 繁忙，本次查询跳过了持有人和历史数据。请在一分钟后重试。")}</>;
  if (reason === "unavailable") return <>{c("Holder and history data could not be read from Blockscout.", "无法从 Blockscout 读取持有人和历史数据。")}</>;
  return null;
}

function Share({ value }: { value: unknown }) {
  const c = useCopy();
  return <>{sharePercent(value) ?? c("Unknown", "未知")}</>;
}

export function TokenFacts({ facts }: { facts: ResearchFacts }) {
  const c = useCopy();
  const decimals = explorerCount(facts.decimals);
  const supply = scaleRawAmount(facts.totalSupply, decimals);
  const holders = explorerCount(facts.holders);
  const transfers = explorerCount(facts.lifetimeTransfers);
  const explorer = facts.holderCoverage === "top_holders" || holders !== null;
  const distribution = facts.holderCoverage === "top_holders" || (facts.holderCoverage !== "unavailable" && Array.isArray(facts.topHolders));
  const history = facts.activityCoverage === "indexed_window" || (facts.activityCoverage !== "unavailable" && Array.isArray(facts.recentTransfers));
  const rows = facts.recentTransfers ?? [];
  const shares = holderShares(facts);
  const rpc = facts.sourceCoverage === "rpc_sample_only" || facts.metadataCoverage === "rpc_partial" || facts.metadataCoverage === "rpc_insufficient";
  return <div data-testid="token-facts" className="opsis-explorer-facts">
    <p className="opsis-small" data-testid="token-name-origin">{reviewedAsset(facts.address)
      ? c("This contract is on the Opsis reviewed asset list.", "此合约在 Opsis 的已审核资产列表中。")
      : c("Name and symbol are what this contract reports about itself. Anyone can deploy a token with any name, so identify it by the contract address above.", "名称和符号由该合约自行报告。任何人都可以用任意名称部署代币，请以上方的合约地址为准。")}</p>
    <dl className="opsis-metrics">
      <div><dt>{c("Decimals", "小数位")}</dt><dd>{decimals !== null && decimals <= 255 ? decimals : c("Unknown", "未知")}</dd></div>
      <div><dt>{c("Total supply", "总供应量")}</dt><dd title={supply ?? undefined}>{formatExactAmount(supply) ?? c("Unknown", "未知")}</dd></div>
      {explorer && <>
        <div><dt>{c("Holders · Blockscout", "持有人 · Blockscout")}</dt><dd>{holders === null ? c("Unknown", "未知") : formatExactAmount(String(holders))}</dd></div>
        <div><dt>{c("Transfers (lifetime) · Blockscout", "转移（累计）· Blockscout")}</dt><dd>{transfers === null ? c("Unknown", "未知") : formatExactAmount(String(transfers))}</dd></div>
        <div><dt>{c("Source code · Blockscout", "源代码 · Blockscout")}</dt><dd>{facts.verified === true ? c("Verified", "已验证") : facts.verified === false ? c("Not verified", "未验证") : c("Unknown", "未知")}</dd></div>
        <div><dt>{c("Upgradeable proxy · Blockscout", "可升级代理 · Blockscout")}</dt><dd>{facts.proxy === true ? <>
          {c("Yes", "是")}{facts.proxyType && <> · {visibleTokenText(facts.proxyType)}</>}
          {facts.implementations?.map((implementation) => <p className="opsis-small" key={implementation.address}>{c("Implementation", "实现合约")}: <PublicAddress address={implementation.address} />{implementation.name && <> · {visibleTokenText(implementation.name)}</>}</p>)}
        </> : facts.proxy === false ? c("No", "否") : c("Unknown", "未知")}</dd></div>
      </>}
    </dl>
    {typeof facts.totalSupply === "string" && <details><summary>{c("Exact supply", "精确供应量")}</summary>
      {supply !== null && <p>{c("Total supply", "总供应量")}: <code>{supply}</code></p>}
      <p>{c("Raw supply", "原始供应量")}: <code>{facts.totalSupply}</code></p>
    </details>}
    {facts.explorerReputation === "scam" && <p className="opsis-small">{c("Blockscout marks this token as a scam.", "Blockscout 将此代币标记为骗局。")}</p>}
    {(distribution || facts.holderCoverage === "unavailable") && <section data-testid="token-holders">
      <h3>{c("Who holds it", "谁持有它")}</h3>
      {facts.holderCoverage === "unavailable" ? <p>{c("Holder data could not be read from Blockscout.", "无法从 Blockscout 读取持有人数据。")}</p> : <>
        <p className="opsis-small">{c("These are the largest", "这些是从 Blockscout 读取的最大的")} {explorerCount(facts.holdersAnalyzed) ?? facts.topHolders?.length ?? c("Unknown", "未知")} {c("holders read from Blockscout. Shares are percentages of total supply.", "个持有人。占比均以总供应量为基准。")}</p>
        <dl className="opsis-metrics">
          <div><dt>{c("Largest holder, excluding trading pools and burn addresses", "最大持有人，不含交易池和销毁地址")}</dt><dd><Share value={shares.largest} /></dd></div>
          <div><dt>{c("Ten largest, excluding trading pools and burn addresses", "前十大持有人，不含交易池和销毁地址")}</dt><dd><Share value={shares.ten} /></dd></div>
          <div><dt>{c("In trading pools", "交易池中的占比")}</dt><dd><Share value={facts.liquidityPoolShare} /></dd></div>
          {(explorerNumber(shares.burned) ?? 0) > 0 && <div><dt>{c("Burned share", "销毁地址占比")}</dt><dd><Share value={shares.burned} /></dd></div>}
          {explorerNumber(facts.deployerStillHolds) !== null && !isBurnAddress(facts.deployer) && <div><dt>{c("Deployer still holds", "部署者仍持有")}{typeof facts.deployer === "string" && <> · <PublicAddress address={facts.deployer} /></>}</dt><dd><Share value={facts.deployerStillHolds} /></dd></div>}
        </dl>
        {!!facts.topHolders?.length && <ul className="opsis-balance-list">{facts.topHolders.slice(0, 10).map((holder) => <li key={holder.address}>
          <PublicAddress address={holder.address} />{holder.label && <> · {visibleTokenText(holder.label)}</>} · <strong><Share value={holder.share} /></strong>
          <p className="opsis-small opsis-explorer-tags">
            {holder.isPool && <span>{c("Trading pool", "交易池")}</span>}
            {holder.isContract && <span>{c("Contract", "合约")}</span>}
            {(holder.isBurn || isBurnAddress(holder.address)) && <span>{c("Burn address", "销毁地址")}</span>}
            {holder.flaggedScam && <span>{c("Flagged by the explorer", "被区块浏览器标记")}</span>}
          </p>
        </li>)}</ul>}
      </>}
    </section>}
    {(history || facts.activityCoverage === "unavailable") && <section data-testid="token-transfers">
      <h3>{c("Recent transfers", "近期转移")}</h3>
      {facts.activityCoverage === "unavailable" ? <p>{c("Recent transfers could not be read from Blockscout.", "无法从 Blockscout 读取近期转移。")}</p> : <>
        <p className="opsis-small">{rows.length} {c("transfers in this Blockscout window.", "笔转移记录在此 Blockscout 窗口中。")}{rows.length > 0 && <> {c("Latest", "最近一笔")}: <ObservedTime value={latestTimestamp(rows)} /></>}</p>
        {rows.length > 0 && <ul className="opsis-balance-list">{rows.slice(0, 5).map((row, index) => <li key={`${row.transactionHash}:${index}`}>
          <ObservedTime value={row.timestamp} />
          <p>{c("From", "从")} <Party address={row.from} role="from" /> {c("to", "至")} <Party address={row.to} role="to" /></p>
          <strong>{formatExactAmount(row.formattedValue) ?? c("Amount unknown", "数量未知")} {visibleTokenText(row.tokenSymbol ?? "")}</strong>
        </li>)}</ul>}
      </>}
    </section>}
    {facts.explorerObservedAt && <p className="opsis-small" data-testid="explorer-read-time">{c("Blockscout data read", "Blockscout 数据读取于")}: <ObservedTime value={facts.explorerObservedAt} />{facts.explorerCached && <> · {c("Reused from that read.", "复用了该次读取的数据。")}</>}</p>}
    {rpc ? <p className="opsis-small" data-testid="research-token-rpc-coverage">
      {c("Opsis could not see holders, indexed activity or contract verification. Available metadata is sampled from independent latest-state RPC reads, with no shared block anchor; proxy status and sellability remain unknown.", "Opsis 无法查看持有人、索引活动或合约验证状态。可用元数据来自独立的最新状态 RPC 读取，未锚定至同一区块；代理状态和可售性仍未知。")}
      {facts.explorerUnavailableReason && <> <ExplorerReason reason={facts.explorerUnavailableReason} /></>}
    </p> : facts.explorerUnavailableReason && <p className="opsis-small"><ExplorerReason reason={facts.explorerUnavailableReason} /></p>}
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
  return <section data-testid="wallet-balances" className="opsis-explorer-facts">
    <h3>{c("Observed balances", "观察到的余额")}</h3>
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
  const failed = rows.filter((row) => row.status !== "ok").length;
  return <section data-testid="wallet-transactions" className="opsis-explorer-facts">
    <h3>{c("Recent transactions", "近期交易")}</h3>
    {facts.activityCoverage === "unavailable" || !Array.isArray(facts.recentTransactions) ? <p>{c("Recent transactions could not be read from Blockscout.", "无法从 Blockscout 读取近期交易。")} <ExplorerReason reason={facts.explorerUnavailableReason} /></p> : <>
      <p className="opsis-small">{rows.length} {c("transactions in this Blockscout window.", "笔交易记录在此 Blockscout 窗口中。")}{failed > 0 && <> {failed} {failed === 1 ? c("failed transaction in this window.", "笔交易在此窗口中失败。") : c("failed transactions in this window.", "笔交易在此窗口中失败。")}</>}</p>
      {rows.length > 0 && <ul className="opsis-balance-list">{rows.slice(0, 10).map((row) => {
        const direction = transactionDirection(row.from, row.to, address);
        const counterparty = direction === "sent" ? row.to : direction === "received" ? row.from : direction === "self" ? address : null;
        const method = transactionMethod(row);
        const value = scaleRawAmount(row.value, 18);
        return <li key={row.hash}>
          <ObservedTime value={row.timestamp} /> · {direction === "sent" ? c("Sent", "发送") : direction === "received" ? c("Received", "接收") : direction === "self" ? c("Self", "自身") : c("Direction unknown", "方向未知")}
          {counterparty && <> · <PublicAddress address={counterparty} /></>}
          <p>{method.kind === "decoded" ? method.text : method.kind === "transfer" ? c("Transfer", "转账") : <>{c("Contract call", "合约调用")}{method.text && <> · <code>{method.text}</code></>}</>}
            {value !== null && /[1-9]/.test(value) && <> · {formatExactAmount(value)} ETH</>}
            {row.status !== "ok" && <> · <span className="opsis-explorer-tag">{c("Failed", "失败")}</span></>}
          </p>
        </li>;
      })}</ul>}
    </>}
  </section>;
}
