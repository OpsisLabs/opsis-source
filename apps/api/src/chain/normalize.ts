import type { ExplorerDocuments } from "./blockscout.js";
import { decodeErc20Metadata } from "./erc20-metadata.js";
import type { Citation, ChainEntityType, NormalizedEntity, RiskNote } from "@rh-chain/shared";
import { decodeFunctionData, toFunctionSelector, type Abi, type AbiFunction, type Hex } from "viem";
import type { SourceDocumentInput } from "./types.js";
import { delegationTarget } from "./delegation.js";

function citation(doc: SourceDocumentInput, fieldsUsed: string[], description: string, explorerBase: string): Citation {
  return {
    id: doc.id,
    provider: doc.provider,
    // Provider request URLs are useful for durable internal snapshots, but
    // raw API/RPC endpoints are not reliable browser citations. Link readers
    // to the stable human explorer page for the exact entity instead.
    url: explorerUrl(doc.entityType, doc.entityValue, explorerBase),
    fetchedAt: doc.fetchedAt,
    fieldsUsed,
    description
  };
}

function explorerUrl(type: ChainEntityType, value: string, explorerBase: string): string {
  if (type === "transaction") return `${explorerBase}/tx/${value}`;
  if (type === "block") return `${explorerBase}/block/${value}`;
  if (type === "token") return `${explorerBase}/token/${value}`;
  return `${explorerBase}/address/${value}`;
}

export function normalizeEntity(
  chainId: number,
  type: ChainEntityType,
  value: string,
  docs: SourceDocumentInput[],
  explorerBase = "https://robinhoodchain.blockscout.com"
): NormalizedEntity {
  const citations = docs.map((doc) => citation(doc, fieldsUsedForDoc(doc), sourceDescription(doc), explorerBase));
  const facts = summarizeFacts(type, docs, value);
  const explorerReason = (docs as ExplorerDocuments).explorerUnavailableReason;
  if ((type === "token" || type === "wallet") && explorerReason) facts.explorerUnavailableReason = explorerReason;
  facts.chainId = chainId;
  facts.explorerUrl = explorerUrl(type, value, explorerBase);
  facts.sourceIds = citations.map((source) => source.id);
  return {
    chainId,
    type,
    value,
    facts,
    citations,
    riskNotes: buildRiskNotes(type, facts, citations)
  };
}

function sourceDescription(doc: SourceDocumentInput): string {
  const response = doc.responseJson as { method?: string; query?: string } | null;
  const methodLabels: Record<string, string> = {
    eth_getBalance: "Native ETH balance",
    eth_getCode: "Contract code / account delegation",
    eth_getTransactionByHash: "Transaction sender, recipient and value",
    eth_getTransactionReceipt: "Transaction outcome, gas and event logs",
  };
  const label = response?.method === "eth_call" && response.query === "reviewedTokenBalanceSample"
    ? "Limited reviewed-token balance sample (not all holdings)"
    : response?.method ? methodLabels[response.method] : undefined;
  if (label) return `${label} · ${doc.provider}`;
  const path = doc.requestUrl ?? "";
  const indexed = path.includes("/token-transfers") ? "Token transfers"
    : path.includes("/internal-transactions") ? "Internal transaction calls"
    : path.includes("/logs") ? "Transaction event logs"
    : path.includes("/raw-trace") ? "Transaction execution trace"
    : path.includes("/state-changes") ? "Transaction state changes"
    : path.includes("/token-balances") ? "Indexed token balances"
    : path.includes("/transfers") ? "Recent token transfers"
    : path.includes("/holders") ? "Largest token holders"
    : path.includes("/counters") ? "Holder and transfer counts"
    : /\/tokens\/[^/?]+(?:\?|$)/.test(path) ? "Token profile"
    : /\/addresses\/[^/?]+(?:\?|$)/.test(path) ? "Address profile"
    : path.includes("/transactions") ? (doc.entityType === "transaction" ? "Transaction details" : "Indexed recent transactions")
    : path.includes("/smart-contracts/") ? "Contract metadata and verification"
    : undefined;
  return indexed ? `${indexed} · ${doc.provider}` : `${doc.provider} ${doc.entityType} source data`;
}

function fieldsUsedForDoc(doc: SourceDocumentInput): string[] {
  const url = doc.requestUrl ?? "";
  const response = doc.responseJson as { method?: string; query?: string };
  const method = response?.method;
  if (method === "eth_getTransactionByHash") return ["result.hash", "result.from", "result.to", "result.value", "result.input", "result.blockNumber", "result.blockHash"];
  if (method === "eth_getTransactionReceipt") return ["result.transactionHash", "result.status", "result.gasUsed", "result.contractAddress", "result.logs", "result.blockNumber", "result.blockHash"];
  if (method === "eth_getBalance") return ["result"];
  if (method === "eth_getCode") return ["result"];
  if (method === "eth_call" && response.query === "reviewedTokenBalanceSample") {
    return ["items[].token", "items[].value", "contractsChecked", "registryReviewedAt"];
  }
  if (method === "eth_call" && response.query === "erc20MetadataSample") return ["result", "field"];
  if (method === "eth_call") return ["result", "token", "spender", "query"];
  if (url.includes("/token-transfers") || url.includes("/transfers")) return ["items[].from", "items[].to", "items[].token", "items[].value", "items[].transaction_hash"];
  if (url.includes("/internal-transactions")) return ["items[].from", "items[].to", "items[].value", "items[].success", "items[].error"];
  if (url.includes("/transactions")) return ["items[].hash", "items[].timestamp", "items[].status", "items[].from", "items[].to", "items[].value", "items[].method"];
  if (url.includes("/token-balances") || url.includes("/balances_v2/")) return ["items[].token", "items[].balance", "items[].value"];
  if (url.includes("/approvals/")) return ["items[].token_address", "items[].spender_address", "items[].allowance"];
  if (url.includes("/smart-contracts/")) return ["is_verified", "abi", "name", "proxy_type", "implementations"];
  if (doc.entityType === "token") return ["name", "symbol", "decimals", "total_supply", "holders_count"];
  if (doc.entityType === "wallet" || doc.entityType === "contract") return ["hash", "coin_balance", "is_contract", "token", "implementations"];
  return ["hash", "status", "from", "to", "value", "gas_used", "method", "block_number"];
}

