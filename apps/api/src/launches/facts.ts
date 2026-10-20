export type Fact<T> =
  | {
      state: "available" | "partial";
      value: T;
      coverage: Record<string, unknown>;
      reason?: string;
    }
  | { state: "unknown"; reason: string; coverage?: Record<string, unknown> };
export const known = <T>(
  value: T,
  coverage: Record<string, unknown> = {},
  partial = false,
  reason?: string,
): Fact<T> => ({
  state: partial ? "partial" : "available",
  value,
  coverage,
  ...(reason ? { reason } : {}),
});
export const unknown = (reason: string): Fact<never> => ({
  state: "unknown",
  reason,
});
export const rules = {
  early: {
    version: "v1",
    text: "early buyer (rule v1): received the token from the launch's curve or pool within 10 seconds of trading opening, in a transaction this wallet signed itself.",
  },
  multi: {
    version: "v1",
    text: "same-tx multi-buy (rule v1): this wallet signed one transaction, within 10 seconds of trading opening, that delivered the token from the curve or pool to two or more wallets. Only the signing wallet is tagged; receiving tokens never tags a wallet.",
  },
  fresh: {
    version: "v1",
    text: "new wallet (rule v1): an early buyer that had sent at most one transaction before this buy.",
  },
  distributions: {
    version: "v1",
    text: "Deployer distributions (rule v1): tokens the deployer sent to other wallets in the first 24 hours after launch. This describes the deployer's transfers; it does not tag the wallets that received them.",
  },
} as const;
export type Tag = {
  wallet: string;
  kind: "early buyer" | "same-tx multi-buy" | "new wallet";
  rule: { version: string; text: string };
  transactionHash: string;
  recipientCount?: number;
};
export type Transfer = {
  from: string;
  to: string;
  value: bigint;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
};
export function buyerFacts(
  transfers: Transfer[],
  source: string,
  t0: number,
  signers: Map<string, string>,
  nonces: Map<string, number>,
) {
  const tags: Tag[] = [],
    multi: {
      signer: string;
      transactionHash: string;
      recipients: string[];
      deliveredRaw: string;
    }[] = [];
  const transactions = new Map<string, Transfer[]>();
  for (const row of transfers) {
    if (
      row.from !== source ||
      row.timestamp < t0 ||
      row.timestamp > t0 + 10 ||
      row.value <= 0n ||
      /^0x0{40}$/.test(row.to)
    )
      continue;
    const rows = transactions.get(row.transactionHash) ?? [];
    rows.push(row);
    transactions.set(row.transactionHash, rows);
  }
  for (const [hash, rows] of transactions) {
    const signer = signers.get(hash);
    if (!signer) continue;
    if (rows.some((row) => row.to === signer)) {
      tags.push({
        wallet: signer,
        kind: "early buyer",
        rule: rules.early,
        transactionHash: hash,
      });
      const nonce = nonces.get(hash);
      if (nonce === 0 || nonce === 1)
        tags.push({
          wallet: signer,
          kind: "new wallet",
          rule: rules.fresh,
          transactionHash: hash,
        });
    }
    const recipients = [...new Set(rows.map((row) => row.to))];
    if (recipients.length >= 2) {
      tags.push({
        wallet: signer,
        kind: "same-tx multi-buy",
        rule: rules.multi,
        transactionHash: hash,
        recipientCount: recipients.length,
      });
      multi.push({
        signer,
        transactionHash: hash,
        recipients,
        deliveredRaw: rows.reduce((n, row) => n + row.value, 0n).toString(),
      });
    }
  }
  return { tags, transactions: multi };
}
