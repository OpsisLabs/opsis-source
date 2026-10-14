import type {
  PortfolioApproval,
  PortfolioCitation,
  PortfolioMovement,
  PortfolioNftHolding,
  PortfolioSnapshot,
  PortfolioTokenHolding,
  PortfolioTransaction
} from "@rh-chain/shared";
import { keccak256, stringToHex } from "viem";
import type { Env } from "../config/env.js";
import { formatUnits } from "../chain/normalize.js";
import { createProviderHttp, type ProviderHttp } from "../chain/provider-http.js";
import {
  createRobinhoodRpcHttp,
  robinhoodRpcEndpoint,
  rpcRoutingDisclosure,
  type RobinhoodRpcEndpoint,
  type RpcSpendBudget
} from "../chain/robinhood-rpc.js";
import { AppError } from "../http/errors.js";
import { REVIEWED_ASSET_SAMPLE_REVIEWED_ON, REVIEWED_ROBINHOOD_ASSET_SAMPLE } from "../chain/reviewed-assets.js";
import { createPortfolioBudget, type PortfolioBudget } from "./budget.js";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const MAX_UINT256 = (2n ** 256n - 1n).toString();
const MAX_TOKENS = 10;
const MAX_NFTS = 10;
const MAX_TRANSACTIONS = 10;
const REVIEWED_SAMPLE_CITATION_ID = "reviewed-asset-sample";
const MAX_APPROVALS = 10;
const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));
const TRANSFER_SINGLE_TOPIC = keccak256(stringToHex("TransferSingle(address,address,address,uint256,uint256)"));
const TRANSFER_BATCH_TOPIC = keccak256(stringToHex("TransferBatch(address,address,address,uint256[],uint256[])"));

type Dependencies = {
  rpc: ProviderHttp;
  blockscout: ProviderHttp;
  budget: PortfolioBudget;
  now: () => Date;
};

type Discovery = {
  path: "address" | "token-balances" | "nft" | "transactions" | "token-transfers";
  url: string;
  body: unknown;
  citationId: string;
  fetchedAt: string;
};

type RpcRequest = { jsonrpc: "2.0"; id: string; method: string; params: unknown[] };
type RpcResponse = { id?: string; result?: unknown; error?: unknown };

type ApprovalCandidate = {
  transactionHash: string;
  contract: string;
  spender: string;
  kind: "erc20" | "erc721-token" | "operator";
  tokenId: string | null;
  symbol: string;
  sourceId: string;
};

type TransferMetadata = {
  kind: "erc20" | "erc721" | "erc1155";
  symbol: string;
  decimals: number;
};

export interface PortfolioSnapshotSource {
  snapshot(address: string): Promise<PortfolioSnapshot>;
}

export class PortfolioService implements PortfolioSnapshotSource {
  private readonly dependencies: Dependencies;
  private readonly rpcUrl?: string;
  private readonly rpcEndpoint: RobinhoodRpcEndpoint;

  constructor(private readonly env: Env, dependencies?: Partial<Dependencies> & { rpcSpend?: RpcSpendBudget }) {
    const oneAttemptEnv: Env = { ...env, PROVIDER_MAX_RETRIES: 0 };
    this.rpcEndpoint = robinhoodRpcEndpoint(env);
    this.dependencies = {
      rpc: dependencies?.rpc ?? createRobinhoodRpcHttp(env, {
        providerName: "portfolio-rpc",
        spend: dependencies?.rpcSpend,
        client: { maxRetries: 0, rpcWorkload: "portfolio" }
      }),
      // The Blockscout HTTP factory uses the same process gate as Research.
      blockscout: dependencies?.blockscout ?? createProviderHttp(oneAttemptEnv, "blockscout"),
      budget: dependencies?.budget ?? createPortfolioBudget(env),
      now: dependencies?.now ?? (() => new Date())
    };
    this.rpcUrl = this.rpcEndpoint.url;
  }

