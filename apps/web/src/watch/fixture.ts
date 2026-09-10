import type { PortfolioSnapshot } from "@rh-chain/shared";

// Deterministic test data only. Never imported by the product or live demo.
export const WATCH_TEST_ADDRESS = "0x1111111111111111111111111111111111111111";
export const WATCH_TEST_TOKEN = "0x3333333333333333333333333333333333333333";
export function watchFixture(block = 100, now = Date.now()): PortfolioSnapshot {
  const date = new Date(now).toISOString();
  return {
    schemaVersion: 1,
    chain: { id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH" },
    address: WATCH_TEST_ADDRESS,
    anchor: {
      tag: "latest",
      blockNumber: block,
      blockHash: `0x${block.toString(16).padStart(64, "0")}`,
      timestamp: date,
      fetchedAt: date,
    },
    nativeBalanceEth:
      block === 100 ? "1.000000000000000001" : "0.900000000000000001",
    tokens: [
      {
        kind: "erc20",
        contract: WATCH_TEST_TOKEN,
        name: "Test token",
        symbol: "TEST",
        decimals: 18,
        quantity: block === 100 ? "2" : "5",
        rawBalance:
          block === 100 ? "2000000000000000000" : "5000000000000000000",
        sourceIds: ["rpc"],
      },
    ],
    nfts: [],
    transactions: [
      {
        hash: `0x${"b".repeat(64)}`,
        blockNumber: 99,
        timestamp: date,
        status: "success",
        method: "transfer",
        direction: "in",
        counterparty: WATCH_TEST_TOKEN,
        nativeValueEth: "0",
        movementCount: 0,
        movementCoverage: "complete",
        sourceIds: ["rpc"],
      },
      ...(block > 100
        ? [
            {
              hash: `0x${"c".repeat(64)}`,
              blockNumber: block,
              timestamp: date,
              status: "success" as const,
              method: "transfer",
              direction: "out" as const,
              counterparty: WATCH_TEST_TOKEN,
              nativeValueEth: "0.1",
              movementCount: 1,
              movementCoverage: "complete" as const,
              sourceIds: ["rpc"],
            },
          ]
        : []),
    ],
    movements:
      block > 100
        ? [
            {
              transactionHash: `0x${"c".repeat(64)}`,
              blockNumber: block,
              timestamp: date,
              direction: "out",
              kind: "native",
              symbol: "ETH",
              quantity: "0.1",
              contract: null,
              tokenId: null,
              counterparty: WATCH_TEST_TOKEN,
              sourceIds: ["rpc"],
            },
          ]
        : [],
    approvals: [],
    attention: [],
    reconciliation: {
      tokenCandidates: 1,
      tokenConfirmed: 1,
      nftCandidates: 0,
      nftConfirmed: 0,
      activityCandidates: block > 100 ? 2 : 1,
      activityConfirmed: block > 100 ? 2 : 1,
      approvalCandidates: 0,
      approvalConfirmed: 0,
      degradedSources: [],
      truncatedSections: [],
    },
    citations: [
      {
        id: "rpc",
        provider: "robinhood",
        url: "https://rpc.mainnet.chain.robinhood.com",
        fetchedAt: date,
        description: "Current block read",
      },
    ],
    privacy: {
      accountRequired: false,
      walletConnectionRequired: false,
      serverStorage: "none",
      browserStorage: "client_encrypted_vault",
      providerDestinations: ["robinhood_public_rpc", "blockscout"],
      disclosure: "Only the public address was sent.",
    },
  };
}
