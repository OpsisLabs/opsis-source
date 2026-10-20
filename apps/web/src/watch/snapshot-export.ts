import type { PortfolioSnapshot } from "@rh-chain/shared";
import { visibleTokenText } from "../opsis/explorer-facts";
import { orderTokens, watchActivitySummary, watchTimeline } from "./holdings";

type Copy = (en: string, zh: string) => string;

function exportSnapshot(snapshot: PortfolioSnapshot, c: Copy) {
  const entries = watchTimeline(snapshot);
  return {
    header: {
      source: "Opsis Watch",
      disclaimer: c("Not investment advice", "非投资建议"),
      coverage: c("Only the bounded snapshot shown; missing coverage is not an empty history.", "仅包含所显示的有限快照；覆盖缺失不代表历史为空。"),
      finality: c("Current block, not final", "当前区块，尚未最终确认"),
    },
    wallet: snapshot.address,
    chain: snapshot.chain,
    blockNumber: String(snapshot.anchor.blockNumber),
    blockHash: snapshot.anchor.blockHash,
    time: snapshot.anchor.timestamp,
    checkedAt: snapshot.anchor.fetchedAt,
    ethBalance: snapshot.nativeBalanceEth,
    tokens: orderTokens(snapshot.tokens).map((token) => ({
      symbol: visibleTokenText(token.symbol),
      contract: token.contract,
      balance: token.quantity,
      decimals: token.decimals,
      rawBalance: token.rawBalance,
    })),
    transactions: entries.map((entry) => ({
      hash: entry.hash,
      time: entry.timestamp,
      timeReason: entry.timestamp === null ? c("Transaction time unknown", "交易时间未知") : null,
      blockNumber: entry.blockNumber === null ? null : String(entry.blockNumber),
      summary: watchActivitySummary(entry, c),
      status: entry.transaction?.status ?? null,
      nativeValueEth: entry.transaction?.nativeValueEth ?? null,
      movementCoverage: entry.transaction?.movementCoverage ?? null,
      // Failed calls' movements and approvals are also hidden in the timeline.
      movements: entry.transaction?.status === "failed" ? [] : entry.movements.map((movement) => ({
        direction: movement.direction,
        symbol: visibleTokenText(movement.symbol),
        quantity: movement.quantity,
        contract: movement.contract,
        tokenId: movement.tokenId === null ? null : visibleTokenText(movement.tokenId),
      })),
    })),
    approvals: entries.flatMap((entry) => entry.transaction?.status === "failed" ? [] : entry.approvals.map((approval) => ({
      token: visibleTokenText(approval.symbol),
      contract: approval.contract,
      spender: approval.spender,
      unlimited: approval.unlimited,
      active: approval.active,
      currentAmount: approval.currentAmount,
      tokenId: approval.tokenId === undefined ? null : visibleTokenText(approval.tokenId),
      transactionHash: approval.transactionHash,
    }))),
    sources: snapshot.citations.map(({ id, provider, url, fetchedAt }) => ({ id, provider, url, fetchedAt })),
    reconciliation: snapshot.reconciliation,
  };
}

export function snapshotJson(snapshot: PortfolioSnapshot, c: Copy): string {
  return JSON.stringify(exportSnapshot(snapshot, c), null, 2);
}

// Quote every cell; an apostrophe keeps untrusted metadata from becoming a spreadsheet formula.
function csvCell(value: string | number | boolean | null): string {
  let text = value === null ? "" : String(value);
  if (/^\s*[=+\-@]|^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function snapshotCsv(snapshot: PortfolioSnapshot, c: Copy): string {
  const data = exportSnapshot(snapshot, c);
  const rows: Array<Array<string | number | boolean | null>> = [
    [c("Source", "来源"), data.header.source, data.header.disclaimer],
    [c("Coverage", "覆盖范围"), data.header.coverage],
    [c("Finality", "最终确认状态"), data.header.finality],
    [c("Wallet", "钱包"), data.wallet],
    [c("Chain", "链"), data.chain.name, data.chain.id],
    [c("Block number", "区块号"), data.blockNumber],
    [c("Block hash", "区块哈希"), data.blockHash],
    [c("Block time", "区块时间"), data.time],
    [c("Checked at", "核查时间"), data.checkedAt],
    [c("ETH balance", "ETH 余额"), data.ethBalance],
    [c("Degraded sources", "降级来源"), ...data.reconciliation.degradedSources],
    [c("Truncated sections", "截断部分"), ...data.reconciliation.truncatedSections],
    [],
    [c("Tokens", "代币")],
    [c("Symbol", "符号"), c("Contract", "合约"), c("Balance", "余额"), c("Decimals", "小数位数"), c("Raw balance", "原始余额")],
    ...data.tokens.map((token) => [token.symbol, token.contract, token.balance, token.decimals, token.rawBalance]),
    [],
    [c("Recent transactions", "最近交易")],
    [c("Hash", "哈希"), c("Time", "时间"), c("Block number", "区块号"), c("Summary", "摘要"), c("Status", "状态"), c("Native value (ETH)", "原生资产数量 (ETH)"), c("Movement coverage", "转移记录覆盖范围")],
    ...data.transactions.map((tx) => [tx.hash, tx.time ?? tx.timeReason, tx.blockNumber, tx.summary,
      tx.status === "success" ? c("Success", "成功") : tx.status === "failed" ? c("Failed", "失败") : c("Transaction details unavailable", "交易详情不可用"),
      tx.nativeValueEth,
      tx.movementCoverage === "complete" ? c("Complete within scope", "范围内完整") : tx.movementCoverage === "partial" ? c("Partial", "部分") : c("Unknown", "未知")]),
    [],
    [c("Observed transfers", "已观察转账")],
    [c("Transaction hash", "交易哈希"), c("Direction", "方向"), c("Symbol", "符号"), c("Quantity", "数量"), c("Contract", "合约"), c("Token ID", "代币 ID")],
    ...data.transactions.flatMap((tx) => tx.movements.map((movement) => [tx.hash,
      movement.direction === "in" ? c("Received", "已收到") : movement.direction === "out" ? c("Sent", "已发送") : c("Self transfer", "自身转账"),
      movement.symbol, movement.quantity, movement.contract, movement.tokenId])),
    [],
    [c("Approvals", "授权")],
    [c("Token", "代币"), c("Contract", "合约"), c("Spender", "被授权方"), c("Unlimited", "无限额"), c("Active", "当前有效"), c("Current amount", "当前额度"), c("Token ID", "代币 ID"), c("Transaction hash", "交易哈希")],
    ...data.approvals.map((approval) => [approval.token, approval.contract, approval.spender, approval.unlimited, approval.active, approval.currentAmount, approval.tokenId, approval.transactionHash]),
    [],
    [c("Sources and read times", "来源与读取时间")],
    [c("Source ID", "来源 ID"), c("Provider", "提供方"), c("URL", "链接"), c("Read at", "读取于")],
    ...data.sources.map((source) => [source.id, source.provider, source.url, source.fetchedAt]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function snapshotFilename(snapshot: PortfolioSnapshot, format: "csv" | "json"): string {
  const address = `${snapshot.address.slice(0, 8)}-${snapshot.address.slice(-6)}`;
  return `opsis-watch-${address}-${snapshot.anchor.blockNumber}.${format}`;
}