  async snapshot(inputAddress: string): Promise<PortfolioSnapshot> {
    const address = inputAddress.toLowerCase();
    if (!ADDRESS_PATTERN.test(address)) throw new AppError("INVALID_PORTFOLIO_ADDRESS", 400, "Provide a complete Robinhood Chain address");
    if (!this.rpcUrl) throw new AppError("PORTFOLIO_PROVIDER_UNAVAILABLE", 503, "Anchored chain reads are unavailable");

    let rpcUnits = 0;
    const consumeRpc = async (units: number): Promise<void> => {
      if (rpcUnits + units > this.env.PORTFOLIO_MAX_RPC_SUBCALLS) {
        throw new AppError("PORTFOLIO_RPC_LIMIT_EXCEEDED", 503, "The snapshot exceeded its RPC safety limit");
      }
      rpcUnits += units;
      await this.dependencies.budget.consume(units);
    };
    const anchor = await this.latestBlock(consumeRpc);
    const discoveries = await this.discover(address);
    const degradedSources = discoveries.degraded;
    const byPath = new Map(discoveries.documents.map((document) => [document.path, document]));
    // When the indexer cannot list ERC-20 balances, check the fixed reviewed
    // Robinhood Chain sample directly at the anchor instead of showing none.
    // This is a bounded sample, never a complete holdings claim.
    const tokenDiscoveryUnavailable = degradedSources.includes("blockscout:token-balances");
    const discoveredTokenCandidates = tokenDiscoveryUnavailable
      ? REVIEWED_ROBINHOOD_ASSET_SAMPLE.map((asset) => ({
        contract: asset.address.toLowerCase(),
        name: asset.name,
        symbol: asset.symbol,
        sourceId: REVIEWED_SAMPLE_CITATION_ID
      }))
      : uniqueBy(items(byPath.get("token-balances")?.body)
        .map(parseTokenCandidate)
        .filter((value): value is ReturnType<typeof parseTokenCandidate> & {} => value !== undefined), (token) => token.contract);
    const tokenCandidateLimit = tokenDiscoveryUnavailable ? REVIEWED_ROBINHOOD_ASSET_SAMPLE.length : MAX_TOKENS;
    const reviewedContracts = new Set(REVIEWED_ROBINHOOD_ASSET_SAMPLE.map((asset) => asset.address.toLowerCase()));
    const tokenCandidates = [
      ...discoveredTokenCandidates.filter((token) => reviewedContracts.has(token.contract)),
      ...discoveredTokenCandidates.filter((token) => !reviewedContracts.has(token.contract))
    ].slice(0, tokenCandidateLimit);
    const discoveredNftCandidates = uniqueBy(items(byPath.get("nft")?.body)
      .map(parseNftCandidate)
      .filter((value): value is ReturnType<typeof parseNftCandidate> & {} => value !== undefined), (nft) => `${nft.contract}:${nft.tokenId}`);
    const nftCandidates = discoveredNftCandidates.slice(0, MAX_NFTS);
    const indexedTransactions = items(byPath.get("transactions")?.body)
      .map(parseTransactionCandidate)
      .filter((value): value is ReturnType<typeof parseTransactionCandidate> & {} => value !== undefined)
      .filter((transaction) => transaction.blockNumber <= anchor.blockNumber);
    const indexedTokenTransfers = items(byPath.get("token-transfers")?.body)
      .map(parseTransferTransactionCandidate)
      .filter((value): value is ReturnType<typeof parseTransferTransactionCandidate> & {} => value !== undefined)
      .filter((transaction) => transaction.blockNumber <= anchor.blockNumber);
    const discoveredTransactionCandidates = [...indexedTransactions, ...indexedTokenTransfers]
      .sort((left, right) => right.blockNumber - left.blockNumber)
      .filter((transaction, index, candidates) => candidates.findIndex((candidate) => candidate.hash === transaction.hash) === index);
    const transactionCandidates = discoveredTransactionCandidates.slice(0, MAX_TRANSACTIONS);
    const rpcRequests: RpcRequest[] = [rpc("native", "eth_getBalance", [address, anchor.blockHex])];
    tokenCandidates.forEach((token, index) => rpcRequests.push(
      rpc(`token:${index}`, "eth_call", [{
        to: token.contract,
        data: `0x70a08231${encodeAddress(address)}`
      }, anchor.blockHex]),
      rpc(`token-decimals:${index}`, "eth_call", [{
        to: token.contract,
        data: "0x313ce567"
      }, anchor.blockHex])
    ));
    nftCandidates.forEach((nft, index) => rpcRequests.push(rpc(`nft:${index}`, "eth_call", [{
      to: nft.contract,
      data: nft.kind === "erc721"
        ? `0x6352211e${encodeUint(nft.tokenId)}`
        : `0x00fdd58e${encodeAddress(address)}${encodeUint(nft.tokenId)}`
    }, anchor.blockHex])));
    transactionCandidates.forEach((transaction, index) => rpcRequests.push(
      rpc(`transaction:${index}`, "eth_getTransactionByHash", [transaction.hash]),
      rpc(`receipt:${index}`, "eth_getTransactionReceipt", [transaction.hash])
    ));

    const reconciled = await this.rpcBatch(rpcRequests, consumeRpc);
    const nativeRaw = rpcHex(reconciled.get("native"));
    if (nativeRaw === undefined) throw new AppError("PORTFOLIO_PROVIDER_UNAVAILABLE", 503, "The anchored native balance could not be confirmed");

    const rpcCitation: PortfolioCitation = {
      id: `${this.rpcEndpoint.id}-anchor`,
      provider: "robinhood",
      url: new URL(this.rpcUrl).origin,
      fetchedAt: anchor.fetchedAt,
      description: `${this.rpcEndpoint.label} read-only reconciliation at captured current block ${anchor.blockNumber}`
    };
    const reviewedSampleCitation: PortfolioCitation | undefined = tokenDiscoveryUnavailable ? {
      id: REVIEWED_SAMPLE_CITATION_ID,
      provider: "robinhood",
      url: "https://docs.robinhood.com/chain/stock-token-apis/",
      fetchedAt: anchor.fetchedAt,
      description: `Fixed ${REVIEWED_ROBINHOOD_ASSET_SAMPLE.length}-asset reviewed Robinhood Chain sample (reviewed ${REVIEWED_ASSET_SAMPLE_REVIEWED_ON}), checked directly because indexer token discovery was unavailable`
    } : undefined;
    const citations = [
      ...discoveries.documents.map(citationForDiscovery),
      ...(reviewedSampleCitation ? [reviewedSampleCitation] : []),
      rpcCitation
    ];
    let tokenReadFailures = 0;
    const heldTokens = tokenCandidates.flatMap((token, index): PortfolioTokenHolding[] => {
      const rawBalance = rpcHex(reconciled.get(`token:${index}`));
      const decimalsRaw = rpcHex(reconciled.get(`token-decimals:${index}`));
      const decimals = decimalsRaw === undefined ? undefined : Number(decimalsRaw);
      if (rawBalance === undefined || decimals === undefined || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        tokenReadFailures += 1;
        return [];
      }
      const quantity = formatUnits(rawBalance, decimals);
      if (quantity === undefined || BigInt(rawBalance) === 0n) return [];
      return [{
        kind: "erc20",
        contract: token.contract,
        name: token.name,
        symbol: token.symbol,
        ...("reputation" in token && token.reputation !== undefined ? { reputation: token.reputation } : {}),
        decimals,
        quantity,
        rawBalance,
        sourceIds: [token.sourceId, rpcCitation.id]
      }];
    });
    const tokens = heldTokens.slice(0, MAX_TOKENS);
    const nfts = nftCandidates.flatMap((nft, index): PortfolioNftHolding[] => {
      const raw = reconciled.get(`nft:${index}`);
      if (raw?.error || typeof raw?.result !== "string") return [];
      if (nft.kind === "erc721") {
        const owner = decodedAddress(raw.result);
        if (!owner || owner !== address) return [];
        return [{ ...nft, quantity: "1", sourceIds: [nft.sourceId, rpcCitation.id] }];
      }
      const quantityRaw = hexQuantity(raw.result);
      if (quantityRaw === undefined || quantityRaw === "0") return [];
      return [{ ...nft, quantity: quantityRaw, sourceIds: [nft.sourceId, rpcCitation.id] }];
    });

    const confirmedTransactions = transactionCandidates.flatMap((transaction, index) => {
      const direct = asRecord(reconciled.get(`transaction:${index}`)?.result);
      const receipt = reconciled.get(`receipt:${index}`)?.result as Record<string, unknown> | undefined;
      const directHash = typeof direct.hash === "string" && HASH_PATTERN.test(direct.hash) ? direct.hash.toLowerCase() : undefined;
      const receiptTransactionHash = typeof receipt?.transactionHash === "string" && HASH_PATTERN.test(receipt.transactionHash)
        ? receipt.transactionHash.toLowerCase()
        : undefined;
      const directBlockHash = typeof direct.blockHash === "string" && HASH_PATTERN.test(direct.blockHash) ? direct.blockHash.toLowerCase() : undefined;
      const receiptBlockHash = typeof receipt?.blockHash === "string" && HASH_PATTERN.test(receipt.blockHash) ? receipt.blockHash.toLowerCase() : undefined;
      const directBlock = hexNumber(direct.blockNumber);
      const receiptBlock = hexNumber(receipt?.blockNumber);
      const from = addressValue(direct.from);
      const to = addressValue(direct.to);
      const valueRaw = hexQuantity(direct.value);
      const receiptStatus = receipt?.status;
      if (
        !receipt
        || directHash !== transaction.hash
        || receiptTransactionHash !== transaction.hash
        || directBlock === undefined
        || !directBlockHash
        || receiptBlockHash !== directBlockHash
        || directBlock !== transaction.blockNumber
        || receiptBlock !== directBlock
        || directBlock > anchor.blockNumber
        || !from
        || valueRaw === undefined
        || !Array.isArray(receipt.logs)
        || (receiptStatus !== "0x0" && receiptStatus !== "0x1")
      ) return [];
      return [{
        transaction: {
          ...transaction,
          from,
          to,
          nativeValueEth: formatUnits(valueRaw, 18) ?? "0",
          direct
        },
        receipt
      }];
    });
    const transferMetadata = new Map<string, TransferMetadata>();
    tokenCandidates.forEach((token, index) => {
      const directDecimalsRaw = rpcHex(reconciled.get(`token-decimals:${index}`));
      const directDecimals = directDecimalsRaw === undefined ? undefined : Number(directDecimalsRaw);
      if (directDecimals !== undefined && Number.isInteger(directDecimals) && directDecimals >= 0 && directDecimals <= 255) {
        transferMetadata.set(token.contract, { kind: "erc20", symbol: token.symbol, decimals: directDecimals });
      }
    });
    nftCandidates.forEach((nft) => transferMetadata.set(nft.contract, {
      kind: nft.kind,
      symbol: nft.symbol,
      decimals: 0
    }));
    items(byPath.get("token-transfers")?.body).forEach((value) => {
      const metadata = parseTransferMetadata(value);
      if (metadata && metadata.kind !== "erc20" && !transferMetadata.has(metadata.contract)) {
        transferMetadata.set(metadata.contract, metadata);
      }
    });
    const verifiedMovements = [
      ...confirmedTransactions.flatMap(({ transaction, receipt }): PortfolioMovement[] => {
        if (receipt.status !== "0x1") return [];
        if (!involves(address, transaction.from, transaction.to)) return [];
        if (transaction.nativeValueEth === "0") return [];
        return [{
          transactionHash: transaction.hash,
          blockNumber: transaction.blockNumber,
          timestamp: transaction.timestamp,
          direction: direction(address, transaction.from, transaction.to),
          kind: "native",
          symbol: "ETH",
          quantity: transaction.nativeValueEth,
          contract: null,
          tokenId: null,
          counterparty: counterparty(address, transaction.from, transaction.to),
          sourceIds: [transaction.sourceId, rpcCitation.id]
        }];
      }),
      ...confirmedTransactions.flatMap(({ transaction, receipt }) => receipt.status === "0x1"
        ? decodeReceiptMovements(
            receipt,
            transaction.hash,
            transaction.blockNumber,
            transaction.timestamp,
            address,
            transferMetadata,
            [transaction.sourceId, rpcCitation.id]
          )
        : [])
    ];
    const movementDecodePartial = new Set(confirmedTransactions.flatMap(({ transaction, receipt }) =>
      receipt.status === "0x1" && receiptMovementDecodeIncomplete(receipt, address, transferMetadata)
        ? [transaction.hash]
        : []
    ));
    const relevantTransactions = confirmedTransactions.filter(({ transaction }) =>
      involves(address, transaction.from, transaction.to)
      || verifiedMovements.some((movement) => movement.transactionHash === transaction.hash)
      || movementDecodePartial.has(transaction.hash)
    );
    const symbolByContract = new Map<string, string>([
      ...tokenCandidates.map((token) => [token.contract, token.symbol] as const),
      ...nftCandidates.map((nft) => [nft.contract, nft.symbol] as const)
    ]);
    const kindByContract = new Map<string, "erc20" | "erc721" | "erc1155">([
      ...tokenCandidates.map((token) => [token.contract, "erc20" as const] as const),
      ...nftCandidates.map((nft) => [nft.contract, nft.kind] as const)
    ]);
    const approvalCandidates = relevantTransactions
      .filter(({ transaction }) => transaction.from === address)
      .map(({ transaction }) => parseApprovalCandidate(
        transaction.direct,
        transaction.hash,
        transaction.sourceId,
        symbolByContract.get(addressValue(transaction.direct.to) ?? ""),
        kindByContract.get(addressValue(transaction.direct.to) ?? "")
      ))
      .filter((value): value is ApprovalCandidate => value !== undefined)
      .filter((approval) => approval.kind !== "erc721-token" || nfts.some((nft) =>
        nft.kind === "erc721" && nft.contract === approval.contract && nft.tokenId === approval.tokenId
      ))
      .slice(0, MAX_APPROVALS);
    const approvalRequests = approvalCandidates.map((approval, index) => rpc(`approval:${index}`, "eth_call", [{
      to: approval.contract,
      data: approval.kind === "operator"
        ? `0xe985e9c5${encodeAddress(address)}${encodeAddress(approval.spender)}`
        : approval.kind === "erc721-token"
          ? `0x081812fc${encodeUint(approval.tokenId!)}`
        : `0xdd62ed3e${encodeAddress(address)}${encodeAddress(approval.spender)}`
    }, anchor.blockHex]));
    const approvalResponses = approvalRequests.length > 0
      ? await this.rpcBatch(approvalRequests, consumeRpc)
      : new Map<string, RpcResponse>();
    await this.assertAnchorUnchanged(anchor, consumeRpc);

    const movements = verifiedMovements
      .sort((left, right) => right.blockNumber - left.blockNumber)
      .slice(0, 40);
    const shownMovementCounts = movements.reduce((counts, movement) => {
      counts.set(movement.transactionHash, (counts.get(movement.transactionHash) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const verifiedMovementCounts = verifiedMovements.reduce((counts, movement) => {
      counts.set(movement.transactionHash, (counts.get(movement.transactionHash) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const truncatedMovementTransactions = new Set([...verifiedMovementCounts.entries()]
      .flatMap(([hash, count]) => count > (shownMovementCounts.get(hash) ?? 0) ? [hash] : []));
    const transactions: PortfolioTransaction[] = relevantTransactions.map(({ transaction, receipt }) => {
      const transactionMovements = verifiedMovements.filter((movement) => movement.transactionHash === transaction.hash);
      return {
        hash: transaction.hash,
        blockNumber: transaction.blockNumber,
        timestamp: transaction.timestamp,
        status: receipt.status === "0x0" ? "failed" : "success",
        method: transaction.method,
        direction: transactionDirection(address, transaction.from, transaction.to, transactionMovements),
        counterparty: transactionCounterparty(address, transaction.from, transaction.to, transactionMovements),
        nativeValueEth: transaction.nativeValueEth,
        movementCount: transactionMovements.length,
        movementCoverage: movementDecodePartial.has(transaction.hash) || truncatedMovementTransactions.has(transaction.hash) ? "partial" : "complete",
        sourceIds: [transaction.sourceId, rpcCitation.id]
      };
    });
    const approvals = approvalCandidates.flatMap((approval, index): PortfolioApproval[] => {
      if (approval.kind === "erc721-token") {
        const approved = decodedAddress(approvalResponses.get(`approval:${index}`)?.result);
        if (!approved) return [];
        const active = approved === approval.spender;
        return [{
          transactionHash: approval.transactionHash,
          contract: approval.contract,
          spender: approval.spender,
          kind: approval.kind,
          symbol: approval.symbol,
          active,
          unlimited: false,
          tokenId: approval.tokenId ?? undefined,
          currentAmount: approved,
          sourceIds: [approval.sourceId, rpcCitation.id]
        }];
      }
      const currentRaw = rpcHex(approvalResponses.get(`approval:${index}`));
      if (currentRaw === undefined) return [];
      const active = BigInt(currentRaw) > 0n;
      return [{
        transactionHash: approval.transactionHash,
        contract: approval.contract,
        spender: approval.spender,
        kind: approval.kind,
        symbol: approval.symbol,
        active,
        unlimited: approval.kind === "operator" ? active : currentRaw === MAX_UINT256,
        currentAmount: approval.kind === "operator" ? String(active) : currentRaw,
        sourceIds: [approval.sourceId, rpcCitation.id]
      }];
    });

    const activeApprovals = approvals.filter((approval) => approval.active);
    const unlimitedApprovals = activeApprovals.filter((approval) => approval.unlimited);
    const failedTransactions = transactions.filter((transaction) => transaction.status === "failed");
    const truncatedSections = [
      ...(discoveredTokenCandidates.length > tokenCandidateLimit ? [`tokens: ${tokenCandidateLimit} of ${discoveredTokenCandidates.length} candidates evaluated`] : []),
      ...(heldTokens.length > tokens.length ? [`tokens: ${tokens.length} of ${heldTokens.length} held tokens returned`] : []),
      ...(discoveredNftCandidates.length > MAX_NFTS ? [`nfts: ${MAX_NFTS} of ${discoveredNftCandidates.length} candidates evaluated`] : []),
      ...(discoveredTransactionCandidates.length > MAX_TRANSACTIONS ? [`activity: ${MAX_TRANSACTIONS} of ${discoveredTransactionCandidates.length} candidates evaluated`] : []),
      ...(verifiedMovements.length > movements.length ? [`movements: ${movements.length} of ${verifiedMovements.length} decoded rows returned`] : [])
    ];
    const unreconciled = {
      // A reviewed-sample zero balance is a confirmed observation, not a gap.
      tokens: tokenDiscoveryUnavailable ? tokenReadFailures : Math.max(0, discoveredTokenCandidates.length - tokens.length),
      nfts: Math.max(0, discoveredNftCandidates.length - nfts.length),
      activity: Math.max(0, discoveredTransactionCandidates.length - transactions.length),
      approvals: Math.max(0, approvalCandidates.length - approvals.length)
    };
    const attention: PortfolioSnapshot["attention"] = [];
    if (unlimitedApprovals.length > 0) attention.push({
      severity: "high",
      title: "Active broad approval detected",
      detail: `${unlimitedApprovals.length} approval(s) in the fetched anchored activity window still allow unlimited ERC-20 spending or operator-wide NFT access.`,
      sourceIds: [...new Set(unlimitedApprovals.flatMap((approval) => approval.sourceIds))]
    });
    else if (activeApprovals.length > 0) attention.push({
      severity: "medium",
      title: "Active token approval detected",
      detail: `${activeApprovals.length} approval(s) discovered in the fetched activity window remain active at the captured block.`,
      sourceIds: [...new Set(activeApprovals.flatMap((approval) => approval.sourceIds))]
    });
    if (failedTransactions.length >= 3) attention.push({
      severity: "medium",
      title: "Repeated failed activity",
      detail: `${failedTransactions.length} confirmed transactions in the fetched window failed. This can reflect contract errors, insufficient gas, or repeated attempts.`,
      sourceIds: [...new Set(failedTransactions.flatMap((transaction) => transaction.sourceIds))]
    });
    if (movementDecodePartial.size > 0) attention.push({
      severity: "info",
      title: "Some token movement details were not normalized",
      detail: `${movementDecodePartial.size} confirmed transaction(s) contained an owner transfer that could not be decoded with directly verified token metadata. The activity row is marked partial rather than reporting zero movements as complete.`,
      sourceIds: [rpcCitation.id]
    });
    if (truncatedSections.length > 0) attention.push({
      severity: "info",
      title: "This bounded snapshot was truncated",
      detail: `${truncatedSections.join("; ")}. Refresh results never claim that omitted candidates were checked or absent.`,
      sourceIds: [rpcCitation.id]
    });
    if (reviewedSampleCitation) attention.push({
      severity: "info",
      title: "Token list limited to a reviewed sample",
      detail: `The indexer could not list this wallet's tokens, so only ${REVIEWED_ROBINHOOD_ASSET_SAMPLE.length} reviewed Robinhood Chain assets (USDG, WETH and stock tokens) were checked at the captured block. Other tokens may be held and are not shown.`,
      sourceIds: [reviewedSampleCitation.id, rpcCitation.id]
    });
    if (Object.values(unreconciled).some((count) => count > 0) || degradedSources.length > 0) attention.push({
      severity: "info",
      title: "Some indexed candidates were not shown",
      detail: "Opsis only shows holdings and activity that reconciled against the captured RPC snapshot. Provider gaps and newer or mismatched indexer rows are omitted.",
      sourceIds: [rpcCitation.id]
    });

    return {
      schemaVersion: 1,
      chain: { id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH" },
      address,
      anchor: {
        tag: "latest",
        blockNumber: anchor.blockNumber,
        blockHash: anchor.blockHash,
        timestamp: anchor.timestamp,
        fetchedAt: anchor.fetchedAt
      },
      nativeBalanceEth: formatUnits(nativeRaw, 18) ?? "0",
      tokens,
      nfts,
      transactions,
      movements,
      approvals,
      attention,
      reconciliation: {
        tokenCandidates: discoveredTokenCandidates.length,
        tokenConfirmed: tokens.length,
        nftCandidates: discoveredNftCandidates.length,
        nftConfirmed: nfts.length,
        activityCandidates: discoveredTransactionCandidates.length,
        activityConfirmed: transactions.length,
        approvalCandidates: approvalCandidates.length,
        approvalConfirmed: approvals.length,
        degradedSources,
        truncatedSections
      },
      citations,
      privacy: {
        accountRequired: false,
        walletConnectionRequired: false,
        serverStorage: "none",
        browserStorage: "client_encrypted_vault",
        providerDestinations: [this.rpcEndpoint.id === "drpc" ? "drpc" : "robinhood_public_rpc", "blockscout"],
        disclosure: `Blockscout receives this public address for discovery. The ${this.rpcEndpoint.label} receives the address plus derived public contract, transaction, token ID, spender, and operator identifiers needed for exact reads at one captured current block.${rpcRoutingDisclosure(this.rpcEndpoint)} This anchor is not final and can be reorganized after the response; Opsis rechecks its block hash before returning. The RPC provider is rate-limited and may be unavailable, so Opsis fails closed and keeps the last encrypted local snapshot. Opsis does not save the query or response; optional ownership labels and lot context can be stored only inside the encrypted browser Vault.`
      }
    };
  }

  private async latestBlock(
    consumeRpc: (units: number) => Promise<void>
  ): Promise<{ blockNumber: number; blockHash: string; blockHex: string; timestamp: string; fetchedAt: string }> {
    await consumeRpc(1);
    const response = await this.dependencies.rpc.requestJson(this.rpcUrl!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpc("anchor", "eth_getBlockByNumber", ["latest", false]))
    }) as RpcResponse;
    const block = response.result as Record<string, unknown> | undefined;
    const blockNumber = hexNumber(block?.number);
    const timestampSeconds = hexNumber(block?.timestamp);
    if (response.error || blockNumber === undefined || timestampSeconds === undefined || !HASH_PATTERN.test(String(block?.hash))) {
      throw new AppError("PORTFOLIO_ANCHOR_UNAVAILABLE", 503, "Robinhood Chain did not return a usable current block anchor");
    }
    return {
      blockNumber,
      blockHash: String(block?.hash).toLowerCase(),
      blockHex: `0x${blockNumber.toString(16)}`,
      timestamp: new Date(timestampSeconds * 1_000).toISOString(),
      fetchedAt: this.dependencies.now().toISOString()
    };
  }

  private async assertAnchorUnchanged(
    anchor: { blockHash: string; blockHex: string },
    consumeRpc: (units: number) => Promise<void>
  ): Promise<void> {
    await consumeRpc(1);
    const response = await this.dependencies.rpc.requestJson(this.rpcUrl!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpc("anchor-check", "eth_getBlockByNumber", [anchor.blockHex, false]))
    }) as RpcResponse;
    const block = asRecord(response.result);
    const hash = typeof block.hash === "string" && HASH_PATTERN.test(block.hash) ? block.hash.toLowerCase() : undefined;
    if (response.error || hash !== anchor.blockHash) {
      throw new AppError("SNAPSHOT_REORGED", 503, "The current block anchor changed while it was being verified; refresh again");
    }
  }

  private async discover(address: string): Promise<{ documents: Discovery[]; degraded: string[] }> {
    const paths: Discovery["path"][] = ["address", "token-balances", "nft", "transactions", "token-transfers"];
    const requests = paths.map(async (path): Promise<Discovery> => {
      // The unpaginated token-balances route can return tens of thousands of
      // spam/NFT balances and exceed the provider response-size safety limit.
      // Fetch one bounded ERC-20 page; NFT discovery already has its own path.
      const suffix = path === "address" ? `/addresses/${address}`
        : path === "token-balances" ? `/addresses/${address}/tokens?type=ERC-20`
        : `/addresses/${address}/${path}`;
      const authenticated = this.blockscoutUrl(suffix);
      const tab = path === "token-balances" || path === "nft" ? "?tab=tokens"
        : path === "transactions" || path === "token-transfers" ? "?tab=txs" : "";
      return {
        path,
        url: `https://robinhoodchain.blockscout.com/address/${address}${tab}`,
        body: await this.dependencies.blockscout.requestJson(authenticated, { headers: { accept: "application/json" } }),
        citationId: `blockscout-${path}`,
        fetchedAt: this.dependencies.now().toISOString()
      };
    });
    const settled = await Promise.allSettled(requests);
    return {
      documents: settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
      degraded: settled.flatMap((result, index) => result.status === "rejected" ? [`blockscout:${paths[index]}`] : [])
    };
  }

  private async rpcBatch(
    requests: RpcRequest[],
    consumeRpc: (units: number) => Promise<void>
  ): Promise<Map<string, RpcResponse>> {
    if (requests.length === 0) return new Map();
    await consumeRpc(requests.length);
    const body = await this.dependencies.rpc.requestJson(this.rpcUrl!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requests)
    }) as RpcResponse[] | RpcResponse;
    const responses = Array.isArray(body) ? body : [body];
    return new Map(responses.flatMap((response) => typeof response.id === "string" ? [[response.id, response] as const] : []));
  }

  private blockscoutUrl(path: string): string {
    const configuredBase = this.env.BLOCKSCOUT_PRO_API_KEY
      ? `${this.env.BLOCKSCOUT_PRO_API_BASE_URL.replace(/\/$/, "")}/${this.env.BLOCKSCOUT_CHAIN_ID}/api/v2`
      : this.env.BLOCKSCOUT_API_BASE_URL;
    const authenticated = new URL(path.replace(/^\//, ""), `${configuredBase.replace(/\/$/, "")}/`);
    const key = this.env.BLOCKSCOUT_PRO_API_KEY ?? this.env.BLOCKSCOUT_API_KEY;
    if (key) authenticated.searchParams.set("apikey", key);
    return authenticated.toString();
  }
}

function rpc(id: string, method: string, params: unknown[]): RpcRequest {
  return { jsonrpc: "2.0", id, method, params };
}

function citationForDiscovery(document: Discovery): PortfolioCitation {
  return {
    id: document.citationId,
    provider: "blockscout",
    url: document.url,
    fetchedAt: document.fetchedAt,
    description: `Blockscout ${document.path.replace(/-/g, " ")} discovery`
  };
}

function items(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const body = value as { items?: unknown[] } | undefined;
  return Array.isArray(body?.items) ? body.items : [];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const candidate = key(value);
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

function parseTokenCandidate(value: unknown) {
  const row = asRecord(value);
  const token = asRecord(row.token);
  const contract = addressValue(token.address_hash);
  if (!contract || String(token.type).toUpperCase() !== "ERC-20") return undefined;
  return {
    contract,
    name: boundedText(token.name, "Unknown token"),
    symbol: boundedText(token.symbol, "TOKEN"),
    ...(typeof token.reputation === "string" && token.reputation.trim() ? { reputation: boundedText(token.reputation, "") } : {}),
    sourceId: "blockscout-token-balances"
  };
}

function parseNftCandidate(value: unknown) {
  const row = asRecord(value);
  const token = asRecord(row.token);
  const contract = addressValue(token.address_hash);
  const tokenId = decimalInteger(row.id ?? row.token_id);
  const type = String(row.token_type ?? token.type).toUpperCase();
  if (!contract || !tokenId || (type !== "ERC-721" && type !== "ERC-1155")) return undefined;
  return {
    kind: type === "ERC-721" ? "erc721" as const : "erc1155" as const,
    contract,
    tokenId,
    name: boundedText(token.name, "Unknown NFT"),
    symbol: boundedText(token.symbol, "NFT"),
    sourceId: "blockscout-nft"
  };
}

function parseTransactionCandidate(value: unknown) {
  const row = asRecord(value);
  const hash = typeof row.hash === "string" && HASH_PATTERN.test(row.hash) ? row.hash.toLowerCase() : undefined;
  const blockNumber = integerNumber(row.block_number);
  const from = addressValue(row.from);
  const to = addressValue(row.to);
  if (!hash || blockNumber === undefined || !from) return undefined;
  return {
    hash,
    blockNumber,
    timestamp: validTimestamp(row.timestamp),
    from,
    to,
    method: typeof row.method === "string" && row.method.length <= 120 ? row.method : null,
    nativeValueEth: formatUnits(decimalInteger(row.value) ?? "0", 18) ?? "0",
    sourceId: "blockscout-transactions",
    raw: row
  };
}

function parseTransferTransactionCandidate(value: unknown) {
  const row = asRecord(value);
  const hashValue = row.transaction_hash ?? row.transactionHash ?? row.tx_hash;
  const hash = typeof hashValue === "string" && HASH_PATTERN.test(hashValue) ? hashValue.toLowerCase() : undefined;
  const blockNumber = integerNumber(row.block_number ?? row.blockNumber);
  const from = addressValue(row.from);
  const to = addressValue(row.to);
  if (!hash || blockNumber === undefined || !from) return undefined;
  return {
    hash,
    blockNumber,
    timestamp: validTimestamp(row.timestamp),
    from,
    to,
    method: null,
    nativeValueEth: "0",
    sourceId: "blockscout-token-transfers",
    raw: row
  };
}

function parseApprovalCandidate(
  row: Record<string, unknown>,
  transactionHash: string,
  sourceId: string,
  knownSymbol?: string,
  knownKind?: "erc20" | "erc721" | "erc1155"
): ApprovalCandidate | undefined {
  const contract = addressValue(row.to);
  if (!contract) return undefined;
  const decoded = asRecord(row.decoded_input);
  const parameters = Array.isArray(decoded.parameters) ? decoded.parameters.map(asRecord) : [];
  const method = String(row.method ?? decoded.method_call ?? "").toLowerCase();
  const rawInput = typeof row.input === "string"
    ? row.input.toLowerCase()
    : typeof row.raw_input === "string"
      ? row.raw_input.toLowerCase()
      : "";
  const isOperator = method.includes("setapprovalforall") || rawInput.startsWith("0xa22cb465");
  const isApprove = method === "approve" || method.startsWith("approve(") || rawInput.startsWith("0x095ea7b3");
  const kind = isOperator && (knownKind === "erc721" || knownKind === "erc1155")
    ? "operator"
    : isApprove && knownKind === "erc20"
      ? "erc20"
      : isApprove && knownKind === "erc721"
        ? "erc721-token"
        : undefined;
  if (!kind) return undefined;
  const decodedSpender = parameters.find((parameter) => ["spender", "operator", "to"].includes(String(parameter.name).toLowerCase()))?.value;
  const rawSpender = rawInput.length >= 74 ? `0x${rawInput.slice(34, 74)}` : undefined;
  const spender = addressValue(decodedSpender) ?? addressValue(rawSpender);
  if (!spender) return undefined;
  const tokenId = kind === "erc721-token"
    ? rawInput.length >= 138
      ? BigInt(`0x${rawInput.slice(74, 138)}`).toString()
      : decimalInteger(parameters.find((parameter) => ["tokenid", "token_id"].includes(String(parameter.name).toLowerCase()))?.value) ?? null
    : null;
  if (kind === "erc721-token" && tokenId === null) return undefined;
  return {
    transactionHash,
    contract,
    spender,
    kind,
    tokenId,
    symbol: boundedText(knownSymbol ?? asRecord(row.token).symbol, kind === "operator" ? "NFT" : "TOKEN"),
    sourceId
  };
}

function parseTransferMetadata(value: unknown): (TransferMetadata & { contract: string }) | undefined {
  const row = asRecord(value);
  const token = asRecord(row.token);
  const total = asRecord(row.total);
  const tokenType = String(row.type ?? token.type).toUpperCase();
  const decimals = Number(total.decimals ?? token.decimals ?? 0);
  const contract = addressValue(token.address_hash);
  if (!contract || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return undefined;
  const kind = tokenType === "ERC-721" ? "erc721" : tokenType === "ERC-1155" ? "erc1155" : tokenType === "ERC-20" ? "erc20" : undefined;
  if (!kind) return undefined;
  return {
    contract,
    kind,
    symbol: boundedText(token.symbol, kind === "erc20" ? "TOKEN" : "NFT"),
    decimals
  };
}

function decodeReceiptMovements(
  receipt: Record<string, unknown>,
  transactionHash: string,
  blockNumber: number,
  timestamp: string | null,
  owner: string,
  metadata: Map<string, TransferMetadata>,
  sourceIds: string[]
): PortfolioMovement[] {
  const logs = Array.isArray(receipt.logs) ? receipt.logs.map(asRecord) : [];
  return logs.flatMap((log): PortfolioMovement[] => {
    const contract = addressValue(log.address);
    const topics = Array.isArray(log.topics) ? log.topics.filter((topic): topic is string => typeof topic === "string") : [];
    const data = typeof log.data === "string" ? log.data.toLowerCase() : "";
    if (!contract || topics.length === 0) return [];
    const token = metadata.get(contract);

    if (topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase() && topics.length >= 3) {
      const from = topicAddress(topics[1]);
      const to = topicAddress(topics[2]);
      if (!from || !to || (from !== owner && to !== owner)) return [];
      if (topics.length >= 4) {
        const tokenId = topicUint(topics[3]);
        if (!tokenId || (token && token.kind === "erc20")) return [];
        return [{
          transactionHash,
          blockNumber,
          timestamp,
          direction: direction(owner, from, to),
          kind: "erc721",
          symbol: token?.symbol ?? "NFT",
          quantity: "1",
          contract,
          tokenId,
          counterparty: counterparty(owner, from, to),
          sourceIds
        }];
      }
      const rawValue = dataWord(data, 0);
      if (rawValue === undefined || token?.kind !== "erc20") return [];
      return [{
        transactionHash,
        blockNumber,
        timestamp,
        direction: direction(owner, from, to),
        kind: "erc20",
        symbol: token?.symbol ?? "TOKEN",
        quantity: formatUnits(rawValue, token?.decimals ?? 0) ?? rawValue,
        contract,
        tokenId: null,
        counterparty: counterparty(owner, from, to),
        sourceIds
      }];
    }

    if (topics[0]?.toLowerCase() === TRANSFER_SINGLE_TOPIC.toLowerCase() && topics.length >= 4) {
      const from = topicAddress(topics[2]);
      const to = topicAddress(topics[3]);
      const tokenId = dataWord(data, 0);
      const quantity = dataWord(data, 1);
      if (!from || !to || !tokenId || !quantity || (from !== owner && to !== owner)) return [];
      if (token && token.kind !== "erc1155") return [];
      return [{
        transactionHash,
        blockNumber,
        timestamp,
        direction: direction(owner, from, to),
        kind: "erc1155",
        symbol: token?.symbol ?? "NFT",
        quantity,
        contract,
        tokenId,
        counterparty: counterparty(owner, from, to),
        sourceIds
      }];
    }

    if (topics[0]?.toLowerCase() === TRANSFER_BATCH_TOPIC.toLowerCase() && topics.length >= 4) {
      const from = topicAddress(topics[2]);
      const to = topicAddress(topics[3]);
      const tokenIds = dynamicUintArray(data, 0);
      const quantities = dynamicUintArray(data, 1);
      if (!from || !to || !tokenIds || !quantities || tokenIds.length !== quantities.length || (from !== owner && to !== owner)) return [];
      if (token && token.kind !== "erc1155") return [];
      return tokenIds.map((tokenId, index) => ({
        transactionHash,
        blockNumber,
        timestamp,
        direction: direction(owner, from, to),
        kind: "erc1155" as const,
        symbol: token?.symbol ?? "NFT",
        quantity: quantities[index]!,
        contract,
        tokenId,
        counterparty: counterparty(owner, from, to),
        sourceIds
      }));
    }
    return [];
  });
}

function receiptMovementDecodeIncomplete(
  receipt: Record<string, unknown>,
  owner: string,
  metadata: Map<string, TransferMetadata>
): boolean {
  const logs = Array.isArray(receipt.logs) ? receipt.logs.map(asRecord) : [];
  return logs.some((log) => {
    const contract = addressValue(log.address);
    const topics = Array.isArray(log.topics) ? log.topics.filter((topic): topic is string => typeof topic === "string") : [];
    const data = typeof log.data === "string" ? log.data.toLowerCase() : "";
    if (!contract || topics.length === 0) return false;
    const token = metadata.get(contract);
    if (topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase() && topics.length >= 3) {
      const from = topicAddress(topics[1]);
      const to = topicAddress(topics[2]);
      if (!from || !to || (from !== owner && to !== owner)) return false;
      if (topics.length >= 4) return topicUint(topics[3]) === undefined || token?.kind === "erc20";
      return dataWord(data, 0) === undefined || token?.kind !== "erc20";
    }
    if (topics[0]?.toLowerCase() === TRANSFER_SINGLE_TOPIC.toLowerCase() && topics.length >= 4) {
      const from = topicAddress(topics[2]);
      const to = topicAddress(topics[3]);
      if (!from || !to || (from !== owner && to !== owner)) return false;
      return token?.kind === "erc20" || dataWord(data, 0) === undefined || dataWord(data, 1) === undefined;
    }
    if (topics[0]?.toLowerCase() === TRANSFER_BATCH_TOPIC.toLowerCase() && topics.length >= 4) {
      const from = topicAddress(topics[2]);
      const to = topicAddress(topics[3]);
      if (!from || !to || (from !== owner && to !== owner)) return false;
      const tokenIds = dynamicUintArray(data, 0);
      const quantities = dynamicUintArray(data, 1);
      return token?.kind === "erc20" || !tokenIds || !quantities || tokenIds.length !== quantities.length;
    }
    return false;
  });
}

function dynamicUintArray(data: string, offsetWord: number): string[] | undefined {
  const offsetValue = dataWord(data, offsetWord);
  if (offsetValue === undefined) return undefined;
  const offset = Number(offsetValue);
  if (!Number.isSafeInteger(offset) || offset < 64 || offset % 32 !== 0) return undefined;
  const lengthValue = dataWord(data, offset / 32);
  if (lengthValue === undefined) return undefined;
  const length = Number(lengthValue);
  if (!Number.isSafeInteger(length) || length < 0 || length > 50) return undefined;
  const values = Array.from({ length }, (_, index) => dataWord(data, offset / 32 + 1 + index));
  return values.every((value): value is string => value !== undefined) ? values : undefined;
}

function topicAddress(value: string | undefined): string | undefined {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) return undefined;
  return `0x${value.slice(-40)}`.toLowerCase();
}

function topicUint(value: string | undefined): string | undefined {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) return undefined;
  return BigInt(value).toString();
}

function dataWord(value: string, index: number): string | undefined {
  if (!/^0x(?:[0-9a-fA-F]{64})+$/.test(value)) return undefined;
  const start = 2 + index * 64;
  const word = value.slice(start, start + 64);
  return word.length === 64 ? BigInt(`0x${word}`).toString() : undefined;
}

function rpcHex(response: RpcResponse | undefined): string | undefined {
  if (!response || response.error || typeof response.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(response.result)) return undefined;
  return BigInt(response.result).toString();
}

function hexQuantity(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) return undefined;
  return BigInt(value).toString();
}

function decodedAddress(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) return undefined;
  return `0x${value.slice(-40)}`.toLowerCase();
}

function encodeAddress(value: string): string {
  if (!ADDRESS_PATTERN.test(value)) throw new AppError("INVALID_PORTFOLIO_ADDRESS", 400, "Provide a complete Robinhood Chain address");
  return value.slice(2).toLowerCase().padStart(64, "0");
}

function encodeUint(value: string): string {
  return BigInt(value).toString(16).padStart(64, "0");
}

function direction(owner: string, from: string, to: string | undefined): "in" | "out" | "self" {
  const fromOwner = from.toLowerCase() === owner;
  const toOwner = to?.toLowerCase() === owner;
  if (fromOwner && toOwner) return "self";
  return fromOwner ? "out" : "in";
}

function involves(owner: string, from: string, to: string | undefined): boolean {
  return from.toLowerCase() === owner || to?.toLowerCase() === owner;
}

function transactionDirection(
  owner: string,
  from: string,
  to: string | undefined,
  movements: PortfolioMovement[]
): PortfolioTransaction["direction"] {
  const directions = [...new Set(movements.map((movement) => movement.direction))];
  if (directions.length > 0) return directions.length === 1 ? directions[0]! : "mixed";
  return involves(owner, from, to) ? direction(owner, from, to) : "mixed";
}

function transactionCounterparty(
  owner: string,
  from: string,
  to: string | undefined,
  movements: PortfolioMovement[]
): string | null {
  const counterparties = [...new Set(movements.flatMap((movement) => movement.counterparty ? [movement.counterparty] : []))];
  if (counterparties.length > 0) return counterparties.length === 1 ? counterparties[0]! : null;
  return involves(owner, from, to) ? counterparty(owner, from, to) : null;
}

function counterparty(owner: string, from: string, to: string | undefined): string | null {
  if (from.toLowerCase() === owner) return to ?? null;
  return from;
}

function addressValue(value: unknown): string | undefined {
  const candidate = typeof value === "string" ? value : typeof asRecord(value).hash === "string" ? String(asRecord(value).hash) : undefined;
  return candidate && ADDRESS_PATTERN.test(candidate) ? candidate.toLowerCase() : undefined;
}

function decimalInteger(value: unknown): string | undefined {
  return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value).toString() : undefined;
}

function integerNumber(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function hexNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) return undefined;
  const number = Number(BigInt(value));
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function boundedText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
