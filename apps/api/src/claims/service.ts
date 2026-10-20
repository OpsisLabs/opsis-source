import type {
  Claim,
  ClaimBlock,
  ClaimObservation,
  ClaimRequest,
  ClaimResponse,
  Json,
} from "@rh-chain/shared";
import type { ControlsEvidence } from "../controls/service.js";
import type { ReceiptService } from "../receipts/service.js";
import { AppError } from "../http/errors.js";
import { checkClaim, type Snapshot } from "./checkers.js";
export type Header = { number: number; hash: string; seconds: number };
export interface ClaimSession {
  evidence: ControlsEvidence;
  current(): Promise<Header>;
  block(number: number): Promise<Header>;
  snapshot(
    address: string,
    claims: Claim[],
    anchor: Header,
    historical: boolean,
  ): Promise<Snapshot>;
  recheck(anchor: Header): Promise<void>;
}
export interface ClaimSource {
  check(input: ClaimRequest): Promise<ClaimResponse>;
}
/** Upper-bound search includes duplicate timestamps. At most 54 headers for safe-integer heights. */
export async function postTimeBlock(
  seconds: number,
  current: Header,
  read: (number: number) => Promise<Header>,
): Promise<Header | null> {
  if (seconds > current.seconds) return null;
  let lo = 0,
    hi = current.number;
  let candidate: Header | null = null;
  for (let steps = 0; lo <= hi && steps < 54; steps++) {
    const mid = lo + Math.floor((hi - lo) / 2),
      h = mid === current.number ? current : await read(mid);
    if (h.number !== mid || !Number.isSafeInteger(h.seconds) || h.seconds < 0)
      throw new AppError(
        "CLAIM_BLOCK_UNAVAILABLE",
        503,
        "Block timestamp unavailable",
      );
    if (h.seconds <= seconds) {
      candidate = h;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (lo <= hi)
    throw new AppError("CLAIM_SEARCH_LIMIT", 503, "Block search cap reached");
  return candidate;
}
export class ClaimCheckService implements ClaimSource {
  constructor(
    private readonly session: () => ClaimSession,
    private readonly receipts?: ReceiptService,
    private readonly receiptsEnabled = false,
    private readonly now: () => number = Date.now,
  ) {}
  async check(input: ClaimRequest): Promise<ClaimResponse> {
    // Also protect internal callers; never rely on a browser assertion alone.
    if (
      input.confirmed !== true ||
      !/^0x[\da-f]{40}$/i.test(input.address) ||
      /^0x0{40}$/i.test(input.address)
    )
      throw new AppError(
        "CLAIM_CONFIRMATION_REQUIRED",
        400,
        "Confirm a nonzero contract address",
      );
    const start = this.now();
    const session = this.session(),
      current = await session.current();
    const observe = async (
      h: Header,
      historical: boolean,
    ): Promise<ClaimObservation> => {
      const snapshot = await session.snapshot(
        input.address,
        input.claims,
        h,
        historical,
      );
      const block: ClaimBlock = {
        number: h.number,
        hash: h.hash,
        timestamp: new Date(h.seconds * 1000).toISOString(),
        label: historical ? "post time" : "current, not final",
      };
      await session.recheck(h);
      return {
        block,
        results: input.claims.map((c) => checkClaim(c, h.number, snapshot)),
      };
    };
    const result: ClaimResponse = {
      chainId: 4663,
      address: input.address.toLowerCase(),
      current: await observe(current, false),
    };
    if (input.postTime) {
      const seconds = Date.parse(input.postTime) / 1000;
      if (!Number.isFinite(seconds))
        throw new AppError("INVALID_POST_TIME", 400, "Enter an ISO post time");
      const h = await postTimeBlock(seconds, current, (n) => session.block(n));
      const reason =
        seconds > current.seconds
          ? "Post time is after the captured current block"
          : "Post time precedes the first available block";
      result.post = h
        ? await observe(h, true)
        : {
            block: null,
            reason,
            results: input.claims.map((c) => checkClaim(c, null, {}, reason)),
          };
    }
    await session.recheck(current);
    if (this.now() < start || this.now() - start >= 30_000)
      throw new AppError(
        "CLAIM_CHECK_TIMEOUT",
        503,
        "Claim check exceeded its time bound",
      );
    if (this.receiptsEnabled) {
      if (!this.receipts || !session.evidence.sources.length)
        throw new AppError(
          "RECEIPTS_UNAVAILABLE",
          503,
          "Receipt evidence unavailable",
        );
      try {
        result.receipt = await this.receipts.issue({
          tool: "claimCheck",
          inputs: {
            address: result.address,
            claims: input.claims,
            ...(input.postTime ? { postTime: input.postTime } : {}),
          } as Json,
          chainId: 4663,
          block: {
            number: String(current.number),
            hash: current.hash as `0x${string}`,
            timestamp: new Date(current.seconds * 1000).toISOString(),
          },
          rpcCalls: session.evidence.rpcCalls,
          sources: session.evidence.sources.map((s, i) => ({
            ...s,
            id: `claim-source-${i}`,
          })),
          outputs: result as unknown as Json,
          labelsetVersion: "claim-definitions/1",
        });
      } catch {
        throw new AppError("RECEIPTS_UNAVAILABLE", 503, "Receipt unavailable");
      }
    }
    return result;
  }
}
