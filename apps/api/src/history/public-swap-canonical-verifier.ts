const CHAIN_ID = 4663;
const MAX_RANGE_BLOCKS = 100n;
const MAX_RANGE_EVENTS = 100;
const MAX_FINALIZED_HEAD_DEPTH = 64n;
const HASH = /^0x[0-9a-f]{64}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type CanonicalCoverage = {
  id: string;
  revision: number;
  chainId: number;
  poolAddress: string;
  fromBlock: bigint;
  toBlock: bigint;
  blockHash: string | null;
  source: string;
  status: string;
  canonicalStatus: string;
};

export type CanonicalCoverageRequest = Pick<CanonicalCoverage,
  "chainId" | "poolAddress" | "fromBlock" | "toBlock" | "source">;

export type ObservationBlockAnchor = {
  chainId: number;
  poolAddress: string;
  source: string;
  blockNumber: bigint;
  blockHash: string;
};

export interface CanonicalCoverageReader {
  readLatest(request: CanonicalCoverageRequest): Promise<CanonicalCoverage | null>;
  readObservationBlockAnchors(request: CanonicalCoverageRequest): Promise<readonly ObservationBlockAnchor[]>;
}

export type PublicBlockHeader = { chainId: number; number: bigint; hash: string };

/** Each adapter must have a stable, independently configured source identity. */
export interface PublicHeaderSource {
  readonly id: string;
  getHead(): Promise<PublicBlockHeader>;
  getHeader(blockNumber: bigint): Promise<PublicBlockHeader>;
}

export type VerifiedBlockAnchor = { blockNumber: bigint; blockHash: string };
export type VerifiedCanonicalRangeInput = {
  chainId: number;
  poolAddress: string;
  fromBlock: bigint;
  toBlock: bigint;
  source: string;
  coverageId: string;
  revision: number;
  blockHash: string;
  verifiedBlocks: readonly VerifiedBlockAnchor[];
};

export interface CanonicalRangePromoter {
  promoteVerifiedCanonicalRange(input: VerifiedCanonicalRangeInput): Promise<boolean>;
}

export type CanonicalVerificationResult =
  | { promoted: true; coverageId: string; revision: number; blockNumber: bigint; blockHash: string }
  | { promoted: false; reason: "disabled" | "invalid_request" | "coverage_unavailable" | "coverage_changed" | "observations_invalid" | "sources_invalid" | "source_failure" | "not_finalized" | "hash_mismatch" };

/** Independent, read-only verification before canonical history promotion. */
export class PublicSwapCanonicalVerifier {
  constructor(
    private readonly coverageReader: CanonicalCoverageReader,
    private readonly repository: CanonicalRangePromoter,
    private readonly sources: readonly PublicHeaderSource[],
    private readonly options: { enabled?: boolean; finalizedHeadDepth?: bigint } = {},
  ) {}