function summarizeFacts(type: ChainEntityType, docs: SourceDocumentInput[], entityValue: string): Record<string, unknown> {
  const primary = docs[0]?.responseJson as Record<string, unknown> | undefined;
  if (type === "transaction") {
    const receipt = docs.find((doc) => JSON.stringify(doc.responseJson).includes("eth_getTransactionReceipt"))?.responseJson as Record<string, unknown> | undefined;
    const transfers = documentItems(docs, "/token-transfers").map(normalizeTokenTransfer);
    const internalTransactions = documentItems(docs, "/internal-transactions");
    const logs = documentItems(docs, "/logs");
    const rawTrace = docs.find((doc) => doc.requestUrl?.includes("/raw-trace"))?.responseJson;
    const stateChanges = documentItems(docs, "/state-changes");
    const decodedInput = (primary?.decoded_input as Record<string, unknown> | undefined) ?? decodeWithContractAbi(primary, docs);
    const rawValue = primary?.value ?? valueFromRpc(docs, "value");
    const providerMethod = typeof primary?.method === "string" && !primary.method.startsWith("eth_")
      ? primary.method
      : undefined;
    const rpcTransactionDocs = docs.filter((doc) => {
      const method = (doc.responseJson as { method?: unknown } | undefined)?.method;
      return method === "eth_getTransactionByHash" || method === "eth_getTransactionReceipt";
    });
    const rpcTx = rpcTransactionDocs.find((doc) => (doc.responseJson as { method?: string }).method === "eth_getTransactionByHash")
      ?.responseJson as { result?: Record<string, unknown> } | undefined;
    const rpcReceipt = rpcTransactionDocs.find((doc) => (doc.responseJson as { method?: string }).method === "eth_getTransactionReceipt")
      ?.responseJson as { result?: Record<string, unknown> } | undefined;
    const receiptTransferObservation = parseReceiptTransferEvents(rpcReceipt?.result, entityValue,
      rpcTx?.result as Record<string, unknown> | undefined);
    const rpcBlockEvidence = [rpcTx?.result, rpcReceipt?.result].some((result) =>
      typeof result?.blockHash === "string" || typeof result?.blockNumber === "string"
    );
    const rpcTransactionCoverage = rpcTransactionDocs.length > 0
      ? (typeof rpcTx?.result?.hash === "string" && typeof rpcReceipt?.result?.transactionHash === "string"
        && typeof rpcTx.result.blockHash === "string" && typeof rpcTx.result.blockNumber === "string"
        && typeof rpcReceipt.result.blockHash === "string" && typeof rpcReceipt.result.blockNumber === "string"
        ? "rpc_pair_block_matched" : "partial")
      : undefined;
    return {
      hash: primary?.hash ?? valueFromRpc(docs, "hash") ?? valueFromRpc(docs, "transactionHash")
        ?? (rpcTransactionDocs.length > 0 ? docs.find((doc) => (doc.responseJson as { method?: string }).method === "eth_getTransactionByHash")?.entityValue : undefined),
      blockNumber: primary?.block_number ?? valueFromRpc(docs, "blockNumber"),
      blockHash: primary?.block_hash ?? valueFromRpc(docs, "blockHash"),
      timestamp: primary?.timestamp ?? null,
      status: primary?.status ?? valueFromRpc([...(receipt ? [{ responseJson: receipt }] : [])], "status"),
      from: addressHash(primary?.from) ?? valueFromRpc(docs, "from"),
      to: addressHash(primary?.to) ?? valueFromRpc(docs, "to"),
      value: rawValue,
      valueEth: weiToEth(rawValue),
      method: providerMethod ?? decodedInput?.method_call ?? primary?.method_id,
      methodId: decodedInput?.method_id ?? primary?.method_id,
      decodedInput,
      fee: primary?.fee,
      gasUsed: primary?.gas_used ?? valueFromRpc(docs, "gasUsed"),
      gasPriceWei: primary?.gas_price ?? valueFromRpc(docs, "gasPrice"),
      contractAddress: addressHash(primary?.created_contract) ?? valueFromRpc(docs, "contractAddress"),
      tokenTransfers: transfers.length > 0 ? transfers : primary?.token_transfers,
      internalTransactions,
      events: logs.map(normalizeEvent),
      rawTrace,
      stateChanges,
      internalTransactionFailure: Boolean(primary?.has_error_in_internal_transactions),
      failureDetail: typeof primary?.revert_reason === "string" ? primary.revert_reason
        : typeof primary?.result === "string" ? primary.result : undefined,
      ...(rpcTransactionCoverage ? {
        transactionEvidenceCoverage: rpcTransactionCoverage,
        observationFinality: rpcBlockEvidence ? "current_not_final" : "unknown"
      } : {}),
      decodedActions: (rpcReceipt as { decodedActions?: unknown } | undefined)?.decodedActions ?? [],
      decodeCoverage: (rpcReceipt as { decodeCoverage?: unknown } | undefined)?.decodeCoverage ?? "none",
      receiptTransferEvents: receiptTransferObservation.events,
      receiptTransferCoverage: receiptTransferObservation.coverage,
      rawSourceCount: docs.length
    };
  }
  if (type === "wallet") {
    const items = documentItems(docs, "/transactions");
    const transactions = items.map(normalizeWalletTransaction);
    const failedTransactions = transactions.filter((transaction) => isFailedStatus(transaction.status));
    const highValueThresholdWei = "1000000000000000000";
    const highValueMovements = transactions.filter((transaction) => integerAtLeast(transaction.value, highValueThresholdWei));
    const allowanceByPair = allowanceResults(docs);
    const approvalTransactions = [
      ...transactions.map((transaction) => normalizeApproval(transaction, allowanceByPair)).filter((approval) => approval !== undefined),
      ...documentItems(docs, "/approvals/").map(normalizeGoldRushApproval)
    ];
    const tokenTransfers = documentItems(docs, "/token-transfers").map(normalizeTokenTransfer);
    const internalTransactions = documentItems(docs, "/internal-transactions");
    const balanceDoc = docs.find((doc) => doc.requestUrl?.includes("/token-balances"));
    const reviewedBalanceDoc = docs.find((doc) =>
      (doc.responseJson as { query?: unknown } | undefined)?.query === "reviewedTokenBalanceSample"
    );
    const reviewedBalanceResponse = reviewedBalanceDoc?.responseJson as { items?: unknown[]; contractsChecked?: unknown } | undefined;
    const tokenBalances = [
      ...(Array.isArray(balanceDoc?.responseJson) ? balanceDoc.responseJson : []).map(normalizeTokenBalance),
      ...documentItems(docs, "/balances_v2/").map(normalizeTokenBalance),
      ...(Array.isArray(reviewedBalanceResponse?.items) ? reviewedBalanceResponse.items : []).map(normalizeTokenBalance)
    ];
    const todayTransactions = transactions.filter((transaction) => isTodayUtc(transaction.timestamp));
    const timestamps = transactions.map((transaction) => transaction.timestamp).filter((timestamp): timestamp is string => typeof timestamp === "string");
    const unusualActivity: string[] = [];
    if (failedTransactions.length >= 3) unusualActivity.push("Multiple failed transactions appear in the fetched activity window.");
    if (approvalTransactions.filter((approval) => approval.unlimited === true).length > 0) {
      unusualActivity.push("An unlimited or operator-wide approval appears in the fetched activity window.");
    }
    const coinBalance = primary?.coin_balance ?? rpcResult(docs, "eth_getBalance");
    const delegatedTo = delegationTarget(rpcResult(docs, "eth_getCode"));
    return {
      address: primary?.hash ?? primary?.address ?? docs[0]?.entityValue,
      coinBalance,
      nativeBalanceEth: weiToEth(coinBalance),
      transactionsFetched: transactions.length,
      recentTransactions: transactions,
      todayActivity: todayTransactions,
      activityTimeWindow: timestamps.length > 0 ? { newest: timestamps[0], oldest: timestamps[timestamps.length - 1] } : null,
      contractsInteractedWith: [...new Set(transactions.filter((transaction) => transaction.method).map((transaction) => transaction.to).filter(Boolean))],
      failedTransactions,
      highValueThresholdWei,
      highValueMovements,
      approvalTransactions,
      tokenTransfers,
      internalTransactions,
      tokenBalances,
      activityCoverage: docs.some((doc) => doc.requestUrl?.includes("/transactions")) ? "indexed_window" : "unavailable",
      tokenBalanceCoverage: balanceDoc || docs.some((doc) => doc.requestUrl?.includes("/balances_v2/")) ? "indexed_window" : "unavailable",
      ...(reviewedBalanceDoc ? {
        tokenBalanceCoverage: "reviewed_asset_sample",
        tokenBalanceContractsChecked: reviewedBalanceResponse?.contractsChecked
      } : {}),
      unusualActivity,
      hasTokenTransfers: Boolean(primary?.has_token_transfers),
      hasTokens: Boolean(primary?.has_tokens),
      ...(delegatedTo ? { accountType: "delegated_wallet", delegationTarget: delegatedTo } : {}),
      isContract: !delegatedTo && (Boolean(primary?.is_contract) || Boolean(rpcResult(docs, "eth_getCode") && !/^0x0*$/.test(String(rpcResult(docs, "eth_getCode")))))
    };
  }
  if (type === "token") {
    const tokenDoc = docs.find((doc) => doc.requestUrl && /\/tokens\/[^/?]+(?:\?|$)/.test(doc.requestUrl));
    const token = (tokenDoc?.responseJson ?? primary?.token ?? primary) as Record<string, unknown>;
    const contract = docs.find((doc) => doc.requestUrl?.includes("/smart-contracts/"))?.responseJson as Record<string, unknown> | undefined;
    const counters = docs.find((doc) => doc.requestUrl?.includes("/counters"))?.responseJson as Record<string, unknown> | undefined;
    const addressInfo = docs.find(
      (doc) => doc.requestUrl?.includes("/addresses/") && !doc.requestUrl.includes("/counters")
    )?.responseJson as Record<string, unknown> | undefined;
    const deployer = addressHash(addressInfo?.creator_address_hash);
    const distribution = summarizeDistribution(documentItems(docs, "/holders"), token?.total_supply, deployer);

    const rpcMetadata = docs.some((doc) => (doc.responseJson as { query?: unknown } | undefined)?.query === "erc20MetadataSample");
    if (rpcMetadata) {
      const metadata: Record<string, unknown> = {};
      for (const doc of docs) {
        const response = doc.responseJson as { method?: unknown; query?: unknown; field?: unknown; result?: unknown };
        if (response.query !== "erc20MetadataSample" || response.method !== "eth_call" || typeof response.field !== "string") continue;
        metadata[response.field] = decodeErc20Metadata(response.field, response.result);
      }
      const name = metadata.name;
      const symbol = metadata.symbol;
      const decimals = metadata.decimals;
      const totalSupply = metadata.totalSupply;
      const enough = (typeof name === "string" || typeof symbol === "string") &&
        (typeof decimals === "number" || typeof totalSupply === "string");
      return {
        address: docs[0]?.entityValue,
        name: typeof name === "string" ? name : null,
        symbol: typeof symbol === "string" ? symbol : null,
        decimals: typeof decimals === "number" ? decimals : null,
        totalSupply: typeof totalSupply === "string" ? totalSupply : null,
        verified: null,
        proxy: null,
        holders: null,
        lifetimeTransfers: null,
        holderCoverage: "unavailable",
        activityCoverage: "unavailable",
        sourceCoverage: "rpc_sample_only",
        metadataCoverage: enough ? "rpc_partial" : "rpc_insufficient",
        observation: "latest_rpc_sample",
        observationFinality: "unknown",
        blockRelation: "independent_samples_not_same_block_anchored"
      };
    }

    return {
      address: docs[0]?.entityValue,
      name: token?.name,
      symbol: token?.symbol,
      decimals: boundedInteger(token?.decimals, 255),
      type: token?.type,
      totalSupply: typeof token?.total_supply === "string" && /^\d+$/.test(token.total_supply) ? token.total_supply : null,
      holders: boundedInteger(token?.holders ?? token?.holders_count ?? counters?.token_holders_count),
      lifetimeTransfers: boundedInteger(counters?.transfers_count),
      exchangeRate: token?.exchange_rate,
      deployer,
      deployedAt: contract?.creation_timestamp ?? contract?.deployed_at,
      verified: contract ? Boolean(contract.is_verified || contract.is_verified_via_eth_bytecode_db) : null,
      proxy: contract ? Boolean(contract.is_proxy || contract.proxy_type) : null,
      proxyType: typeof (contract?.proxy_type ?? addressInfo?.proxy_type) === "string" ? contract?.proxy_type ?? addressInfo?.proxy_type : undefined,
      implementations: normalizeImplementations(contract?.implementations ?? addressInfo?.implementations),
      holderCoverage: docs.some((doc) => doc.requestUrl?.includes("/holders")) ? "top_holders" : "unavailable",
      activityCoverage: docs.some((doc) => doc.requestUrl?.includes("/transfers")) ? "indexed_window" : "unavailable",
      sourceCoverage: contract ? "explorer_metadata" : "unavailable",
      explorerObservedAt: docs.filter((doc) => doc.provider === "blockscout").map((doc) => doc.fetchedAt).sort()[0],
      explorerReputation: typeof token?.reputation === "string" ? token.reputation : undefined,
      recentTransfers: withNativeValues(documentItems(docs, "/transfers").map(normalizeTokenTransfer), docs),
      ...distribution
    };
  }
  if (type === "contract") {
    const contractDoc = docs.find((doc) => doc.requestUrl?.includes("/smart-contracts/"));
    const contract = (contractDoc?.responseJson ?? primary) as Record<string, unknown>;
    const address = docs.find((doc) => doc.requestUrl?.includes("/addresses/") && !doc.requestUrl.includes("/transactions"))?.responseJson as Record<string, unknown> | undefined;
    const transactionSourcePresent = docs.some((doc) => doc.requestUrl?.includes("/transactions"));
    const holderSourcePresent = docs.some((doc) => doc.requestUrl?.includes("/holders"));
    const recentInteractions = documentItems(docs, "/transactions").map(normalizeWalletTransaction);
    const code = rpcResult(docs, "eth_getCode");
    const metadataPresent = Boolean(contractDoc);
    const verification = metadataPresent && hasAnyField(contract, ["is_verified", "is_verified_via_eth_bytecode_db"])
      ? Boolean(contract.is_verified || contract.is_verified_via_eth_bytecode_db)
      : null;
    const abiAvailable = metadataPresent && Object.prototype.hasOwnProperty.call(contract, "abi")
      ? Boolean(contract.abi)
      : null;
    const proxy = metadataPresent && hasAnyField(contract, ["is_proxy", "proxy_type"])
      ? Boolean(contract.is_proxy || contract.proxy_type)
      : address && Object.prototype.hasOwnProperty.call(address, "implementations")
        ? Boolean(address.implementations)
        : null;
    return {
      address: docs[0]?.entityValue,
      verified: verification,
      name: contract?.name,
      compiler: contract?.compiler_version,
      language: contract?.language,
      abiAvailable,
      proxy,
      proxyType: contract?.proxy_type,
      implementations: contract?.implementations ?? address?.implementations,
      deployer: addressHash(address?.creator_address_hash ?? contract?.creator_address_hash),
      creationTransaction: address?.creation_tx_hash ?? contract?.creation_tx_hash,
      deployedAt: address?.creation_timestamp ?? contract?.creation_timestamp ?? contract?.deployed_at,
      ...(transactionSourcePresent ? {
        recentInteractions,
        recentMethods: [...new Set(recentInteractions.map((transaction) => transaction.method).filter(Boolean))],
        activityCoverage: "indexed_window"
      } : { activityCoverage: "unavailable" }),
      sourceCoverage: metadataPresent ? "explorer_metadata" : "unavailable",
      holderCoverage: holderSourcePresent ? "indexed_window" : "unavailable",
      ...(validRpcCode(code) ? {
        codePresent: !/^0x0*$/i.test(code),
        observation: "latest_rpc_sample",
        observationFinality: "not_anchored",
        blockRelation: "independent_samples_not_same_block_anchored"
      } : {}),
      ...(rpcResult(docs, "eth_getBalance") !== undefined ? {
        nativeBalanceEth: weiToEth(rpcResult(docs, "eth_getBalance")),
        balanceObservation: "latest_rpc_sample"
      } : {})
    };
  }
  return { value: docs[0]?.entityValue, rawSourceCount: docs.length };
}

