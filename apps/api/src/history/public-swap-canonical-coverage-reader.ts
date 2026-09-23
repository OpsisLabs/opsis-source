import type { PrismaClient } from "@prisma/client";
import type {
  CanonicalCoverageReader,
  CanonicalCoverageRequest,
  CanonicalCoverage,
  ObservationBlockAnchor,
} from "./public-swap-canonical-verifier.js";

type CanonicalDb = Pick<PrismaClient, "publicSwapHistoryCoverage" | "publicSwapObservation">;

/** Bounded local evidence for a verifier; this adapter makes no chain calls. */
export class PrismaCanonicalCoverageReader implements CanonicalCoverageReader {
  constructor(private readonly prisma: CanonicalDb) {}

  async readLatest(request: CanonicalCoverageRequest): Promise<CanonicalCoverage | null> {
    return this.prisma.publicSwapHistoryCoverage.findFirst({
      where: request,
      orderBy: { revision: "desc" },
      select: {
        id: true, revision: true, chainId: true, poolAddress: true,
        fromBlock: true, toBlock: true, blockHash: true, source: true,
        status: true, canonicalStatus: true,
      },
    });
  }

  async readObservationBlockAnchors(request: CanonicalCoverageRequest): Promise<readonly ObservationBlockAnchor[]> {
    // The extra row proves over-cap data exists without fetching an unbounded range.
    return this.prisma.publicSwapObservation.findMany({
      where: {
        chainId: request.chainId,
        poolAddress: request.poolAddress.toLowerCase(),
        source: request.source,
        blockNumber: { gte: request.fromBlock, lte: request.toBlock },
      },
      select: { chainId: true, poolAddress: true, source: true, blockNumber: true, blockHash: true },
      take: 101,
    });
  }
}
