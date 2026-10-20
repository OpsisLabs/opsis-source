import type { Claim, TokenControls } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import type { RpcSpendBudget } from "../chain/robinhood-rpc.js";
import type { ProviderHttp } from "../chain/provider-http.js";
import type { LaunchCardsBudget } from "../launches/budget.js";
import { LaunchReader, hex } from "../launches/reader.js";
import { LaunchCardsService } from "../launches/service.js";
import { ControlsService, type ControlsEvidence } from "../controls/service.js";
import { EngineCardSources } from "../cards/sources.js";
import { JsonCache } from "../cache/service.js";
import { AppError } from "../http/errors.js";
import type { ClaimSession, Header } from "./service.js";
import type { Sample, Snapshot } from "./checkers.js";
import type { Fact } from "../launches/facts.js";

export class EngineClaimSession implements ClaimSession {
  readonly evidence: ControlsEvidence = { rpcCalls: [], sources: [] };
  private readonly reader: LaunchReader;
  private readonly controls: ControlsService;
  private readonly launches: LaunchCardsService;
  private readonly cards: EngineCardSources;
  constructor(
    env: Env,
    claimBudget: LaunchCardsBudget,
    portfolioBudget: LaunchCardsBudget,
    launchBudget: LaunchCardsBudget,
    spend?: RpcSpendBudget,
    rpc?: ProviderHttp,
    now = Date.now,
  ) {
    let units = 0;
    const budget = {
      consume: async (n: number) => {
        if (units + n > 1200)
          throw new AppError(
            "CLAIM_CHECK_READ_CAP",
            503,
            "Claim-check subcall cap reached",
          );
        await claimBudget.consume(n);
        units += n;
      },
    };
    const compose = (other: LaunchCardsBudget) => ({
      consume: async (n: number) => {
        await budget.consume(n);
        await other.consume(n);
      },
    });
    // Existing portfolio/launch ledgers and provider fuses remain in addition to this tool's ledger.
    this.reader = new LaunchReader(
      env,
      compose(portfolioBudget),
      1200,
      now,
      rpc,
      spend,
    );
    this.controls = new ControlsService(
      env,
      compose(portfolioBudget),
      rpc,
      now,
      spend,
    );
    this.launches = new LaunchCardsService(env, new JsonCache(), {
      budget: compose(launchBudget),
      rpc,
      rpcSpend: spend,
      now,
    });
    this.cards = new EngineCardSources(
      env,
      compose(portfolioBudget),
      spend,
      rpc,
    );
  }
  async current() {
    const h = await this.reader.anchor();
    this.flush();
    return h;
  }
  async block(n: number) {
    try {
      return await this.reader.block(n);
    } finally {
      this.flush();
    }
  }
  async recheck(h: Header) {
    try {
      await this.reader.recheck(h);
    } finally {
      this.flush();
    }
  }
  private flush() {
    this.evidence.rpcCalls.push(...this.reader.evidence.rpcCalls.splice(0));
    this.evidence.sources.push(...this.reader.evidence.sources.splice(0));
  }
  async snapshot(
    address: string,
    claims: Claim[],
    anchor: Header,
    historical: boolean,
  ): Promise<Snapshot> {
    const result: Snapshot = {};
    const needed = new Set(claims.map((c) => c.type));
    const attempt = async <T>(fn: () => Promise<T>): Promise<Sample<T>> => {
      try {
        return {
          value: await fn(),
          evidence: {
            source: "Robinhood Chain RPC",
            block: String(anchor.number),
            timestamp: new Date(anchor.seconds * 1000).toISOString(),
          },
        };
      } catch (error) {
        if (
          error instanceof AppError &&
          /BUDGET|LIMIT|CAP|RECEIPT/.test(error.code)
        )
          throw error;
        return { reason: "Source evidence unavailable at the stated block" };
      } finally {
        this.flush();
      }
    };
    const needsControls = needed.has("ownership") || needed.has("paused");
    const needsLaunch = ["lpBurned", "launchpad", "deployer"].some((t) =>
      needed.has(t as Claim["type"]),
    );
    if (needsLaunch) {
      const observation = await attempt(() =>
        this.launches.cardAt(address, anchor, this.evidence),
      );
      if ("reason" in observation) {
        result.lp = result.launchpad = result.deployer = observation;
      } else {
        const card = observation.value,
          launch = card.launch as Fact<{ adapter: string; deployer?: string }>;
        const lp = card.lpStatus as Fact<{ finalPositionRecipient?: string }>;
        const permissions = card.permissions as Fact<TokenControls> | undefined;
        if (needsControls && permissions && permissions.state !== "unknown")
          result.controls = {
            value: permissions.value,
            evidence: observation.evidence,
          };
        const evidence = {
          ...observation.evidence,
          method: "launch-facts/1",
          coverage: JSON.stringify(card.coverage),
        };
        // Registry and deployer fields come from the decoded event; retain bounded scan coverage.
        result.launchpad =
          launch.state !== "unknown"
            ? { value: launch.value.adapter, evidence }
            : { reason: "Launch registry match is missing" };
        result.lp =
          lp.state === "available" &&
          lp.value.finalPositionRecipient &&
          /^0x(?:0{40}|0{36}dead)$/i.test(lp.value.finalPositionRecipient) &&
          !(card.otherLaunches as unknown[])?.length
            ? {
                value: [lp.value.finalPositionRecipient],
                evidence: {
                  ...evidence,
                  coverage:
                    "Launch facts recorded the burn recipient; other position transfers are not indexed",
                },
              }
            : {
                reason:
                  "LP recipient coverage is unknown or partial, or only an initial non-burn recipient is available",
              };
        if (needed.has("deployer")) {
          const deployer =
            launch.state !== "unknown" ? launch.value.deployer : undefined;
          result.deployer = deployer
            ? await attempt(async () => {
                const read = async (data: string) => {
                  const raw = await this.reader.read(
                    "eth_call",
                    [{ to: address, data }, hex(anchor.number)],
                    true,
                  );
                  if (typeof raw !== "string" || !/^0x[\da-f]{64}$/i.test(raw))
                    throw new Error("Balance unavailable");
                  return BigInt(raw).toString();
                };
                return {
                  numerator: await read(
                    `0x70a08231${deployer.slice(2).padStart(64, "0")}`,
                  ),
                  denominator: await read("0x18160ddd"),
                };
              })
            : { reason: "Launch facts do not identify a deployer" };
          if ("value" in result.deployer)
            result.deployer.evidence.deployer = deployer!;
        }
      }
    }
    if (needsControls && !result.controls)
      result.controls = await attempt(() =>
        this.controls.checkAt(
          address,
          { blockNumber: anchor.number, blockHash: anchor.hash },
          this.evidence,
        ),
      );
    if (needed.has("top10") || needed.has("verified")) {
      if (historical)
        result.top10 = result.verified = {
          reason:
            "Explorer evidence is current-only and cannot be read at the post-time block",
        };
      else {
        const market = await attempt(() =>
          this.cards.market(address, this.evidence),
        );
        if ("reason" in market) result.top10 = result.verified = market;
        else {
          const sample = market.value.explorerClaims;
          const evidence = {
            source: "blockscout",
            observedAt: sample?.observedAt ?? market.value.observedAt,
            coverage:
              "Explorer current sample; not block-pinned. Pools and burn addresses included as reported.",
          };
          result.top10 = sample?.share
            ? { value: sample.share, evidence }
            : { reason: "Explorer holder share unavailable" };
          result.verified =
            typeof sample?.verified === "boolean"
              ? {
                  value: sample.verified,
                  evidence: {
                    ...evidence,
                    observedAt:
                      sample.verifiedObservedAt ?? evidence.observedAt,
                  },
                }
              : { reason: "Explorer verification flag unavailable" };
        }
      }
    }
    return result;
  }
}
