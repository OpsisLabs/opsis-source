export type Pool = {
  pairAddress: string;
  tokenId: string;
  dexId: string;
  url: string;
  priceUsd: string;
  quoteToken: { symbol: string };
  liquidity: { usd: number };
  volume: { h24?: number | null };
  priceChange: { h24?: number | null };
};
export type LabToken = {
  id: string;
  symbol: string;
  name: string;
  contract: string;
  color: string;
  price: number;
  liquidity: number;
  volume24h: number;
  returns: { h24?: number | null };
  reportedChainVolumeDisplay: string;
  marketUrl: string;
  pools: Pool[];
};
export type LabData = {
  capturedAt: string;
  chainId: number;
  selection: string;
  poolScope: string;
  priceMethod: string;
  tokens: LabToken[];
};
export const money = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n < 1 ? 4 : 2,
      }).format(n)
    : "Unavailable";
export const compactMoney = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(n)
    : "Unavailable";
export const change = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? `${n > 0 ? "+" : ""}${n.toFixed(2)}%`
    : "Unavailable";
export function eligiblePools(
  data: LabData,
  filter: string,
  min: number,
): Pool[] {
  const unique = new Map<string, Pool>();
  for (const t of data.tokens)
    for (const p of t.pools)
      if (
        (filter === "all" || p.tokenId === filter) &&
        p.liquidity.usd >= min &&
        typeof p.volume?.h24 === "number" &&
        p.volume.h24 >= 1000 &&
        typeof p.priceChange?.h24 === "number" &&
        Number.isFinite(p.priceChange.h24)
      )
        unique.set(p.pairAddress, p);
  return [...unique.values()];
}
/** Same deterministic $10,000 basket and formula as the frozen publication. */
export function portfolioScenario(
  core: number,
  other: number,
  weth: number,
  fee: number,
) {
  const gross =
    10000 * (1 + ((weth + 15) / 100) * (core / 100) + 0.3 * (other / 100));
  const net = gross * (1 - fee / 100);
  return { gross, net, pl: net - 10000 };
}
export type Point3D = {
  id: string;
  x: number;
  y: number;
  z: number;
  color: string;
  label: string;
};
export function poolPoints(pools: Pool[], tokens: LabToken[]): Point3D[] {
  return pools.map((p) => ({
    id: p.pairAddress,
    x: ((Math.log10(p.volume.h24!) - 3) / 4) * 2 - 1,
    y:
      (Math.sign(p.priceChange.h24!) *
        Math.log10(1 + Math.abs(p.priceChange.h24!))) /
      3,
    z: ((Math.log10(p.liquidity.usd) - 3) / 5) * 2 - 1,
    color: tokens.find((t) => t.id === p.tokenId)?.color ?? "#ffffff",
    label: `${tokens.find((t) => t.id === p.tokenId)?.symbol} · ${compactMoney(p.liquidity.usd)} liquidity`,
  }));
}
export function scenarioPoints(weth: number, fee: number): Point3D[] {
  const points: Point3D[] = [];
  for (let i = 0; i <= 60; i++)
    for (let j = 0; j <= 40; j++) {
      const core = -40 + (i * 80) / 60,
        other = -60 + (j * 120) / 40;
      const value = portfolioScenario(core, other, weth, fee);
      points.push({
        id: `${i}-${j}`,
        x: core / 40,
        y: value.pl / 5500,
        z: other / 60,
        color: value.pl >= 0 ? "#baffb5" : "#ffbaa5",
        label: `${core.toFixed(1)}% / ${other.toFixed(1)}%: ${money(value.pl)}`,
      });
    }
  return points;
}
