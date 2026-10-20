import type { ContractFact, ContractFacts } from "@rh-chain/shared";
import type { SourceDocumentInput } from "./types.js";

const addressPattern = /^0x[0-9a-f]{40}$/i;
const fields = ["is_verified", "is_verified_via_eth_bytecode_db", "name", "compiler_version", "optimization_enabled", "proxy_type", "is_proxy", "implementations", "verified_at"];
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value) ? value : undefined;
const boolean = (value: unknown): boolean | undefined => typeof value === "boolean" ? value : undefined;
const timestamp = (value: unknown): string | undefined =>
  typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19) ? value : undefined;

function implementations(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const addresses = value.map((item) => record(item)?.address_hash ?? record(item)?.address);
  return addresses.every((address) => typeof address === "string" && addressPattern.test(address)) ? addresses as string[] : undefined;
}

/** Reuse the resolver's public documents, including their original cached read times. */
export function contractFacts(chainId: number, address: string, documents: SourceDocumentInput[]): ContractFacts {
  const find = (endpoint: string) => documents.find((doc) => {
    if (doc.provider !== "blockscout" || doc.chainId !== chainId || doc.entityValue.toLowerCase() !== address.toLowerCase() || !doc.requestUrl) return false;
    try {
      const url = new URL(doc.requestUrl);
      return ["https:", "http:"].includes(url.protocol) && url.pathname.toLowerCase().endsWith(`/api/v2/${endpoint}/${address.toLowerCase()}`);
    } catch { return false; }
  });
  const contract = find("smart-contracts");
  const addressDoc = find("addresses");
  const metadata = contract ?? addressDoc;
  const reported = (doc: SourceDocumentInput | undefined, keys: string[]) => keys.some((key) => {
    const value = record(doc?.responseJson)?.[key];
    return value !== undefined && value !== null;
  });
  function fact<T>(doc: SourceDocumentInput | undefined, used: string[], parse: (body: Record<string, unknown>) => T | undefined): ContractFact<T> {
    if (!doc) return { value: null, reason: "explorer_unavailable", source: null };
    const body = record(doc.responseJson);
    const url = new URL(doc.requestUrl!);
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    const source = timestamp(doc.fetchedAt) ? { provider: "blockscout" as const, url: url.toString(), fetchedAt: doc.fetchedAt, fieldsUsed: used } : null;
    if (!source || !body || !fields.some((key) => key in body)) return { value: null, reason: "malformed", source };
    const value = parse(body);
    return { value: value ?? null, reason: value !== undefined ? null : used.some((key) => body[key] !== undefined && body[key] !== null) ? "malformed" : "not_reported", source };
  }
  const verificationFields = ["is_verified", "is_verified_via_eth_bytecode_db"];
  const verificationDoc = reported(contract, verificationFields) ? contract : addressDoc ?? contract;
  const sourceVerified = fact(verificationDoc, verificationFields, (body) =>
    body.is_verified === true || body.is_verified_via_eth_bytecode_db === true ? true
      : body.is_verified === false && (body.is_verified_via_eth_bytecode_db === false || body.is_verified_via_eth_bytecode_db === undefined) ? false : undefined);
  const read = <T>(key: string, parse: (value: unknown) => T | undefined) => fact(contract, [key], (body) => parse(body[key]));
  const proxyDoc = contract && ["proxy_type", "is_proxy", "implementations"].some((key) => key in (record(contract.responseJson) ?? {})) ? contract : addressDoc ?? contract;
  const implementationDoc = reported(contract, ["implementations"]) ? contract : addressDoc ?? contract;
  return {
    sourceVerified,
    name: sourceVerified.value === true ? fact(metadata, ["name"], (body) => text(body.name))
      : { value: null, reason: sourceVerified.reason ?? "not_reported", source: sourceVerified.source },
    compilerVersion: read("compiler_version", text),
    optimizationEnabled: read("optimization_enabled", boolean),
    proxy: fact(proxyDoc, ["is_proxy", "proxy_type", "implementations"], (body) => {
      const targets = implementations(body.implementations);
      if (body.is_proxy === true || text(body.proxy_type) || (targets && targets.length > 0)) return true;
      if (body.is_proxy === false || (body.proxy_type === null && targets?.length === 0)) return false;
      return undefined;
    }),
    implementations: fact(implementationDoc, ["implementations"], (body) => implementations(body.implementations)),
    verifiedAt: read("verified_at", timestamp)
  };
}
