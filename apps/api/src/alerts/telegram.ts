import { escapeText } from "../cards/render.js";
import { TelegramBuckets, type BotApiClient } from "../telegram/service.js";
import type { AlertRule, Delivery } from "./rules.js";
import { ruleSchema } from "./rules.js";
import type { AlertStore } from "./store.js";
import { AlertCrypto } from "./crypto.js";
export function formatDelivery(
  rule: AlertRule,
  delivery: Delivery,
  explorer: string,
  correction = false,
): string {
  const mode = delivery.mode === "safe" ? "safe block" : "latest";
  const gap = delivery.eventKey.startsWith("gap:");
  const lines = gap
    ? [`Rule ${rule.id}`, delivery.payload.detail]
    : correction
      ? [
          `Correction for rule ${rule.id}: block ${delivery.blockNumber} was replaced. The earlier observation is no longer canonical.`,
        ]
      : [
          `Rule ${rule.id}: ${rule.type}`,
          `Token ${delivery.payload.token}`,
          `Amount ${delivery.payload.amount}`,
          delivery.payload.detail,
        ];
  lines.push(
    `Block ${delivery.blockNumber}; mode ${mode}`,
    "Not investment advice",
  );
  const text = lines.map((line) => `<code>${escapeText(line)}</code>`);
  if (gap) return text.join("\n");
  if (delivery.payload.tx)
    text.push(
      `<a href="${escapeText(`${new URL(explorer).origin}/tx/${delivery.payload.tx}`)}">Explorer transaction</a>`,
    );
  else
    text.push(
      `<a href="${escapeText(`${new URL(explorer).origin}/block/${delivery.blockNumber}`)}">Explorer block (scheduled multiplier read; no transaction observed)</a>`,
    );
  return text.join("\n");
}
export interface AlertSender {
  reserve(rule: AlertRule): boolean;
  send(rule: AlertRule, text: string): Promise<void>;
}
export class TelegramAlertSender implements AlertSender {
  constructor(
    private readonly crypto: AlertCrypto,
    private readonly client: BotApiClient,
    private readonly dispatch: TelegramBuckets,
  ) {}
  private chat(rule: AlertRule): number {
    const reference = this.crypto.decrypt(rule.deliveryRef);
    if (
      !/^-?[1-9][0-9]{0,15}$/.test(reference) ||
      !Number.isSafeInteger(Number(reference))
    )
      throw new Error("ALERTS_REFERENCE_INVALID");
    return Number(reference);
  }
  reserve(rule: AlertRule) {
    const chat = this.chat(rule);
    return this.dispatch.take(chat, chat < 0);
  }
  async send(rule: AlertRule, text: string) {
    if (text.length > 4096) throw new Error("ALERTS_MESSAGE_TOO_LONG");
    await this.client.sendMessage({
      chat_id: this.chat(rule),
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }
}
export class AlertCommands {
  private readonly creation: TelegramBuckets;
  constructor(
    private readonly store: AlertStore,
    secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.creation = new TelegramBuckets(secret, () => now().getTime());
  }
  accepts(text: string): boolean {
    return /^\/alerts?(?:@[A-Za-z][A-Za-z0-9_]{4,31})?(?:\s|$)/.test(text);
  }
  async execute(text: string, chat: number, group: boolean): Promise<string> {
    const [command, ...args] = text.trim().split(/\s+/);
    const verb = command?.split("@")[0];
    const reference = String(chat);
    try {
      if (verb === "/alerts") {
        if (args.length === 0) {
          const rows = await this.store.list(reference, this.now());
          return rows.length
            ? rows
                .map(
                  (row) =>
                    `${row.id}: ${row.type}; expires ${row.expiresAt.toISOString()}`,
                )
                .join("\n")
            : "No active alert rules.";
        }
        if (args.length === 1 && args[0] === "delete-my-data") {
          await this.store.remove(reference);
          return "Alert data for this chat deleted, including delivery records.";
        }
        if (
          args.length === 2 &&
          args[0] === "stop" &&
          /^(all|[a-zA-Z0-9_-]{1,80})$/.test(args[1]!)
        ) {
          const count = await this.store.remove(
            reference,
            args[1] === "all" ? undefined : args[1],
          );
          return `${count} alert rule(s) deleted.`;
        }
      }
      if (verb === "/alert") {
        // Telegram accounts plus chat/group admission and dispatch caps replace PoW.
        if (!this.creation.take(chat, group))
          return "Alert creation rate limit reached. Try again later.";
        const [kind, first, second, third] = args;
        let input: unknown;
        if (kind === "transfer" && args.length === 4)
          input = {
            type: "transfer_above",
            watchedAddress: second,
            params: { token: first, amount: third },
          };
        if (kind === "approval" && args.length === 2)
          input = {
            type: "approval_unverified",
            watchedAddress: first,
            params: {},
          };
        if (kind === "swap" && args.length === 3)
          input = {
            type: "large_swap",
            watchedAddress: first,
            params: { amount: second, tokenSide: 0 },
          };
        if (kind === "multiplier" && args.length === 2)
          input = {
            type: "multiplier_scheduled",
            watchedAddress: first,
            params: {},
          };
        const parsed = ruleSchema.safeParse(input);
        if (!parsed.success)
          return "Invalid alert. Use complete addresses and integer raw token amounts. Swap amounts use token0 units.";
        const row = await this.store.create(parsed.data, reference, this.now());
        return `Alert rule ${row.id} created; expires ${row.expiresAt.toISOString()}. ${row.type === "large_swap" ? "Threshold: token0 raw units. " : ""}Not investment advice`;
      }
      return "Commands: /alert transfer <token> <address> <amount>; /alert approval <address>; /alert swap <pool> <amount>; /alert multiplier <stock-token>; /alerts; /alerts stop <id|all>; /alerts delete-my-data; /privacy en; /privacy zh";
    } catch (error) {
      return error instanceof Error && error.message === "ALERTS_RULE_LIMIT"
        ? "Limit: 3 active alert rules per chat, including groups."
        : error instanceof Error &&
            ["REDIS_EVICTION_POLICY", "REDIS_PERSISTENCE_OFF"].includes(error.message)
          ? `Alerts degraded: ${error.message}. New rules are unavailable; existing rules can still be listed or deleted.`
          : error instanceof Error && error.message === "ALERTS_CAPACITY_STOP"
            ? "Alerts are at the global 1,000-rule limit. Try again after a rule expires or is deleted."
            : "Alert command unavailable. No provider read was requested.";
    }
  }
}
