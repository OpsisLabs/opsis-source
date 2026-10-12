const TOKEN = "0x1111111111111111111111111111111111111111";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const POOL = `0x${"a".repeat(40)}`;
export function fixture() {
  const now = Date.now();
  return {
    schemaVersion: 1,
    supported: true,
    reason: "ok",
    chain: { id: 4663, name: "Robinhood Chain" },
    input: {
      contract: TOKEN,
      symbol: null,
      decimals: 6,
      amount: "1.5",
      rawAmount: "1500000",
    },
    output: { symbol: "WETH", address: WETH, decimals: 18 },
    quote: {
      pool: { fee: 3000, pool: POOL },
      amountOut: "500000000000",
      amountOutDisplay: "0.0000005",
      spotAmountOut: "500000000000",
      spotAmountOutDisplay: "0.0000005",
      priceImpactBps: "0",
      priceImpactPercent: "0",
      feeTier: 3000,
      feePercent: "0.3",
      feeAmount: "4500",
      feeAmountDisplay: "0.0045",
      activeLiquidity: "12345678901234567890",
      fullExecutionProven: false,
    },
    coverage: {
      feeTiersTested: [100, 500, 3000, 10000],
      poolsFound: [{ fee: 3000, pool: POOL }],
      poolsQuoted: [
        {
          fee: 3000,
          pool: POOL,
          amountOut: "500000000000",
          amountOutDisplay: "0.0000005",
        },
      ],
      poolsFailed: [],
      poolsMissing: [100, 500, 10000],
      poolsDiscoveryFailed: [],
    },
    anchor: {
      tag: "latest",
      blockNumber: 60401526,
      blockHash: `0x${"b".repeat(64)}`,
      timestamp: new Date(now).toISOString(),
      fetchedAt: new Date(now).toISOString(),
    },
    quotedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    freshForMs: 30_000,
    quoteIsNotSellabilityProof: true,
    limitations: [
      "This is not a guaranteed fill, a maximum slippage, or proof that the token can be transferred or sold.",
      "Only standard Uniswap V3 fee-tier pools created by the official factory are tested. Uniswap v4 and other venues are not included.",
      "Active V3 liquidity (L) is a raw pool parameter, not the dollar amount you can sell without moving the price.",
    ],
    provider: { name: "robinhood-public-rpc", cached: false },
  };
}

export function research() {
  const citations = [
    {
      id: "s1",
      provider: "blockscout",
      url: `https://robinhoodchain.blockscout.com/token/${TOKEN}`,
      fetchedAt: "2026-09-18T12:00:00.000Z",
      fieldsUsed: ["symbol"],
      description: "Fixture token metadata",
    },
  ];
  const facts = {
    address: TOKEN,
    name: "Fixture Token",
    symbol: "FIX",
    decimals: 6,
  };
  return {
    mode: "private",
    entity: {
      chainId: 4663,
      type: "token",
      value: TOKEN,
      facts,
      citations,
      riskNotes: [],
    },
    answer: {
      answer: "Fixture observation; incomplete coverage.",
      facts,
      confirmedFacts: [{ fact: "Fixture fact", sourceIds: ["s1"] }],
      riskNotes: [],
      citations,
    },
    privacy: {
      accountRequired: false,
      walletConnectionRequired: false,
      serverStorage: "none",
      browserStorage: "memory_only",
      clearsOnReload: true,
      modelProvider: "none",
      providerDestinations: ["blockscout"],
      disclosure: "Public identifier only.",
    },
  };
}
