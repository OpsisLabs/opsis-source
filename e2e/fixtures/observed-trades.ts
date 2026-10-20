import type { Page } from "@playwright/test";
import type { ObservedTradesResponse } from "../../apps/web/src/trades/api";

export const EOA = `0x${"aa".repeat(20)}`;
const CONTRACT = `0x${"bb".repeat(20)}`;
const POOL = `0x${"5a".repeat(20)}`;
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
export const TX_A = `0x${"01".repeat(32)}`;
export const TX_B = `0x${"02".repeat(32)}`;

export function observedTradesFixture(): ObservedTradesResponse {
  return {
    schemaVersion: 1,
    state: "observed",
    chain: { id: 4663, slug: "robinhood", name: "Robinhood Chain" },
    pair: {
      base: { address: WETH, symbol: "WETH", decimals: 18, reviewed: true },
      quote: { address: USDG, symbol: "USDG", decimals: 6, reviewed: true },
      pool: POOL,
      fee: 100,
      factory: `0x${"1f".repeat(20)}`,
      factoryVerified: true,
    },
    window: {
      fromBlock: 60_401_000,
      toBlock: 60_402_000,
      fromTime: "2026-09-11T11:45:00.000Z",
      toTime: "2026-09-11T11:50:00.000Z",
      requestedBlocks: 1000,
      blockCount: 1000,
      capped: false,
      narrowed: false,
      notes: [],
    },
    coverage: {
      poolsRequested: 4,
      poolVerified: true,
      logsScanned: 12,
      matchedLogs: 2,
      topRows: 2,
      logCap: 1000,
      blockCap: 1000,
      logCapReached: false,
      rpcUnits: 14,
    },
    classification: {
      method: "uniswap_v3_swap_signed_amounts",
      transfersUsed: false,
    },
    observations: [
      {
        id: `${TX_B}:7`,
        side: "sell",
        pool: POOL,
        fee: 100,
        txHash: TX_B,
        blockNumber: 60_401_900,
        blockHash: `0x${"22".repeat(32)}`,
        blockTime: "2026-09-11T11:49:00.000Z",
        logIndex: 7,
        baseToken: {
          address: WETH,
          symbol: "WETH",
          decimals: 18,
          reviewed: true,
        },
        quoteToken: {
          address: USDG,
          symbol: "USDG",
          decimals: 6,
          reviewed: true,
        },
        baseAmount: "2",
        quoteAmount: "5100",
        notionalQuote: "5100",
        eventSender: EOA,
        eventRecipient: CONTRACT,
        transactionSender: EOA,
        transactionSenderType: "eoa",
        followable: true,
      },
      {
        id: `${TX_A}:1`,
        side: "buy",
        pool: POOL,
        fee: 100,
        txHash: TX_A,
        blockNumber: 60_401_500,
        blockHash: `0x${"11".repeat(32)}`,
        blockTime: "2026-09-11T11:47:00.000Z",
        logIndex: 1,
        baseToken: {
          address: WETH,
          symbol: "WETH",
          decimals: 18,
          reviewed: true,
        },
        quoteToken: {
          address: USDG,
          symbol: "USDG",
          decimals: 6,
          reviewed: true,
        },
        baseAmount: "1.234567890123456789",
        quoteAmount: "3141.592653",
        notionalQuote: "3141.592653",
        eventSender: EOA,
        eventRecipient: EOA,
        transactionSender: CONTRACT,
        transactionSenderType: "contract",
        followable: false,
      },
    ],
    limitations: [
      "Observed from one factory-verified Uniswap V3 pool; this is not a chain-wide or all-venue ranking.",
      "Each row is one signed V3 Swap event for this pool, classified from amount0/amount1 only, never from token transfers.",
    ],
    fetchedAt: "2026-09-11T11:50:01.000Z",
    privacy: {
      accountRequired: false,
      walletConnectionRequired: false,
      serverStorage: "none",
      modelProvider: "none",
      providerDestinations: ["Robinhood Public RPC"],
      disclosure: "Your clicked request sent the public token contract only.",
    },
  };
}

export async function mockObservedTrades(
  page: Page,
  status = 200,
  body?: unknown,
) {
  await page.route("**/v1/private/market/observed-trades", async (route) => {
    if (status !== 200) {
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          body ?? {
            error: {
              code: "OBSERVED_TRADES_RANGE_TOO_WIDE",
              message:
                "The requested block range matched more logs than the RPC provider returns",
            },
          },
        ),
      });
      return;
    }
    await route.fulfill({ status: 200, json: body ?? observedTradesFixture() });
  });
}
