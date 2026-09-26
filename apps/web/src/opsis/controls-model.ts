import type { TokenControls } from "@rh-chain/shared";
const expectedUnknown = [
  "mint_permissions", "transfer_fees", "custom_roles", "other_proxy_patterns", "holder_concentration",
] as const;
export function validControls(
  value: unknown,
  contract: string,
): value is TokenControls {
  if (!value || typeof value !== "object") return false;
  const v = value as TokenControls;
  if (
    v.kind !== "observed" ||
    v.chainId !== 4663 ||
    v.contract !== contract.toLowerCase() ||
    typeof v.hasCode !== "boolean" ||
    v.methodVersion !== "controls-v1" ||
    (v.source !== "robinhood-public-rpc" && v.source !== "drpc") ||
    v.coverage?.state !== "partial" ||
    !Number.isInteger(v.coverage.rpcCalls) ||
    v.coverage.rpcCalls < 1 ||
    v.coverage.rpcCalls > 10 ||
    !Array.isArray(v.coverage.unknown) ||
    v.coverage.unknown.length !== expectedUnknown.length ||
    v.coverage.unknown.some((field, index) => field !== expectedUnknown[index]) ||
    !v.anchor ||
    !Number.isSafeInteger(v.anchor.blockNumber) ||
    v.anchor.blockNumber < 0 ||
    !/^0x[0-9a-f]{64}$/i.test(v.anchor.blockHash) ||
    v.anchor.finality !== "current_not_final" ||
    !Number.isFinite(Date.parse(v.anchor.timestamp)) ||
    !Number.isFinite(Date.parse(v.observedAt)) ||
    Date.parse(v.expiresAt) - Date.parse(v.observedAt) !== 30000 ||
    Date.parse(v.observedAt) > Date.now() + 5000 ||
    !v.readings
  )
    return false;
  return (
    ["owner", "paused", "implementation", "admin", "beacon"] as const
  ).every((key) => {
    const r = v.readings[key];
    if (!r || typeof r !== "object") return false;
    return r.state === "unknown"
      ? ["reverted", "malformed"].includes(r.reason)
      : r.state === "observed" &&
          typeof r.value === "string" &&
          (key === "paused"
            ? ["true", "false"].includes(r.value)
            : /^0x[0-9a-f]{40}$/.test(r.value));
  });
}
