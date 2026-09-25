import { afterEach, expect, it, vi } from "vitest";
import { publicIdentity, researchInputMatchesChoice, unlockPreview, workspaceLink, savedLink } from "./model";
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

it("validates address versus transaction input for Auto and explicit Token choices", () => {
  const address = "0x" + "a".repeat(40);
  const hash = "0x" + "b".repeat(64);
  expect(researchInputMatchesChoice(address, "unknown")).toBe(true);
  expect(researchInputMatchesChoice(hash, "unknown")).toBe(true);
  expect(researchInputMatchesChoice(address, "token")).toBe(true);
  expect(researchInputMatchesChoice(hash, "token")).toBe(false);
  expect(researchInputMatchesChoice("not an identifier", "unknown")).toBe(false);
});

const now = Date.UTC(2026, 8, 20, 13, 0, 0, 400);
function response(expiresAt: number, date?: string) {
  const enabled = { research: true, tokenControls: false, exitCheck: true, watch: true, rwa: true, observedTrades: true };
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
      manifest: {
        version: 1,
        chain: { id: 4663, name: "Robinhood Chain" },
        build: "a".repeat(40),
        capabilities: Object.entries(enabled).map(([id, on]) => ({
          id, enabled: on,
          scope: "bounded test scope", origin: "live on request",
          freshness: "per request", coverage: "partial", limits: "provider health unknown",
        })),
      },
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

it("validates manifest version, shape and parity while accepting older boolean-only fixtures", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(Date.now() + 60_000));
  vi.stubGlobal("fetch", fetcher);
  const parsed = await unlockPreview("", new AbortController().signal);
  expect(parsed.manifest?.version).toBe(1);
  expect(parsed.manifest?.capabilities.find((entry) => entry.id === "tokenControls")?.enabled).toBe(false);

  type ManifestFixture = {
    manifest: {
      version: number;
      capabilities: Array<{ enabled: unknown; [key: string]: unknown }>;
    };
    [key: string]: unknown;
  };
  for (const mutate of [
    (data: ManifestFixture) => { data.manifest.version = 2; },
    (data: ManifestFixture) => { data.manifest.capabilities[0].enabled = "true"; },
    (data: ManifestFixture) => { data.manifest.capabilities.pop(); },
  ]) {
    const body = await response(Date.now() + 60_000).json() as ManifestFixture;
    mutate(body);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(unlockPreview("", new AbortController().signal)).rejects.toThrow("Invalid preview response");
  }
  const legacy = await response(Date.now() + 60_000).json() as Record<string, unknown>;
  delete legacy.manifest;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(legacy))));
  expect((await unlockPreview("", new AbortController().signal)).manifest).toBeUndefined();
});

it("legacy Vault redirect keeps only a known workspace", () => {
  expect(savedLink("?view=portfolio&amount=10&note=private")).toBe("/saved?view=portfolio");
  expect(savedLink("?view=reports&entity=private")).toBe("/saved?view=reports");
  expect(savedLink("?view=https://example.com")).toBe("/saved");
});
