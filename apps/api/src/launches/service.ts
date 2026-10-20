import { REVIEWED_ASSETS } from "@rh-chain/shared";
import { runSellTest, keyParameters, nativeCurrency } from "./sell-test.js";
import { encodeAbiParameters, keccak256 } from "viem";
import { EngineCardSources } from "../cards/sources.js";
import type { Json, TokenControls } from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import {
  createProviderHttp,
  type ProviderHttp,
} from "../chain/provider-http.js";
import { ethUsdFeed, readChainlinkUsd, usdgUsdFeed } from "../rwa/chainlink.js";
import { stockPairUsdPrice } from "../rwa/service.js";
import type { RpcSpendBudget } from "../chain/robinhood-rpc.js";
import { JsonCache } from "../cache/service.js";
import { ControlsService, type ControlsEvidence } from "../controls/service.js";
import type { ReceiptService } from "../receipts/service.js";
import { AppError } from "../http/errors.js";
import { createLaunchCardsBudget, type LaunchCardsBudget } from "./budget.js";
import {
  buyerFacts,
  known,
  unknown,
  rules,
  type Fact,
  type Transfer,
} from "./facts.js";
import {
  adapters,
  registry,
  registryVersion,
  reviewDate,
  related,
  longHistoryDeploymentBlock,
  decodeLaunch,
  decode as decodeRaw,
  addressTopic,
  topic,
  type AdapterId,
  type ChainLog,
  type Launch,
  type Point,
} from "./registry.js";
import {
  LaunchReader,
  ReadCap,
  unavailable,
  quantity,
  hex,
  isAddress,
  type Header,
} from "./reader.js";

