import { describe, expect, it, vi } from "vitest";
import { PublicTimestampCalendar } from "../src/receipts/calendar.js";
import type { Hex } from "@rh-chain/shared";
const root: Hex = `0x${"ab".repeat(32)}`;
const calendars = ["https://calendar-one.example", "https://calendar-two.example"];
const response = (bytes = [0, 1, 2, 255]) => new Response(new Uint8Array(bytes), { headers: { "content-type": "application/vnd.opentimestamps.v1" } });
describe("injected OpenTimestamps public protocol", () => {
  it("posts 32 raw bytes to two calendars and records accepting ones", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const adapter = new PublicTimestampCalendar(calendars, fetcher);
    const commitment = await adapter.submit(root);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
      const [url, init] = fetcher.mock.calls[i]!;
      expect(url).toBe(`${calendars[i]}/digest`); expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ Accept: "application/vnd.opentimestamps.v1" });
      expect(init?.body).toEqual(new Uint8Array(32).fill(0xab));
    }
    expect(commitment.accepted).toEqual([{ calendar: calendars[0], proof: new Uint8Array([0, 1, 2, 255]) }]);
  });
  it("upgrades by root hex, retains failed calendar commitments, treats bytes as opaque", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockResolvedValueOnce(response()).mockResolvedValueOnce(response([5, 6])).mockRejectedValueOnce(new Error("fixture unavailable"));
    const adapter = new PublicTimestampCalendar(calendars, fetcher), submitted = await adapter.submit(root);
    const upgraded = await adapter.upgrade(submitted);
    expect(fetcher.mock.calls[2]![0]).toBe(`${calendars[0]}/timestamp/${root.slice(2)}`);
    expect(fetcher.mock.calls[2]![1]).toMatchObject({ method: "GET", headers: { Accept: "application/vnd.opentimestamps.v1" } });
    expect(fetcher.mock.calls[2]![1]?.body).toBeUndefined();
    expect(upgraded.accepted[0]!.proof).toEqual(new Uint8Array([5, 6])); expect(upgraded.accepted[1]).toEqual(submitted.accepted[1]);
  });
  it("requires two distinct explicit calendars and fails if none accepts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("fixture unavailable"));
    expect(() => new PublicTimestampCalendar([], fetcher)).toThrow();
    expect(() => new PublicTimestampCalendar([calendars[0]!, calendars[0]!], fetcher)).toThrow();
    expect(() => new PublicTimestampCalendar(["http://calendar.example", calendars[1]!], fetcher)).toThrow();
    await expect(new PublicTimestampCalendar(calendars, fetcher).submit(root)).rejects.toThrow("No calendar accepted");
  });
  it("rejects wrong content types, empty/oversized proofs, malformed roots and unknown upgrade targets", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response("<html>fixture</html>"));
    const adapter = new PublicTimestampCalendar(calendars, fetcher);
    await expect(adapter.submit(root)).rejects.toThrow();
    fetcher.mockImplementation(async () => response([])); await expect(adapter.submit(root)).rejects.toThrow();
    fetcher.mockImplementation(async () => response(Array(1_000_001).fill(0))); await expect(adapter.submit(root)).rejects.toThrow();
    fetcher.mockClear(); await expect(adapter.submit("0x12")).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
    await expect(adapter.upgrade({ root, accepted: [{ calendar: "https://unknown.example", proof: new Uint8Array([1]) }] })).rejects.toThrow();
  });
});
