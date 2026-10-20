import { getAddress } from "viem";
import type {
  FundingLink,
  Json,
  LinkedHolder,
  LinkedWalletGraph,
} from "@rh-chain/shared";
import type { Env } from "../config/env.js";
import type { ProviderHttp } from "../chain/provider-http.js";
import type { RpcSpendBudget } from "../chain/robinhood-rpc.js";
import { JsonCache } from "../cache/service.js";
import type { ReceiptService } from "../receipts/service.js";
import { AppError } from "../http/errors.js";
import {
  LaunchReader,
  ReadCap,
  hex,
  isAddress,
  mapSix,
} from "../launches/reader.js";
import { LaunchCardsService } from "../launches/service.js";
import {
  createLinkedWalletsBudget,
  type LinkedWalletsBudget,
} from "./budget.js";
import {
  FundingExplorer,
  fundingCap,
  fundingFailure,
  type Funding,
} from "./explorer.js";
import { tokenFunding } from "./funding-logs.js";
import { fraction, groupHolders } from "./grouping.js";
import {
  hubRegistryVersion,
  reviewedHubs,
  methodVersion,
  limits,
} from "./registry.js";

type LaunchFacts = Omit<
  Awaited<ReturnType<LaunchCardsService["fundingFacts"]>>,
  "fundingHubs"
