import type { Receipt } from "./receipts.js";

export const claimTypes = [
  "ownership",
  "paused",
  "lpBurned",
  "top10",
  "deployer",
  "launchpad",
  "verified",
  "tax",
  "unsupported",
] as const;
export type ClaimType = (typeof claimTypes)[number];
export const launchpads = [
  "pons",
  "long",
  "instant",
  "launcher",
  "v3",
  "v4",
] as const;
export type Claim =
  | {
      type: "ownership" | "paused" | "lpBurned" | "verified";
      expected: boolean;
    }
  | {
      type: "top10" | "deployer";
      comparison: "under" | "over" | "equal";
      percent: string;
    }
  | { type: "launchpad"; launchpad: (typeof launchpads)[number] }
  | { type: "tax"; buy: string | null; sell: string | null }
  | { type: "unsupported" };
export const claimDefinitions: Record<ClaimType, string> = {
  ownership:
    "Ownership renounced means owner() reads as the zero address AND the ERC-1967 admin slot is zero. If either read is unavailable, can't check.",
  paused:
    "Contract paused / not paused means the standard paused() read reports the claimed state. If the read is unavailable, can't check.",
  lpBurned:
    "LP burned means every LP position Opsis launch facts can see for this token is held by the zero address or 0x000000000000000000000000000000000000dEaD. Unknown or partial LP recipient coverage gives can't check. A recorded initial recipient alone does not establish current holdings.",
  top10:
    "Top 10 holders hold under / over / exactly X% means the explorer-reported top 10 share satisfies the stated strict comparison or exact equality. Pools and burn addresses are counted as the explorer reports them. The explorer is current-only; historical or missing evidence gives can't check.",
  deployer:
    "Deployer holds under / over / exactly X% means balanceOf(deployer) / totalSupply at the stated block satisfies the stated strict comparison or exact equality. The deployer comes from Opsis launch facts. Missing launch facts, balance or positive total supply gives can't check.",
  launchpad:
    "Launched on a launchpad means Opsis launch facts match that registry adapter. Uniswap Liquidity Launcher covers pools.trade and other front ends; a match does not identify a front end. Missing registry evidence gives can't check.",
  verified:
    "Contract source verified means the explorer verification flag reports the claimed state. The explorer is current-only; historical or unavailable explorer evidence gives can't check.",
  tax: "Buy/sell tax X% / no tax can't be checked in this version.",
  unsupported:
    "A claim type outside the published list can't be checked in this version.",
};
export type ClaimCandidate = {
  claim: Claim;
  matchedText: string;
  foundBy: "pattern";
};
export function stripPostIdentifiers(text: string): string {
  return text
    .replace(/(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s<>]+/gi, " ")
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/[^\s<>]*/gi, " ")
    .replace(/@[\p{L}\p{N}_]+/gu, " ");
}
export function extractClaims(raw: string): ClaimCandidate[] {
  const text = stripPostIdentifiers(raw.slice(0, 20000));
  const found: Array<ClaimCandidate & { index: number }> = [];
  const add = (
    pattern: RegExp,
    make: (m: RegExpMatchArray) => Claim | null,
  ) => {
    for (const m of text.matchAll(pattern)) {
      const prefix =
        text
          .slice(Math.max(0, m.index! - 35), m.index!)
          .split(/[.!?;\n,]/)
          .pop() ?? "";
      // Refuse negated/conditional context outside the explicitly matched phrase.
      if (
        /\b(?:not|never|isn't|isnt|wasn't|wasnt|no|if|unless|might|maybe|not yet)\b/i.test(
          prefix,
        )
      )
        continue;
      const claim = make(m);
      if (claim)
        found.push({
          claim,
          matchedText: m[0],
          foundBy: "pattern",
          index: m.index!,
        });
    }
  };
  add(/\b(?:(not|never)\s+)?(?:ownership\s+)?renounced\b/gi, (m) => ({
    type: "ownership",
    expected: !m[1],
  }));
  add(/\b(?:contract\s+(?:is\s+)?)?(not\s+|un)?paused\b/gi, (m) => ({
    type: "paused",
    expected: !m[1],
  }));
  add(
    /\b(?:LP|liquidity)\s+(?:(?:is|was)\s+)?(not\s+)?burn(?:ed|t)\b/gi,
    (m) => ({ type: "lpBurned", expected: !m[1] }),
  );
  add(
    /\b(top\s*10(?:\s+holders)?|dev|deployer)\s+holds?\s+(?:(under|over|less than|more than|exactly)\s+)?(\d+(?:\.\d{1,6})?)\s*%/gi,
    (m) => {
      if (Number(m[3]) > 100) return null;
      return {
        type: /^top/i.test(m[1]!) ? "top10" : "deployer",
        comparison: /under|less/i.test(m[2] ?? "")
          ? "under"
          : /over|more/i.test(m[2] ?? "")
            ? "over"
            : "equal",
        percent: m[3]!,
      };
    },
  );
  add(
    /\blaunched\s+on\s+(pons|long|instant launch|uniswap liquidity launcher|pools\.trade|uniswap v3|uniswap v4)\b/gi,
    (m) => ({
      type: "launchpad",
      launchpad: (
        {
          pons: "pons",
          long: "long",
          "instant launch": "instant",
          "uniswap liquidity launcher": "launcher",
          "pools.trade": "launcher",
          "uniswap v3": "v3",
          "uniswap v4": "v4",
        } as const
      )[m[1]!.toLowerCase() as "pons"],
    }),
  );
  add(/\b(?:contract\s+)?source\s+(?:is\s+)?(not\s+|un)?verified\b/gi, (m) => ({
    type: "verified",
    expected: !m[1],
  }));
  add(
    /\b(no tax|(?:\d+(?:\.\d{1,6})?)\s*\/\s*(?:\d+(?:\.\d{1,6})?)\s*%?\s*tax|(?:buy|sell|buy\/sell)\s+tax\s+\d+(?:\.\d{1,6})?\s*%)/gi,
    (m) => {
      const n = m[0].match(/\d+(?:\.\d+)?/g) ?? ["0", "0"];
      if (n.some((v) => Number(v) > 100)) return null;
      const buyOnly = /^buy\s/i.test(m[0]),
        sellOnly = /^sell\s/i.test(m[0]);
      return {
        type: "tax",
        buy: sellOnly ? null : n[0]!,
        sell: buyOnly ? null : (n[1] ?? n[0]!),
      };
    },
  );
  return found
    .sort((a, b) => a.index - b.index)
    .slice(0, 32)
    .map(({ index: _index, ...candidate }) => candidate);
}
export type ClaimRequest = {
  address: string;
  confirmed: true;
  claims: Claim[];
  postTime?: string;
};
export type ClaimBlock = {
  number: number;
  hash: string;
  timestamp: string;
  label: "current, not final" | "post time";
};
export type ClaimResult = {
  claim: Claim;
  definition: string;
  status: "agrees" | "differs" | "can't check";
  wording: string;
  evidence: Record<string, string>;
  reason?: string;
};
export type ClaimObservation = {
  block: ClaimBlock | null;
  reason?: string;
  results: ClaimResult[];
};
export type ClaimResponse = {
  chainId: 4663;
  address: string;
  current: ClaimObservation;
  post?: ClaimObservation;
  receipt?: Receipt;
};
