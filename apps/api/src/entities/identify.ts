import { z } from "zod";
import type { ChainEntityType } from "@rh-chain/shared";

export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const txHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export function identifyEntity(input: string): { type: ChainEntityType; value: string } {
  const value = input.trim();
  if (txHashSchema.safeParse(value).success) return { type: "transaction", value: value.toLowerCase() };
  if (evmAddressSchema.safeParse(value).success) return { type: "wallet", value: value.toLowerCase() };
  if (/^\d+$/.test(value)) return { type: "block", value };
  return { type: "unknown", value };
}