const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const maxReceiptLogs = 64;

function parseReceiptTransferEvents(
  receipt: Record<string, unknown> | undefined,
  requestedHash: string,
  transaction?: Record<string, unknown>
): { events: Array<{ emitter: string; from: string; to: string; rawAmount: string; logIndex: string }>; coverage: "complete" | "partial" | "capped" | "unavailable" } {
  const unavailable = { events: [] as Array<{ emitter: string; from: string; to: string; rawAmount: string; logIndex: string }>, coverage: "unavailable" as const };
  if (!isBytes32(requestedHash) || !receipt || typeof receipt.transactionHash !== "string" || !isBytes32(receipt.transactionHash) ||
      receipt.transactionHash.toLowerCase() !== requestedHash.toLowerCase() || receipt.status !== "0x1" ||
      !isBytes32(receipt.blockHash) || !isQuantity(receipt.blockNumber)) return unavailable;
  if (transaction) {
    if (typeof transaction.hash !== "string" || transaction.hash.toLowerCase() !== receipt.transactionHash.toLowerCase() ||
        typeof transaction.blockHash !== "string" || !isBytes32(transaction.blockHash) ||
        transaction.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase() ||
        !isQuantity(transaction.blockNumber) || BigInt(transaction.blockNumber) !== BigInt(receipt.blockNumber)) return unavailable;
  }
  if (!Array.isArray(receipt.logs)) return unavailable;
  if (receipt.logs.length > maxReceiptLogs) return { ...unavailable, coverage: "capped" };

  let ambiguous = false;
  const seenLogIndexes = new Set<string>();
  const events = receipt.logs.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { ambiguous = true; return []; }
    const log = entry as Record<string, unknown>;
    const topics = Array.isArray(log.topics) ? log.topics : undefined;
    if (!topics || topics.length === 0 || typeof topics[0] !== "string" || !isBytes32(topics[0])) { ambiguous = true; return []; }
    if (topics[0].toLowerCase() !== transferTopic) return [];
    if ((log.removed !== undefined && log.removed !== false) || typeof log.address !== "string" || !isAddress(log.address) ||
        topics.length !== 3 || topics.some((topic) => typeof topic !== "string" || !isBytes32(topic)) ||
        !isIndexedAddress(topics[1]) || !isIndexedAddress(topics[2]) ||
        typeof log.data !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(log.data) ||
        typeof log.logIndex !== "string" || !isQuantity(log.logIndex)) { ambiguous = true; return []; }
    for (const key of ["blockHash", "transactionHash"] as const) {
      if (log[key] !== undefined && (typeof log[key] !== "string" || log[key].toLowerCase() !== receipt[key]?.toString().toLowerCase())) { ambiguous = true; return []; }
    }
    if (log.blockNumber !== undefined && !quantitiesEqual(log.blockNumber, receipt.blockNumber)) { ambiguous = true; return []; }
    if (log.transactionIndex !== undefined && (!isQuantity(log.transactionIndex) ||
        (receipt.transactionIndex !== undefined && !quantitiesEqual(log.transactionIndex, receipt.transactionIndex)))) { ambiguous = true; return []; }
    const logIndex = BigInt(log.logIndex).toString();
    if (seenLogIndexes.has(logIndex)) { ambiguous = true; return []; }
    seenLogIndexes.add(logIndex);
    return [{
      emitter: log.address.toLowerCase(),
      from: `0x${(topics[1] as string).slice(-40).toLowerCase()}`,
      to: `0x${(topics[2] as string).slice(-40).toLowerCase()}`,
      rawAmount: BigInt(log.data).toString(),
      logIndex
    }];
  });
  return { events, coverage: ambiguous ? "partial" : "complete" };
}

