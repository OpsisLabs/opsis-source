import { afterEach, expect, it, vi } from "vitest";
import { publicIdentity, researchInputMatchesChoice, unlockPreview, workspaceLink, workspaceIdentity, savedLink } from "./model";
it("only hands public identity across workspaces, never amounts or notes", () => {
  const address = "0x" + "a".repeat(40);
  expect(workspaceLink("/check", address)).toBe(`/check?token=${address}`);
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
  expect(options.headers["x-opsis-csrf"]).toBe("1");
  expect(Object.keys(options.headers).filter(name => name.includes("csrf"))).toEqual(["x-opsis-csrf"]);
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
it("accepts an optional Swap preview capability only when its legacy flag agrees", async () => {
  type Body = { swapPreview?: unknown; manifest: { capabilities: Array<Record<string, unknown>> }; [key: string]: unknown };
  const withSwap = async (enabled: unknown, legacy: unknown) => {
    const body = await response(Date.now() + 60_000).json() as Body;
    body.manifest.capabilities.push({ id: "swapPreview", enabled, scope: "quote preview", origin: "live quote on request", freshness: "short-lived", coverage: "WETH and USDG only", limits: "not an execution" });
    if (legacy !== undefined) body.swapPreview = legacy;
    return new Response(JSON.stringify(body));
  };

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(await withSwap(true, true)));
  const enabled = await unlockPreview("", new AbortController().signal);
  expect(enabled.swapPreview).toBe(true);
  expect(enabled.manifest?.capabilities.map((entry) => entry.id)).toContain("swapPreview");

  // An older server without the row still parses, with Swap preview treated as off.
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(Date.now() + 60_000)));
  expect((await unlockPreview("", new AbortController().signal)).swapPreview).toBeUndefined();

  for (const bad of [await withSwap(true, false), await withSwap(false, "true"), await withSwap("yes", true)]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bad));
    await expect(unlockPreview("", new AbortController().signal)).rejects.toThrow("Invalid preview response");
  }
  const unknownRow = await response(Date.now() + 60_000).json() as Body;
  unknownRow.manifest.capabilities.push({ id: "perpExecution", enabled: false, scope: "x", origin: "x", freshness: "x", coverage: "x", limits: "x" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(unknownRow))));
  await expect(unlockPreview("", new AbortController().signal)).rejects.toThrow("Invalid preview response");
});


it("reads only validated public URL context and accepts legacy token links", () => {
  const address = "0x" + "a".repeat(40);
  const hash = "0x" + "b".repeat(64);
  expect(workspaceIdentity("/research", `?entity=${hash}&amount=12&note=private`)).toBe(hash);
  expect(workspaceIdentity("/check", `?token=${address}&amount=12&note=private`)).toBe(address);
  expect(workspaceIdentity("/check", `?entity=${address}`)).toBe(address);
  expect(workspaceIdentity("/check", `?token=${hash}`)).toBe("");
  expect(workspaceLink("/check", hash)).toBe("/check");
  expect(workspaceIdentity("/research", "?entity=private%20label")).toBe("");
  expect(workspaceIdentity("/check", `?token=invalid&entity=${address}`)).toBe("");
  expect(workspaceLink("/research", address)).toBe(`/research?entity=${address}`);
});

it("keeps the optional perp hand-off off when absent and validates its flag and manifest parity", async () => {
  type Body = { perpHandoff?: unknown; manifest?: { capabilities: Array<Record<string, unknown>> }; [key: string]: unknown };
  const body = async () => await response(Date.now() + 60_000).json() as Body;
  const row = (enabled: boolean) => ({ id: "perpHandoff", enabled, scope: "reviewed directory", origin: "static review", freshness: "120 days", coverage: "United States and Canada only", limits: "no orders or eligibility verification" });
  const parse = async (fixture: Body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture))));
    return unlockPreview("", new AbortController().signal);
  };
  expect((await parse(await body())).perpHandoff).toBeUndefined();
  const enabled = await body();
  enabled.perpHandoff = true;
  enabled.manifest!.capabilities.push(row(true));
  expect((await parse(enabled)).perpHandoff).toBe(true);
  const off = await body();
  off.manifest!.capabilities.push(row(false));
  expect((await parse(off)).perpHandoff ?? false).toBe(false);
  const missingRow = await body();
  missingRow.perpHandoff = false;
  expect((await parse(missingRow)).perpHandoff).toBe(false);

  for (const [flag, manifestFlag] of [[true, false], [false, true], [undefined, true]] as const) {
    const mismatch = await body();
    mismatch.perpHandoff = flag;
    mismatch.manifest!.capabilities.push(row(manifestFlag));
    await expect(parse(mismatch)).rejects.toThrow("Invalid preview response");
  }
  const missingEnabledRow = await body();
  missingEnabledRow.perpHandoff = true;
  await expect(parse(missingEnabledRow)).rejects.toThrow("Invalid preview response");
  for (const invalid of [null, "", "true", 0, 1, {}, []]) {
    for (const hasManifest of [true, false]) {
      const malformed = await body();
      malformed.perpHandoff = invalid;
      if (!hasManifest) delete malformed.manifest;
      await expect(parse(malformed)).rejects.toThrow("Invalid preview response");
    }
  }
});