> & { fundingHubs?: string[] };
type Options = {
  budget?: LinkedWalletsBudget;
  rpc?: ProviderHttp;
  explorer?: ProviderHttp;
  rpcSpend?: RpcSpendBudget;
  receipts?: ReceiptService;
  now?: () => number;
  launchFacts?: (
    reader: LaunchReader,
    anchor: Awaited<ReturnType<LaunchReader["anchor"]>>,
    token: string,
  ) => Promise<LaunchFacts>;
};
export interface LinkedWalletsSource {
  graph(token: string): Promise<LinkedWalletGraph>;
}
const capError = fundingCap;
export class LinkedWalletsService implements LinkedWalletsSource {
  private readonly pending = new Map<string, Promise<LinkedWalletGraph>>();
  private readonly budget: LinkedWalletsBudget;
  private readonly now: () => number;
  constructor(
    private readonly env: Env,
    private readonly cache: JsonCache,
    private readonly options: Options = {},
  ) {
    this.budget = options.budget ?? createLinkedWalletsBudget(env);
    this.now = options.now ?? Date.now;
  }
  async graph(input: string): Promise<LinkedWalletGraph> {
    if (
      !this.env.LINKED_WALLETS_ENABLED ||
      !this.env.PRIVATE_MODE_ENABLED ||
      !this.env.OPSIS_WORKSPACES_ENABLED
    )
      throw new AppError("NOT_FOUND", 404, "Not found");
    if (!isAddress(input) || /^0x0{40}$/i.test(input))
      throw new AppError("INVALID_TOKEN", 400, "Enter a nonzero token address");
    try {
      getAddress(input);
    } catch {
      throw new AppError("INVALID_TOKEN", 400, "Invalid token address");
    }
    const token = input.toLowerCase();
    const existing = this.pending.get(token);
    if (existing) return { ...(await existing), servedFrom: "cache" };
    const promise = this.cached(token);
    this.pending.set(token, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(token);
    }
  }
  private async cached(token: string): Promise<LinkedWalletGraph> {
    const key = `linked-wallets:${methodVersion}:${hubRegistryVersion}:${this.env.ROBINHOOD_RPC_PROVIDER}:${token}:${this.env.LINKED_WALLETS_MAX_EXPLORER_CALLS}:${this.env.LINKED_WALLETS_MAX_RPC_CALLS}:${this.env.LINKED_WALLETS_WALLET_PAGE_CAP}:${this.env.LINKED_WALLETS_FUNDING_HOLDERS}:${this.env.LINKED_WALLETS_CACHE_SECONDS}:${this.env.RECEIPTS_ENABLED}`;
    const cached = await this.cache.get<LinkedWalletGraph>(key);
    if (cached && Date.parse(cached.expiresAt) > this.now())
      return { ...cached, servedFrom: "cache" };
    const result = await this.compute(token);
    // Live graphs are normally partial (only the top holders get funding checks) and cost the
    // same explorer credits, so partial results are cached too. A graph without a holder list
    // (an explorer failure) is cached only briefly so a transient outage clears quickly.
    const window = this.env.LINKED_WALLETS_CACHE_SECONDS;
    const ttl = result.holders.length === 0 ? Math.min(60, window) : window;
    const stored =
      ttl === window
        ? result
        : {
            ...result,
            expiresAt: new Date(Date.parse(result.observedAt) + ttl * 1000).toISOString(),
          };
    await this.cache.set(key, stored, ttl);
    return stored;
  }
  private async compute(token: string): Promise<LinkedWalletGraph> {
    const start = this.now();
    // Reserve the final anchor recheck before optional work can exhaust the
    // daily ledger. Actual RPCs retain the account-wide provider spend fuse.
    await this.budget.consume(1);
    let finalizing = false;
    const r = new LaunchReader(
      this.env,
      {
        consume: async (n) => {
          if (!finalizing) {
            if (this.now() - start >= 25_000)
              throw new ReadCap("Observation time cap reached");
            await this.budget.consume(n);
          }
        },
      },
      this.env.LINKED_WALLETS_MAX_RPC_CALLS,
      this.now,
      this.options.rpc,
      this.options.rpcSpend,
    );
    r.deadline = start + 25_000;
    r.ceiling = start + 30_000;
    const anchor = await r.anchor();
    const explorer = new FundingExplorer(
      this.env,
      {
        consume: async (n) => {
          if (this.now() - start >= 20_000)
            throw new ReadCap("Explorer time cap reached");
          await this.budget.consume(n);
        },
      },
      this.now,
      this.options.explorer,
    );
    const reasons = new Set<string>();
    const notChecked = new Map<string, string>();
    let holderListComplete = false;
    let candidates: Awaited<ReturnType<FundingExplorer["holders"]>>["holders"] =
      [];
    try {
      const found = await explorer.holders(token);
      candidates = found.holders;
      holderListComplete = found.complete;
    } catch (error) {
      reasons.add(
        capError(error)
          ? "Holder list not checked (cap)"
          : "Holder list unavailable",
      );
    }
    if (!holderListComplete) reasons.add("Top-holder selection incomplete");
    let supply: bigint | null = null;
    const uint = async (data: string): Promise<bigint | null> => {
      const raw = await r.read(
        "eth_call",
        [{ to: token, data }, hex(anchor.number)],
        true,
      );
      return typeof raw === "string" && /^0x[0-9a-f]{64}$/i.test(raw)
        ? BigInt(raw)
        : null;
    };
    try {
      supply = await uint("0x18160ddd");
    } catch (error) {
      reasons.add(
        capError(error) ? "Supply not checked (cap)" : "Supply unavailable",
      );
    }
    if (!supply) {
      supply = null;
      reasons.add("Supply unavailable or zero");
    }
    const holders: LinkedHolder[] = [],
      excluded: LinkedWalletGraph["excluded"] = [];
    const balances = await mapSix(candidates, async (candidate) => {
      const row: LinkedHolder = {
        wallet: candidate.wallet,
        balanceRaw: null,
        share: null,
        funding: "not checked (cap)",
      };
      try {
        const value = await uint(
          `0x70a08231${candidate.wallet.slice(2).padStart(64, "0")}`,
        );
        row.balanceRaw = value?.toString() ?? null;
        row.share = value === null ? null : fraction(value, supply);
      } catch (error) {
        reasons.add(
          capError(error) ? "Balance read cap reached" : "Balance unavailable",
        );
      }
      if (row.balanceRaw === null) {
        notChecked.set(row.wallet, "Anchor balance not checked");
        reasons.add("Anchor balance not checked");
      }
      return { row, excludedReason: candidate.excluded };
    });
    for (const { row, excludedReason } of balances) {
      if (excludedReason) excluded.push({ ...row, reason: excludedReason });
      else holders.push(row);
    }
    const sums = [...holders, ...excluded]
      .filter((h) => h.balanceRaw !== null)
      .reduce((n, h) => n + BigInt(h.balanceRaw!), 0n);
    if (supply !== null && sums > supply)
      throw new AppError(
        "LINKED_WALLETS_REFUSED",
        503,
        "Holder balances exceed supply at the anchor",
      );
    let launch: LaunchFacts = { transactions: [], buys: [], partial: true };
    let launchState: LinkedWalletGraph["coverage"]["launchFacts"] = "checked";
    try {
      launch = await (
        this.options.launchFacts ??
        ((reader, block, address) =>
          new LaunchCardsService(this.env, this.cache, {
            explorerHttp: explorer.launchHttp,
            now: this.now,
          }).fundingFacts(reader, block, address))
      )(r, anchor, token);
      if (launch.partial) {
        launchState = "partial";
        reasons.add("Launch facts partial or unavailable in bounded scan");
      }
    } catch (error) {
      launchState = capError(error) ? "not checked (cap)" : "unavailable";
      reasons.add(`Launch facts ${launchState}`);
    }
    const knownHubs = new Set([...reviewedHubs, ...(launch.fundingHubs ?? [])]);
    const funding: Funding[] = [];
    const selected = holders
      .filter((h) => h.balanceRaw !== null && !knownHubs.has(h.wallet))
      .sort((a, b) => {
        const av = BigInt(a.balanceRaw ?? "0"),
          bv = BigInt(b.balanceRaw ?? "0");
        return av === bv ? a.wallet.localeCompare(b.wallet) : av > bv ? -1 : 1;
      })
      .slice(0, this.env.LINKED_WALLETS_FUNDING_HOLDERS);
    const selectedSet = new Set(selected.map((h) => h.wallet));
    for (const holder of holders) {
      if (selectedSet.has(holder.wallet)) continue;
      if (holder.balanceRaw === null && !knownHubs.has(holder.wallet)) continue;
      const reason = knownHubs.has(holder.wallet)
        ? "not checked (known hub)"
        : `not checked (beyond top ${this.env.LINKED_WALLETS_FUNDING_HOLDERS})`;
      holder.funding = knownHubs.has(holder.wallet)
        ? "not checked (known hub)"
        : "not checked (beyond top N)";
      notChecked.set(holder.wallet, reason);
    }
    // Four wallet workers bound explorer concurrency; production transport also
    // uses the shared account-wide explorer rate/credit gate (at most 5/s).
    let next = 0;
    let stopFunding: string | undefined;
    await Promise.all(
      Array.from({ length: Math.min(4, selected.length) }, async () => {
        while (next < selected.length) {
          const holder = selected[next++]!;
          if (stopFunding) {
            notChecked.set(holder.wallet, `not checked (cap): ${stopFunding}`);
            continue;
          }
          try {
            const result = await explorer.firstFunding(
              holder.wallet,
              anchor.number,
            );
            if (result.capped) {
              notChecked.set(
                holder.wallet,
                "not checked (cap): oldest native pages contain no inbound value",
              );
              reasons.add("Oldest native funding pages incomplete");
            } else {
              const found =
                result.funding ??
                (await tokenFunding(
                  r,
                  token,
                  holder.wallet,
                  anchor.number,
                  this.env.LINKED_WALLETS_WALLET_PAGE_CAP,
                ));
              holder.funding = "checked";
              if (found) funding.push(found);
            }
          } catch (error) {
            const capped = capError(error);
            const detail = fundingFailure(error);
            holder.funding = capped ? "not checked (cap)" : "unavailable";
            notChecked.set(holder.wallet, `${holder.funding}: ${detail}`);
            reasons.add(
              capped
                ? "Funding read budget or cap reached"
                : "Funding evidence unavailable",
            );
            // A wallet's bounded log scan does not stop the other wallets.
            if (
              capped &&
              !(error instanceof ReadCap && /Token funding/.test(error.message))
            )
              stopFunding = detail;
          }
        }
      }),
    );
    funding.sort((a, b) => a.to.localeCompare(b.to));
    const observed = new Map<string, Set<string>>();
    for (const transfer of [...explorer.observed, ...funding]) {
      const recipients = observed.get(transfer.from) ?? new Set<string>();
      recipients.add(transfer.to);
      observed.set(transfer.from, recipients);
    }
    const hubs: LinkedWalletGraph["hubs"] = [];
    const hubSet = new Set(knownHubs);
    const unclassified = new Set<string>();
    // Classify every endpoint, including signers and recipients. Hub endpoints
    // never connect through either strong rule.
    const holderAddresses = new Set(holders.map((h) => h.wallet));
    const relevantMulti = launch.transactions.filter((tx) =>
      tx.recipients.some((wallet) => holderAddresses.has(wallet)),
    );
    const endpoints = new Set([
      ...holders
        .filter((h) => selectedSet.has(h.wallet) || knownHubs.has(h.wallet))
        .map((h) => h.wallet),
      ...funding.map((f) => f.from),
      ...relevantMulti.flatMap((tx) => [
        tx.signer,
        ...tx.recipients.filter((wallet) => holderAddresses.has(wallet)),
      ]),
    ]);
    await mapSix([...endpoints].sort(), async (wallet) => {
      const fanOut = observed.get(wallet)?.size ?? 0;
      if (knownHubs.has(wallet) || fanOut > 50) {
        hubSet.add(wallet);
        hubs.push({
          wallet,
          reason: fanOut > 50 ? "fan_out" : "registry",
          fanOut,
        });
        return;
      }
      try {
        const code = await r.read("eth_getCode", [wallet, hex(anchor.number)]);
        if (typeof code !== "string" || !/^0x(?:[0-9a-f]{2})*$/i.test(code))
          throw new Error("Invalid code");
        if (code !== "0x") {
          hubSet.add(wallet);
          hubs.push({ wallet, reason: "contract", fanOut });
        }
      } catch (error) {
        unclassified.add(wallet);
        reasons.add(
          capError(error)
            ? "Hub classification not checked (cap)"
            : "Hub classification unavailable",
        );
      }
    });
    hubs.sort((a, b) => a.wallet.localeCompare(b.wallet));
    for (const wallet of unclassified) {
      if (holderAddresses.has(wallet) && !notChecked.has(wallet))
        notChecked.set(wallet, "Hub classification not checked");
    }
    const strong: FundingLink[] = [],
      weakLinks: FundingLink[] = [];
    const eligible = new Set(holders.map((h) => h.wallet));
    const excludedSet = new Set(excluded.map((h) => h.wallet));
    const uncheckedFunding = new Set(
      holders.filter((h) => h.funding !== "checked").map((h) => h.wallet),
    );
    for (const f of funding) {
      if (unclassified.has(f.from) || unclassified.has(f.to)) {
        notChecked.set(f.to, "Hub classification not checked");
        continue;
      }
      if (
        !uncheckedFunding.has(f.from) &&
        !uncheckedFunding.has(f.to) &&
        !hubSet.has(f.from) &&
        !hubSet.has(f.to) &&
        !excludedSet.has(f.from)
      )
        strong.push({
          from: f.from,
          to: f.to,
          kind: "first_funding",
          transactionHashes: [f.transactionHash],
        });
    }
    // Shared hub funding is weak even when all 100 recipients share it.
    for (let i = 0; i < funding.length; i++)
      for (let j = i + 1; j < funding.length; j++) {
        const a = funding[i]!,
          b = funding[j]!;
        if (a.from === b.from && hubSet.has(a.from))
          weakLinks.push({
            from: a.to,
            to: b.to,
            via: a.from,
            kind: "shared_hub",
            transactionHashes: [
              ...new Set([a.transactionHash, b.transactionHash]),
            ],
          });
      }
    for (const tx of launch.transactions)
      for (const recipient of tx.recipients) {
        if (
          uncheckedFunding.has(recipient) ||
          uncheckedFunding.has(tx.signer) ||
          !eligible.has(recipient) ||
          recipient === tx.signer ||
          excludedSet.has(tx.signer) ||
          hubSet.has(tx.signer) ||
          hubSet.has(recipient) ||
          unclassified.has(tx.signer) ||
          unclassified.has(recipient)
        )
          continue;
        strong.push({
          from: tx.signer,
          to: recipient,
          kind: "same_signer_multi_buy",
          transactionHashes: [tx.transactionHash],
        });
      }
    for (let i = 0; i < launch.buys.length; i++)
      for (let j = i + 1; j < launch.buys.length; j++) {
        const a = launch.buys[i]!,
          b = launch.buys[j]!;
        if (
          a.wallet !== b.wallet &&
          eligible.has(a.wallet) &&
          eligible.has(b.wallet) &&
          a.timestamp === b.timestamp
        )
          weakLinks.push({
            from: a.wallet,
            to: b.wallet,
            kind: "same_second",
            transactionHashes: [
              ...new Set([a.transactionHash, b.transactionHash]),
            ],
          });
      }
    const grouped = groupHolders(holders, strong, hubSet, supply);
    if (grouped.cappedLinks.length) reasons.add("Large group cap reached");
    // Launch discovery has a shorter caller deadline than the explorer transport.
    // Finish admitted attempts before freezing coverage and receipt accounting.
    await explorer.settle();
    finalizing = true;
    try {
      await r.recheck(anchor);
    } catch {
      throw new AppError(
        "LINKED_WALLETS_ANCHOR_CHANGED",
        503,
        "Anchor could not be reverified; observation refused",
      );
    }
    if (this.now() < start || this.now() - start >= 30_000)
      throw new AppError(
        "LINKED_WALLETS_REFUSED",
        503,
        "Observation exceeded its time bound",
      );
    const known = holders
      .filter((h) => h.share !== null)
      .sort((a, b) => (BigInt(a.balanceRaw!) > BigInt(b.balanceRaw!) ? -1 : 1));
    const result: LinkedWalletGraph = {
      schemaVersion: 1,
      chainId: 4663,
      token,
      state: reasons.size ? "partial" : "finished",
      servedFrom: "fresh",
      observedAt: new Date(start).toISOString(),
      expiresAt: new Date(
        start + this.env.LINKED_WALLETS_CACHE_SECONDS * 1000,
      ).toISOString(),
      anchor: {
        blockNumber: anchor.number,
        blockHash: anchor.hash,
        timestamp: new Date(anchor.seconds * 1000).toISOString(),
      },
      methodVersion,
      registryVersion: hubRegistryVersion,
      holders,
      excluded,
      ...grouped,
      weakLinks,
      hubs,
      notChecked: [...notChecked].map(([wallet, reason]) => ({
        wallet,
        reason,
      })),
      totals: {
        largestGroup: holders.every((h) => h.share !== null)
          ? (grouped.groups[0]?.share ?? null)
          : null,
        largestSingleWallet: holders.every((h) => h.share !== null)
          ? (known[0]?.share ?? null)
          : null,
      },
      coverage: {
        explorerCalls: explorer.calls,
        explorerCreditsReserved: explorer.calls * 50,
        rpcCalls: r.calls,
        holderSelection: "explorer latest, not block-pinned",
        holderListComplete,
        launchFacts: launchState,
        reasons: [...reasons],
      },
      limits,
    };
    if (!this.env.RECEIPTS_ENABLED) return result;
    if (!this.options.receipts)
      throw new AppError(
        "RECEIPTS_UNAVAILABLE",
        503,
        "Receipt evidence unavailable",
      );
    try {
      const receipt = await this.options.receipts.issue({
        tool: "linkedWallets",
        inputs: { token },
        chainId: 4663,
        block: {
          number: String(anchor.number),
          hash: anchor.hash as `0x${string}`,
          timestamp: result.anchor.timestamp,
        },
        rpcCalls: r.evidence.rpcCalls,
        sources: [...r.evidence.sources, ...explorer.evidence.sources],
        outputs: result as unknown as Json,
        labelsetVersion: methodVersion,
      });
      return { ...result, receipt };
    } catch {
      throw new AppError("RECEIPTS_UNAVAILABLE", 503, "Receipt unavailable");
    }
  }
}
