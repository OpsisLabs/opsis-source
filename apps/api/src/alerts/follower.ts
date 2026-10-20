import type { AlertStore } from "./store.js";
import {
  eventKey,
  matchRule,
  type AlertRule,
  type Anchor,
  type BlockMode,
  type Event,
} from "./rules.js";
import type { AlertLease, AlertProgress } from "./guards.js";
import {
  AlertRangeError,
  alertLogFilters,
  type AlertSource,
} from "./source.js";
import { formatDelivery, type AlertSender } from "./telegram.js";
import { observeAlert } from "../observability/metrics.js";
export type FollowerOptions = {
  enabled: boolean;
  mode: BlockMode;
  explorer: string;
  pollMs?: number;
  maxBlocks?: number;
  dailyCallBudget?: number;
  now?: () => Date;
};
let processFollower: AlertFollower | undefined;
export class AlertFollower {
  private chunk: number;
  private owned = false;
  private busy = false;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private nextPoll = 0;
  private failures = 0;
  stopReason: string | null = null;
  readonly counters = {
    polls: 0,
    lag: 0,
    deliveries: 0,
    duplicates: 0,
    budgetStops: 0,
  };
  constructor(
    private readonly options: FollowerOptions,
    private readonly store: AlertStore,
    private readonly source: AlertSource,
    private readonly lease: AlertLease,
    private readonly progress: AlertProgress,
    private readonly sender: AlertSender,
  ) {
    this.chunk = options.maxBlocks ?? 50_000;
    if (!Number.isInteger(this.chunk) || this.chunk < 1 || this.chunk > 50_000)
      throw new Error("ALERTS_RANGE_INVALID");
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }
  async checkLease() {
    if (!this.owned || !(await this.lease.renew())) {
      this.owned = false;
      throw new Error("ALERTS_LEASE_LOST");
    }
  }
  private count(name: "polls" | "deliveries" | "duplicates" | "budgetStops") {
    this.counters[name]++;
    observeAlert(name);
  }
  start(): boolean {
    if (!this.options.enabled || this.running || processFollower) return false;
    processFollower = this;
    this.running = true;
    const run = async () => {
      await this.poll();
      if (this.running)
        this.timer = setTimeout(
          () => void run(),
          this.stopReason ? 60_000 : (this.options.pollMs ?? 3000),
        );
      else {
        this.running = false;
        if (processFollower === this) processFollower = undefined;
      }
    };
    void run();
    return true;
  }
  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    // Let an in-flight poll finish before dependencies close.
    while (this.busy) await new Promise((resolve) => setTimeout(resolve, 10));
    if (this.owned) {
      await this.lease.release();
      this.owned = false;
    }
    if (processFollower === this) processFollower = undefined;
  }
  async poll(): Promise<void> {
    if (
      !this.options.enabled ||
      this.busy ||
      (!this.stopReason && this.now().getTime() < this.nextPoll)
    )
      return;
    this.busy = true;
    try {
      if (!this.owned) this.owned = await this.lease.acquire();
      if (!this.owned) return;
      await this.checkLease();
      await this.store.cleanup(this.now());
      const rules = await this.store.active(this.now());
      if (!rules.length) return;
      const journal = await this.store.events();
      // Gap notices concern our coverage, not a chain observation. Deliver them
      // without RPC, including after a source-budget stop.
      for (const delivery of journal) {
        if (
          !delivery.eventKey.startsWith("gap:") ||
          delivery.state !== "pending"
        )
          continue;
        const live = await this.store.get(delivery.ruleId, this.now());
        if (!live || !this.sender.reserve(live)) continue;
        await this.checkLease();
        if (!(await this.store.claim(delivery, this.now()))) continue;
        await this.checkLease();
        await this.sender.send(
          live,
          formatDelivery(live, delivery, this.options.explorer),
        );
        this.count("deliveries");
      }
      if (this.stopReason) return;
      this.count("polls");
      const target = await this.source.block(this.options.mode);
      const saved = await this.progress.load(this.options.mode);
      let multiplierAt = saved?.multiplierAt;
      let gap = saved?.gap;
      let cursor = saved ? BigInt(saved.cursor) : target.number - 1n;
      let recent = saved?.recent ?? [];
      const checks = new Map<string, Anchor>();
      const canonical = async (number: bigint) => {
        const key = String(number);
        if (!checks.has(key)) {
          await this.checkLease();
          checks.set(key, await this.source.block(number));
        }
        return checks.get(key)!;
      };
      let reorg = false;
      if (this.options.mode === "latest")
        for (const block of recent) {
          if ((await canonical(BigInt(block.number))).hash !== block.hash) {
            cursor =
              cursor < BigInt(block.number)
                ? cursor
                : BigInt(block.number) - 1n;
            reorg = true;
          }
        }
      for (const rule of rules)
        if (
          rule.type === "multiplier_scheduled" &&
          rule.lastMultiplierBlockNumber !== null &&
          rule.lastMultiplierBlockNumber <= target.number &&
          rule.lastMultiplierBlockHash &&
          (await canonical(rule.lastMultiplierBlockNumber)).hash !==
            rule.lastMultiplierBlockHash
        )
          reorg = true;
      // A mode switch does not discard earlier latest-mode correction obligations.
      for (const delivery of journal) {
        if (delivery.eventKey.startsWith("gap:")) continue;
        if (
          delivery.state !== "pending" &&
          delivery.state !== "sent" &&
          delivery.state !== "orphaned"
        )
          continue;
        if (
          this.options.mode === "safe" &&
          delivery.blockNumber > target.number
        )
          continue;
        const live = await this.store.get(delivery.ruleId, this.now());
        if (!live) continue;
        const changed =
          (await canonical(delivery.blockNumber)).hash !== delivery.blockHash;
        if (changed) {
          reorg = true;
          if (delivery.mode === "latest")
            cursor =
              cursor < delivery.blockNumber
                ? cursor
                : delivery.blockNumber - 1n;
          if (delivery.state === "pending") {
            await this.store.mark(delivery.id, "skipped");
            continue;
          }
          // Persist correction obligation before transport, including rate-limit deferral.
          if (delivery.state === "sent")
            await this.store.mark(delivery.id, "orphaned");
          if (!this.sender.reserve(live)) continue;
          await this.checkLease();
          if (!(await this.store.claimCorrection(delivery.id))) continue;
          await this.checkLease();
          await this.sender.send(
            live,
            formatDelivery(live, delivery, this.options.explorer, true),
          );
          this.count("deliveries");
          continue;
        }
        if (delivery.state !== "pending") continue;
        // Refresh immediately before dispatch, even if this block was checked above.
        await this.checkLease();
        if (
          (await this.source.block(delivery.blockNumber)).hash !==
          delivery.blockHash
        ) {
          await this.store.mark(delivery.id, "skipped");
          continue;
        }
        if (!this.sender.reserve(live)) continue;
        await this.checkLease();
        if (!(await this.store.claim(delivery, this.now()))) {
          await this.store.mark(delivery.id, "skipped");
          continue;
        }
        await this.checkLease();
        await this.sender.send(
          live,
          formatDelivery(live, delivery, this.options.explorer),
        );
        this.count("deliveries");
      }
      if (reorg)
        recent = recent.filter((block) => BigInt(block.number) <= cursor);
      if (reorg)
        for (const rule of rules)
          if (rule.type === "multiplier_scheduled")
            await this.store.observeMultiplier(rule.id, null, this.now());
      // A full catch-up must fit even its minimum filter/header call cost in one
      // daily budget. Actual calls remain reserved individually by the source.
      const logCalls = alertLogFilters(rules).length;
      // One tag read and two boundary checks per one-chunk poll. Event, journal
      // and enrichment reads still reserve their actual cost individually.
      const chunksPerDay = Math.floor(
        (this.options.dailyCallBudget ?? 10_000) / (logCalls + 3),
      );
      if (target.number - cursor > BigInt(this.chunk) * BigInt(chunksPerDay)) {
        const from = String(cursor + 1n),
          to = String(target.number);
        // Persist one deduplicated notice per affected rule before moving the cursor.
        // Restart/replay cannot lose the notice or repeat an accepted send attempt.
        for (const rule of rules) {
          await this.checkLease();
          if (!(await this.store.get(rule.id, this.now()))) continue;
          await this.store.enqueue({
            ruleId: rule.id,
            eventKey: `gap:${from}:${to}`,
            blockNumber: target.number,
            blockHash: target.hash,
            mode: this.options.mode,
            payload: {
              token: rule.watchedAddress,
              amount: "0",
              tx: null,
              detail: `Gap: blocks ${from}–${to} were not checked for alerts; the catch-up range exceeded the daily call budget. Delivery can be late or missed.`,
            },
          });
        }
        gap = { state: "gap" as const, from, to };
        cursor = target.number;
        recent = [];
        observeAlert("gaps");
      }
      const from = cursor + 1n;
      let to = from + BigInt(this.chunk) - 1n;
      if (to > target.number) to = target.number;
      const index = new Map<string, AlertRule[]>();
      for (const rule of rules) {
        const key = `${rule.type}:${rule.watchedAddress}`;
        index.set(key, [...(index.get(key) ?? []), rule]);
      }
      const enqueue = async (event: Event) => {
        if ((await canonical(event.number)).hash !== event.hash)
          throw new Error("ALERTS_REORG_RETRY");
        const addresses =
          event.type === "transfer_above"
            ? [event.from, event.to]
            : event.type === "approval_unverified"
              ? [event.owner]
              : event.type === "large_swap"
                ? [event.pool]
                : [event.token];
        const candidates = new Map(
          addresses.flatMap((address) =>
            (index.get(`${event.type}:${address}`) ?? []).map(
              (rule) => [rule.id, rule] as const,
            ),
          ),
        );
        for (const rule of candidates.values()) {
          const match = matchRule(rule, event);
          if (!match || !(await this.store.get(rule.id, this.now()))) continue;
          await this.checkLease();
          if (
            !(await this.store.enqueue({
              ruleId: rule.id,
              eventKey: eventKey(event),
              blockNumber: event.number,
              blockHash: event.hash,
              mode: this.options.mode,
              payload: {
                ...match,
                tx: event.type === "multiplier_scheduled" ? null : event.tx,
              },
            }))
          )
            this.count("duplicates");
        }
      };
      if (from <= to) {
        await this.checkLease();
        let events: Event[];
        for (;;) {
          try {
            events = await this.source.logs(rules, from, to);
            break;
          } catch (error) {
            if (!(error instanceof AlertRangeError) || to === from) throw error;
            const attempted = Number(to - from + 1n);
            this.chunk = Math.min(
              this.chunk,
              error.limit && error.limit < attempted
                ? error.limit
                : Math.max(1, Math.floor(attempted / 2)),
            );
            to = from + BigInt(this.chunk) - 1n;
            await this.checkLease();
          }
        }
        if (events.length > 1000) throw new Error("ALERTS_CAPACITY_STOP");
        const anchor = await this.source.block(to);
        for (const event of events) {
          if (event.number < from || event.number > to)
            throw new Error("ALERTS_RANGE_INVALID");
          await enqueue(event);
        }
        if ((await this.source.block(to)).hash !== anchor.hash)
          throw new Error("ALERTS_REORG_RETRY");
        cursor = to;
        recent.push({ number: String(to), hash: anchor.hash });
      }
      const dueMultipliers = rules.filter(
        (rule) =>
          rule.type === "multiplier_scheduled" &&
          (!rule.multiplierObservedAt ||
            this.now().getTime() - rule.multiplierObservedAt.getTime() >=
              60_000),
      );
      const runMultipliers =
        dueMultipliers.length > 0 &&
        (multiplierAt === undefined ||
          this.now().getTime() - multiplierAt >= 60_000);
      const multiplierValues = new Map<string, string>();
      if (runMultipliers) {
        // Persist the type-wide attempted cadence, including across restarts/failures.
        multiplierAt = this.now().getTime();
        await this.checkLease();
        await this.progress.save(this.options.mode, {
          cursor: String(cursor),
          recent: recent.slice(-32),
          multiplierAt,
          gap,
        });
      }
      for (const rule of runMultipliers ? dueMultipliers : []) {
        await this.checkLease();
        // Persist attempted cadence too: provider failures cannot create rapid retries.
        await this.store.observeMultiplier(
          rule.id,
          rule.lastObservedMultiplier,
          this.now(),
        );
        if (!multiplierValues.has(rule.watchedAddress))
          multiplierValues.set(
            rule.watchedAddress,
            await this.source.multiplier(rule.watchedAddress, target),
          );
        const value = multiplierValues.get(rule.watchedAddress)!;
        if ((await this.source.block(target.number)).hash !== target.hash)
          throw new Error("ALERTS_REORG_RETRY");
        await enqueue({
          type: "multiplier_scheduled",
          ...target,
          tx: target.hash,
          logIndex: 0,
          token: rule.watchedAddress,
          amount: value,
          previous: reorg ? null : rule.lastObservedMultiplier,
        });
        await this.store.observeMultiplier(rule.id, value, this.now(), target);
      }
      // Capacity is fail-closed rather than evicting dedupe/correction evidence.
      await this.store.events();
      await this.checkLease();
      await this.progress.save(this.options.mode, {
        cursor: String(cursor),
        recent: recent.slice(-32),
        multiplierAt,
        gap,
      });
      this.counters.lag = Number(
        target.number > cursor ? target.number - cursor : 0n,
      );
      observeAlert("lag", this.counters.lag);
      this.failures = 0;
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (
        /ALERTS_BUDGET_STOP|MONTHLY_BUDGET|GLOBAL_BUDGET|SPEND_GUARD|CAPACITY/.test(
          code,
        )
      ) {
        this.stopReason = /CAPACITY/.test(code) ? "capacity" : "budget";
        if (this.stopReason === "budget") this.count("budgetStops");
        observeAlert(
          "stop",
          1,
          this.stopReason === "capacity" ? "capacity" : "budget",
        );
        if (this.owned) {
          await this.lease.release().catch(() => undefined);
          this.owned = false;
        }
      } else {
        this.failures++;
        this.nextPoll =
          this.now().getTime() +
          Math.min(
            60_000,
            (this.options.pollMs ?? 3000) * 2 ** Math.min(this.failures - 1, 5),
          );
        observeAlert(
          "stop",
          1,
          code === "ALERTS_LEASE_LOST" ? "lease" : "provider",
        );
      }
    } finally {
      this.busy = false;
    }
  }
}
