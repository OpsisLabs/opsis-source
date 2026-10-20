/** Bounded evidence stored only inside an explicitly saved encrypted report. */
type CheckBase = {
  version: 1;
  chainId: 4663;
  identifier: string;
  observedAt: string;
  providers: string[];
};
export type SavedResearchCheck = CheckBase & {
  kind: "research";
  method: "token-facts-v1";
  sourceCoverage: "explorer_metadata" | "rpc_sample_only" | "unavailable";
  holderCoverage: "top_holders" | "unavailable";
  activityCoverage: "indexed_window" | "unavailable";
  decimals: number | null;
  holders: string | null;
  holdersAnalyzed: string | null;
  top1WalletShare: string | null;
  verified: boolean | null;
  proxy: boolean | null;
};
export type SavedTradeCheck = CheckBase & {
  kind: "check";
  method: "uniswap-v3-quote-v1";
  inputDecimals: number;
  inputRaw: string;
  output: { address: string; decimals: number };
  supported: boolean;
  pool: { address: string; fee: number } | null;
  amountOut: string | null;
  priceImpactBps: string | null;
  anchor: { height: number; hash: string };
  expiresAt: string;
  coverage: {
    tested: number[];
    found: string[];
    quoted: string[];
    failed: string[];
    missing: number[];
    discoveryFailed: number[];
  };
};
export type SavedCheck = SavedResearchCheck | SavedTradeCheck;

const address = (v: unknown) =>
  typeof v === "string" && /^0x[0-9a-f]{40}$/.test(v);
const uint = (v: unknown) =>
  typeof v === "string" &&
  /^(0|[1-9][0-9]{0,77})$/.test(v) &&
  BigInt(v) < 1n << 256n;
const decimals = (v: unknown) =>
  Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 36;
export const checkTime = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length === 24 &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
function keys(v: unknown, expected: string): boolean {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.keys(v).sort().join(",") === expected.split(",").sort().join(",")
  );
}
const nullable = (v: unknown, valid: (v: unknown) => boolean) =>
  v === null || valid(v);
const tiers = [100, 500, 3000, 10000];
function list(v: unknown, valid: (item: unknown) => boolean): boolean {
  return (
    Array.isArray(v) &&
    v.length <= 4 &&
    v.every(valid) &&
    new Set(v).size === v.length &&
    JSON.stringify(v) ===
      JSON.stringify(
        [...v].sort((a, b) =>
          typeof a === "number" ? a - b : a < b ? -1 : a > b ? 1 : 0,
        ),
      )
  );
}

