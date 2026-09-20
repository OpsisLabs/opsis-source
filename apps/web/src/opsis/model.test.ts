import { afterEach, expect, it, vi } from "vitest";
import { publicIdentity, unlockPreview, workspaceLink } from "./model";
it("only hands public identity across workspaces, never amounts or notes", () => {
  const address = "0x" + "a".repeat(40);
  expect(workspaceLink("/check", address)).toBe(`/check?entity=${address}`);
  for (const value of [
    null,
    "wallet note",
    "1.5",
    `${address}&amount=10`,
    "javascript:alert(1)",
    "0x123",
  ])
    expect(publicIdentity(value)).toBe("");
  expect(publicIdentity("0x" + "b".repeat(64))).toHaveLength(66);
});

const now = Date.UTC(2026, 8, 20, 13, 0, 0, 400);
function response(expiresAt: number, date?: string) {
  return new Response(
    JSON.stringify({
      expiresAt: new Date(expiresAt).toISOString(),
      chainId: 4663,
      research: true,
      exitCheck: true,
      watch: true,
      rwa: true,
      observedTrades: true,
      perpExecution: false,
    }),
    { headers: date === undefined ? {} : { date } },
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("accepts subsecond server clock skew without extending the local one-hour session", async () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        response(now + 3_600_300, new Date(now + 300).toUTCString()),
      ),
  );
  const result = await unlockPreview(
    "a".repeat(64),
    new AbortController().signal,
  );
  expect(Date.parse(result.expiresAt)).toBe(now + 3_600_000);
});
it("retains an earlier server expiry", async () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(response(now + 60_000, new Date(now).toUTCString())),
  );
  expect(
    Date.parse(
      (await unlockPreview("a".repeat(64), new AbortController().signal))
        .expiresAt,
    ),
  ).toBe(now + 60_000);
});
it("rejects expired, excessive and malformed lifetimes with or without a server date", async () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  for (const candidate of [
    response(now - 1),
    response(now + 3_600_001),
    response(now + 7_200_000, new Date(now).toUTCString()),
    response(now + 60_000, "invalid"),
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(candidate));
    await expect(
      unlockPreview("a".repeat(64), new AbortController().signal),
    ).rejects.toThrow("Invalid preview response");
  }
});
it("public capability requests omit credentials and keep CSRF protection", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(Date.now() + 60_000));
  vi.stubGlobal("fetch", fetcher);
  await unlockPreview("", new AbortController().signal);
  const options = fetcher.mock.calls[0][1];
  expect(options.credentials).toBe("omit");
  expect(options.headers.authorization).toBeUndefined();
  expect(options.headers["x-chainscout-csrf"]).toBe("1");
});