  async verifyAndPromote(request: CanonicalCoverageRequest): Promise<CanonicalVerificationResult> {
    if (this.options.enabled !== true) return { promoted: false, reason: "disabled" };
    const depth = this.options.finalizedHeadDepth ?? 12n;
    if (request.chainId !== CHAIN_ID || !/^0x[0-9a-f]{40}$/i.test(request.poolAddress)
      || request.fromBlock < 0n || request.toBlock < request.fromBlock
      || request.toBlock - request.fromBlock + 1n > MAX_RANGE_BLOCKS
      || !SOURCE_ID.test(request.source) || depth < 1n || depth > MAX_FINALIZED_HEAD_DEPTH) {
      return { promoted: false, reason: "invalid_request" };
    }
    if (this.sources.length !== 2 || this.sources.some((source) => !SOURCE_ID.test(source.id))
      || new Set(this.sources.map((source) => source.id)).size !== 2) {
      return { promoted: false, reason: "sources_invalid" };
    }

    let coverage: CanonicalCoverage | null;
    try { coverage = await this.coverageReader.readLatest(request); }
    catch { return { promoted: false, reason: "coverage_unavailable" }; }
    if (!isEligibleCoverage(coverage, request)) return { promoted: false, reason: "coverage_unavailable" };

    let candidates: Map<bigint, Set<string>>;
    try {
      const rows = await this.coverageReader.readObservationBlockAnchors(request);
      const validated = normalizeObservationAnchors(rows, request);
      if (!validated || (coverage.status === "EMPTY" && rows.length !== 0)
        || (coverage.status === "COMPLETE" && rows.length === 0)) {
        return { promoted: false, reason: "observations_invalid" };
      }
      candidates = validated;
      const endHashes = candidates.get(request.toBlock) ?? new Set<string>();
      endHashes.add(coverage.blockHash.toLowerCase());
      candidates.set(request.toBlock, endHashes);
    } catch { return { promoted: false, reason: "observations_invalid" }; }
    const blockNumbers = [...candidates.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);

    let heads: PublicBlockHeader[];
    try { heads = await Promise.all(this.sources.map((source) => source.getHead())); }
    catch { return { promoted: false, reason: "source_failure" }; }
    for (const head of heads) {
      if (!validHeader(head) || head.chainId !== CHAIN_ID || head.number < request.toBlock
        || head.number - request.toBlock < depth) return { promoted: false, reason: "not_finalized" };
    }

    const canonicalAnchors: VerifiedBlockAnchor[] = [];
    for (const expectedNumber of blockNumbers) {
      let headers: PublicBlockHeader[];
      try { headers = await Promise.all(this.sources.map((source) => source.getHeader(expectedNumber))); }
      catch { return { promoted: false, reason: "source_failure" }; }
      const first = headers[0]!;
      const second = headers[1]!;
      if (![first, second].every((header) => validHeader(header) && header.chainId === CHAIN_ID && header.number === expectedNumber)) {
        return { promoted: false, reason: "not_finalized" };
      }
      if (first.hash.toLowerCase() !== second.hash.toLowerCase()) return { promoted: false, reason: "hash_mismatch" };
      if (!candidates.get(expectedNumber)!.has(first.hash.toLowerCase())) return { promoted: false, reason: "hash_mismatch" };
      canonicalAnchors.push({ blockNumber: expectedNumber, blockHash: first.hash.toLowerCase() });
    }

    // Re-read immediately before promotion so a revised latest coverage cannot be promoted.
    let latest: CanonicalCoverage | null;
    try { latest = await this.coverageReader.readLatest(request); }
    catch { return { promoted: false, reason: "coverage_changed" }; }
    if (!sameCoverageRevision(coverage, latest) || !isEligibleCoverage(latest, request)) {
      return { promoted: false, reason: "coverage_changed" };
    }
    try {
      const result = await this.repository.promoteVerifiedCanonicalRange({
        chainId: CHAIN_ID,
        poolAddress: request.poolAddress.toLowerCase(),
        fromBlock: request.fromBlock,
        toBlock: request.toBlock,
        source: request.source,
        coverageId: coverage.id,
        revision: coverage.revision,
        blockHash: coverage.blockHash.toLowerCase(),
        verifiedBlocks: canonicalAnchors,
      });
      if (!result) return { promoted: false, reason: "coverage_changed" };
    } catch { return { promoted: false, reason: "coverage_changed" }; }
    return { promoted: true, coverageId: coverage.id, revision: coverage.revision,
      blockNumber: request.toBlock, blockHash: coverage.blockHash.toLowerCase() };
  }
}

function validHeader(header: unknown): header is PublicBlockHeader {
  if (header === null || typeof header !== "object") return false;
  const value = header as PublicBlockHeader;
  return Number.isSafeInteger(value.chainId) && value.chainId > 0 && typeof value.number === "bigint"
    && value.number >= 0n && typeof value.hash === "string" && HASH.test(value.hash);
}

function normalizeObservationAnchors(
  rows: readonly ObservationBlockAnchor[],
  request: CanonicalCoverageRequest,
): Map<bigint, Set<string>> | null {
  if (!Array.isArray(rows) || rows.length > MAX_RANGE_EVENTS) return null;
  const byBlock = new Map<bigint, Set<string>>();
  for (const row of rows) {
    if (row.chainId !== CHAIN_ID || typeof row.poolAddress !== "string"
      || row.poolAddress.toLowerCase() !== request.poolAddress.toLowerCase() || row.source !== request.source
      || typeof row.blockNumber !== "bigint" || row.blockNumber < request.fromBlock || row.blockNumber > request.toBlock
      || typeof row.blockHash !== "string" || !HASH.test(row.blockHash)) return null;
    const hash = row.blockHash.toLowerCase();
    const hashes = byBlock.get(row.blockNumber) ?? new Set<string>();
    hashes.add(hash);
    byBlock.set(row.blockNumber, hashes);
  }
  if (byBlock.size > MAX_RANGE_EVENTS) return null;
  return byBlock;
}

function isEligibleCoverage(
  coverage: CanonicalCoverage | null,
  request: CanonicalCoverageRequest,
): coverage is CanonicalCoverage & { blockHash: string } {
  return coverage !== null && typeof coverage.poolAddress === "string" && coverage.chainId === CHAIN_ID
    && coverage.poolAddress.toLowerCase() === request.poolAddress.toLowerCase()
    && coverage.fromBlock === request.fromBlock && coverage.toBlock === request.toBlock && coverage.source === request.source
    && (coverage.status === "COMPLETE" || coverage.status === "EMPTY") && coverage.canonicalStatus === "UNKNOWN"
    && typeof coverage.blockHash === "string" && HASH.test(coverage.blockHash)
    && typeof coverage.id === "string" && Number.isSafeInteger(coverage.revision) && coverage.revision > 0;
}

function sameCoverageRevision(a: CanonicalCoverage, b: CanonicalCoverage | null): boolean {
  return b !== null && a.id === b.id && a.revision === b.revision && a.chainId === b.chainId
    && a.poolAddress.toLowerCase() === b.poolAddress.toLowerCase() && a.fromBlock === b.fromBlock
    && a.toBlock === b.toBlock && a.blockHash?.toLowerCase() === b.blockHash?.toLowerCase()
    && a.source === b.source && a.status === b.status && a.canonicalStatus === b.canonicalStatus;
}
