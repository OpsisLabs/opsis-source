/** EIP-7702 designators are exactly 0xef0100 followed by one 20-byte address. */
export function delegationTarget(code: unknown): string | undefined {
  return typeof code === "string" && /^0xef0100[0-9a-f]{40}$/i.test(code)
    ? `0x${code.slice(8).toLowerCase()}`
    : undefined;
}
