import { REVIEWED_ASSETS } from "@rh-chain/shared";
import { runSellTest, keyParameters, nativeCurrency } from "./sell-test.js";
import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { BlockscoutProvider } from "../chain/blockscout.js";
import {
  firstBlock,
  hasCode,
  initialized,
  poolIdFor,
  liquid,
} from "./state.js";
import { EXIT_CHECK_FEE_TIERS } from "../exit-check/constants.js";
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
  registry,
  registryVersion,
  reviewDate,
  related,
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
  TimeLimit,
  mapSix,
  within,
  ReadCap,
  LogRangeError,
  providerReason,
  isHash,
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
  buyers: 25,
  transactions: 25,
  nonces: 25,
  balances: 100,
  feedLogCalls: 90,
  feedEntries: 200,
} as const;
export const maxFeedMinutes = 360;
type Scan = { launch: Launch; log: ChainLog; receipt?: ChainLog[] };
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
  explorerHttp?: ProviderHttp;
  rpcSpend?: RpcSpendBudget;
  now?: () => number;
  receipts?: ReceiptService;
};
export class LaunchCardsService implements LaunchCardsSource {
  private readonly pending = new Map<
    number,
    Promise<Record<string, unknown>>
  >();
  private readonly pendingCards = new Map<
    string,
    Promise<Record<string, unknown>>
  >();
  private readonly creationBlocks = new Map<string, number>();
  private readonly explorer: BlockscoutProvider;
  private readonly budget: LaunchCardsBudget;
  private readonly now: () => number;
  constructor(
    private readonly env: Env,
    private readonly cache: JsonCache,
    private readonly options: Options = {},
  ) {
    this.explorer = new BlockscoutProvider(
      env,
      options.explorerHttp ??
        createProviderHttp(
          { ...env, PROVIDER_MAX_RETRIES: 0, PROVIDER_TIMEOUT_MS: 1_200 },
          "blockscout",
        ),
    );
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
  async feed(minutes = 10): Promise<Record<string, unknown>> {
    this.enabled();
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > maxFeedMinutes)
      throw new AppError(
        "INVALID_WINDOW",
        400,
        `Use a window from 1 to ${maxFeedMinutes} minutes`,
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
      const entries = scan.rows
        .slice(0, caps.feedEntries)
        .map((row) => row.launch);
      await r.recheck(anchor);
      this.duration(start);
      const result = {
        chainId: 4663,
        anchor: anchorJson(anchor),
        minutes,
        entries: entries.sort(newest).map((entry) => ({
          ...entry,
          created: {
            ...entry.created,
            timestamp: entry.created.timestamp || null,
          },
          partial: scan.partial || !entry.created.timestamp,
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
  /** Release 50 composes the same bounded launch rules at its own anchor and budget. */
  async fundingFacts(r: LaunchReader, anchor: Header, token: string) {
    const scan = await this.creation(r, anchor, token);
    const order: AdapterId[] = [
      "pons",
      "long",
      "instant",
      "launcher",
      "v3",
      "v4",
    ];
    const candidate = scan.rows.sort(
      (a, b) =>
        order.indexOf(a.launch.adapter) - order.indexOf(b.launch.adapter) ||
        a.launch.created.blockNumber - b.launch.created.blockNumber,
    )[0];
    if (!candidate)
      return {
        transactions: [],
        buys: [],
        partial: true,
        fundingHubs: [] as string[],
      };
    const resolved = await this.trading(r, anchor, candidate);
    const fundingHubs = [
      candidate.launch.curve,
      candidate.launch.hook,
      candidate.launch.pool,
    ]
      .filter((address): address is string => address !== null)
      .map((address) => address.toLowerCase());
    const buyers = await this.buyers(r, anchor, token, resolved);
    if (buyers.state === "unknown")
      return { transactions: [], buys: [], partial: true, fundingHubs };
    const transactions = buyers.value.windows.flatMap((w) => w.transactions);
    const buys: Array<{
      wallet: string;
      timestamp: number;
      transactionHash: string;
    }> = [];
    for (const tag of buyers.value.windows
      .flatMap((w) => w.tags)
      .filter((t) => t.kind === "early buyer")) {
      const tx = (await r.read("eth_getTransactionByHash", [
        tag.transactionHash,
      ])) as {
        blockNumber: unknown;
        blockHash: unknown;
        from: unknown;
        hash: unknown;
      } | null;
      if (!tx || tx.hash !== tag.transactionHash || tx.from !== tag.wallet)
        throw unavailable();
      const block = await r.block(quantity(tx.blockNumber));
      if (tx.blockHash !== block.hash || block.number > anchor.number)
        throw unavailable();
      buys.push({
        wallet: tag.wallet,
        timestamp: block.seconds,
        transactionHash: tag.transactionHash,
      });
    }
    return {
      transactions,
      buys,
      fundingHubs,
      partial:
        scan.partial || resolved.tradingPartial || buyers.state === "partial",
    };
  }
  async card(input: string): Promise<Record<string, unknown>> {
    this.enabled();
    if (!isAddress(input) || /^0x0{40}$/i.test(input))
      throw new AppError("INVALID_TOKEN", 400, "Enter a nonzero token address");
    const token = input.toLowerCase();
    const age = (card: Record<string, unknown>) => ({
      ...card,
      ageSeconds: Math.max(
        0,
        Math.floor((this.now() - Date.parse(String(card.observedAt))) / 1000),
      ),
    });
    const pending = this.pendingCards.get(token);
    if (pending) return age(await pending);
    const key = `launch-card:f:${registryVersion}:${this.env.ROBINHOOD_RPC_PROVIDER}:${this.env.ROBINHOOD_PUBLIC_RPC_URL}:${token}:${this.env.LAUNCH_LOG_WINDOW_BLOCKS}:${this.env.LAUNCH_CARDS_MAX_RPC_SUBCALLS}:${this.env.LAUNCH_SELL_TEST_ENABLED}:${this.env.RECEIPTS_ENABLED}:${this.env.LAUNCH_CARDS_CACHE_SECONDS}`;
    const promise = (async () => {
      if (this.env.LAUNCH_CARDS_CACHE_SECONDS > 0) {
        const cached = await this.cache.get<Record<string, unknown>>(key);
        if (cached) return cached;
      }
      const result = await this.buildCard(token);
      if (this.env.LAUNCH_CARDS_CACHE_SECONDS > 0)
        await this.cache.set(key, result, this.env.LAUNCH_CARDS_CACHE_SECONDS);
      return result;
    })();
    this.pendingCards.set(token, promise);
    try {
      return age(await promise);
    } finally {
      this.pendingCards.delete(token);
    }
  }
  // Claim Check composes a fresh observation at its own anchor, without using
  // the public card cache or issuing a second, nested receipt.
  async cardAt(
    input: string,
    at: Header,
    evidence: ControlsEvidence,
  ): Promise<Record<string, unknown>> {
    if (!isAddress(input) || /^0x0{40}$/i.test(input))
      throw new AppError("INVALID_TOKEN", 400, "Enter a nonzero token address");
    return this.buildCard(input.toLowerCase(), at, evidence);
  }
  private async buildCard(
    token: string,
    at?: Header,
    evidence?: ControlsEvidence,
  ): Promise<Record<string, unknown>> {
    const r = this.reader(),
      start = this.now();
    r.deadline = start + 20_000;
    r.ceiling = start + 30_000;
    // The registry read cap (150) plus a full sell test (12 simulations at 20 units each).
    r.unitLimit = 150 + 12 * 20;
    r.nonSimulationLimit = 40;
    r.simulationLimit = 12;
    let anchor: Header;
    try {
      anchor = at ?? (await r.anchor());
      if (at && (await r.block(at.number)).hash !== at.hash)
        throw unavailable("HEADER_MISMATCH");
    } catch (error) {
      if (error instanceof TimeLimit) throw unavailable("ANCHOR_UNAVAILABLE");
      throw error;
    }
    let discovered: Discovery;
    try {
      discovered = await this.creation(r, anchor, token);
    } catch (error) {
      if (
        !(
          error instanceof AppError ||
          error instanceof ReadCap ||
          error instanceof TimeLimit
        ) ||
        providerReason(error) === "HEADER_MISMATCH"
      )
        throw error;
      discovered = {
        rows: [],
        partial: true,
        coverage: { partial: true, reason: providerReason(error) },
      };
    }
    if (discovered.rows.length) r.nonSimulationLimit = 150;
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
        discovered.partial
          ? String(discovered.coverage.reason ?? "Creation evidence incomplete")
          : "Launch not found in the supported registry",
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
        if (
          providerReason(error) === "HEADER_MISMATCH" ||
          !(
            error instanceof AppError ||
            error instanceof ReadCap ||
            error instanceof TimeLimit
          )
        )
          throw error;
        launch = known(
          candidates[0].launch,
          discovered.coverage,
          true,
          providerReason(error),
        );
      }
    }
    const section = async <T>(fn: () => Promise<Fact<T>>): Promise<Fact<T>> => {
      if (this.now() >= r.deadline) return unknown("TIME_LIMIT");
      try {
        const value = await within(fn(), r.deadline - this.now());
        return this.now() >= r.deadline ? unknown("TIME_LIMIT") : value;
      } catch (error) {
        if (error instanceof TimeLimit) return unknown("TIME_LIMIT");
        if (providerReason(error) === "HEADER_MISMATCH") throw error;
        if (error instanceof ReadCap)
          return unknown("RPC subcall cap reached in this section");
        // A failed read degrades only this section; the anchor re-check after
        // all sections still refuses the whole card if the block changed.
        if (error instanceof AppError && error.statusCode >= 500)
          return unknown(
            `A source read failed in this section (${String((error.details as { reason?: string })?.reason ?? error.code)})`,
          );
        throw error;
      }
    };
    const buyersPromise = resolved
      ? section(() => this.buyers(r, anchor, token, resolved!))
      : Promise.resolve(
          unknown("Trading start or liquidity source is unknown"),
        );
    const supplyPromise = buyersPromise.then((buyers) =>
      section(() => this.supply(r, anchor, token, buyers)),
    );
    const historyPromise = resolved
      ? section(() => this.history(r, anchor, resolved!.launch))
      : Promise.resolve(unknown("Launch is unknown"));
    const distributionsPromise = resolved
      ? section(() => this.distributions(r, anchor, token, resolved!.launch))
      : Promise.resolve(unknown("Deployer or launch time is unknown"));
    const lpPromise = resolved
      ? section(() => this.lp(r, anchor, resolved!))
      : Promise.resolve(unknown("Launch is unknown"));
    const directPromise = !resolved
      ? section(async () =>
          known(
            await this.directPools(r, anchor, token, []),
            {
              anchor: anchorJson(anchor),
              limits:
                "Reviewed pairs and hookless keys only; creation and first liquidity were not searched",
            },
            true,
          ),
        )
      : Promise.resolve(unknown("Launch pool shown in launch facts"));
    const permissionsPromise = section(
      async (): Promise<Fact<TokenControls>> => {
        const controls = new ControlsService(
          this.env,
          this.budget,
          r.rpc,
          this.now,
          this.options.rpcSpend,
          r.read.bind(r),
        );
        const value = await controls.checkAt(token, {
          blockNumber: anchor.number,
          blockHash: anchor.hash,
          timestamp: new Date(anchor.seconds * 1000).toISOString(),
        });
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
    const sellTestPromise = within(
      runSellTest(
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
          return {
            ...(await readChainlinkUsd(
              read,
              hex(anchor.number),
              anchor.seconds,
              ethUsdFeed,
            )),
            decimals: REVIEWED_ASSETS.WETH.decimals,
            symbol: pair === nativeCurrency ? "ETH" : "WETH",
          };
        },
        this.env.LAUNCH_SELL_TEST_ENABLED
          ? undefined
          : "Sell test not enabled on this deployment",
      ),
      r.deadline - this.now(),
    ).catch((error) => {
      if (!(error instanceof TimeLimit)) throw error;
      return runSellTest(
        r,
        anchor,
        resolved?.launch,
        async () => null,
        "TIME_LIMIT",
      );
    });
    const [
      buyers,
      supply,
      history,
      distributions,
      lp,
      permissions,
      sellTest,
      directPools,
    ] = await Promise.all([
      buyersPromise,
      supplyPromise,
      historyPromise,
      distributionsPromise,
      lpPromise,
      permissionsPromise,
      sellTestPromise,
      directPromise,
    ]);
    await r.recheck(anchor);
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
      directPools,
      coverage: {
        rpcCalls: r.calls,
        budgetUnits: r.budgetUnits,
        documentReads: r.documentCalls,
        discovery: discovered.coverage,
        source: r.evidence.sources[0]?.provider ?? "unknown",
        caps,
      },
      disclaimer: "Not investment advice",
    };
    if (evidence) {
      evidence.rpcCalls.push(...r.evidence.rpcCalls);
      evidence.sources.push(...r.evidence.sources);
      return result;
    }
    if (!this.env.RECEIPTS_ENABLED) return result;
    if (!this.options.receipts || r.evidence.rpcCalls.length !== r.calls)
      throw new AppError(
        "RECEIPTS_UNAVAILABLE",
        503,
        "Receipt evidence unavailable",
        { reason: "RECEIPT_UNAVAILABLE" },
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
      throw new AppError("RECEIPTS_UNAVAILABLE", 503, "Receipt unavailable", {
        reason: "RECEIPT_UNAVAILABLE",
      });
    }
  }
  private duration(start: number) {
    if (this.now() < start || this.now() - start >= 30_000)
      throw new TimeLimit();
  }
  private async creation(
    r: LaunchReader,
    anchor: Header,
    token: string,
  ): Promise<Discovery> {
    let receipt: ChainLog[] | undefined;
    let explorerReason: string | undefined;
    let doc: { creation_tx_hash?: unknown } | undefined;
    try {
      doc = (await r.explorer(() =>
        this.explorer.getAddress(token),
      )) as typeof doc;
    } catch (error) {
      if (error instanceof ReadCap) throw error;
      explorerReason = "EXPLORER_UNAVAILABLE";
    }
    if (isHash(doc?.creation_tx_hash)) {
      try {
        receipt = await r.receipt(doc.creation_tx_hash, anchor);
      } catch (error) {
        if (providerReason(error) === "HEADER_MISMATCH") throw error;
        explorerReason = providerReason(error);
      }
    }
    const usedReceipt = Boolean(receipt);
    if (!receipt) {
      let block = this.creationBlocks.get(token);
      if (block === undefined) {
        if (!(await hasCode(r, token, anchor.number)))
          return {
            rows: [],
            partial: false,
            coverage: { reason: "CREATION_NOT_FOUND" },
          };
        block = await firstBlock(0, anchor.number, (n) => hasCode(r, token, n));
        this.creationBlocks.set(token, block);
      }
      if (block > anchor.number) throw unavailable("CREATION_NOT_FOUND");
      const ids = ["pons", "long", "launcher", "instant", "v4"] as const;
      const logs = await r.logs(
        ids.map((id) => registry[id].address),
        [ids.map((id) => topic(id))],
        block,
        block,
      );
      receipt = logs;
      // Receipts retain same-transaction pool evidence (including v3) without another range scan.
      for (const hash of [
        ...new Set(
          (await this.fromReceipt(r, logs, token)).map(
            (row) => row.log.transactionHash,
          ),
        ),
      ]) {
        const confirmed = await r.receipt(hash, anchor);
        receipt = receipt
          .filter((log) => log.transactionHash !== hash)
          .concat(confirmed);
      }
    }
    const rows = await this.fromReceipt(r, receipt, token);
    return {
      rows,
      partial: false,
      coverage: {
        method: usedReceipt ? "creation-receipt" : "archive-creation-block",
        registryLaunchFound: rows.length > 0,
        ...(!rows.length
          ? { registryReason: "Launch not found in the supported registry" }
          : {}),
        ...(explorerReason ? { explorerReason } : {}),
      },
    };
  }
  private async fromReceipt(
    r: LaunchReader,
    receipt: ChainLog[],
    token?: string,
  ): Promise<Scan[]> {
    const rows: Scan[] = [];
    for (const log of receipt) {
      for (const id of ["pons", "long", "launcher", "instant"] as const) {
        if (
          (log.address.toLowerCase() !== registry[id].address &&
            !(
              id === "long" && log.address.toLowerCase() === related.longHistory
            )) ||
          log.topics[0]?.toLowerCase() !== topic(id)
        )
          continue;
        const launch = decodeLaunch(id, log, await r.point(log));
        if (!token || launch.token === token)
          rows.push({ launch, log, receipt });
      }
    }
    return rows;
  }
  private async directPools(
    r: LaunchReader,
    anchor: Header,
    token: string,
    _receipt: ChainLog[],
  ) {
    const pairs = [
      nativeCurrency,
      REVIEWED_ASSETS.WETH.address.toLowerCase(),
      REVIEWED_ASSETS.USDG.address.toLowerCase(),
    ].filter((pair) => pair !== token);
    const factoryAbi = parseAbi([
      "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
    ]);
    const slotAbi = parseAbi([
      "function getSlot0(bytes32 poolId) view returns (uint160,int24,uint24,uint24)",
    ]);
    const lookups = pairs.flatMap((pair) =>
      pair === nativeCurrency
        ? []
        : EXIT_CHECK_FEE_TIERS.map((fee) => ({
            pair,
            fee,
            to: registry.v3.address,
            data: encodeFunctionData({
              abi: factoryAbi,
              functionName: "getPool",
              args: [token as `0x${string}`, pair as `0x${string}`, fee],
            }),
          })),
    );
    const keys = pairs.flatMap((pair) =>
      [
        [100, 1],
        [500, 10],
        [3000, 60],
        [10000, 200],
        [2500, 25],
      ].map(([fee, tickSpacing]) => {
        const currencies = [token, pair].sort();
        const key = {
          currency0: currencies[0] as `0x${string}`,
          currency1: currencies[1] as `0x${string}`,
          fee: fee!,
          tickSpacing: tickSpacing!,
          hooks: nativeCurrency as `0x${string}`,
        };
        const poolId = poolIdFor(key);
        return {
          pair,
          key,
          poolId,
          to: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
          data: encodeFunctionData({
            abi: slotAbi,
            functionName: "getSlot0",
            args: [poolId],
          }),
        };
      }),
    );
    const values = await r.multicall([...lookups, ...keys], hex(anchor.number));
    const pools: Record<string, unknown>[] = [];
    lookups.forEach((lookup, i) => {
      try {
        const pool = decodeFunctionResult({
          abi: factoryAbi,
          functionName: "getPool",
          data: values[i] as `0x${string}`,
        }).toLowerCase();
        if (!/^0x0{40}$/.test(pool))
          pools.push({
            protocol: "v3",
            pool,
            pairToken: lookup.pair,
            fee: lookup.fee,
            t0: null,
          });
      } catch {
        /* An allowFailure entry stays unknown. */
      }
    });
    keys.forEach((lookup, i) => {
      try {
        const slot = decodeFunctionResult({
          abi: slotAbi,
          functionName: "getSlot0",
          data: values[lookups.length + i] as `0x${string}`,
        });
        if (slot[0] > 0n)
          pools.push({
            protocol: "v4",
            poolId: lookup.poolId,
            poolKey: lookup.key,
            pairToken: lookup.pair,
            t0: null,
          });
      } catch {
        /* An allowFailure entry stays unknown. */
      }
    });
    return {
      pools,
      checked: values.length,
      unavailable: values.filter((v) => v === null).length,
    };
  }
  private async discover(
    r: LaunchReader,
    anchor: Header,
    from: number,
  ): Promise<Discovery> {
    const rows: Scan[] = [],
      ranges: Record<string, unknown> = {};
    const scans = (["pons", "long", "launcher", "instant"] as const).map(
      (id) => ({
        id,
        cursor: anchor.number,
        failed: false,
        reason: undefined as string | undefined,
      }),
    );
    const budget = { remaining: caps.feedLogCalls as number };
    let partial = false;
    const eventBlocks = new Set<number>();
    for (let round = 0; round < 100; round++) {
      for (const scan of scans) {
        if (scan.cursor < from || scan.failed) continue;
        let page;
        try {
          page = await r.logWindow(
            registry[scan.id].address,
            [topic(scan.id)],
            from,
            scan.cursor,
            r.logWindowBlocks,
            budget,
            true,
            14,
          );
        } catch (error) {
          if (
            !(error instanceof AppError || error instanceof ReadCap) ||
            providerReason(error) === "HEADER_MISMATCH"
          )
            throw error;
          scan.failed = true;
          scan.reason = providerReason(error);
          partial = true;
          continue;
        }
        if (!page) continue;
        scan.cursor = page.from - 1;
        for (const log of [...page.logs].reverse()) {
          if (rows.length >= caps.feedEntries) {
            partial = true;
            break;
          }
          const block = quantity(log.blockNumber);
          let point: Point = {
            blockNumber: block,
            blockHash: log.blockHash,
            transactionHash: log.transactionHash,
            logIndex: quantity(log.logIndex),
            timestamp: "",
          };
          if (
            r.headers.has(block) ||
            (!eventBlocks.has(block) &&
              eventBlocks.size < 32 &&
              r.calls + r.documentCalls < r.maxCalls - 14)
          ) {
            eventBlocks.add(block);
            try {
              point = await r.point(log);
            } catch (error) {
              if (
                error instanceof AppError &&
                (error.details as { reason?: string })?.reason ===
                  "HEADER_MISMATCH"
              )
                throw error;
              partial = true;
            }
          }
          const launch = decodeLaunch(scan.id, log, point);
          if (!point.timestamp) {
            launch.t0 = null;
            launch.unknownReasons.t0 = "Time unknown; event block is listed";
            partial = true;
          }
          rows.push({ launch, log });
        }
      }
      if (
        scans.every((s) => s.cursor < from || s.failed) ||
        budget.remaining === 0 ||
        r.calls + r.documentCalls >= r.maxCalls - 14 ||
        rows.length >= caps.feedEntries
      )
        break;
    }
    for (const scan of scans) {
      const incomplete = scan.failed || scan.cursor >= from;
      partial ||= incomplete;
      ranges[scan.id] = {
        state: incomplete ? "partial" : "available",
        fromBlock: scan.cursor + 1,
        toBlock: anchor.number,
        requestedFromBlock: from,
        ...(incomplete ? { reason: scan.reason ?? "BUDGET_EXHAUSTED" } : {}),
      };
    }
    return {
      rows,
      partial,
      coverage: {
        adapters: ranges,
        requestedFromBlock: from,
        toBlock: anchor.number,
        partial,
        logCalls: caps.feedLogCalls - budget.remaining,
        windowBlocks: r.windowBlocks,
        eventHeaderCap: 32,
        eventHeaders: eventBlocks.size,
      },
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
      let logs: ChainLog[] = [];
      if (launch.adapter === "pons") {
        try {
          if (launch.pairToken !== nativeCurrency)
            throw unavailable("GRADUATION_UNKNOWN");
          const key = {
            currency0: nativeCurrency as `0x${string}`,
            currency1: launch.token as `0x${string}`,
            fee: 0,
            tickSpacing: 200,
            hooks: related.ponsHook,
          };
          const id = poolIdFor(key);
          if (await initialized(r, id, anchor.number)) {
            const block = await firstBlock(
              launch.created.blockNumber,
              anchor.number,
              (n) => initialized(r, id, n),
            );
            const graduates = await r.logs(
              launch.factory,
              [topic("graduation"), addressTopic(launch.token)],
              block,
              block,
            );
            if (graduates.length !== 1) throw unavailable("GRADUATION_UNKNOWN");
            const graduationReceipt = await r.receipt(
              graduates[0]!.transactionHash,
              anchor,
            );
            graduation = {
              point: await r.point(graduates[0]!),
              positionId: String(
                decode(graduates[0]!, "graduation").positionId,
              ),
            };
            logs = graduationReceipt.filter(
              (log) =>
                log.address.toLowerCase() === registry.v4.address &&
                log.topics[0] === topic("v4") &&
                log.topics[1] === id,
            );
            if (logs.length !== 1) throw unavailable("GRADUATION_UNKNOWN");
            const a = decode(logs[0]!, "v4");
            if (
              String(a.id).toLowerCase() !== id ||
              String(a.currency0).toLowerCase() !== key.currency0 ||
              String(a.currency1).toLowerCase() !== key.currency1 ||
              Number(a.fee) !== key.fee ||
              Number(a.tickSpacing) !== key.tickSpacing ||
              String(a.hooks).toLowerCase() !== key.hooks
            )
              throw unavailable("GRADUATION_UNKNOWN");
            tradingCoverage.graduation = {
              method: "state-view-binary-search",
              blockNumber: block,
            };
          } else {
            tradingPartial = true;
            launch.unknownReasons.graduation =
              "Graduation unknown for the reviewed PoolKey";
          }
        } catch (error) {
          if (!(error instanceof AppError || error instanceof ReadCap))
            throw error;
          graduation = null;
          logs = [];
          tradingPartial = true;
          launch.unknownReasons.graduation =
            error instanceof ReadCap
              ? "BUDGET_EXHAUSTED"
              : String(
                  (error.details as { reason?: string })?.reason ??
                    "GRADUATION_UNKNOWN",
                );
        }
      } else {
        const receipt =
          row.receipt ?? (await r.receipt(row.log.transactionHash, anchor));
        logs = receipt.filter(
          (log) =>
            log.address.toLowerCase() === registry.v4.address &&
            log.topics[0] === topic("v4"),
        );
        tradingCoverage.initialize = {
          method: "creation-receipt",
          blockNumber: launch.created.blockNumber,
        };
      }
      const expectedHooks =
        launch.adapter === "pons"
          ? [related.ponsHook]
          : [related.longPoolHook, launch.hook];
      for (const log of logs) {
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
          throw unavailable("POOL_KEY_MISMATCH");
        if (poolInitialize) throw unavailable("AMBIGUOUS_POOL"); // Ambiguous Initialize evidence.
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
        const receipt =
          row.receipt ?? (await r.receipt(row.log.transactionHash, anchor));
        for (const log of receipt.filter(
          (log) =>
            log.address.toLowerCase() === registry.v3.address &&
            log.topics[0] === topic("v3"),
        )) {
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
      const present = (n: number) =>
        liquid(
          r,
          launch.pool ?? registry.v4.address,
          v3 ? null : launch.poolId,
          n,
        );
      if (!(await present(anchor.number))) {
        launch.unknownReasons.t0 =
          "First liquidity unknown from historical pool state";
        tradingPartial = true;
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
      const block = await firstBlock(
        launch.created.blockNumber,
        anchor.number,
        present,
      );
      const scan = await r.range(
        v3 ? launch.pool! : registry.v4.address,
        v3 ? [topic("v3Mint")] : [topic("v4Liquidity"), launch.poolId],
        block,
        block,
        1,
      );
      tradingCoverage.firstLiquidity = {
        ...scan.coverage,
        method: "historical-liquidity-state",
        limits:
          "Historical liquidity can return to zero; this is the first observed state transition, not exhaustive pool history",
      };
      tradingPartial ||= scan.partial;
      // Historical state locates a candidate transition. Confirm a positive add
      // in that single block; missing evidence leaves trading start unknown.
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
    buyerSet?: Set<string>,
  ) {
    const start = Date.parse(t0.timestamp) / 1000,
      end = start + seconds;
    const after = await r.lowerBound(end + 1, anchor, t0.blockNumber);
    const scan = await r.range(
      token,
      [topic("transfer"), addressTopic(sender)],
      t0.blockNumber,
      Math.min(anchor.number, after - 1),
      chunks,
    );
    const rows: Transfer[] = [];
    let metadataCapped = false;
    const selected: ChainLog[] = [];
    let buyerCapped = false;
    for (const log of scan.logs) {
      const a = decode(log, "transfer"),
        recipient = String(a.to).toLowerCase();
      if (
        buyerSet &&
        BigInt(String(a.value)) > 0n &&
        !/^0x0{40}$/.test(recipient)
      ) {
        if (!buyerSet.has(recipient) && buyerSet.size >= caps.buyers) {
          buyerCapped = true;
          break;
        }
        buyerSet.add(recipient);
        if (buyerSet.size >= caps.buyers) buyerCapped = true;
      }
      selected.push(log);
    }
    await mapSix(selected, async (log) => {
      if (r.calls >= r.maxCalls - 2) {
        metadataCapped = true;
        return;
      }
      const p = await r.point(log),
        timestamp = Date.parse(p.timestamp) / 1000;
      if (timestamp < start || timestamp > end) return;
      const a = decode(log, "transfer");
      rows.push({
        from: String(a.from).toLowerCase(),
        to: String(a.to).toLowerCase(),
        value: BigInt(String(a.value)),
        transactionHash: p.transactionHash,
        blockNumber: p.blockNumber,
        timestamp,
      });
    });
    // Concurrent metadata fetches must not change event order.
    const order = new Map(
      selected.map((log, i) => [
        `${log.transactionHash}:${String(decode(log, "transfer").to).toLowerCase()}`,
        i,
      ]),
    );
    rows.sort(
      (a, b) =>
        (order.get(`${a.transactionHash}:${a.to}`) ?? 0) -
        (order.get(`${b.transactionHash}:${b.to}`) ?? 0),
    );
    return {
      rows,
      coverage: {
        ...scan.coverage,
        metadataCapped,
        ...(buyerSet
          ? {
              buyerCap: caps.buyers,
              buyerCapped,
              distinctBuyers: buyerSet.size,
            }
          : {}),
        decodedLogs: rows.length,
        fromTimestamp: t0.timestamp,
        toTimestamp: new Date(
          Math.min(anchor.seconds, end) * 1000,
        ).toISOString(),
        requestedEndTimestamp: new Date(end * 1000).toISOString(),
        ongoing: anchor.seconds < end,
      },
      partial:
        scan.partial || metadataCapped || buyerCapped || anchor.seconds < end,
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
    const distinctBuyers = new Set<string>();
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
        distinctBuyers,
      );
      const signers = new Map<string, string>(),
        nonces = new Map<string, number>();
      const hashes = [
        ...new Set(
          scan.rows
            .filter((t) => t.value > 0n && !/^0x0{40}$/.test(t.to))
            .map((t) => t.transactionHash),
        ),
      ];
      if (hashes.length > caps.transactions - transactionReads) partial = true;
      await mapSix(
        hashes.slice(0, Math.max(0, caps.transactions - transactionReads)),
        async (hash) => {
          transactionReads++;
          const transfer = scan.rows.find((t) => t.transactionHash === hash)!;
          const tx = await r.signer(hash, transfer.blockNumber);
          signers.set(hash, tx);
          if (
            scan.rows.some((t) => t.transactionHash === hash && t.to === tx)
          ) {
            if (nonceReads >= caps.nonces || transfer.blockNumber === 0) {
              partial = true;
              return;
            }
            nonceReads++;
            nonces.set(
              hash,
              quantity(
                await r.read("eth_getTransactionCount", [
                  tx,
                  hex(transfer.blockNumber - 1),
                ]),
              ),
            );
          }
        },
      );
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
        buyerCap: caps.buyers,
        distinctBuyers: distinctBuyers.size,
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
    const [total] = await Promise.all([
      this.uint(r, token, "0x18160ddd", anchor),
      mapSix(wallets.slice(0, caps.balances), async (wallet) => {
        const balance = await this.uint(
          r,
          token,
          `0x70a08231${wallet.slice(2).padStart(64, "0")}`,
          anchor,
        );
        if (balance !== null) balances.set(wallet, balance);
      }),
    ]);
    if (total === null || total === 0n)
      return unknown("totalSupply unavailable or zero");
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
    if (!launch.deployer)
      return unknown("Factory event does not identify a deployer or launcher");
    const tokens: { token: string; launchTime: string; factory: string }[] = [];
    const seen = new Set<string>(),
      cursors = new Set<string>();
    let cursor: Record<string, unknown> | undefined,
      pages = 0,
      confirmed = 0,
      partial = false;
    try {
      for (; pages < 4;) {
        const doc = (await r.explorer(() =>
          this.explorer.getAddressTransactionPage(launch.deployer!, cursor),
        )) as {
          items?: Record<string, unknown>[];
          next_page_params?: Record<string, unknown> | null;
        };
        pages++;
        if (!Array.isArray(doc.items) || doc.items.length > 50)
          throw unavailable("EXPLORER_UNAVAILABLE");
        await mapSix(doc.items, async (tx) => {
          const address = (v: unknown) =>
            typeof v === "string"
              ? v.toLowerCase()
              : String(
                  (v as { hash?: unknown } | null)?.hash ?? "",
                ).toLowerCase();
          if (address(tx.from) !== launch.deployer) return;
          const to = address(tx.to);
          const factories: string[] = [
            registry.pons.address,
            registry.long.address,
            related.longHistory,
            registry.launcher.address,
            registry.instant.address,
          ];
          if (!factories.includes(to) && !tx.created_contract) return;
          if (!isHash(tx.hash) || seen.has(tx.hash)) return;
          seen.add(tx.hash);
          if (
            confirmed >= caps.historyChunks ||
            r.calls + r.documentCalls >= r.maxCalls - 14
          ) {
            partial = true;
            return;
          }
          confirmed++;
          const receipt = await r.receipt(tx.hash, anchor);
          for (const earlier of await this.fromReceipt(r, receipt)) {
            const point = earlier.launch.created;
            if (
              earlier.launch.deployer !== launch.deployer ||
              earlier.launch.token === launch.token ||
              point.blockNumber > launch.created.blockNumber ||
              (point.blockNumber === launch.created.blockNumber &&
                point.logIndex >= launch.created.logIndex)
            )
              continue;
            if (!tokens.some((t) => t.token === earlier.launch.token))
              tokens.push({
                token: earlier.launch.token,
                launchTime: point.timestamp,
                factory: earlier.launch.factory,
              });
          }
        });
        if (partial || !doc.next_page_params) break;
        const key = JSON.stringify(doc.next_page_params);
        if (cursors.has(key)) {
          partial = true;
          break;
        }
        cursors.add(key);
        cursor = doc.next_page_params;
        if (pages === 4) partial = true;
      }
    } catch (error) {
      partial = true;
      return known(
        {
          count: tokens.length,
          launches: tokens,
          liquidityHistory: unknown(
            "Liquidity history is unknown in this version",
          ),
        },
        {
          pages,
          confirmed,
          reason:
            error instanceof AppError || error instanceof ReadCap
              ? providerReason(error)
              : "EXPLORER_UNAVAILABLE",
        },
        true,
      );
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
        method: "explorer-transactions-and-receipts",
        pages,
        confirmed,
        pageCap: 4,
        receiptCap: caps.historyChunks,
        ...(partial ? { reason: "BUDGET_EXHAUSTED" } : {}),
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
            : unknown(
                launch.unknownReasons.graduation ??
                  "Graduation unknown for the reviewed PoolKey",
              ),
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