export const caps = {
  discoveryChunksPerAdapter: 12,
  transferChunks: 12,
  distributionChunks: 24,
  historyChunks: 20,
  transactions: 64,
  nonces: 32,
  balances: 100,
  feedLogCalls: 90,
  feedEntries: 200,
} as const;
type Scan = { launch: Launch; log: ChainLog };
type Discovery = {
  rows: Scan[];
  coverage: Record<string, unknown>;
  partial: boolean;
};
export interface LaunchCardsSource {
  card(token: string): Promise<Record<string, unknown>>;
  feed(minutes?: number): Promise<Record<string, unknown>>;
}
type Options = {
  budget?: LaunchCardsBudget;
  rpc?: ProviderHttp;
  stockHttp?: ProviderHttp;
  rpcSpend?: RpcSpendBudget;
  now?: () => number;
  receipts?: ReceiptService;
};
export class LaunchCardsService implements LaunchCardsSource {
  private readonly pending = new Map<
    number,
    Promise<Record<string, unknown>>
  >();
  private readonly budget: LaunchCardsBudget;
  private readonly now: () => number;
  constructor(
    private readonly env: Env,
    private readonly cache: JsonCache,
    private readonly options: Options = {},
  ) {
    this.budget = options.budget ?? createLaunchCardsBudget(env);
    this.now = options.now ?? Date.now;
  }
  private enabled() {
    if (
      !this.env.LAUNCH_CARDS_ENABLED ||
      !this.env.PRIVATE_MODE_ENABLED ||
      !this.env.OPSIS_WORKSPACES_ENABLED
    )
      throw new AppError("NOT_FOUND", 404, "Not found");
  }
  private reader(feed = false) {
    return new LaunchReader(
      this.env,
      this.budget,
      feed
        ? this.env.LAUNCH_CARDS_FEED_MAX_RPC_SUBCALLS
        : this.env.LAUNCH_CARDS_MAX_RPC_SUBCALLS,
      this.now,
      this.options.rpc,
      this.options.rpcSpend,
    );
  }
  async feed(minutes = 30): Promise<Record<string, unknown>> {
    this.enabled();
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120)
      throw new AppError(
        "INVALID_WINDOW",
        400,
        "Use a window from 1 to 120 minutes",
      );
    const existing = this.pending.get(minutes);
    if (existing) return existing;
    const promise = (async () => {
      const key = `launch-feed:${registryVersion}:${this.env.ROBINHOOD_RPC_PROVIDER}:${this.env.LAUNCH_LOG_WINDOW_BLOCKS}:${minutes}:${this.env.LAUNCH_CARDS_FEED_MAX_RPC_SUBCALLS}:${this.env.LAUNCH_CARDS_FEED_CACHE_SECONDS}`;
      const cached = await this.cache.get<Record<string, unknown>>(key);
      if (cached) return cached;
      const r = this.reader(true),
        start = this.now(),
        anchor = await r.anchor();
      const from = await r.lowerBound(anchor.seconds - minutes * 60, anchor);
      const scan = await this.discover(r, anchor, from);
      const entries: Launch[] = [];
      for (const row of scan.rows.slice(0, caps.feedEntries)) {
        try {
          entries.push((await this.trading(r, anchor, row)).launch);
        } catch (error) {
          if (!(error instanceof ReadCap)) throw error;
          entries.push(row.launch);
        }
      }
      await r.recheck(anchor);
      this.duration(start);
      const result = {
        chainId: 4663,
        anchor: anchorJson(anchor),
        minutes,
        entries: entries.sort(newest).map((entry) => ({
          ...entry,
          partial: scan.partial,
          t0State: entry.t0 ? "available" : "unknown",
        })),
        coverage: {
          state:
            scan.partial ||
            scan.rows.length > caps.feedEntries ||
            entries.some((e) => !e.t0)
              ? "partial"
              : "available",
          ...scan.coverage,
          entryCap: caps.feedEntries,
          rpcCalls: r.calls,
          t0Unknown: entries.filter((e) => !e.t0).length,
        },
        observedAt: new Date(start).toISOString(),
        expiresAt: new Date(
          start + this.env.LAUNCH_CARDS_FEED_CACHE_SECONDS * 1000,
        ).toISOString(),
        disclaimer: "Not investment advice",
      };
      await this.cache.set(
        key,
        result,
        this.env.LAUNCH_CARDS_FEED_CACHE_SECONDS,
      );
      return result;
    })();
    this.pending.set(minutes, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(minutes);
    }
  }
  async card(input: string): Promise<Record<string, unknown>> {
    this.enabled();
    if (!isAddress(input) || /^0x0{40}$/i.test(input))
      throw new AppError("INVALID_TOKEN", 400, "Enter a nonzero token address");
    const token = input.toLowerCase(),
      r = this.reader(),
      start = this.now(),
      anchor = await r.anchor();
    const discovered = await this.discover(r, anchor, 0, token);
    // Prefer protocol launch events over direct pool duplicates. Multiple launches
    // remain visible; no token is identified from its symbol or a pool hook alone.
    const order: AdapterId[] = [
      "pons",
      "long",
      "instant",
      "launcher",
      "v3",
      "v4",
    ];
    const candidates = discovered.rows.sort(
      (a, b) =>
        order.indexOf(a.launch.adapter) - order.indexOf(b.launch.adapter) ||
        a.launch.created.blockNumber - b.launch.created.blockNumber,
    );
    let launch: Fact<Launch> = unknown(
        "No matching event in the bounded registry scan",
      ),
      resolved: Awaited<ReturnType<LaunchCardsService["trading"]>> | undefined;
    if (candidates[0]) {
      try {
        resolved = await this.trading(r, anchor, candidates[0]);
        launch = known(
          resolved.launch,
          { ...discovered.coverage, trading: resolved.tradingCoverage },
          discovered.partial || resolved.tradingPartial,
        );
      } catch (error) {
        if (!(error instanceof ReadCap)) throw error;
        launch = known(
          candidates[0].launch,
          discovered.coverage,
          true,
          "Trading-start read cap reached",
        );
      }
    }
    const section = async <T>(fn: () => Promise<Fact<T>>): Promise<Fact<T>> => {
      if (r.calls >= r.maxCalls - 12)
        return unknown("RPC subcall cap reached before this section");
      try {
        return await fn();
      } catch (error) {
        if (error instanceof ReadCap)
          return unknown("RPC subcall cap reached in this section");
        // A failed read degrades only this section; the anchor re-check after
        // all sections still refuses the whole card if the block changed.
        if (error instanceof AppError && error.statusCode >= 500)
          return unknown(
            `A source read failed in this section (${error.code})`,
          );
        throw error;
      }
    };
    const buyers = resolved
      ? await section(() => this.buyers(r, anchor, token, resolved!))
      : unknown("Trading start or liquidity source is unknown");
    const supply = await section(() => this.supply(r, anchor, token, buyers));
    const history = resolved
      ? await section(() => this.history(r, anchor, resolved!.launch))
      : unknown("Launch is unknown");
    const distributions = resolved
      ? await section(() =>
          this.distributions(r, anchor, token, resolved!.launch),
        )
      : unknown("Deployer or launch time is unknown");
    const lp = resolved
      ? await section(() => this.lp(r, anchor, resolved!))
      : unknown("Launch is unknown");
    const permissions = await section(
      async (): Promise<Fact<TokenControls>> => {
        // Reserve the controls service's fixed upper bound inside this card cap.
        if (r.calls + 11 > r.maxCalls) throw new ReadCap();
        const evidence: ControlsEvidence = { rpcCalls: [], sources: [] };
        const controls = new ControlsService(
          this.env,
          this.budget,
          r.rpc,
          this.now,
          this.options.rpcSpend,
        );
        const value = await controls.checkAt(
          token,
          { blockNumber: anchor.number, blockHash: anchor.hash },
          evidence,
        );
        r.calls += evidence.rpcCalls.length;
        r.evidence.rpcCalls.push(...evidence.rpcCalls);
        r.evidence.sources.push(
          ...evidence.sources.map((source) => ({
            ...source,
            id: `controls-${source.id}`,
          })),
        );
        return known(
          value,
          {
            source: value.source,
            anchor: value.anchor,
            limits: value.coverage.unknown,
          },
          true,
        );
      },
    );
    const sellTest = await runSellTest(
      r,
      anchor,
      resolved?.launch,
      async (pair) => {
        const read = r.read.bind(r);
        if (pair === REVIEWED_ASSETS.USDG.address.toLowerCase())
          return {
            ...(await readChainlinkUsd(
              read,
              hex(anchor.number),
              anchor.seconds,
              usdgUsdFeed,
            )),
            decimals: REVIEWED_ASSETS.USDG.decimals,
            symbol: "USDG",
          };
        if (
          pair !== nativeCurrency &&
          pair !== REVIEWED_ASSETS.WETH.address.toLowerCase()
        ) {
          const http =
            this.options.stockHttp ??
            createProviderHttp(
              { ...this.env, PROVIDER_MAX_RETRIES: 0 },
              "rwa-public-source",
            );
          return stockPairUsdPrice(
            pair,
            (url) => r.document(http, url),
            read,
            hex(anchor.number),
            anchor.seconds,
          );
        }
        // Chainlink ETH / USD at the card's anchor first; the explorer price is the fallback.
        try {
          return {
            ...(await readChainlinkUsd(read, hex(anchor.number), anchor.seconds, ethUsdFeed)),
            decimals: REVIEWED_ASSETS.WETH.decimals,
            symbol: pair === nativeCurrency ? "ETH" : "WETH",
          };
        } catch (error) {
          if (error instanceof ReadCap) throw error;
        }
        const market = await new EngineCardSources(
          this.env,
          this.budget,
          this.options.rpcSpend,
          this.options.rpc,
        ).market(REVIEWED_ASSETS.WETH.address);
        return {
          priceUsd: market.priceUsd ?? "",
          decimals: REVIEWED_ASSETS.WETH.decimals,
          symbol: pair === nativeCurrency ? "ETH" : "WETH",
          source: `${market.source} WETH / USD`,
          observedAt: market.observedAt,
        };
      },
      this.env.LAUNCH_SELL_TEST_ENABLED ? undefined : "Sell test not enabled on this deployment",
    );
    await r.recheck(anchor);
    this.duration(start);
    const result = {
      chainId: 4663,
      token,
      anchor: anchorJson(anchor),
      observedAt: new Date(start).toISOString(),
      methodVersion: "launch-facts/1",
      registry: { version: registryVersion, reviewDate },
      launch,
      otherLaunches: candidates.slice(1, 20).map((c) => c.launch),
      buyers,
      supplyByTag: supply,
      deployerHistory: history,
      deployerDistributions: distributions,
      lpStatus: lp,
      permissions,
      sellTest,
      coverage: {
        rpcCalls: r.calls,
        documentReads: r.documentCalls,
        discovery: discovered.coverage,
        source: r.evidence.sources[0]?.provider ?? "unknown",
        caps,
      },
      disclaimer: "Not investment advice",
    };
    if (!this.env.RECEIPTS_ENABLED) return result;
    if (!this.options.receipts || r.evidence.rpcCalls.length !== r.calls)
      throw new AppError(
        "RECEIPTS_UNAVAILABLE",
        503,
        "Receipt evidence unavailable",
      );
    try {
      const receipt = await this.options.receipts.issue({
        tool: "launchCards",
        inputs: { token },
        chainId: 4663,
        block: {
          number: String(anchor.number),
          hash: anchor.hash as `0x${string}`,
          timestamp: new Date(anchor.seconds * 1000).toISOString(),
        },
        ...r.evidence,
        outputs: result as unknown as Json,
        labelsetVersion: "launch-rules/v1",
      });
      return { ...result, receipt };
    } catch {
      throw new AppError("RECEIPTS_UNAVAILABLE", 503, "Receipt unavailable");
    }
  }
  private duration(start: number) {
    if (this.now() < start || this.now() - start >= 30_000) throw unavailable();
  }
  private async discover(
    r: LaunchReader,
    anchor: Header,
    from: number,
    token?: string,
  ): Promise<Discovery> {
    const rows: Scan[] = [],
      ranges: Record<string, unknown> = {};
    const scans = adapters.flatMap((id) => {
      const filters: unknown[][] = token
        ? id === "pons" || id === "launcher"
          ? [[topic(id), addressTopic(token)]]
          : id === "long" || id === "instant"
            ? [[topic(id), null, addressTopic(token)]]
            : id === "v4"
              ? [
                  [topic(id), null, addressTopic(token)],
                  [topic(id), null, null, addressTopic(token)],
                ]
              : [
                  [topic(id), addressTopic(token)],
                  [topic(id), null, addressTopic(token)],
                ]
        : [[topic(id)]];
      return filters.map((topics) => ({
        id,
        topics,
        cursor: anchor.number,
        from: Math.max(from, registry[id].deploymentBlock),
        windowBlocks: token ? r.logWindowBlocks : 2_000,
      }));
    });
    const budget = { remaining: caps.feedLogCalls as number };
    let partial = false;
    const reserve = token ? 100 : 14;
    // Round-robin over indexed sides keeps every adapter represented. Failed
    // range attempts share the total log-call cap; a successful page alone
    // advances its cursor. Each token side has independent, explicit coverage.
    for (
      let round = 0;
      round < (token ? caps.discoveryChunksPerAdapter : 100);
      round++
    ) {
      for (const scan of scans) {
        if (scan.cursor < scan.from) continue;
        const page = await r.logWindow(
          registry[scan.id].address,
          scan.topics,
          scan.from,
          scan.cursor,
          scan.windowBlocks,
          budget,
          true,
          reserve,
        );
        if (!page) continue;
        scan.windowBlocks = page.windowBlocks;
        scan.cursor = page.from - 1;
        for (const log of [...page.logs].reverse()) {
          if (
            rows.length >= caps.feedEntries ||
            r.calls >= r.maxCalls - reserve
          ) {
            partial = true;
            break;
          }
          const point = await r.point(log);
          let launch: Launch;
          try {
            launch = decodeLaunch(scan.id, log, point, token);
          } catch {
            throw unavailable();
          }
          if (
            !rows.some(
              (row) =>
                row.launch.factory === launch.factory &&
                row.log.transactionHash === log.transactionHash &&
                row.log.logIndex === log.logIndex,
            )
          )
            rows.push({ launch, log });
        }
      }
      if (
        scans.every((s) => s.cursor < s.from) ||
        budget.remaining === 0 ||
        r.calls >= r.maxCalls - reserve
      )
        break;
    }
    for (const id of adapters) {
      const sides = scans.filter((s) => s.id === id);
      const incomplete = sides.some((s) => s.cursor >= s.from);
      ranges[id] = {
        state: incomplete || partial ? "partial" : "available",
        fromBlock: Math.max(...sides.map((s) => s.cursor + 1)),
        toBlock: anchor.number,
        requestedFromBlock: Math.max(from, registry[id].deploymentBlock),
        factory: registry[id].address,
        filters: sides.map((s) => ({
          topics: s.topics,
          fromBlock: s.cursor + 1,
          toBlock: anchor.number,
        })),
      };
    }
    partial ||= scans.some((s) => s.cursor >= s.from);
    return {
      rows,
      coverage: {
        adapters: ranges,
        requestedFromBlock: from,
        toBlock: anchor.number,
        partial,
        logCalls: caps.feedLogCalls - budget.remaining,
        windowBlocks: token ? r.logWindowBlocks : 2_000,
        earlierFactories:
          "Long earlier factory is history-only; Pons V1 inactive",
      },
      partial,
    };
  }
  private async trading(r: LaunchReader, anchor: Header, row: Scan) {
    const launch = {
      ...row.launch,
      unknownReasons: { ...row.launch.unknownReasons },
    };
    const tradingCoverage: Record<string, unknown> = {};
    let tradingPartial = false;
    let graduation: { point: Point; positionId: string } | null = null,
      poolStart: Point | null = null,
      poolInitialize: Point | null = null,
      source: string | null = launch.curve ?? launch.pool;
    if (launch.adapter === "instant") source = registry.v4.address;
    if (launch.adapter === "long" || launch.adapter === "pons") {
      if (launch.adapter === "pons") {
        const scan = await r.range(
          launch.factory,
          [topic("graduation"), addressTopic(launch.token)],
          launch.created.blockNumber,
          anchor.number,
          4,
          true,
          true,
        );
        tradingCoverage.graduation = scan.coverage;
        tradingPartial ||= scan.partial;
        if (scan.logs[0])
          graduation = {
            point: await r.point(scan.logs[0]),
            positionId: String(decode(scan.logs[0], "graduation").positionId),
          };
      }
      if (!launch.pairToken) throw unavailable();
      const currencies = [launch.token, launch.pairToken].sort();
      const scan = await r.range(
        registry.v4.address,
        [
          topic("v4"),
          null,
          addressTopic(currencies[0]!),
          addressTopic(currencies[1]!),
        ],
        launch.created.blockNumber,
        launch.adapter === "long" ? launch.created.blockNumber : anchor.number,
        4,
        true,
        true,
      );
      tradingCoverage.initialize = scan.coverage;
      tradingPartial ||= scan.partial;
      const expectedHooks =
        launch.adapter === "pons"
          ? [related.ponsHook]
          : [related.longPoolHook, launch.hook];
      for (const log of scan.logs) {
        const a = decode(log, "v4"),
          hook = String(a.hooks).toLowerCase();
        if (
          launch.pairToken &&
          ![a.currency0, a.currency1].some(
            (v) => String(v).toLowerCase() === launch.pairToken,
          )
        )
          continue;
        if (
          hook === "0x0000000000000000000000000000000000000000" ||
          !expectedHooks.includes(hook) ||
          ![a.currency0, a.currency1].some(
            (v) => String(v).toLowerCase() === launch.token,
          )
        )
          continue;
        // Long's pool is created by the launch transaction. Pons may graduate
        // in a separate transaction and requires both independently shown events.
        if (
          launch.adapter === "long" &&
          log.transactionHash !== row.log.transactionHash
        )
          continue;
        const poolKey = {
          currency0: String(a.currency0).toLowerCase() as `0x${string}`,
          currency1: String(a.currency1).toLowerCase() as `0x${string}`,
          fee: Number(a.fee),
          tickSpacing: Number(a.tickSpacing),
          hooks: hook as `0x${string}`,
        };
        if (
          keccak256(
            encodeAbiParameters(keyParameters, [poolKey]),
          ).toLowerCase() !== String(a.id).toLowerCase()
        )
          throw unavailable();
        if (poolInitialize) throw unavailable(); // Ambiguous Initialize evidence.
        launch.poolKey = poolKey;
        launch.poolId = String(a.id).toLowerCase();
        launch.hook = hook;
        const point = await r.point(log);
        poolInitialize = point;
        if (graduation) poolStart = later(graduation.point, point);
        if (launch.adapter === "long") source = registry.v4.address;
      }
      if (launch.adapter === "long" && !source) {
        // A Long poolOrHook can also be a v3 pool. Factory evidence, not an
        // arbitrary contract address, establishes the liquidity source.
        const scan3 = await r.range(
          registry.v3.address,
          [topic("v3")],
          launch.created.blockNumber,
          launch.created.blockNumber,
          1,
        );
        for (const log of scan3.logs) {
          const a = decode(log, "v3");
          if (
            String(a.pool).toLowerCase() === launch.hook &&
            log.transactionHash === row.log.transactionHash &&
            [a.token0, a.token1].some(
              (v) => String(v).toLowerCase() === launch.pairToken,
            ) &&
            [a.token0, a.token1].some(
              (v) => String(v).toLowerCase() === launch.token,
            )
          ) {
            launch.fee = Number(a.fee);
            launch.pool = String(a.pool).toLowerCase();
            source = launch.pool;
          }
        }
      }
    }
    if (launch.adapter === "v3" || launch.adapter === "v4") {
      const v3 = launch.adapter === "v3";
      const scan = await r.range(
        v3 ? launch.pool! : registry.v4.address,
        v3 ? [topic("v3Mint")] : [topic("v4Liquidity"), launch.poolId],
        launch.created.blockNumber,
        anchor.number,
        4,
      );
      tradingCoverage.firstLiquidity = scan.coverage;
      tradingPartial ||= scan.partial;
      // Forward scan from creation establishes the first positive add even if
      // later history is capped. No add found in a partial scan stays unknown.
      for (const log of scan.logs) {
        const a = decode(log, v3 ? "v3Mint" : "v4Liquidity");
        if (BigInt(String(v3 ? a.amount : a.liquidityDelta)) > 0n) {
          launch.t0 = await r.point(log);
          delete launch.unknownReasons.t0;
          source = v3 ? launch.pool : registry.v4.address;
          break;
        }
      }
    }
    if (launch.adapter === "pons")
      launch.poolGraduated = !!(graduation && poolInitialize);
    return {
      launch,
      graduation,
      poolStart,
      poolInitialize,
      source,
      tradingCoverage,
      tradingPartial,
    };
  }
  private async transfers(
    r: LaunchReader,
    anchor: Header,
    token: string,
    sender: string,
    t0: Point,
    seconds: number,
    chunks: number,
  ) {
    const start = Date.parse(t0.timestamp) / 1000,
      end = start + seconds;
    const after = await r.lowerBound(end + 1, anchor);
    const scan = await r.range(
      token,
      [topic("transfer"), addressTopic(sender)],
      t0.blockNumber,
      Math.min(anchor.number, after - 1),
      chunks,
    );
    const rows: Transfer[] = [];
    let metadataCapped = false;
    for (const log of scan.logs) {
      if (r.calls >= r.maxCalls - 14) {
        metadataCapped = true;
        break;
      }
      const p = await r.point(log),
        timestamp = Date.parse(p.timestamp) / 1000;
      if (timestamp < start || timestamp > end) continue;
      const a = decode(log, "transfer");
      rows.push({
        from: String(a.from).toLowerCase(),
        to: String(a.to).toLowerCase(),
        value: BigInt(String(a.value)),
        transactionHash: p.transactionHash,
        blockNumber: p.blockNumber,
        timestamp,
      });
    }
    return {
      rows,
      coverage: {
        ...scan.coverage,
        metadataCapped,
        decodedLogs: rows.length,
        fromTimestamp: t0.timestamp,
        toTimestamp: new Date(
          Math.min(anchor.seconds, end) * 1000,
        ).toISOString(),
        requestedEndTimestamp: new Date(end * 1000).toISOString(),
        ongoing: anchor.seconds < end,
      },
      partial: scan.partial || metadataCapped || anchor.seconds < end,
    };
  }
  private async buyers(
    r: LaunchReader,
    anchor: Header,
    token: string,
    resolved: Awaited<ReturnType<LaunchCardsService["trading"]>>,
  ) {
    if (!resolved.launch.t0 || !resolved.source)
      return unknown("Trading start or liquidity source is unknown");
    const windows = [{ point: resolved.launch.t0, source: resolved.source }];
    if (resolved.launch.adapter === "pons" && resolved.poolStart)
      windows.push({ point: resolved.poolStart, source: registry.v4.address });
    const groups = [],
      coverage = [];
    let transactionReads = 0,
      nonceReads = 0,
      partial = false;
    for (const window of windows) {
      const scan = await this.transfers(
        r,
        anchor,
        token,
        window.source,
        window.point,
        10,
        caps.transferChunks,
      );
      const signers = new Map<string, string>(),
        nonces = new Map<string, number>();
      for (const hash of [
        ...new Set(scan.rows.map((t) => t.transactionHash)),
      ]) {
        if (
          transactionReads >= caps.transactions ||
          r.calls >= r.maxCalls - 15
        ) {
          partial = true;
          break;
        }
        const tx = (await r.read("eth_getTransactionByHash", [hash])) as {
          hash?: unknown;
          from?: unknown;
          blockNumber?: unknown;
          blockHash?: unknown;
        } | null;
        transactionReads++;
        const transfer = scan.rows.find((t) => t.transactionHash === hash)!;
        if (
          !tx ||
          typeof tx.hash !== "string" ||
          tx.hash.toLowerCase() !== hash ||
          !isAddress(tx.from) ||
          quantity(tx.blockNumber) !== transfer.blockNumber ||
          tx.blockHash !== (await r.block(transfer.blockNumber)).hash
        )
          throw unavailable();
        signers.set(hash, tx.from.toLowerCase());
        if (
          scan.rows.some(
            (t) =>
              t.transactionHash === hash &&
              t.to === tx.from!.toString().toLowerCase(),
          )
        ) {
          if (
            nonceReads >= caps.nonces ||
            r.calls >= r.maxCalls - 15 ||
            transfer.blockNumber === 0
          ) {
            partial = true;
            continue;
          }
          nonces.set(
            hash,
            quantity(
              await r.read("eth_getTransactionCount", [
                tx.from.toLowerCase(),
                hex(transfer.blockNumber - 1),
              ]),
            ),
          );
          nonceReads++;
        }
      }
      groups.push({
        t0: window.point,
        liquiditySource: window.source,
        ...buyerFacts(
          scan.rows,
          window.source,
          Date.parse(window.point.timestamp) / 1000,
          signers,
          nonces,
        ),
      });
      coverage.push(scan.coverage);
      partial ||= scan.partial;
    }
    return known(
      { windows: groups },
      {
        windows: coverage,
        transactionReads,
        nonceReads,
        rules,
        limit:
          "Transfers from the verified liquidity source only; PoolManager transfers are not uniquely attributable to a pool.",
      },
      partial,
    );
  }
  private async uint(
    r: LaunchReader,
    token: string,
    data: string,
    anchor: Header,
  ) {
    const value = await r.read(
      "eth_call",
      [{ to: token, data }, hex(anchor.number)],
      true,
    );
    return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value)
      ? BigInt(value)
      : null;
  }
  private async supply(
    r: LaunchReader,
    anchor: Header,
    token: string,
    buyers: Awaited<ReturnType<LaunchCardsService["buyers"]>>,
  ) {
    if (buyers.state === "unknown") return unknown("Buyer tags are unknown");
    const total = await this.uint(r, token, "0x18160ddd", anchor);
    if (total === null || total === 0n)
      return unknown("totalSupply unavailable or zero");
    const tags = buyers.value.windows.flatMap((w) => w.tags);
    const multiTransactions = buyers.value.windows.flatMap(
      (w) => w.transactions,
    );
    const wallets = [
      ...new Set([
        ...tags.map((t) => t.wallet),
        ...multiTransactions.flatMap((tx) => tx.recipients),
      ]),
    ];
    const balances = new Map<string, bigint>();
    for (const wallet of wallets.slice(0, caps.balances)) {
      if (r.calls >= r.maxCalls - 12) break;
      const balance = await this.uint(
        r,
        token,
        `0x70a08231${wallet.slice(2).padStart(64, "0")}`,
        anchor,
      );
      if (balance !== null) balances.set(wallet, balance);
    }
    const byTag = ["early buyer", "same-tx multi-buy", "new wallet"].map(
      (kind) => {
        const members = [
          ...new Set(
            tags.filter((tag) => tag.kind === kind).map((tag) => tag.wallet),
          ),
        ];
        const covered = members.filter((wallet) => balances.has(wallet));
        const numerator = covered.reduce(
          (sum, wallet) => sum + balances.get(wallet)!,
          0n,
        );
        return {
          tag: kind,
          state:
            covered.length < members.length || buyers.state === "partial"
              ? "partial"
              : "available",
          wallets: covered,
          balanceRaw:
            members.length > 0 && covered.length === 0
              ? null
              : numerator.toString(),
          supplyShare:
            members.length > 0 && covered.length === 0
              ? unknown("No balances read for this tag")
              : known(
                  {
                    numerator: numerator.toString(),
                    denominator: total.toString(),
                  },
                  { checked: covered.length, discovered: members.length },
                  covered.length < members.length || buyers.state === "partial",
                ),
          checked: covered.length,
          discovered: members.length,
        };
      },
    );
    // Recipients' current balances are a fact about the transaction's recipient
    // set. They never become wallet tags from inbound transfers alone.
    const transactions = multiTransactions.map((tx) => {
      const covered = tx.recipients.filter((wallet) => balances.has(wallet));
      const numerator = covered.reduce(
        (sum, wallet) => sum + balances.get(wallet)!,
        0n,
      );
      return {
        ...tx,
        supplyShare:
          covered.length === 0
            ? unknown("Recipient balances unavailable")
            : known(
                {
                  numerator: numerator.toString(),
                  denominator: total.toString(),
                },
                {
                  checked: covered.length,
                  recipients: tx.recipients.length,
                  anchor: anchorJson(anchor),
                },
                covered.length < tx.recipients.length,
              ),
        basis:
          "Combined distinct recipient balances at the anchor; delivered amount is a separate event fact",
      };
    });
    return known(
      {
        byTag,
        transactions,
        totalSupplyRaw: total.toString(),
        anchor: anchorJson(anchor),
      },
      {
        checked: balances.size,
        discovered: wallets.length,
        cap: caps.balances,
      },
      buyers.state === "partial" || balances.size < wallets.length,
    );
  }
  private async history(r: LaunchReader, anchor: Header, launch: Launch) {
    if (!launch.deployer || !["pons", "long"].includes(launch.adapter))
      return unknown("Factory event does not identify a deployer or launcher");
    const factories =
      launch.adapter === "long"
        ? [launch.factory, related.longHistory]
        : [launch.factory];
    const tokens: { token: string; launchTime: string; factory: string }[] = [],
      coverage = [];
    let partial = launch.adapter === "long";
    for (const factory of [...new Set(factories)]) {
      const topics =
        launch.adapter === "pons"
          ? [topic("pons"), null, null, addressTopic(launch.deployer)]
          : [topic("long")];
      const scan = await r.range(
        factory,
        topics,
        factory === related.longHistory
          ? longHistoryDeploymentBlock
          : registry[launch.adapter].deploymentBlock,
        anchor.number,
        Math.floor(caps.historyChunks / factories.length),
        true,
        launch.adapter === "pons",
      );
      for (const log of scan.logs) {
        if (r.calls >= r.maxCalls - 14) {
          partial = true;
          break;
        }
        const point = await r.point(log);
        const earlier = decodeLaunch(launch.adapter, log, point);
        if (
          earlier.deployer === launch.deployer &&
          earlier.token !== launch.token &&
          (point.blockNumber < launch.created.blockNumber ||
            (point.blockNumber === launch.created.blockNumber &&
              point.logIndex < launch.created.logIndex))
        )
          tokens.push({
            token: earlier.token,
            launchTime: point.timestamp,
            factory,
          });
      }
      coverage.push(scan.coverage);
      partial ||= scan.partial;
    }
    return known(
      {
        count: tokens.length,
        launches: tokens,
        liquidityHistory: unknown(
          "Liquidity history is unknown in this version",
        ),
      },
      {
        ranges: coverage,
        indexedDeployer: launch.adapter === "pons",
        cap: caps.historyChunks,
      },
      partial,
    );
  }
  private async distributions(
    r: LaunchReader,
    anchor: Header,
    token: string,
    launch: Launch,
  ) {
    if (!launch.deployer)
      return unknown("Deployer is not identified by this event");
    const scan = await this.transfers(
      r,
      anchor,
      token,
      launch.deployer,
      launch.created,
      86_400,
      caps.distributionChunks,
    );
    return known(
      scan.rows
        .filter((t) => t.to !== launch.deployer)
        .map((t) => ({ ...t, value: t.value.toString() })),
      { ...scan.coverage, rule: rules.distributions },
      scan.partial,
    );
  }
  private async lp(
    r: LaunchReader,
    anchor: Header,
    resolved: Awaited<ReturnType<LaunchCardsService["trading"]>>,
  ): Promise<Fact<Record<string, unknown>>> {
    const { launch } = resolved;
    if (launch.adapter === "instant" && launch.finalPositionRecipient) {
      const recipient = launch.finalPositionRecipient;
      if (
        /^0x0{40}$/.test(recipient) ||
        recipient === "0x000000000000000000000000000000000000dead"
      )
        return known(
          { finalPositionRecipient: recipient, recipientKind: "burn address" },
          {
            anchor: anchorJson(anchor),
            limits:
              "Recipient only; no inference about current position control",
          },
        );
      const code = await r.read("eth_getCode", [recipient, hex(anchor.number)]);
      if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(code))
        return unknown("Recipient code is unavailable");
      return known(
        {
          finalPositionRecipient: recipient,
          recipientKind: code === "0x" ? "EOA" : "contract",
        },
        {
          anchor: anchorJson(anchor),
          limits:
            "Code observation only; no inference about current position control",
        },
      );
    }
    if (launch.adapter === "pons")
      return known(
        {
          graduation: resolved.graduation
            ? known(resolved.graduation)
            : unknown("No graduation found in the bounded scan"),
          initialize: resolved.poolInitialize
            ? known(resolved.poolInitialize)
            : unknown("Matching Initialize not established"),
          poolTradingStart: resolved.poolStart
            ? known(resolved.poolStart)
            : unknown(
                "Matching Pons-hook Initialize and graduation not both established",
              ),
          lock: unknown(
            "Locker event signatures are unverified; no decodable ABI in this version",
          ),
        },
        {
          ...resolved.tradingCoverage,
          locker: related.ponsLocker,
          confirmation: registry.pons.confirmation,
        },
        resolved.tradingPartial ||
          !resolved.graduation ||
          !resolved.poolInitialize,
      );
    return unknown("LP status is unknown for this adapter in this version");
  }
}
function anchorJson(h: Header) {
  return {
    blockNumber: h.number,
    blockHash: h.hash,
    timestamp: new Date(h.seconds * 1000).toISOString(),
    finality: "current_not_final",
  };
}
function newest(a: Launch, b: Launch) {
  return (
    (b.t0 ?? b.created).blockNumber - (a.t0 ?? a.created).blockNumber ||
    b.created.logIndex - a.created.logIndex
  );
}
function later(a: Point, b: Point) {
  return a.blockNumber > b.blockNumber ||
    (a.blockNumber === b.blockNumber && a.logIndex > b.logIndex)
    ? a
    : b;
}

function decode(log: ChainLog, event: Parameters<typeof decodeRaw>[1]) {
  try {
    return decodeRaw(log, event);
  } catch {
    throw unavailable();
  }
}
