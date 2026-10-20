import {
  claimDefinitions,
  type Claim,
  type ClaimResult,
  type TokenControls,
} from "@rh-chain/shared";
export type Sample<T> =
  { value: T; evidence: Record<string, string> } | { reason: string };
export type Snapshot = {
  controls?: Sample<TokenControls>;
  lp?: Sample<string[]>;
  top10?: Sample<{ numerator: string; denominator: string }>;
  deployer?: Sample<{ numerator: string; denominator: string }>;
  launchpad?: Sample<string>;
  verified?: Sample<boolean>;
};
/** Reserved for the release-48 pass-B simulation adapter. No adapter is installed here. */
export interface SellTestHook {
  checkTax(
    address: string,
    block: number,
    claim: Extract<Claim, { type: "tax" }>,
  ): Promise<Sample<{ buy: string; sell: string }>>;
}
export function compareShare(
  numerator: string,
  denominator: string,
  claim: Extract<Claim, { comparison: string }>,
): boolean | null {
  if (
    !/^\d+$/.test(numerator) ||
    !/^\d+$/.test(denominator) ||
    !/^\d{1,3}(?:\.\d{1,6})?$/.test(claim.percent)
  )
    return null;
  const n = BigInt(numerator),
    d = BigInt(denominator);
  if (d <= 0n || n > d || Number(claim.percent) > 100) return null;
  const [whole, decimal = ""] = claim.percent.split(".");
  const left = n * 100n * 10n ** BigInt(decimal.length),
    right = BigInt(`${whole}${decimal}`) * d;
  return claim.comparison === "under"
    ? left < right
    : claim.comparison === "over"
      ? left > right
      : left === right;
}
export function checkClaim(
  claim: Claim,
  block: number | null,
  snapshot: Snapshot,
  missing?: string,
): ClaimResult {
  let agrees: boolean | null = null;
  let evidence: Record<string, string> = {};
  let reason = missing;
  const use = <T>(sample: Sample<T> | undefined): T | undefined => {
    if (!sample) {
      reason = "Evidence unavailable";
      return undefined;
    }
    if ("reason" in sample) {
      reason = sample.reason;
      return undefined;
    }
    evidence = sample.evidence;
    return sample.value;
  };
  if (!missing)
    switch (claim.type) {
      case "ownership": {
        const controls = use(snapshot.controls);
        if (controls) {
          const { owner, admin } = controls.readings;
          if (owner.state !== "observed" || admin.state !== "observed")
            reason = "Owner or ERC-1967 admin read unavailable";
          else {
            evidence = { ...evidence, owner: owner.value, admin: admin.value };
            agrees =
              (/^0x0{40}$/i.test(owner.value) &&
                /^0x0{40}$/i.test(admin.value)) === claim.expected;
          }
        }
        break;
      }
      case "paused": {
        const controls = use(snapshot.controls),
          read = controls?.readings.paused;
        if (
          read?.state === "observed" &&
          ["true", "false"].includes(read.value)
        ) {
          evidence = {
            ...evidence,
            paused: read.value === "true" ? "paused" : "not paused",
          };
          agrees = (read.value === "true") === claim.expected;
        } else reason ??= "Pause read unavailable";
        break;
      }
      case "lpBurned": {
        const positions = use(snapshot.lp);
        if (positions?.length) {
          evidence = { ...evidence, recipients: positions.join(", ") };
          agrees =
            positions.every((a) => /^0x(?:0{40}|0{36}dead)$/i.test(a)) ===
            claim.expected;
        } else reason ??= "LP recipients unavailable";
        break;
      }
      case "top10":
      case "deployer": {
        const share = use(snapshot[claim.type]);
        if (share) {
          evidence = { ...evidence, ...share };
          agrees = compareShare(share.numerator, share.denominator, claim);
          if (agrees === null) reason = "Supply share unavailable or invalid";
        }
        break;
      }
      case "launchpad": {
        const pad = use(snapshot.launchpad);
        if (pad !== undefined) {
          evidence = { ...evidence, adapter: pad };
          agrees = pad === claim.launchpad;
        }
        break;
      }
      case "verified": {
        const flag = use(snapshot.verified);
        if (flag !== undefined) {
          evidence = {
            ...evidence,
            verified: flag ? "verified" : "not verified",
          };
          agrees = flag === claim.expected;
        }
        break;
      }
      case "tax":
        reason = "Tax claims can't be checked in this version";
        break;
      case "unsupported":
        reason = "Claim type outside the published list";
    }
  const status =
    agrees === null ? "can't check" : agrees ? "agrees" : "differs";
  return {
    claim,
    definition: claimDefinitions[claim.type],
    status,
    wording:
      block === null ? "can't check" : `Chain data at block ${block} ${status}`,
    evidence,
    ...(agrees === null ? { reason: reason ?? "Evidence unavailable" } : {}),
  };
}
