import type {
  Claim,
  ClaimRequest,
  ClaimResponse,
  ClaimType,
} from "@rh-chain/shared";
export function initialClaim(type: ClaimType): Claim {
  if (type === "top10" || type === "deployer")
    return { type, comparison: "under", percent: "10" };
  if (type === "launchpad") return { type, launchpad: "launcher" };
  if (type === "tax") return { type, buy: "0", sell: "0" };
  if (type === "unsupported") return { type };
  return { type, expected: true };
}
/** Whitelist projection prevents UI text, matched text and extra fields crossing the boundary. */
export function claimInput(claim: Claim): Claim {
  switch (claim.type) {
    case "ownership":
    case "paused":
    case "lpBurned":
    case "verified":
      return { type: claim.type, expected: claim.expected };
    case "top10":
    case "deployer":
      return {
        type: claim.type,
        comparison: claim.comparison,
        percent: claim.percent,
      };
    case "launchpad":
      return { type: claim.type, launchpad: claim.launchpad };
    case "tax":
      return { type: claim.type, buy: claim.buy, sell: claim.sell };
    default:
      return { type: "unsupported" };
  }
}
export function addressConfirmed(
  address: string,
  confirmedAddress: string,
): boolean {
  return (
    /^0x[\da-f]{40}$/i.test(address) &&
    !/^0x0{40}$/i.test(address) &&
    address === confirmedAddress
  );
}
export async function requestClaims(
  input: {
    address: string;
    confirmedAddress: string;
    claims: Claim[];
    postTime?: string;
  },
  enabled: boolean,
  previewKey: string,
  signal?: AbortSignal,
): Promise<ClaimResponse> {
  if (
    !enabled ||
    !addressConfirmed(input.address, input.confirmedAddress) ||
    !input.claims.length
  )
    throw new Error("Claim check unavailable or address unconfirmed");
  const body: ClaimRequest = {
    address: input.address,
    confirmed: true,
    claims: input.claims.map(claimInput),
    ...(input.postTime ? { postTime: input.postTime } : {}),
  };
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? ""}/v1/private/opsis/claims`,
    {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: {
        "content-type": "application/json",
        "x-opsis-csrf": "1",
        ...(previewKey ? { authorization: `Preview ${previewKey}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error("Claim check unavailable");
  return (await response.json()) as ClaimResponse;
}