it("keeps the optional saved-check comparison off when absent and validates its flag and manifest parity", async () => {
  type Body = { savedCheckComparisons?: unknown; manifest?: { capabilities: Array<Record<string, unknown>> }; [key: string]: unknown };
  const body = async () => await response(Date.now() + 60_000).json() as Body;
  const row = (enabled: boolean) => ({ id: "savedCheckComparisons", enabled, scope: "local comparison", origin: "encrypted browser records", freshness: "historical", coverage: "matching typed evidence", limits: "no automatic lookup" });
  const parse = async (fixture: Body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture))));
    return unlockPreview("", new AbortController().signal);
  };
  expect((await parse(await body())).savedCheckComparisons).toBeUndefined();
  const enabled = await body();
  enabled.savedCheckComparisons = true;
  enabled.manifest!.capabilities.push(row(true));
  expect((await parse(enabled)).savedCheckComparisons).toBe(true);
  const off = await body();
  off.manifest!.capabilities.push(row(false));
  expect((await parse(off)).savedCheckComparisons ?? false).toBe(false);
  const missingRow = await body();
  missingRow.savedCheckComparisons = false;
  expect((await parse(missingRow)).savedCheckComparisons).toBe(false);

  for (const [flag, manifestFlag] of [[true, false], [false, true], [undefined, true]] as const) {
    const mismatch = await body();
    mismatch.savedCheckComparisons = flag;
    mismatch.manifest!.capabilities.push(row(manifestFlag));
    await expect(parse(mismatch)).rejects.toThrow("Invalid preview response");
  }
  const missingEnabledRow = await body();
  missingEnabledRow.savedCheckComparisons = true;
  await expect(parse(missingEnabledRow)).rejects.toThrow("Invalid preview response");
  for (const invalid of [null, "", "true", 0, 1, {}, []]) {
    for (const hasManifest of [true, false]) {
      const malformed = await body();
      malformed.savedCheckComparisons = invalid;
      if (!hasManifest) delete malformed.manifest;
      await expect(parse(malformed)).rejects.toThrow("Invalid preview response");
    }
  }
});

it("keeps receipts default-off and rejects capability/manifest mismatches", async () => {
  type Body = { receipts?: unknown; manifest?: { capabilities: Array<Record<string, unknown>> }; [key: string]: unknown };
  const body = async () => await response(Date.now() + 60_000).json() as Body;
  const row = (enabled: boolean) => ({ id: "receipts", enabled, scope: "computation receipts", origin: "on request", freshness: "issued per request", coverage: "controls reference only", limits: "Bitcoin attestation not verified" });
  const parse = async (fixture: Body) => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)))); return unlockPreview("", new AbortController().signal); };
  expect((await parse(await body())).receipts).toBeUndefined();
  for (const enabled of [false, true]) { const value = await body(); value.receipts = enabled; value.manifest!.capabilities.push(row(enabled)); expect((await parse(value)).receipts).toBe(enabled); }
  for (const [flag, manifestFlag] of [[true, false], [false, true], [undefined, true]] as const) { const value = await body(); value.receipts = flag; value.manifest!.capabilities.push(row(manifestFlag)); await expect(parse(value)).rejects.toThrow("Invalid preview response"); }
  const missing = await body(); missing.receipts = true; await expect(parse(missing)).rejects.toThrow("Invalid preview response");
  for (const invalid of [null, "true", 1, {}, []]) { const value = await body(); value.receipts = invalid; await expect(parse(value)).rejects.toThrow("Invalid preview response"); }
});

it("parses optional reach flags and rejects missing or mismatched manifest rows", async () => {
  const original = vi.fn();
  vi.stubGlobal("fetch", original);
  const base = { expiresAt: new Date(Date.now() + 60000).toISOString(), chainId: 4663, research: true, tokenControls: false, exitCheck: false, watch: false, rwa: false, observedTrades: false, perpExecution: false };
  const parse = async (body: unknown) => {
    original.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    return unlockPreview("", new AbortController().signal);
  };
  for (const id of ["publicCards", "publicMcp", "telegramBot", "stockDesk"] as const) {
    expect((await parse(base))[id]).toBeUndefined();
    for (const enabled of [false, true]) {
      const capabilities = (["research", "tokenControls", "exitCheck", "watch", "rwa", "observedTrades"] as const).map((key) => ({ id: key, enabled: base[key], scope: "sample", origin: "sample", freshness: "sample", coverage: "partial", limits: "unknown" }));
      const row = { id, enabled, scope: "sample", origin: "sample", freshness: "sample", coverage: "partial", limits: "unknown" };
      const manifest = { version: 1, chain: { id: 4663, name: "Robinhood Chain" }, build: null, capabilities: [...capabilities, row] };
      expect((await parse({ ...base, [id]: enabled, manifest }))[id]).toBe(enabled);
      await expect(parse({ ...base, [id]: !enabled, manifest })).rejects.toThrow("Invalid preview response");
      if (enabled) await expect(parse({ ...base, [id]: true, manifest: { ...manifest, capabilities } })).rejects.toThrow("Invalid preview response");
    }
    for (const invalid of [null, "true", 1]) await expect(parse({ ...base, [id]: invalid })).rejects.toThrow("Invalid preview response");
  }
});
