import { z } from "zod";

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase());
const amount = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine(
    (value) =>
      /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < 2n ** 256n,
  );
export const ruleSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("transfer_above"),
      watchedAddress: addressSchema,
      params: z.object({ token: addressSchema, amount }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("approval_unverified"),
      watchedAddress: addressSchema,
      params: z.object({}).strict(),
    })
    .strict(),
  // The command's amount is explicitly token0 raw units, never a USD amount.
  z
    .object({
      type: z.literal("large_swap"),
      watchedAddress: addressSchema,
      params: z.object({ amount, tokenSide: z.literal(0) }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("multiplier_scheduled"),
      watchedAddress: addressSchema,
      params: z.object({}).strict(),
    })
    .strict(),
]);
export type RuleInput = z.infer<typeof ruleSchema>;
export type AlertRule = RuleInput & {
  id: string;
  deliveryChannel: "telegram";
  deliveryRef: string;
  deliveryHmac: string;
  cooldown: number;
  createdAt: Date;
  expiresAt: Date;
  lastFiredAt: Date | null;
  lastObservedMultiplier: string | null;
  multiplierObservedAt: Date | null;
  lastMultiplierBlockNumber: bigint | null;
  lastMultiplierBlockHash: string | null;
};
export type BlockMode = "safe" | "latest";
export type Anchor = { number: bigint; hash: string };
export type Event = Anchor & {
  tx: string;
  logIndex: number;
  token: string;
  amount: string;
} & (
    | { type: "transfer_above"; from: string; to: string }
    | {
        type: "approval_unverified";
        owner: string;
        spender: string;
        verification: "verified" | "unverified" | "unknown";
      }
    | { type: "large_swap"; pool: string }
    | { type: "multiplier_scheduled"; previous: string | null }
  );
export type Match = { token: string; amount: string; detail: string };
export function matchRule(rule: RuleInput, event: Event): Match | null {
  if (rule.type !== event.type) return null;
  if (
    rule.type === "transfer_above" &&
    event.type === rule.type &&
    rule.params.token === event.token &&
    (event.from === rule.watchedAddress || event.to === rule.watchedAddress) &&
    BigInt(event.amount) > BigInt(rule.params.amount)
  )
    return {
      token: event.token,
      amount: event.amount,
      detail: "ERC-20 transfer; raw token units",
    };
  if (
    rule.type === "approval_unverified" &&
    event.type === rule.type &&
    event.owner === rule.watchedAddress &&
    BigInt(event.amount) > 0n &&
    event.verification !== "verified"
  )
    return {
      token: event.token,
      amount: event.amount,
      detail:
        event.verification === "unknown"
          ? `ERC-20 approval to ${event.spender}; verification unknown`
          : `ERC-20 approval to ${event.spender}; explorer does not report source-verified code`,
    };
  if (
    rule.type === "large_swap" &&
    event.type === rule.type &&
    event.pool === rule.watchedAddress &&
    BigInt(event.amount) > BigInt(rule.params.amount)
  )
    return {
      token: event.token,
      amount: event.amount,
      detail: "Uniswap v3 swap; token0 raw units",
    };
  if (
    rule.type === "multiplier_scheduled" &&
    event.type === rule.type &&
    event.token === rule.watchedAddress &&
    event.previous !== null &&
    event.previous !== event.amount
  )
    return {
      token: event.token,
      amount: event.amount,
      detail: `newUIMultiplier changed from ${event.previous}; raw multiplier units`,
    };
  return null;
}
export type Delivery = {
  id: string;
  ruleId: string;
  eventKey: string;
  blockNumber: bigint;
  blockHash: string;
  mode: BlockMode;
  payload: Match & { tx: string | null };
  state: "pending" | "sent" | "orphaned" | "corrected" | "skipped";
};
export function eventKey(event: Event): string {
  return event.type === "multiplier_scheduled"
    ? `multiplier:${event.number}:${event.amount}`
    : `${event.tx}:${event.logIndex}`;
}
