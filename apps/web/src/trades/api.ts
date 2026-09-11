import { privateApi } from "../dashboard/http";
import type { ObservedTradeSide, SenderType } from "./model";

export type ObservedTradeToken = {
  address: string;
  symbol: string | null;
  decimals: number;
  reviewed: boolean;
};

export type ObservedTradeObservation = {
  id: string;
  side: ObservedTradeSide;
  pool: string;
  fee: number;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  blockTime: string | null;
  logIndex: number;
  baseToken: ObservedTradeToken;
  quoteToken: ObservedTradeToken;
  baseAmount: string;
  quoteAmount: string;
  notionalQuote: string;
  eventSender: string | null;
  eventRecipient: string | null;
  transactionSender: string | null;
  transactionSenderType: SenderType;
  followable: boolean;
};

export type ObservedTradesResponse = {
  schemaVersion: 1;
  state: "observed" | "empty";
  chain: { id: 4663; slug: "robinhood"; name: "Robinhood Chain" };
  pair: {
    base: ObservedTradeToken;
    quote: ObservedTradeToken;
    pool: string;
    fee: number;
    factory: string;
    factoryVerified: true;
  };
  window: {
    fromBlock: number;
    toBlock: number;
    fromTime: string | null;
    toTime: string;
    requestedBlocks: number;
    blockCount: number;
    capped: boolean;
    narrowed: boolean;
    notes: string[];
  };
  coverage: {
    poolsRequested: number;
    poolVerified: boolean;
    logsScanned: number;
    matchedLogs: number;
    topRows: number;
    logCap: number;
    blockCap: number;
    logCapReached: boolean;
    rpcUnits: number;
  };
  classification: {
    method: "uniswap_v3_swap_signed_amounts";
    transfersUsed: false;
  };
  observations: ObservedTradeObservation[];
  limitations: string[];
  fetchedAt: string;
  privacy: {
    accountRequired: false;
    walletConnectionRequired: false;
    serverStorage: "none";
    modelProvider: "none";
    providerDestinations: string[];
    disclosure: string;
  };
};

export type ObservedTradesRequest = {
  chainId: 4663;
  contract?: string;
  fee?: number;
  windowBlocks?: number;
};

export function fetchObservedTrades(
  input: ObservedTradesRequest,
  signal?: AbortSignal,
): Promise<ObservedTradesResponse> {
  return privateApi<ObservedTradesResponse>(
    "/v1/private/market/observed-trades",
    input,
    signal,
  );
}