function isBytes32(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isIndexedAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x0{24}[0-9a-fA-F]{40}$/i.test(value);
}

function isQuantity(value: unknown): value is string {
  return typeof value === "string" && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value);
}

function quantitiesEqual(left: unknown, right: unknown): boolean {
  return isQuantity(left) && isQuantity(right) && BigInt(left) === BigInt(right);
}

function decodeWithContractAbi(
  transaction: Record<string, unknown> | undefined,
  docs: SourceDocumentInput[]
): Record<string, unknown> | undefined {
  const input = transaction?.raw_input ?? transaction?.input;
  const contract = docs.find((doc) => doc.requestUrl?.includes("/smart-contracts/"))?.responseJson as { abi?: unknown } | undefined;
  if (typeof input !== "string" || !input.startsWith("0x") || !Array.isArray(contract?.abi)) return undefined;
  try {
    const decoded = decodeFunctionData({ abi: contract.abi as Abi, data: input as Hex });
    const item = (contract.abi as Array<Record<string, unknown>>).find((entry) => {
      if (entry.type !== "function" || entry.name !== decoded.functionName) return false;
      return toFunctionSelector(entry as AbiFunction) === input.slice(0, 10);
    });
    const inputs = Array.isArray(item?.inputs) ? (item.inputs as Array<Record<string, unknown>>) : [];
    const args = Array.isArray(decoded.args) ? decoded.args : [];
    return {
      method_call: decoded.functionName,
      method_id: input.slice(0, 10),
      parameters: inputs.map((parameter, index) => ({
        name: parameter.name,
        type: parameter.type,
        value: serializeAbiValue(args[index])
      })),
      decoding_source: "local_contract_abi"
    };
  } catch {
    return undefined;
  }
}

function serializeAbiValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeAbiValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeAbiValue(item)]));
  }
  return value;
}

function normalizeWalletTransaction(value: unknown): Record<string, unknown> {
  const transaction = value as Record<string, unknown>;
  return {
    hash: transaction.hash ?? transaction.tx_hash,
    timestamp: transaction.timestamp ?? transaction.block_signed_at,
    status: transaction.status ?? (transaction.successful === true ? "ok" : transaction.successful === false ? "error" : undefined),
    from: addressHash(transaction.from ?? transaction.from_address),
    to: addressHash(transaction.to ?? transaction.to_address),
    value: transaction.value ?? transaction.value_quote,
    method: transaction.method ?? transaction.method_name,
    decodedInput: transaction.decoded_input,
    failureDetail: transaction.revert_reason ?? transaction.result
  };
}

function normalizeApproval(
  transaction: Record<string, unknown>,
  allowanceByPair: Map<string, string>
): Record<string, unknown> | undefined {
  const method = String(transaction.method ?? "").toLowerCase();
  if ((method !== "approve" && method !== "setapprovalforall") || isFailedStatus(transaction.status)) return undefined;
  const decodedInput = transaction.decodedInput as { parameters?: Array<Record<string, unknown>> } | undefined;
  const parameters = Array.isArray(decodedInput?.parameters) ? decodedInput.parameters : [];
  const spender = parameterValue(parameters, ["spender", "operator", "to"]);
  const amount = parameterValue(parameters, ["amount", "value", "wad"]);
  const approved = parameterValue(parameters, ["approved"]);
  const unlimited = amount === MAX_UINT256 || (method === "setapprovalforall" && approved !== false && approved !== "false");
  const contract = transaction.to;
  const query = method === "setapprovalforall" ? "isApprovedForAll" : "allowance";
  const allowanceKey =
    typeof contract === "string" && typeof spender === "string"
      ? `${contract.toLowerCase()}:${spender.toLowerCase()}:${query}`
      : undefined;
  const currentAllowanceRaw = allowanceKey ? allowanceByPair.get(allowanceKey) : undefined;
  return {
    transactionHash: transaction.hash,
    contract,
    method: transaction.method,
    spender,
    amount,
    approved,
    unlimited,
    currentAllowanceRaw,
    currentAllowanceConfirmed: currentAllowanceRaw !== undefined,
    currentUnlimited: method === "setapprovalforall" ? currentAllowanceRaw === "1" : currentAllowanceRaw === MAX_UINT256,
    currentlyActive: currentAllowanceRaw !== undefined ? BigInt(currentAllowanceRaw) > 0n : undefined,
    status: transaction.status
  };
}

const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

function parameterValue(parameters: Array<Record<string, unknown>>, names: string[]): unknown {
  return parameters.find((parameter) => names.includes(String(parameter.name).toLowerCase()))?.value;
}

