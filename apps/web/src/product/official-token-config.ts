import { isAddress, zeroAddress } from "viem";

export type OfficialToken =
  | { status: "not-launched" }
  | { status: "unavailable" }
  | { status: "published"; address: string; network: string; chainId: number };

// Only reviewed, committed configuration supplies this identity. Never use a
// query string, browser storage, a connected wallet or an Explorer result.
export function resolveOfficialToken(value: unknown): OfficialToken {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "unavailable" };
  const config = value as Record<string, unknown>;
  if (config.status === "not-launched" && config.address === null && config.network === null && config.chainId === null) {
    return { status: "not-launched" };
  }
  if (config.status !== "published" || typeof config.address !== "string" ||
    !isAddress(config.address, { strict: true }) || config.address.toLowerCase() === zeroAddress ||
    config.address.toLowerCase() === "0x000000000000000000000000000000000000dead" ||
    typeof config.network !== "string" || config.network !== config.network.trim() ||
    !/^[\p{L}\p{N}][\p{L}\p{N} .()/-]{1,59}$/u.test(config.network) ||
    typeof config.chainId !== "number" || !Number.isSafeInteger(config.chainId) || config.chainId <= 0) {
    return { status: "unavailable" };
  }
  return { status: "published", address: config.address, network: config.network, chainId: config.chainId };
}
