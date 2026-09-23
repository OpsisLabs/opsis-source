import { describe, expect, it, vi } from "vitest";
import {
  PublicSwapCanonicalVerifier,
  type CanonicalCoverage,
  type CanonicalCoverageRequest,
  type ObservationBlockAnchor,
  type PublicHeaderSource,
} from "../src/history/public-swap-canonical-verifier.js";

const POOL = `0x${"11".repeat(20)}`;
const HASH = `0x${"aa".repeat(32)}`;
const REQUEST: CanonicalCoverageRequest = { chainId: 4663, poolAddress: POOL, fromBlock: 80n, toBlock: 88n, source: "capture-a" };
const coverage = (): CanonicalCoverage => ({ id: "cov-1", revision: 1, ...REQUEST, blockHash: HASH, status: "EMPTY", canonicalStatus: "UNKNOWN" });
const source = (id: string): PublicHeaderSource => ({ id,
  getHead: async () => ({ chainId: 4663, number: 100n, hash: HASH }),
  getHeader: async (number) => ({ chainId: 4663, number, hash: HASH }),
});

function setup(overrides: { enabled?: boolean; row?: CanonicalCoverage | null; observations?: ObservationBlockAnchor[]; sources?: PublicHeaderSource[]; onRead?: (count: number) => void; promote?: boolean } = {}) {
  let row = overrides.row === undefined ? coverage() : overrides.row;
  let reads = 0;
  const readLatest = vi.fn(async (_request: CanonicalCoverageRequest) => {
    reads++;
    overrides.onRead?.(reads);
    return row;
  });
  const readObservationBlockAnchors = vi.fn(async (_request: CanonicalCoverageRequest) => overrides.observations ?? []);
  const promoteVerifiedCanonicalRange = vi.fn(async () => overrides.promote ?? true);
  const verifier = new PublicSwapCanonicalVerifier({ readLatest, readObservationBlockAnchors }, { promoteVerifiedCanonicalRange }, overrides.sources ?? [source("rpc-one"), source("rpc-two")],
    { enabled: overrides.enabled ?? true, finalizedHeadDepth: 12n });
  return { verifier, readLatest, readObservationBlockAnchors, promoteVerifiedCanonicalRange, setRow: (value: CanonicalCoverage | null) => { row = value; } };
}