function allowanceResults(docs: SourceDocumentInput[]): Map<string, string> {
  const results = new Map<string, string>();
  for (const doc of docs) {
    const response = doc.responseJson as Record<string, unknown>;
    if (response?.method !== "eth_call" || typeof response.token !== "string" || typeof response.spender !== "string") continue;
    if (typeof response.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(response.result)) continue;
    const query = response.query === "isApprovedForAll" ? "isApprovedForAll" : "allowance";
    results.set(`${response.token.toLowerCase()}:${response.spender.toLowerCase()}:${query}`, BigInt(response.result).toString());
  }
  return results;
}

function isFailedStatus(status: unknown): boolean {
  return ["fail", "error", "0x0"].some((value) => String(status).toLowerCase().includes(value));
}

function integerAtLeast(value: unknown, threshold: string): boolean {
  try {
    return typeof value === "string" && /^\d+$/.test(value) && BigInt(value) >= BigInt(threshold);
  } catch {
    return false;
  }
}

function normalizeTokenBalance(value: unknown): Record<string, unknown> {
  const balance = value as Record<string, unknown>;
  const token = (balance.token ?? {}) as Record<string, unknown>;
  return {
    tokenAddress: token.address_hash ?? balance.contract_address,
    tokenName: token.name ?? balance.contract_name,
    tokenSymbol: token.symbol ?? balance.contract_ticker_symbol,
    tokenType: token.type ?? balance.type,
    reputation: typeof token.reputation === "string" ? token.reputation : undefined,
    ...(boundedInteger(token.decimals, 255) !== null ? { decimals: boundedInteger(token.decimals, 255) } : {}),
    rawValue: balance.value ?? balance.balance,
    formattedValue: formatUnits(balance.value ?? balance.balance, token.decimals ?? balance.contract_decimals)
  };
}

function documentItems(docs: SourceDocumentInput[], path: string): unknown[] {
  return docs.flatMap((doc) => {
    if (!doc.requestUrl?.includes(path)) return [];
    const response = doc.responseJson as { items?: unknown[]; data?: { items?: unknown[] } } | undefined;
    return Array.isArray(response?.items) ? response.items : Array.isArray(response?.data?.items) ? response.data.items : [];
  });
}

function addressHash(value: unknown): unknown {
  if (value && typeof value === "object" && "hash" in value) return (value as { hash: unknown }).hash;
  return value;
}


function boundedInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= maximum ? number : null;
}

function normalizeImplementations(value: unknown): Array<{ address: string; name?: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const address = row.address_hash ?? row.address;
    return typeof address === "string" ? [{ address, ...(typeof row.name === "string" ? { name: row.name } : {}) }] : [];
  });
}

const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
  "0xdead000000000000000042069420694206942069"
]);
function isBurnAddress(account: Record<string, unknown>): boolean {
  if (typeof account.hash === "string" && BURN_ADDRESSES.has(account.hash.toLowerCase())) return true;
  const tags = (account.metadata as { tags?: unknown[] } | undefined)?.tags;
  return Array.isArray(tags) && tags.some((tag) => typeof (tag as { slug?: unknown })?.slug === "string"
    && ((tag as { slug: string }).slug).startsWith("null-"));
}

/** Contracts whose name marks them as a trading pool rather than a holder. */
const POOL_NAME = /pair|pool|swap|router|lp\b/i;

/**
 * Turns the holder list into the numbers that actually decide whether a token
 * is safe to touch: how much supply sits in the trading pool (that is the
 * liquidity you would buy from and sell into), how much a handful of private
 * wallets control, and whether the deployer still holds a position.
 *
 * The pool is separated from the whales deliberately — counting it as
 * concentration makes every liquid token look dangerous, and ignoring it makes
 * an illiquid one look safe.
 */
function summarizeDistribution(
  rawHolders: unknown[],
  rawSupply: unknown,
  deployer: unknown
): Record<string, unknown> {
  const supply = Number(rawSupply);
  if (!Number.isFinite(supply) || supply <= 0 || rawHolders.length === 0) return { burnedShare: 0 };

  const holders = rawHolders
    .map((item) => {
      const row = item as Record<string, unknown>;
      const account = (row.address ?? {}) as Record<string, unknown>;
      const value = Number(row.value);
      return {
        address: typeof account.hash === "string" ? account.hash : "",
        label: typeof account.name === "string" ? account.name : undefined,
        isContract: Boolean(account.is_contract),
        flaggedScam: Boolean(account.is_scam),
        isBurn: isBurnAddress(account),
        share: Number.isFinite(value) ? (value / supply) * 100 : 0
      };
    })
    .filter((h) => h.address)
    .sort((a, b) => b.share - a.share);

  const isPool = (h: (typeof holders)[number]): boolean => h.isContract && Boolean(h.label && POOL_NAME.test(h.label));
  const pools = holders.filter((h) => !h.isBurn && isPool(h));
  const wallets = holders.filter((h) => !h.isBurn && !isPool(h));
  const share = (list: typeof holders, n: number): number =>
    Math.round(list.slice(0, n).reduce((sum, h) => sum + h.share, 0) * 10) / 10;

  const deployerAddress = typeof deployer === "string" ? deployer.toLowerCase() : undefined;
  const deployerHolding = deployerAddress
    ? holders.find((h) => !h.isBurn && h.address.toLowerCase() === deployerAddress)
    : undefined;

  return {
    burnedShare: share(holders.filter((h) => h.isBurn), holders.length),
    liquidityPoolShare: pools.length > 0 ? share(pools, pools.length) : 0,
    liquidityPools: pools.slice(0, 3).map((p) => ({ address: p.address, label: p.label, share: Math.round(p.share * 10) / 10 })),
    top1WalletShare: share(wallets, 1),
    top5WalletShare: share(wallets, 5),
    top10WalletShare: share(wallets, 10),
    topHolders: holders.slice(0, 10).map((h) => ({
      address: h.address,
      label: h.label,
      isPool: !h.isBurn && isPool(h),
      isBurn: h.isBurn,
      isContract: h.isContract,
      flaggedScam: h.flaggedScam,
      share: Math.round(h.share * 100) / 100
    })),
    holdersAnalyzed: holders.length,
    deployerStillHolds: deployerHolding ? Math.round(deployerHolding.share * 100) / 100 : deployerAddress ? 0 : undefined,
    scamFlaggedHolders: holders.filter((h) => h.flaggedScam).length
  };
}