export function parseSavedCheck(input: unknown): SavedCheck | null {
  try {
    if (
      !input ||
      typeof input !== "object" ||
      JSON.stringify(input).length > 8000
    )
      return null;
    const v = input as SavedCheck;
    const common =
      "version,chainId,identifier,observedAt,providers,kind,method,";
    if (
      v.version !== 1 ||
      v.chainId !== 4663 ||
      !address(v.identifier) ||
      !checkTime(v.observedAt) ||
      !Array.isArray(v.providers) ||
      !v.providers.length ||
      v.providers.length > 8 ||
      !v.providers.every(
        (p) => typeof p === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(p),
      ) ||
      new Set(v.providers).size !== v.providers.length ||
      [...v.providers].sort().join() !== v.providers.join()
    )
      return null;
    if (v.kind === "research") {
      if (
        !keys(
          v,
          common +
            "sourceCoverage,holderCoverage,activityCoverage,decimals,holders,holdersAnalyzed,top1WalletShare,verified,proxy",
        ) ||
        v.method !== "token-facts-v1" ||
        !["explorer_metadata", "rpc_sample_only", "unavailable"].includes(
          v.sourceCoverage,
        ) ||
        !["top_holders", "unavailable"].includes(v.holderCoverage) ||
        !["indexed_window", "unavailable"].includes(v.activityCoverage) ||
        !nullable(v.decimals, decimals) ||
        !nullable(v.holders, uint) ||
        !nullable(v.holdersAnalyzed, uint) ||
        !nullable(
          v.top1WalletShare,
          (x) =>
            typeof x === "string" &&
            /^(?:(?:0|[1-9][0-9]?)(?:\.[0-9]{1,18})?|100(?:\.0{1,18})?)$/.test(
              x,
            ),
        ) ||
        !nullable(v.verified, (x) => typeof x === "boolean") ||
        !nullable(v.proxy, (x) => typeof x === "boolean") ||
        (v.holderCoverage === "unavailable" &&
          [v.holders, v.holdersAnalyzed, v.top1WalletShare].some(
            (x) => x !== null,
          )) ||
        (v.sourceCoverage !== "explorer_metadata" &&
          [v.verified, v.proxy].some((x) => x !== null))
      )
        return null;
    } else if (v.kind === "check") {
      if (
        !keys(
          v,
          common +
            "inputDecimals,inputRaw,output,supported,pool,amountOut,priceImpactBps,anchor,expiresAt,coverage",
        ) ||
        v.method !== "uniswap-v3-quote-v1" ||
        !decimals(v.inputDecimals) ||
        !uint(v.inputRaw) ||
        BigInt(v.inputRaw) === 0n ||
        !keys(v.output, "address,decimals") ||
        !address(v.output.address) ||
        !decimals(v.output.decimals) ||
        v.output.address === v.identifier ||
        typeof v.supported !== "boolean" ||
        !keys(v.anchor, "height,hash") ||
        !Number.isSafeInteger(v.anchor.height) ||
        v.anchor.height < 0 ||
        !/^0x[0-9a-f]{64}$/.test(v.anchor.hash) ||
        !checkTime(v.expiresAt) ||
        Date.parse(v.expiresAt) <= Date.parse(v.observedAt) ||
        Date.parse(v.expiresAt) - Date.parse(v.observedAt) > 30_000 ||
        !nullable(v.amountOut, uint) ||
        !nullable(
          v.priceImpactBps,
          (x) =>
            typeof x === "string" &&
            /^-?(0|[1-9][0-9]{0,77})$/.test(x) &&
            x !== "-0",
        ) ||
        (v.supported
          ? !keys(v.pool, "address,fee") ||
            !address(v.pool!.address) ||
            !tiers.includes(v.pool!.fee) ||
            v.amountOut === null
          : v.pool !== null ||
            v.amountOut !== null ||
            v.priceImpactBps !== null) ||
        !keys(v.coverage, "tested,found,quoted,failed,missing,discoveryFailed")
      )
        return null;
      const c = v.coverage;
      if (
        ![c.tested, c.missing, c.discoveryFailed].every((a) =>
          list(a, (x) => tiers.includes(Number(x)) && typeof x === "number"),
        ) ||
        ![c.found, c.quoted, c.failed].every((a) =>
          list(
            a,
            (x) =>
              typeof x === "string" &&
              /^(100|500|3000|10000):0x[0-9a-f]{40}$/.test(x),
          ),
        )
      )
        return null;
      if (
        v.supported &&
        !c.quoted.includes(`${v.pool!.fee}:${v.pool!.address}`)
      )
        return null;
      const foundTiers = c.found.map((p) => Number(p.split(":")[0]));
      const outcomes = [...foundTiers, ...c.missing, ...c.discoveryFailed];
      if (
        !c.tested.length ||
        new Set(outcomes).size !== outcomes.length ||
        JSON.stringify([...outcomes].sort((a, b) => a - b)) !==
          JSON.stringify(c.tested) ||
        [...c.quoted, ...c.failed].some((p) => !c.found.includes(p)) ||
        c.quoted.some((p) => c.failed.includes(p)) ||
        c.found.some((p) => !c.quoted.includes(p) && !c.failed.includes(p)) ||
        (!v.supported && c.quoted.length > 0)
      )
        return null;
    } else return null;
    // Consumers cannot mutate an imported or producer-owned record through this result.
    return JSON.parse(JSON.stringify(v)) as SavedCheck;
  } catch {
    return null;
  }
}

export function formatCheckUnits(raw: string, scale: number): string {
  const value = BigInt(raw),
    negative = value < 0n,
    magnitude = negative ? -value : value;
  const factor = 10n ** BigInt(scale),
    fraction = (magnitude % factor)
      .toString()
      .padStart(scale, "0")
      .replace(/0+$/, "");
  return `${negative ? "-" : ""}${magnitude / factor}${fraction ? `.${fraction}` : ""}`;
}
