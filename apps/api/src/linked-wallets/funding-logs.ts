import { toEventSelector } from "viem";
import { LaunchReader, ReadCap, quantity } from "../launches/reader.js";
import { events } from "../launches/registry.js";
import type { Funding } from "./explorer.js";

// Native-first method: when both native pages are empty, look for the earliest
// positive launched-token transfer, walking forwards without skipping gaps.
export async function tokenFunding(
  reader: LaunchReader,
  token: string,
  wallet: string,
  anchor: number,
  maxCalls: number,
): Promise<Funding | null> {
  const budget = { remaining: maxCalls };
  const topics = [
    toEventSelector(events.transfer),
    null,
    `0x${wallet.slice(2).padStart(64, "0")}`,
  ];
  let cursor = 0;
  while (cursor <= anchor) {
    const page = await reader.logWindow(
      token,
      topics,
      cursor,
      anchor,
      100_000,
      budget,
      false,
      1,
    );
    if (!page) throw new ReadCap("Token funding log-window cap reached");
    const transfers: Funding[] = [];
    for (const log of page.logs) {
      if (
        log.topics.length !== 3 ||
        !/^0x0{24}[0-9a-f]{40}$/i.test(log.topics[1]!) ||
        !/^0x[0-9a-f]{64}$/i.test(log.data)
      )
        throw new Error("Invalid token funding transfer");
      const from = `0x${log.topics[1]!.slice(-40)}`.toLowerCase();
      if (BigInt(log.data) === 0n || from === wallet || /^0x0{40}$/.test(from))
        continue;
      transfers.push({
        from,
        to: wallet,
        transactionHash: log.transactionHash.toLowerCase(),
        block: quantity(log.blockNumber),
        index: quantity(log.transactionIndex),
      });
    }
    const first = transfers[0];
    if (first) {
      if (
        transfers.some(
          (t) =>
            t.block === first.block &&
            t.index === first.index &&
            t.from !== first.from,
        )
      )
        throw new Error("Ambiguous token funding");
      return first;
    }
    cursor = page.to + 1;
  }
  return null;
}
