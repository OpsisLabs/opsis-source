/** Receipt primitives have no runtime dependencies; hosts inject existing viem primitives. */
export type Hex = `0x${string}`;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type ReceiptKey = { address: string; validFrom: string; validTo: string | null };
export type MerkleProof = { index: number; siblings: (Hex | null)[] };
export type ReceiptTimestamp = {
  kind: "opentimestamps"; status: "pending" | "attested"; root: Hex;
  proof: MerkleProof; calendars: string[]; otsProofBase64?: string;
};
export type ReceiptBody = {
  version: "opsis-receipt/1"; tool: string; inputs: Json; chainId: number;
  block: { number: string; hash: Hex; timestamp: string };
  rpcCalls: { method: string; paramsSha256: Hex }[];
  sources: { id: string; provider: string; url: string; fetchedAt: string; responseSha256: Hex }[];
  outputs: Json; codeSha: string; labelsetVersion: string; issuedAt: string;
};
export type Receipt = ReceiptBody & {
  signature: { kind: "secp256k1"; keyId: string; value: Hex };
  timestamp?: ReceiptTimestamp;
};
export interface ReceiptSigner { address: string; signDigest(digest: Hex): Promise<Hex> }
export type ReceiptCrypto = {
  keccak256(bytes: Uint8Array): Hex;
  recoverAddress(args: { hash: Hex; signature: Hex }): Promise<string>;
};
const fail = (): never => { throw new Error("Invalid receipt data"); };
const HASH = /^0x[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const date = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const hash = (v: unknown): v is Hex => typeof v === "string" && HASH.test(v);
function unicode(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
    } else if (c >= 0xdc00 && c <= 0xdfff) fail();
  }
  return s;
}
/** RFC 8785: ECMAScript primitive serialization and UTF-16 property ordering. */
export function canonicalize(value: unknown): string {
  const seen = new Set<object>();
  function encode(v: unknown, depth: number): string {
    if (depth > 100) return fail();
    if (v === null) return "null";
    if (typeof v === "string") return JSON.stringify(unicode(v));
    if (typeof v === "boolean") return String(v);
    if (typeof v === "number") return Number.isFinite(v) ? JSON.stringify(v) : fail();
    if (typeof v !== "object" || seen.has(v)) return fail();
    seen.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(v).some((key) => typeof key !== "string" || (!(Array.isArray(v) && key === "length") && (!descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key]!, "value"))))) return fail();
    let result: string;
    if (Array.isArray(v)) {
      if (Object.getPrototypeOf(v) !== Array.prototype || Object.keys(v).length !== v.length) return fail();
      result = `[${Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, i) ? encode(v[i], depth + 1) : fail()).join(",")}]`;
    } else {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return fail();
      result = `{${Object.keys(v).sort().map((key) => `${JSON.stringify(unicode(key))}:${encode(descriptors[key]!.value, depth + 1)}`).join(",")}}`;
    }
    seen.delete(v);
    return result;
  }
  return encode(value, 0);
}
export const canonicalBytes = (value: unknown): Uint8Array => new TextEncoder().encode(canonicalize(value));
function record(v: unknown, fields: string[], optional: string[] = []): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
  const o = v as Record<string, unknown>;
  if (fields.some((k) => !Object.hasOwn(o, k)) || Object.keys(o).some((k) => !fields.includes(k) && !optional.includes(k))) return fail();
  return o;
}
function list(v: unknown): unknown[] { return Array.isArray(v) ? v : fail(); }
function url(v: unknown): boolean {
  if (!str(v)) return false;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
}
export function validateReceipt(value: unknown): Receipt {
  canonicalize(value);
  const r = record(value, ["version", "tool", "inputs", "chainId", "block", "rpcCalls", "sources", "outputs", "codeSha", "labelsetVersion", "issuedAt", "signature"], ["timestamp"]);
  if (r.version !== "opsis-receipt/1" || !str(r.tool) || !Number.isSafeInteger(r.chainId) || Number(r.chainId) <= 0 || !str(r.codeSha) || !/^[0-9a-f]{40}$/.test(r.codeSha) || !str(r.labelsetVersion) || !date(r.issuedAt)) fail();
  const b = record(r.block, ["number", "hash", "timestamp"]);
  if (!str(b.number) || !/^(0|[1-9][0-9]*)$/.test(b.number) || !hash(b.hash) || !date(b.timestamp) || b.timestamp > (r.issuedAt as string)) fail();
  for (const call of list(r.rpcCalls)) {
    const c = record(call, ["method", "paramsSha256"]);
    if (!str(c.method) || !hash(c.paramsSha256)) fail();
  }
  const ids = new Set<string>();
  for (const source of list(r.sources)) {
    const s = record(source, ["id", "provider", "url", "fetchedAt", "responseSha256"]);
    if (!str(s.id) || ids.has(s.id) || !str(s.provider) || !url(s.url) || !date(s.fetchedAt) || s.fetchedAt > (r.issuedAt as string) || !hash(s.responseSha256)) fail();
    ids.add(s.id as string);
  }
  const s = record(r.signature, ["kind", "keyId", "value"]);
  if (s.kind !== "secp256k1" || !str(s.keyId) || !ADDRESS.test(s.keyId) || !str(s.value) || !/^0x[0-9a-f]{128}1[bc]$/.test(s.value)) fail();
  const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const sig = s.value as string;
  const sigR = BigInt(`0x${sig.slice(2, 66)}`), sigS = BigInt(`0x${sig.slice(66, 130)}`);
  if (sigR <= 0n || sigR >= order || sigS <= 0n || sigS > order / 2n) fail();
  if (r.timestamp !== undefined) {
    const t = record(r.timestamp, ["kind", "status", "root", "proof", "calendars"], ["otsProofBase64"]);
    const p = record(t.proof, ["index", "siblings"]);
    if (t.kind !== "opentimestamps" || !["pending", "attested"].includes(String(t.status)) || !hash(t.root) || !Number.isSafeInteger(p.index) || Number(p.index) < 0 || list(p.siblings).length > 52 || list(p.siblings).some((x) => x !== null && !hash(x)) || list(t.calendars).length === 0 || list(t.calendars).some((x) => !url(x)) || new Set(list(t.calendars)).size !== list(t.calendars).length) fail();
    if (t.otsProofBase64 !== undefined && (!str(t.otsProofBase64) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(t.otsProofBase64))) fail();
    if (t.status === "attested" && !str(t.otsProofBase64)) fail();
  }
  return value as Receipt;
}
export function validateKeys(value: unknown): ReceiptKey[] {
  canonicalize(value);
  for (const key of list(value)) {
    const k = record(key, ["address", "validFrom", "validTo"]);
    if (!str(k.address) || !ADDRESS.test(k.address) || !date(k.validFrom) || (k.validTo !== null && (!date(k.validTo) || k.validTo <= k.validFrom))) fail();
  }
  return value as ReceiptKey[];
}
export function receiptBody(receipt: Receipt): ReceiptBody {
  const { signature: _signature, timestamp: _timestamp, ...body } = receipt;
  return body;
}
export function receiptDigest(body: ReceiptBody, crypto: Pick<ReceiptCrypto, "keccak256">): Hex {
  const prefix = new TextEncoder().encode("OPSIS-RECEIPT-V1\n");
  return crypto.keccak256(concat(prefix, canonicalBytes(body)));
}
/** Sign a snapshot with the receipt domain; hosts supply a secp256k1 digest signer. */
export async function signReceipt(body: ReceiptBody, signer: ReceiptSigner, crypto: Pick<ReceiptCrypto, "keccak256">): Promise<Receipt> {
  const snapshot: ReceiptBody = JSON.parse(canonicalize(body));
  const value = await signer.signDigest(receiptDigest(snapshot, crypto));
  return validateReceipt({ ...snapshot, signature: { kind: "secp256k1", keyId: checksumAddress(signer.address, crypto), value } });
}
export function checksumAddress(address: string, crypto: Pick<ReceiptCrypto, "keccak256">): string {
  if (!ADDRESS.test(address)) return fail();
  const lower = address.slice(2).toLowerCase();
  const h = crypto.keccak256(new TextEncoder().encode(lower)).slice(2);
  return `0x${[...lower].map((c, i) => Number.parseInt(h[i]!, 16) >= 8 ? c.toUpperCase() : c).join("")}`;
}
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0; for (const a of arrays) { out.set(a, offset); offset += a.length; } return out;
}
export function fromHex(h: Hex): Uint8Array {
  if (!hash(h)) return fail();
  return Uint8Array.from(h.slice(2).match(/../g)!, (x) => parseInt(x, 16));
}
export async function sha256(bytes: Uint8Array): Promise<Hex> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return `0x${Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0")).join("")}`;
}
const leaf = (digest: Hex) => sha256(concat(new Uint8Array([0]), fromHex(digest)));
const node = (left: Hex, right: Hex) => sha256(concat(new Uint8Array([1]), fromHex(left), fromHex(right)));
/** A null sibling records a promotion at that level; no hash is duplicated. */
export async function buildReceiptBatch(digests: Hex[]): Promise<{ root: Hex; proofs: MerkleProof[] }> {
  if (!digests.length) return fail();
  const levels: Hex[][] = [await Promise.all(digests.map(leaf))];
  while (levels.at(-1)!.length > 1) {
    const prev = levels.at(-1)!, next: Hex[] = [];
    for (let i = 0; i < prev.length; i += 2) next.push(prev[i + 1] ? await node(prev[i]!, prev[i + 1]!) : prev[i]!);
    levels.push(next);
  }
  return { root: levels.at(-1)![0]!, proofs: digests.map((_, index) => {
    let at = index;
    const siblings = levels.slice(0, -1).map((level) => { const sibling = level[at % 2 ? at - 1 : at + 1] ?? null; at = Math.floor(at / 2); return sibling; });
    return { index, siblings };
  }) };
}
export async function verifyMerkle(digest: Hex, root: Hex, proof: MerkleProof): Promise<boolean> {
  if (!hash(root) || !Number.isSafeInteger(proof.index) || proof.index < 0 || proof.siblings.length > 52) return false;
  let current = await leaf(digest), at = proof.index;
  for (const sibling of proof.siblings) {
    if (sibling === null) { if (at % 2 !== 0) return false; }
    else { if (!hash(sibling)) return false; current = at % 2 ? await node(sibling, current) : await node(current, sibling); }
    at = Math.floor(at / 2);
  }
  return at === 0 && current === root;
}
export type ReceiptChecks = { schema: boolean; canonical: boolean; signature: boolean; keyValidity: boolean; merkle: boolean | null; timestamp: "absent" | "pending" | "attested (Bitcoin attestation not verified in this version)"; valid: boolean; receipt?: Receipt };
/** Files use exact JCS bytes. Whitespace, duplicate keys and alternate escapes fail canonical form. */
export async function verifyReceipt(text: string, keys: unknown, crypto: ReceiptCrypto): Promise<ReceiptChecks> {
  const result: ReceiptChecks = { schema: false, canonical: false, signature: false, keyValidity: false, merkle: null, timestamp: "absent", valid: false };
  let r: Receipt;
  try { r = validateReceipt(JSON.parse(text)); } catch { return result; }
  result.schema = true; result.receipt = r; result.canonical = canonicalize(r) === text;
  const digest = receiptDigest(receiptBody(r), crypto);
  try { result.signature = r.signature.keyId === checksumAddress(r.signature.keyId, crypto) && (await crypto.recoverAddress({ hash: digest, signature: r.signature.value })).toLowerCase() === r.signature.keyId.toLowerCase(); } catch { /* Invalid signatures remain false. */ }
  try {
    result.keyValidity = validateKeys(keys).some((k) => k.address === checksumAddress(k.address, crypto) && k.address === r.signature.keyId && k.validFrom <= r.issuedAt && (k.validTo === null || r.issuedAt < k.validTo));
  } catch { /* An untrusted or malformed key list cannot authorize a receipt. */ }
  if (r.timestamp) {
    result.merkle = await verifyMerkle(digest, r.timestamp.root, r.timestamp.proof);
    result.timestamp = r.timestamp.status === "pending" ? "pending" : "attested (Bitcoin attestation not verified in this version)";
  }
  result.valid = result.schema && result.canonical && result.signature && result.keyValidity && result.merkle !== false;
  return result;
}
