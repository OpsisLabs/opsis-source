import {
  REVIEWED_ROBINHOOD_ASSET_SAMPLE,
  STOCK_DESK_LINE,
  type DeskEvidence,
  type DeskFact,
  type DeskQuote,
  type ReceiptBody,
  type StockDeskIndex,
  type StockDeskResult,
} from "@rh-chain/shared";
import { isAddress } from "viem";
import type { RwaService, RwaVerification } from "../rwa/service.js";
import type { ExitCheckSource } from "../exit-check/service.js";
import type { CardSources } from "../cards/service.js";
import type { ReceiptService } from "../receipts/service.js";
import { AppError } from "../http/errors.js";
import { exact, gap, notionalAmount, product, ratio } from "./math.js";
import { UnavailableGapHistory, type GapHistorySource } from "./history.js";

export const STOCK_DESK_ASSETS = REVIEWED_ROBINHOOD_ASSET_SAMPLE.filter(
  (a) => a.symbol !== "USDG" && a.symbol !== "WETH",
);
const USDG = REVIEWED_ROBINHOOD_ASSET_SAMPLE.find(
  (a) => a.symbol === "USDG",
)!.address;
export type DeskEngines = {
  rwa: Pick<RwaService, "verify">;
  exit: ExitCheckSource;
  market: Pick<CardSources, "market">;
};
export interface StockDeskSource {
  desk(address: string): Promise<StockDeskResult>;
  index(): Promise<StockDeskIndex>;
}
const unknown = (reason: string): DeskFact<never> => ({
  state: "unknown",
  reason,
});
const available = <T>(value: T, evidence: DeskEvidence[]): DeskFact<T> => ({
  state: "available",
  value,
  evidence,
});
function reason(error: unknown): string {
  return error instanceof AppError ? error.code : "SOURCE_UNAVAILABLE";
}
function propagateBudget(error: unknown): void {
  if (
    error instanceof AppError &&
    /DAILY_BUDGET|BUDGET_UNAVAILABLE|FUSE|RESERVATION_EXCEEDED/.test(error.code)
  )
    throw error;
}

