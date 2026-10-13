import { useState } from "react";
import type { DecodedAction, Leg, ResearchFacts } from "../private/api";
import { useCopy } from "./copy";
import { KNOWN_ASSETS } from "./known-assets";
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

export function TokenFacts({ facts }: { facts: ResearchFacts }) {
  const c = useCopy();
  const supply = scaleRawAmount(facts.totalSupply, facts.decimals);
  const reviewed = typeof facts.address === "string"
    && KNOWN_ASSETS.some((asset) => asset.address.toLowerCase() === (facts.address as string).toLowerCase());
  return <div data-testid="token-facts">
    <p className="opsis-small" data-testid="token-name-origin">{reviewed
      ? c("This contract is on the Opsis reviewed asset list.", "此合约在 Opsis 的已审核资产列表中。")
      : c("Name and symbol are what this contract reports about itself. Anyone can deploy a token with any name, so identify it by the contract address above.", "名称和符号由该合约自行报告。任何人都可以用任意名称部署代币，请以上方的合约地址为准。")}</p>
    <dl className="opsis-metrics">
      <div><dt>{c("Decimals", "小数位")}</dt><dd>{typeof facts.decimals === "number" ? facts.decimals : c("Unknown", "未知")}</dd></div>
      <div><dt>{c("Total supply", "总供应量")}</dt><dd title={supply ?? undefined}>{formatExactAmount(supply) ?? c("Unknown", "未知")}</dd></div>
    </dl>
    {typeof facts.totalSupply === "string" && <details><summary>{c("Exact supply", "精确供应量")}</summary>
      {supply !== null && <p>{c("Total supply", "总供应量")}: <code>{supply}</code></p>}
      <p>{c("Raw supply", "原始供应量")}: <code>{facts.totalSupply}</code></p>
    </details>}
    {(facts.metadataCoverage === "rpc_partial" || facts.metadataCoverage === "rpc_insufficient") && <p className="opsis-small" data-testid="research-token-rpc-coverage">
      {c("Opsis could not see holders, indexed activity or contract verification. Available metadata is sampled from independent latest-state RPC reads, with no shared block anchor; proxy status and sellability remain unknown.", "Opsis 无法查看持有人、索引活动或合约验证状态。可用元数据来自独立的最新状态 RPC 读取，未锚定至同一区块；代理状态和可售性仍未知。")}
    </p>}
  </div>;
}

export function WalletBalances({ facts }: { facts: ResearchFacts }) {
  const c = useCopy();
  const balances = Array.isArray(facts.tokenBalances) ? facts.tokenBalances : [];
  return <section data-testid="wallet-balances">
    <h3>{c("Observed balances", "观察到的余额")}</h3>
    <p>{c("Native balance", "原生余额")}: {formatExactAmount(facts.nativeBalanceEth) ?? c("Unknown", "未知")} ETH</p>
    <ul className="opsis-balance-list">{balances.map((value, index) => {
      if (!value || typeof value !== "object") return null;
      const balance = value as Record<string, unknown>;
      return <li key={index}>
        <p>{typeof balance.tokenName === "string" ? balance.tokenName : c("Unknown token", "未知代币")} · {typeof balance.tokenSymbol === "string" ? balance.tokenSymbol : c("Symbol unknown", "符号未知")}</p>
        <strong>{formatExactAmount(balance.formattedValue) ?? c("Amount unknown", "数量未知")}</strong>
        <p className="opsis-identity">{typeof balance.tokenAddress === "string" ? balance.tokenAddress : c("Contract unknown", "合约未知")}</p>
      </li>;
    })}</ul>
    {balances.length === 0 && <p>{c("No token balances were returned in this sample.", "此采样未返回代币余额。")}</p>}
    {facts.tokenBalanceCoverage === "reviewed_asset_sample" && <p className="opsis-small">{c("This is a reviewed sample of contracts checked; other tokens may be held.", "这是已核查合约的审核采样；还可能持有其他代币。")}</p>}
  </section>;
}