/**
 * Prices transfers in the chain's native coin. Only the largest few have their
 * transaction fetched, so most rows keep an undefined nativeValue — a plain
 * wallet-to-wallet transfer moves no ETH at all and should not be shown as 0.
 */
function withNativeValues(
  transfers: Record<string, unknown>[],
  docs: SourceDocumentInput[]
): Record<string, unknown>[] {
  const byHash = new Map<string, string>();
  for (const doc of docs) {
    if (!doc.requestUrl?.includes("/transactions/")) continue;
    const body = doc.responseJson as Record<string, unknown> | undefined;
    const hash = typeof body?.hash === "string" ? body.hash.toLowerCase() : undefined;
    // weiToEth returns the string "0" for a transfer that moved no native coin,
    // which is truthy — guard on the number so those rows stay unpriced rather
    // than rendering a misleading "0 ETH".
    const eth = weiToEth(body?.value);
    if (hash && eth && Number(eth) > 0) byHash.set(hash, eth);
  }
  if (byHash.size === 0) return transfers;

  return transfers.map((transfer) => {
    const hash = typeof transfer.transactionHash === "string" ? transfer.transactionHash.toLowerCase() : undefined;
    const nativeValue = hash ? byHash.get(hash) : undefined;
    return nativeValue ? { ...transfer, nativeValue } : transfer;
  });
}

function normalizeTokenTransfer(value: unknown): Record<string, unknown> {
  const transfer = value as Record<string, unknown>;
  const token = (transfer.token ?? {}) as Record<string, unknown>;
  const total = (transfer.total ?? {}) as Record<string, unknown>;
  const rawValue = total.value ?? transfer.value;
  return {
    from: addressHash(transfer.from),
    to: addressHash(transfer.to),
    method: transfer.method,
    timestamp: transfer.timestamp,
    transactionHash: transfer.transaction_hash,
    tokenAddress: token.address_hash,
    tokenName: token.name,
    tokenSymbol: token.symbol,
    tokenType: token.type,
    rawValue,
    formattedValue: formatUnits(rawValue, token.decimals ?? total.decimals)
  };
}

function normalizeEvent(value: unknown): Record<string, unknown> {
  const log = value as Record<string, unknown>;
  const decoded = log.decoded as Record<string, unknown> | undefined;
  return {
    index: log.index,
    address: addressHash(log.address_hash ?? log.smart_contract),
    signature: decoded?.method_call,
    methodId: decoded?.method_id,
    parameters: decoded?.parameters,
    topics: log.topics
  };
}

export function formatUnits(value: unknown, decimals: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 255) return value;
  if (places === 0) return value;
  const padded = value.padStart(places + 1, "0");
  const integer = padded.slice(0, -places);
  const fraction = padded.slice(-places).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