describe("public Swap canonical verifier", () => {
  it("promotes only after two independent sources confirm a sufficiently finalized anchor", async () => {
    const f = setup();
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ promoted: true, coverageId: "cov-1", revision: 1 });
    expect(f.promoteVerifiedCanonicalRange).toHaveBeenCalledOnce();
    expect(f.promoteVerifiedCanonicalRange).toHaveBeenCalledWith({ chainId: 4663, poolAddress: POOL, fromBlock: 80n, toBlock: 88n, source: "capture-a", coverageId: "cov-1", revision: 1, blockHash: HASH, verifiedBlocks: [{ blockNumber: 88n, blockHash: HASH }] });
    expect(f.readLatest).toHaveBeenCalledTimes(2);
  });

  it("is disabled by default and fails closed", async () => {
    const f = setup({ enabled: false });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "disabled" });
    expect(f.readLatest).not.toHaveBeenCalled();
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong chain", { ...REQUEST, chainId: 1 }],
    ["overlong range", { ...REQUEST, toBlock: 180n }],
  ])("rejects invalid requests (%s)", async (_name, request) => {
    const f = setup();
    await expect(f.verifier.verifyAndPromote(request as CanonicalCoverageRequest)).resolves.toMatchObject({ reason: "invalid_request" });
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });

  it.each(["GAP", "PARTIAL", "UNAVAILABLE"])("does not promote %s coverage", async (status) => {
    const f = setup({ row: { ...coverage(), status } });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "coverage_unavailable" });
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });

  it("rejects same source identities", async () => {
    const f = setup({ sources: [source("same"), source("same")] });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "sources_invalid" });
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });

  it("rejects wrong-chain, wrong-height, malformed, or mismatching headers", async () => {
    const cases: PublicHeaderSource[][] = [
      [source("one"), { ...source("two"), getHeader: async (number) => ({ chainId: 1, number, hash: HASH }) }],
      [source("one"), { ...source("two"), getHeader: async (number) => ({ chainId: 4663, number: number + 1n, hash: HASH }) }],
      [source("one"), { ...source("two"), getHeader: async (number) => ({ chainId: 4663, number, hash: "bad" }) }],
      [source("one"), { ...source("two"), getHeader: async (number) => ({ chainId: 4663, number, hash: `0x${"bb".repeat(32)}` }) }],
    ];
    for (const sources of cases) {
      const f = setup({ sources });
      await f.verifier.verifyAndPromote(REQUEST);
      expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
    }
  });

  it("rejects heads that have not reached the configured finality depth", async () => {
    const f = setup({ sources: [
      { ...source("one"), getHead: async () => ({ chainId: 4663, number: 99n, hash: HASH }) }, source("two"),
    ] });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "not_finalized" });
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });

  it("does not promote when latest coverage changes between verification reads", async () => {
    const f = setup({ onRead: (count) => { if (count === 2) f.setRow({ ...coverage(), revision: 2, blockHash: `0x${"bb".repeat(32)}` }); } });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "coverage_changed" });
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });


  it("verifies every canonical observation height in a COMPLETE range, including earlier blocks", async () => {
    const eventHash = `0x${"bb".repeat(32)}`;
    const observations: ObservationBlockAnchor[] = [
      { chainId: 4663, poolAddress: POOL, source: "capture-a", blockNumber: 82n, blockHash: eventHash },
      // A retained fork at the same height is allowed; sources select the canonical member.
      { chainId: 4663, poolAddress: POOL, source: "capture-a", blockNumber: 82n, blockHash: `0x${"cc".repeat(32)}` },
    ];
    const sources = ["one", "two"].map((id): PublicHeaderSource => ({ ...source(id),
      getHeader: async (number) => ({ chainId: 4663, number, hash: number === 82n ? eventHash : HASH }),
    }));
    const f = setup({ row: { ...coverage(), status: "COMPLETE" }, observations, sources });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ promoted: true });
    expect(f.promoteVerifiedCanonicalRange).toHaveBeenCalledWith(expect.objectContaining({
      verifiedBlocks: [{ blockNumber: 82n, blockHash: eventHash }, { blockNumber: 88n, blockHash: HASH }],
    }));

  });

  it("rejects malformed anchors and more than 100 source rows", async () => {
    const malformed = setup({ observations: [{ chainId: 1, poolAddress: POOL, source: "capture-a", blockNumber: 82n, blockHash: HASH }] });
    await expect(malformed.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "observations_invalid" });
    const excessive = setup({ observations: Array.from({ length: 101 }, () => ({ chainId: 4663, poolAddress: POOL, source: "capture-a", blockNumber: 82n, blockHash: HASH })) });
    await expect(excessive.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "observations_invalid" });
    expect(malformed.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
    expect(excessive.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });

  it("rejects mixed source hashes for an observation height", async () => {
    const observations = [{ chainId: 4663, poolAddress: POOL, source: "capture-a", blockNumber: 82n, blockHash: `0x${"bb".repeat(32)}` }];
    const sources = [source("one"), { ...source("two"), getHeader: async (number: bigint) => ({ chainId: 4663, number, hash: number === 82n ? `0x${"cc".repeat(32)}` : HASH }) }];
    const f = setup({ row: { ...coverage(), status: "COMPLETE" }, observations, sources });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "hash_mismatch" });
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });

  it("limits header concurrency to two and stops at the first mismatching height", async () => {
    const hashes = [81n, 82n, 83n].map((_, index) => `0x${String(index + 1).repeat(64)}`);
    const observations: ObservationBlockAnchor[] = [81n, 82n, 83n].map((blockNumber, index) => ({
      chainId: 4663, poolAddress: POOL, source: "capture-a", blockNumber, blockHash: hashes[index]!,
    }));
    let inFlight = 0;
    let maxInFlight = 0;
    const requested: bigint[] = [];
    const sources = ["one", "two"].map((id): PublicHeaderSource => ({
      ...source(id),
      getHeader: async (number) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        requested.push(number);
        await new Promise((resolve) => setTimeout(resolve, 0));
        inFlight--;
        const hash = number === 82n ? `0x${"f".repeat(64)}` : number === 88n ? HASH : hashes[Number(number - 81n)]!;
        return { chainId: 4663, number, hash };
      },
    }));
    const f = setup({ row: { ...coverage(), status: "COMPLETE" }, observations, sources });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "hash_mismatch" });
    expect(maxInFlight).toBe(2);
    expect(requested).toEqual([81n, 81n, 82n, 82n]);
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });

  it("returns coverage_changed when conditional repository promotion refuses", async () => {
    const f = setup({ promote: false });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "coverage_changed" });
  });

  it("does not promote after a header source fails", async () => {
    const f = setup({ sources: [source("one"), { ...source("two"), getHead: async () => { throw new Error("offline"); } }] });
    await expect(f.verifier.verifyAndPromote(REQUEST)).resolves.toMatchObject({ reason: "source_failure" });
    expect(f.promoteVerifiedCanonicalRange).not.toHaveBeenCalled();
  });
});
