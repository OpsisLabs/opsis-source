import type {
  FundingLink,
  LinkedGroup,
  LinkedHolder,
  SupplyFraction,
} from "@rh-chain/shared";

export function fraction(
  amount: bigint,
  supply: bigint | null,
): SupplyFraction | null {
  return supply !== null && supply > 0n
    ? { numerator: amount.toString(), denominator: supply.toString() }
    : null;
}
export function groupHolders(
  holders: LinkedHolder[],
  strong: FundingLink[],
  hubs: Set<string>,
  supply: bigint | null,
) {
  const parents = new Map<string, string>();
  const members = new Map<string, Set<string>>();
  const frozen = new Set<string>();
  const find = (wallet: string): string => {
    if (!parents.has(wallet)) {
      parents.set(wallet, wallet);
      members.set(wallet, new Set());
    }
    const parent = parents.get(wallet)!;
    if (parent !== wallet) parents.set(wallet, find(parent));
    return parents.get(wallet)!;
  };
  holders.forEach((h) => members.get(find(h.wallet))!.add(h.wallet));
  const accepted: FundingLink[] = [],
    cappedLinks: FundingLink[] = [];
  // Deterministic rebuild; no state survives an observation.
  for (const edge of [...strong].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  )) {
    if (hubs.has(edge.from) || hubs.has(edge.to)) continue;
    const a = find(edge.from),
      b = find(edge.to);
    if (a === b) {
      accepted.push(edge);
      continue;
    }
    const combined = new Set([...members.get(a)!, ...members.get(b)!]);
    if (combined.size > 50 || frozen.has(a) || frozen.has(b)) {
      frozen.add(a);
      frozen.add(b);
      cappedLinks.push(edge);
      continue;
    }
    parents.set(b, a);
    members.set(a, combined);
    accepted.push(edge);
  }
  const roots = [...new Set(holders.map((h) => find(h.wallet)))];
  const groups: LinkedGroup[] = roots.map((root) => {
    const wallets = [...members.get(root)!].sort();
    const rows = holders.filter((h) => wallets.includes(h.wallet));
    const amount = rows.every((h) => h.balanceRaw !== null)
      ? rows.reduce((n, h) => n + BigInt(h.balanceRaw!), 0n)
      : null;
    return {
      id: wallets[0]!,
      members: wallets,
      share: amount === null ? null : fraction(amount, supply),
      links: accepted.filter(
        (e) => find(e.from) === root && find(e.to) === root,
      ),
      status: frozen.has(root)
        ? "large group, review needed"
        : wallets.length > 1
          ? "linked by funding"
          : "single wallet",
    };
  });
  groups.sort((a, b) => {
    const av = BigInt(a.share?.numerator ?? "0"),
      bv = BigInt(b.share?.numerator ?? "0");
    return av === bv ? a.id.localeCompare(b.id) : av > bv ? -1 : 1;
  });
  return { groups, cappedLinks };
}