function valueFromRpc(docs: Array<{ responseJson: unknown }>, key: string): unknown {
  for (const doc of docs) {
    const result = (doc.responseJson as { result?: unknown })?.result;
    if (result && typeof result === "object" && !Array.isArray(result) && key in result) {
      return (result as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

function rpcResult(docs: SourceDocumentInput[], method: string): unknown {
  return (docs.find((doc) => (doc.responseJson as { method?: string })?.method === method)?.responseJson as { result?: unknown } | undefined)?.result;
}

function hasAnyField(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function validRpcCode(value: unknown): value is string {
  return typeof value === "string" && /^0x(?:[0-9a-f]{2})*$/i.test(value);
}

function isTodayUtc(value: unknown, now = new Date()): boolean {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime())
    && timestamp.getUTCFullYear() === now.getUTCFullYear()
    && timestamp.getUTCMonth() === now.getUTCMonth()
    && timestamp.getUTCDate() === now.getUTCDate();
}

function normalizeGoldRushApproval(value: unknown): Record<string, unknown> {
  const approval = value as Record<string, unknown>;
  return {
    contract: approval.token_address ?? approval.contract_address,
    tokenSymbol: approval.ticker_symbol ?? approval.contract_ticker_symbol,
    spender: approval.spender_address,
    amount: approval.allowance ?? approval.balance,
    currentAllowanceConfirmed: true,
    currentlyActive: typeof approval.allowance === "string" ? approval.allowance !== "0" : undefined,
    currentUnlimited: approval.allowance === MAX_UINT256,
    source: "goldrush"
  };
}

function weiToEth(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const decimal = value.startsWith("0x") ? BigInt(value).toString() : value;
    return formatUnits(decimal, 18);
  } catch {
    return undefined;
  }
}

function buildRiskNotes(type: ChainEntityType, facts: Record<string, unknown>, citations: Citation[]): RiskNote[] {
  const ids = citations.map((source) => source.id);
  const notes: RiskNote[] = [];
  const transactionFailed = isFailedStatus(facts.status);
  if (type === "transaction" && transactionFailed) {
    notes.push({
      severity: "medium",
      title: "Transaction may have failed",
      detail: facts.failureDetail
        ? `The source data indicates an unsuccessful transaction: ${String(facts.failureDetail).slice(0, 240)}.`
        : "The source data indicates a failed or unsuccessful transaction status. This is a data-based note, not a judgment about intent.",
      evidenceCitationIds: ids
    });
  }
  if (type === "transaction" && facts.internalTransactionFailure === true) {
    notes.push({
      severity: "medium",
      title: "An internal call may have failed",
      detail: "The transaction source reports an error in at least one internal call. Review the internal-call evidence for context.",
      evidenceCitationIds: ids
    });
  }
  if (type === "transaction" && !facts.method && facts.to) {
    notes.push({
      severity: "info",
      title: "Method is not decoded",
      detail: "The available provider data did not identify the called method. This can limit interpretation of the transaction intent.",
      evidenceCitationIds: ids
    });
  }
  if (type === "token") {
    const top10 = Number(facts.top10WalletShare);
    const top1 = Number(facts.top1WalletShare);
    const pool = Number(facts.liquidityPoolShare);
    const deployerHolds = Number(facts.deployerStillHolds);

    // Benchmarks: a broadly held token typically keeps its top ten private
    // wallets under ~25% of supply. Past 50% a small group can move the price
    // at will, which is the single most useful number a newcomer can be given.
    if (Number.isFinite(top10) && top10 >= 50) {
      notes.push({
        severity: "high",
        title: "Supply is concentrated in a few wallets",
        detail: `The ten largest private wallets hold ${top10}% of supply, excluding any trading pool. Widely held tokens are usually under 25%. A group this size can move the price on its own.`,
        evidenceCitationIds: ids
      });
    } else if (Number.isFinite(top10) && top10 >= 25) {
      notes.push({
        severity: "medium",
        title: "Supply is somewhat concentrated",
        detail: `The ten largest private wallets hold ${top10}% of supply, excluding any trading pool. That is above the ~25% typical of widely held tokens.`,
        evidenceCitationIds: ids
      });
    }

    if (Number.isFinite(top1) && top1 >= 15) {
      notes.push({
        severity: "medium",
        title: "One wallet holds a large share",
        detail: `The largest single wallet holds ${top1}% of supply. A sale from one address that size would be felt by everyone else.`,
        evidenceCitationIds: ids
      });
    }

    if (Number.isFinite(pool) && pool > 0 && pool < 3) {
      notes.push({
        severity: "medium",
        title: "Very little of the supply is tradeable",
        detail: `Only ${pool}% of supply sits in a trading pool. Thin liquidity means even modest trades move the price sharply, and large positions can be hard to exit.`,
        evidenceCitationIds: ids
      });
    }

    if (Number.isFinite(deployerHolds) && deployerHolds >= 5) {
      notes.push({
        severity: "medium",
        title: "The deployer still holds a position",
        detail: `The wallet that created this token still holds ${deployerHolds}% of supply. That is not wrongdoing by itself, but it is a position that could be sold.`,
        evidenceCitationIds: ids
      });
    }

    if (Number(facts.scamFlaggedHolders) > 0) {
      notes.push({
        severity: "medium",
        title: "A holder is flagged by the explorer",
        detail: `${facts.scamFlaggedHolders} address(es) among the largest holders carry a scam flag in explorer metadata. Treat that as a prompt to look closer, not a verdict.`,
        evidenceCitationIds: ids
      });
    }
  }

  if (type === "wallet") {
    const approvals = Array.isArray(facts.approvalTransactions) ? (facts.approvalTransactions as Array<Record<string, unknown>>) : [];
    const currentUnlimited = approvals.filter((approval) => approval.currentUnlimited === true);
    const unconfirmedUnlimited = approvals.filter(
      (approval) => approval.unlimited === true && approval.currentAllowanceConfirmed !== true
    );
    if (currentUnlimited.length > 0) {
      notes.push({
        severity: "high",
        title: "Active unlimited token approval found",
        detail: `${currentUnlimited.length} unlimited approval(s) remain active according to the latest read-only allowance call.`,
        evidenceCitationIds: ids
      });
    }
    if (approvals.length > 0) {
      notes.push({
        severity: "info",
        title: "Token approval activity found",
        detail: `${approvals.length} approval transaction or active approval record(s) appear in the fetched evidence. Review the spender and current allowance state.`,
        evidenceCitationIds: ids
      });
    }
    if (unconfirmedUnlimited.length > 0) {
      notes.push({
        severity: "medium",
        title: "Historical broad token approval found",
        detail: `${unconfirmedUnlimited.length} unlimited or operator-wide approval transaction(s) appear in the fetched activity window, but current allowance state was not available.`,
        evidenceCitationIds: ids
      });
    }
    const failures = Array.isArray(facts.failedTransactions) ? facts.failedTransactions.length : 0;
    if (failures >= 3) {
      notes.push({
        severity: "medium",
        title: "Repeated transaction failures",
        detail: `${failures} failed transactions appear in the fetched activity window. This can indicate contract errors, insufficient gas, or repeated unsuccessful attempts.`,
        evidenceCitationIds: ids
      });
    }
    const largeMovements = Array.isArray(facts.highValueMovements) ? facts.highValueMovements.length : 0;
    if (largeMovements > 0) {
      notes.push({
        severity: "info",
        title: "High-value native movement found",
        detail: `${largeMovements} transaction(s) met the disclosed one-native-token review threshold. Value alone does not imply risk.`,
        evidenceCitationIds: ids
      });
    }
    const contractCount = Array.isArray(facts.contractsInteractedWith) ? facts.contractsInteractedWith.length : 0;
    if (contractCount >= 10) {
      notes.push({
        severity: "info",
        title: "Frequent contract interaction",
        detail: `The fetched window includes interactions with ${contractCount} distinct contracts. This is an activity observation, not a risk verdict.`,
        evidenceCitationIds: ids
      });
    }
  }
  if (type === "contract" && facts.verified === false) {
    notes.push({
      severity: "medium",
      title: "Contract is not verified in available source data",
      detail: "Unverified contracts are harder to inspect. Treat this as a review signal, not proof of malicious behavior.",
      evidenceCitationIds: ids
    });
  }
  if ((type === "contract" || type === "token") && facts.proxy === true) {
    notes.push({
      severity: "info",
      title: "Proxy contract detected",
      detail: "The available explorer metadata indicates proxy behavior. Review the current implementation contract when interpreting source code.",
      evidenceCitationIds: ids
    });
  }
  if (type === "token" && !facts.name && !facts.symbol) {
    notes.push({
      severity: "low",
      title: "Token metadata is incomplete",
      detail: "The provider did not return basic token metadata. This can happen for new or unsupported tokens.",
      evidenceCitationIds: ids
    });
  }
  if (type === "token" && facts.verified === false) {
    notes.push({
      severity: "medium",
      title: "Token contract is not verified in available source data",
      detail: "The explorer data did not report verified source code for this token contract. This is a review signal, not a scam verdict.",
      evidenceCitationIds: ids
    });
  }
  if ((type === "token" || type === "contract") && isRecentDate(facts.deployedAt, 30)) {
    notes.push({
      severity: "info",
      title: "Recently deployed contract",
      detail: "The available deployment timestamp is within the last 30 days. Recency is a review signal, not evidence of malicious behavior.",
      evidenceCitationIds: ids
    });
  }
  return notes;
}

function isRecentDate(value: unknown, days: number, now = new Date()): boolean {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime() && timestamp >= now.getTime() - days * 86_400_000;
}
