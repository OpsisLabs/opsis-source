import type { LinkedWalletGraph, SupplyFraction } from "@rh-chain/shared";
import { opsisPreviewAuthorization } from "./preview-token";

const address = (v: unknown): v is string =>
  typeof v === "string" && /^0x[0-9a-f]{40}$/.test(v);
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v);
const fraction = (v: unknown): boolean =>
  v === null ||
  (!!v &&
    typeof v === "object" &&
    typeof (v as SupplyFraction).numerator === "string" &&
    /^\d+$/.test((v as SupplyFraction).numerator) &&
    typeof (v as SupplyFraction).denominator === "string" &&
    /^[1-9]\d*$/.test((v as SupplyFraction).denominator) &&
    BigInt((v as SupplyFraction).numerator) <=
      BigInt((v as SupplyFraction).denominator));
export function validLinkedGraph(
  value: unknown,
  token: string,
): value is LinkedWalletGraph {
  if (!value || typeof value !== "object") return false;
  const g = value as LinkedWalletGraph;
  const link = (e: LinkedWalletGraph["weakLinks"][number]) =>
    e &&
    address(e.from) &&
    address(e.to) &&
    [
      "first_funding",
      "same_signer_multi_buy",
      "shared_hub",
      "same_second",
    ].includes(e.kind) &&
    Array.isArray(e.transactionHashes) &&
    e.transactionHashes.length > 0 &&
    e.transactionHashes.every(hash) &&
    (e.via === undefined || address(e.via));
  const holder = (h: LinkedWalletGraph["holders"][number]) =>
    h &&
    address(h.wallet) &&
    (h.balanceRaw === null ||
      (typeof h.balanceRaw === "string" && /^\d+$/.test(h.balanceRaw))) &&
    fraction(h.share) &&
    [
      "checked",
      "not checked (cap)",
      "not checked (beyond top N)",
      "not checked (known hub)",
      "unavailable",
    ].includes(h.funding);
  return (
    g.schemaVersion === 1 &&
    g.chainId === 4663 &&
    g.token === token.toLowerCase() &&
    ["finished", "partial"].includes(g.state) &&
    ["fresh", "cache"].includes(g.servedFrom) &&
    Number.isFinite(Date.parse(g.observedAt)) &&
    Number.isFinite(Date.parse(g.expiresAt)) &&
    !!g.anchor &&
    Number.isSafeInteger(g.anchor.blockNumber) &&
    hash(g.anchor.blockHash) &&
    Number.isFinite(Date.parse(g.anchor.timestamp)) &&
    Array.isArray(g.holders) &&
    g.holders.length <= 100 &&
    g.holders.every(holder) &&
    new Set(g.holders.map((h) => h.wallet)).size === g.holders.length &&
    Array.isArray(g.excluded) &&
    g.excluded.every(
      (h) => holder(h) && ["pool", "burn", "token"].includes(h.reason),
    ) &&
    g.holders.length + g.excluded.length <= 100 &&
    Array.isArray(g.groups) &&
    g.groups.every(
      (group) =>
        group &&
        address(group.id) &&
        Array.isArray(group.members) &&
        group.members.length > 0 &&
        group.members.length <= 50 &&
        group.members.every((m) => g.holders.some((h) => h.wallet === m)) &&
        fraction(group.share) &&
        Array.isArray(group.links) &&
        group.links.every(
          (e) =>
            link(e) &&
            ["first_funding", "same_signer_multi_buy"].includes(e.kind),
        ) &&
        [
          "linked by funding",
          "single wallet",
          "large group, review needed",
        ].includes(group.status),
    ) &&
    new Set(g.groups.flatMap((group) => group.members)).size ===
      g.holders.length &&
    g.groups.reduce((n, group) => n + group.members.length, 0) ===
      g.holders.length &&
    Array.isArray(g.weakLinks) &&
    g.weakLinks.every(
      (e) => link(e) && ["shared_hub", "same_second"].includes(e.kind),
    ) &&
    Array.isArray(g.cappedLinks) &&
    g.cappedLinks.every(link) &&
    Array.isArray(g.hubs) &&
    g.hubs.every(
      (h) =>
        h &&
        address(h.wallet) &&
        ["registry", "contract", "fan_out"].includes(h.reason) &&
        Number.isSafeInteger(h.fanOut),
    ) &&
    Array.isArray(g.notChecked) &&
    g.notChecked.every(
      (h) => h && address(h.wallet) && typeof h.reason === "string",
    ) &&
    !!g.totals &&
    fraction(g.totals.largestGroup) &&
    fraction(g.totals.largestSingleWallet) &&
    !!g.coverage &&
    Array.isArray(g.coverage.reasons) &&
    g.coverage.reasons.every((s) => typeof s === "string") &&
    typeof g.limits === "string"
  );
}
export async function loadLinkedWallets(
  token: string,
  enabled: boolean,
  signal?: AbortSignal,
): Promise<LinkedWalletGraph | null> {
  if (!enabled) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) throw new Error("Invalid token");
  const path = `/v1/private/opsis/linked-wallets/${token}`;
  const authorization = opsisPreviewAuthorization(path);
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? ""}${path}`,
    {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal,
      headers: authorization ? { authorization } : {},
    },
  );
  if (!response.ok) throw new Error("Linked-wallet observation unavailable");
  const data: unknown = await response.json();
  if (!validLinkedGraph(data, token))
    throw new Error("Invalid linked-wallet observation");
  return data;
}
export function shareText(
  value: SupplyFraction | null,
  unknown: string,
): string {
  if (!value) return unknown;
  const hundredths =
    (BigInt(value.numerator) * 10000n) / BigInt(value.denominator);
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}% (${value.numerator}/${value.denominator})`;
}