/** Calendar expectation only; no inference of exchange holidays or a live halt. */
export function offHours(now: Date): {
  expectedOffHours: boolean;
  offHoursBasis: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const read = (type: string) => parts.find((p) => p.type === type)!.value;
  const day = read("weekday"),
    minute = Number(read("hour")) * 60 + Number(read("minute"));
  const weekend =
    day === "Sat" ||
    (day === "Sun" && minute < 1200) ||
    (day === "Fri" && minute >= 1200);
  const referenceHolding =
    weekend || day === "Sun" || minute < 570 || minute >= 960;
  return {
    expectedOffHours: weekend || referenceHolding,
    offHoursBasis: weekend
      ? "24/5 weekend closure expectation (New York); holidays unknown"
      : referenceHolding
        ? "reference holding off-hours expectation outside 09:30–16:00 New York; holidays unknown"
        : "regular reference hours expectation; holidays and live market status unknown",
  };
}
export class StockDeskService implements StockDeskSource {
  private cached?: StockDeskIndex;
  private pending?: Promise<StockDeskIndex>;
  constructor(
    private readonly engines: DeskEngines,
    private readonly reserveScan: () => Promise<DeskEngines>,
    private readonly ttlSeconds = 300,
    private readonly receipts?: ReceiptService,
    private readonly history: GapHistorySource = new UnavailableGapHistory(),
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 1800)
      throw new Error("Invalid stock desk cache duration");
  }
  desk(address: string): Promise<StockDeskResult> {
    return this.compute(address, this.engines);
  }
  async index(): Promise<StockDeskIndex> {
    if (this.cached && Date.parse(this.cached.expiresAt) > this.now())
      return this.cached;
    if (this.pending) return this.pending;
    this.pending = this.scan();
    try {
      this.cached = await this.pending;
      return this.cached;
    } finally {
      this.pending = undefined;
    }
  }
  private async scan(): Promise<StockDeskIndex> {
    const engines = await this.reserveScan();
    // Three tokens at a time keeps a cold scan inside proxy timeouts; order is preserved.
    // A token that still fails after one retry is listed as unavailable; budget errors stop the scan.
    const slots: Array<StockDeskIndex["entries"][number] | undefined> = new Array(STOCK_DESK_ASSETS.length);
    const unavailable: Array<{ address: string; reason: string }> = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, STOCK_DESK_ASSETS.length) }, async () => {
      while (next < STOCK_DESK_ASSETS.length) {
        const at = next++;
        const address = STOCK_DESK_ASSETS[at]!.address;
        for (let attempt = 0; ; attempt++) {
          try {
            const desk = await this.compute(address, engines);
            slots[at] = { href: `/rwa?desk=${desk.address}`, desk };
            break;
          } catch (error) {
            propagateBudget(error);
            const retryable = (error as { retryable?: unknown }).retryable === true || (error instanceof AppError && error.statusCode >= 500);
            if (attempt === 0 && retryable) { await new Promise((resolve) => setTimeout(resolve, 750)); continue; }
            unavailable.push({ address: address.toLowerCase(), reason: reason(error) });
            break;
          }
        }
      }
    }));
    const entries = slots.filter((entry): entry is StockDeskIndex["entries"][number] => entry !== undefined);
    const absolute = (value: string) => {
      const raw = BigInt(value.replace(".", "").replace(/^\+/, ""));
      return raw < 0n ? -raw : raw;
    };
    const gaps = entries
      .filter((e) => e.desk.gapBps.state === "available")
      .sort((a, b) => {
        const av = a.desk.gapBps,
          bv = b.desk.gapBps;
        if (av.state !== "available" || bv.state !== "available") return 0;
        // Gap strings may omit trailing fractional zeroes.
        const scaled = (v: string) => {
          const [w, f = ""] = v.split(".");
          return absolute(`${w}.${f.padEnd(6, "0")}`);
        };
        const x = scaled(av.value),
          y = scaled(bv.value);
        return x === y
          ? a.desk.address.localeCompare(b.desk.address)
          : x > y
            ? -1
            : 1;
      })
      .map((e) => e.desk.address);
    const observedAt = new Date(this.now()).toISOString();
    return {
      schemaVersion: 1,
      observedAt,
      expiresAt: new Date(this.now() + this.ttlSeconds * 1000).toISOString(),
      coverage: {
        addresses: STOCK_DESK_ASSETS.map((a) => a.address.toLowerCase()),
        complete: unavailable.length === 0,
        basis:
          "Ten Stock Tokens in the reviewed 2026-09-02 sample; unknown facts remain explicit",
      },
      entries,
      ...(unavailable.length ? { unavailable } : {}),
      gaps,
      multiplierEvents: entries
        .filter(
          (e) =>
            e.desk.multiplier.state === "available" &&
            e.desk.multiplier.value.scheduled !== null &&
            (e.desk.multiplier.value.effectiveAt === null ||
              Date.parse(e.desk.multiplier.value.effectiveAt) > this.now()),
        )
        .map((e) => e.desk.address),
      staleFeeds: entries
        .filter(
          (e) => e.desk.feed.state === "available" && e.desk.feed.value.stale,
        )
        .map((e) => e.desk.address),
      label: "data, not advice",
    };
  }
  private async compute(
    input: string,
    engines: DeskEngines,
  ): Promise<StockDeskResult> {
    if (!isAddress(input, { strict: false }))
      throw new AppError(
        "INVALID_STOCK_TOKEN",
        400,
        "Provide a complete token contract",
      );
    const address = input.toLowerCase();
    const rpcCalls: ReceiptBody["rpcCalls"] = [];
    const rwa = await engines.rwa.verify(address, {
      desk: true,
      rpcCalls: this.receipts ? rpcCalls : undefined,
    });
    const stock = rwa.stock;
    const anchorEvidence: DeskEvidence[] = [
      {
        block: rwa.anchor.blockNumber,
        blockHash: rwa.anchor.blockHash,
        time: rwa.anchor.timestamp ?? rwa.anchor.capturedAt,
        source: "robinhood-rpc",
      },
    ];
    const result: StockDeskResult = {
      schemaVersion: 1,
      address,
      symbol: stock?.symbol ?? null,
      observedAt: new Date(this.now()).toISOString(),
      canonical: !stock
        ? "not_on_official_list"
        : rwa.checks.find((c) => c.id === "canonical")?.status === "confirmed"
          ? "official_list_match"
          : "identity_conflict",
      reference: unknown("CHAINLINK_REFERENCE_UNAVAILABLE"),
      feed: unknown("CHAINLINK_FEED_UNAVAILABLE"),
      multiplier: unknown("OFFICIAL_TOKEN_UNAVAILABLE"),
      corporateActions: unknown("CORPORATE_ACTIONS_UNAVAILABLE"),
      pool: unknown("QUOTE_UNAVAILABLE"),
      gapBps: unknown("COMPARABLE_PRICES_UNAVAILABLE"),
      depth: ["1000", "10000", "100000"].map((notionalUsd) => ({
        notionalUsd,
        quote: unknown("QUOTE_UNAVAILABLE"),
      })),
      concentration: unknown("HOLDER_SAMPLE_UNAVAILABLE"),
      history: await this.history.history(address),
      limitations: [
        "USDG output units are not dollars. Gap uses a separately sourced USDG/USD observation.",
        "Reference and quotes have independent current, non-final anchors; no common-block comparison is claimed.",
        "Explorer observations have no block anchor; fetch time does not establish upstream price calculation time.",
        "Depth uses reference-priced equivalent inputs, includes pool fees and impact, and does not establish execution or eligibility. Network costs are additional.",
        "Holder concentration covers a returned largest-holder sample, with explorer-labelled pools and burns separated; addresses do not establish ownership.",
        "Hosted Robinhood prices are neither requested nor retained by the desk or index. Receipt upstream payload hashes cover no external documents; RPC parameter commitments cover RWA reads only.",
      ],
      disclaimer: STOCK_DESK_LINE,
    };
    if (stock) {
      result.multiplier = available(
        {
          current: stock.currentMultiplier,
          scheduled: stock.pendingMultiplier,
          effectiveAt: stock.pendingEffectiveAt,
        },
        anchorEvidence,
      );
      if (rwa.checks.find((c) => c.id === "actions")?.status === "confirmed")
        result.corporateActions = available(
          stock.corporateActions,
          this.documentEvidence(rwa, "robinhood-actions"),
        );
      const oracle = stock.oracle;
      if (
        oracle?.updatedAt &&
        oracle.value !== null &&
        Date.parse(oracle.updatedAt) <= this.now()
      ) {
        const ageSeconds = Math.floor(
          (this.now() - Date.parse(oracle.updatedAt)) / 1000,
        );
        result.feed = available(
          {
            updatedAt: oracle.updatedAt,
            ageSeconds,
            heartbeatSeconds: oracle.heartbeatSeconds,
            stale: ageSeconds > oracle.heartbeatSeconds,
            paused: stock.oraclePaused,
            ...offHours(new Date(this.now())),
          },
          [
            ...anchorEvidence,
            {
              block: null,
              blockHash: null,
              time: oracle.updatedAt,
              source: `chainlink:${oracle.feed}`,
            },
          ],
        );
        if (typeof oracle.multiplierEmbedded === "boolean") {
          const priceUsd = oracle.multiplierEmbedded
            ? oracle.value
            : product(oracle.value, stock.currentMultiplier);
          if (priceUsd && (exact(priceUsd) ?? 0n) > 0n)
            result.reference = available(
              { priceUsd, multiplierEmbedded: oracle.multiplierEmbedded },
              [
                ...anchorEvidence,
                ...this.documentEvidence(rwa, "chainlink-rdd"),
                {
                  block: rwa.anchor.blockNumber,
                  blockHash: rwa.anchor.blockHash,
                  time: oracle.updatedAt,
                  source: `chainlink:${oracle.feed}`,
                },
              ],
            );
        } else result.reference = unknown("FEED_MULTIPLIER_BASIS_UNKNOWN");
      }
      // Refuse financial comparisons when canonical identity or feed freshness is unknown.
      if (
        result.canonical === "official_list_match" &&
        result.reference.state === "available" &&
        result.feed.state === "available" &&
        !result.feed.value.stale &&
        !result.feed.value.paused
      ) {
        const price = result.reference.value.priceUsd;
        const referenceEvidence = result.reference.evidence;
        const quoteAt = async (usd: string): Promise<DeskFact<DeskQuote>> => {
          const amount = notionalAmount(price, stock.decimals, usd);
          if (!amount) return unknown("SIZE_PRECISION_UNAVAILABLE");
          try {
            const q = await engines.exit.quote({
              token: address,
              amount,
              outputToken: "USDG",
              curve: false,
            });
            if (
              !q.supported ||
              !q.quote ||
              q.output?.symbol !== "USDG" ||
              q.input.contract.toLowerCase() !== address ||
              q.input.amount !== amount ||
              Date.parse(q.expiresAt) <= this.now() ||
              q.coverage.poolsDiscoveryFailed.length ||
              // An empty or too-thin pool reverts in the quoter; that is not a read failure.
              // Transport or other failures still mark the quote incomplete.
              q.coverage.poolsFailed.some((p) => !String(p.reason ?? "").startsWith("reverted"))
            )
              return unknown("POOL_QUOTE_UNAVAILABLE_OR_INCOMPLETE");
            const priceUsdG = ratio(q.quote.amountOutDisplay, amount);
            if (!priceUsdG) return unknown("POOL_PRICE_INVALID");
            return available(
              {
                notionalUsd: usd,
                inputAmount: amount,
                outputAmount: q.quote.amountOutDisplay,
                outputUnit: "USDG",
                priceUsdG,
                impactBps: q.quote.priceImpactBps,
                expiresAt: q.expiresAt,
              },
              [
                {
                  block: q.anchor.blockNumber,
                  blockHash: q.anchor.blockHash,
                  time: q.anchor.timestamp,
                  source: `exit-check:${q.quote.pool.pool}`,
                },
                ...referenceEvidence,
              ],
            );
          } catch (error) {
            propagateBudget(error);
            return unknown(reason(error));
          }
        };
        result.pool = await quoteAt("100");
        for (const depth of result.depth)
          depth.quote = await quoteAt(depth.notionalUsd);
        const usdg = stock.usdgUsd;
        if (result.pool.state === "available" && usdg?.state === "current" && usdg.value && usdg.updatedAt) {
          // Chainlink USDG / USD, read in the same batch and block as the token feed.
          const value = gap(result.pool.value.priceUsdG, price, usdg.value);
          if (value !== null)
            result.gapBps = available(value, [
              ...result.pool.evidence,
              {
                block: rwa.anchor.blockNumber,
                blockHash: rwa.anchor.blockHash,
                time: usdg.updatedAt,
                source: `chainlink:${usdg.feed}:USDG/USD`,
                value: usdg.value,
                unit: "USD per USDG",
              },
            ]);
        } else if (result.pool.state === "available") {
          try {
            const usd = await engines.market.market(USDG);
            const age = this.now() - Date.parse(usd.observedAt);
            if (usd.priceUsd && age >= 0 && age <= 60_000) {
              const value = gap(
                result.pool.value.priceUsdG,
                price,
                usd.priceUsd,
              );
              if (value !== null)
                result.gapBps = available(value, [
                  ...result.pool.evidence,
                  {
                    block: null,
                    blockHash: null,
                    time: usd.observedAt,
                    source: `${usd.source}:USDG/USD; upstream calculation time unknown`,
                    value: usd.priceUsd,
                    unit: "USD per USDG",
                  },
                ]);
            }
          } catch (error) {
            propagateBudget(error);
            result.gapBps = unknown(reason(error));
          }
        }
      }
      try {
        const sample = (await engines.market.market(address)).concentration;
        if (
          sample.state === "available" &&
          sample.value.poolPercent !== undefined &&
          sample.value.burnPercent !== undefined &&
          [
            sample.value.top10Percent,
            sample.value.poolPercent,
            sample.value.burnPercent,
          ].every((v) => Number.isFinite(v) && v >= 0 && v <= 100) &&
          Number.isInteger(sample.value.holdersAnalyzed) &&
          sample.value.holdersAnalyzed > 0
        )
          result.concentration = available(
            {
              top10Percent: sample.value.top10Percent,
              poolPercent: sample.value.poolPercent,
              burnPercent: sample.value.burnPercent,
              holdersAnalyzed: sample.value.holdersAnalyzed,
            },
            [
              {
                block: null,
                blockHash: null,
                time: sample.value.observedAt,
                source: sample.value.source,
              },
            ],
          );
      } catch (error) {
        propagateBudget(error);
        result.concentration = unknown(reason(error));
      }
    }
    if (this.receipts) {
      if (!rwa.anchor.timestamp || !rpcCalls.length)
        throw new AppError(
          "RECEIPTS_UNAVAILABLE",
          503,
          "Stock desk receipt evidence unavailable",
        );
      try {
        result.receipt = await this.receipts.issue({
          tool: "stock-desk",
          inputs: { address },
          chainId: 4663,
          block: {
            number: String(rwa.anchor.blockNumber),
            hash: rwa.anchor.blockHash as `0x${string}`,
            timestamp: rwa.anchor.timestamp,
          },
          rpcCalls,
          sources: [],
          outputs: JSON.parse(JSON.stringify(result)),
          labelsetVersion: "stock-desk-v1",
        });
      } catch {
        throw new AppError(
          "RECEIPTS_UNAVAILABLE",
          503,
          "Stock desk receipt unavailable",
        );
      }
    }
    return result;
  }
  private documentEvidence(rwa: RwaVerification, id: string): DeskEvidence[] {
    return rwa.sources
      .filter((s) => s.id === id)
      .map((s) => ({
        block: null,
        blockHash: null,
        time: s.fetchedAt,
        source: s.url,
      }));
  }
}
