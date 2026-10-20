import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalize,
  claimDefinitions,
  type Claim,
  type TokenControls,
} from "@rh-chain/shared";
import {
  checkClaim,
  compareShare,
  type Snapshot,
} from "../src/claims/checkers.js";
import {
  ClaimCheckService,
  postTimeBlock,
  type ClaimSession,
} from "../src/claims/service.js";
import { EngineClaimSession } from "../src/claims/sources.js";
import { createClaimCheckBudget } from "../src/claims/budget.js";
import { claimRoutes } from "../src/routes/claims.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import { installOpsisPreviewGuard, opsisRoutes } from "../src/routes/opsis.js";
import { ReceiptService } from "../src/receipts/service.js";
import { privateKeyToAccount } from "viem/accounts";
import type { ProviderHttp } from "../src/chain/provider-http.js";
import { BlockscoutProvider } from "../src/chain/blockscout.js";
import { LaunchCardsService } from "../src/launches/service.js";
import { EngineCardSources } from "../src/cards/sources.js";
import type { SourceDocumentInput } from "../src/chain/types.js";
import type Redis from "ioredis";
import { AppError } from "../src/http/errors.js";
afterEach(() => vi.restoreAllMocks());
const address = `0x${"1".repeat(40)}`,
  zero = `0x${"0".repeat(40)}`,
  dead = `0x${"0".repeat(36)}dead`;
const hash = (n: number) =>
  `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
const header = (n: number) => ({
  number: n,
  hash: hash(n + 1),
  seconds: 1000 + Math.floor(n / 2),
});
const env = (extra = {}) =>
  loadEnv({
    NODE_ENV: "test",
    OPSIS_WORKSPACES_ENABLED: "true",
    OPSIS_PUBLIC_ACCESS_ENABLED: "true",
    CLAIM_CHECK_ENABLED: "true",
    ...extra,
  });
const observed = (value: string) => ({ state: "observed" as const, value });
const controls = (owner = zero, admin = zero, paused = "true") =>
  ({
    readings: {
      owner: observed(owner),
      admin: observed(admin),
      paused: observed(paused),
    },
  }) as TokenControls;
const sample = <T>(value: T) => ({
  value,
  evidence: { source: "fixture", coverage: "fixture complete" },
});
const request = {
  address,
  confirmed: true as const,
  claims: [{ type: "ownership", expected: true } as Claim],
};
const verdict = (claim: Claim, snapshot: Snapshot) =>
  checkClaim(claim, 10, snapshot).status;

describe("published claim checkers", () => {
  const rows: Array<{
    claim: Claim;
    yes: Snapshot;
    no: Snapshot;
    missing: Snapshot;
  }> = [
    {
      claim: { type: "ownership", expected: true },
      yes: { controls: sample(controls()) },
      no: { controls: sample(controls(zero, address)) },
      missing: {
        controls: sample({
          readings: {
            owner: observed(zero),
            admin: { state: "unknown", reason: "reverted" },
          },
        } as TokenControls),
      },
    },
    {
      claim: { type: "paused", expected: true },
      yes: { controls: sample(controls()) },
      no: { controls: sample(controls(zero, zero, "false")) },
      missing: {},
    },
    {
      claim: { type: "paused", expected: false },
      yes: { controls: sample(controls(zero, zero, "false")) },
      no: { controls: sample(controls()) },
      missing: {},
    },
    {
      claim: { type: "lpBurned", expected: true },
      yes: { lp: sample([zero, dead.toUpperCase().replace("0X", "0x")]) },
      no: { lp: sample([dead, address]) },
      missing: { lp: { reason: "Partial LP recipients" } },
    },
    {
      claim: { type: "top10", comparison: "under", percent: "12.5" },
      yes: { top10: sample({ numerator: "124", denominator: "1000" }) },
      no: { top10: sample({ numerator: "125", denominator: "1000" }) },
      missing: {},
    },
    {
      claim: { type: "deployer", comparison: "over", percent: "3.25" },
      yes: { deployer: sample({ numerator: "326", denominator: "10000" }) },
      no: { deployer: sample({ numerator: "325", denominator: "10000" }) },
      missing: {},
    },
    {
      claim: { type: "launchpad", launchpad: "launcher" },
      yes: { launchpad: sample("launcher") },
      no: { launchpad: sample("pons") },
      missing: {},
    },
    {
      claim: { type: "verified", expected: true },
      yes: { verified: sample(true) },
      no: { verified: sample(false) },
      missing: {},
    },
  ];
  it.each(rows)(
    "$claim.type compares complete evidence and refuses missing evidence",
    ({ claim, yes, no, missing }) => {
      expect(verdict(claim, yes)).toBe("agrees");
      expect(verdict(claim, no)).toBe("differs");
      expect(verdict(claim, missing)).toBe("can't check");
      expect(checkClaim(claim, 10, yes)).toMatchObject({
        definition: claimDefinitions[claim.type],
        wording: "Chain data at block 10 agrees",
      });
    },
  );
  it("tax and unlisted types stay uncheckable regardless of other evidence", () => {
    for (const claim of [
      { type: "tax", buy: "0", sell: "0" },
      { type: "unsupported" },
    ] as Claim[])
      expect(verdict(claim, { controls: sample(controls()) })).toBe(
        "can't check",
      );
  });
  it("requires both ownership reads even if a known admin is set", () => {
    expect(
      verdict(request.claims[0]!, {
        controls: sample({
          readings: {
            admin: observed(address),
            owner: { state: "unknown", reason: "reverted" },
          },
        } as TokenControls),
      }),
    ).toBe("can't check");
  });
  it("compares exact integers, strict thresholds and refuses invalid supply", () => {
    const c = {
      type: "deployer",
      comparison: "equal",
      percent: "3.125",
    } as const;
    expect(
      compareShare("3125000000000000000000", "100000000000000000000000", c),
    ).toBe(true);
    expect(compareShare("1", "0", c)).toBeNull();
    expect(compareShare("11", "10", c)).toBeNull();
    expect(compareShare("bad", "10", c)).toBeNull();
    expect(
      compareShare("1", "100", {
        ...c,
        comparison: "over",
        percent: "0.999999",
      }),
    ).toBe(true);
  });
});
describe("post-time upper-bound search", () => {
  it("finds the last repeated timestamp and exact boundaries", async () => {
    const read = vi.fn(async (n: number) => header(n));
    expect((await postTimeBlock(1002, header(10), read))?.number).toBe(5);
    expect((await postTimeBlock(1000, header(10), read))?.number).toBe(1);
    expect((await postTimeBlock(1005, header(10), read))?.number).toBe(10);
    expect(await postTimeBlock(999, header(10), read)).toBeNull();
    expect(await postTimeBlock(1006, header(10), read)).toBeNull();
    expect((await postTimeBlock(1000, header(0), read))?.number).toBe(0);
  });
  it("bounds a large chain, propagates unavailable headers and rejects mismatches", async () => {
    const last = {
      number: Number.MAX_SAFE_INTEGER - 1,
      hash: hash(1),
      seconds: Number.MAX_SAFE_INTEGER - 1,
    };
    const read = vi.fn(async (n: number) => ({
      ...last,
      number: n,
      seconds: n,
    }));
    expect((await postTimeBlock(500, last, read))?.number).toBe(500);
    expect(read.mock.calls.length).toBeLessThanOrEqual(54);
    await expect(
      postTimeBlock(1002, header(10), async () => {
        throw new Error("missing header");
      }),
    ).rejects.toThrow("missing header");
    await expect(
      postTimeBlock(1002, header(10), async () => header(99)),
    ).rejects.toThrow("timestamp unavailable");
  });
});
function session(): ClaimSession {
  return {
    evidence: {
      rpcCalls: [{ method: "eth_call", paramsSha256: `0x${"a".repeat(64)}` }],
      sources: [
        {
          id: "fixture",
          provider: "fixture",
          url: "https://rpc.example",
          fetchedAt: "2026-10-19T00:00:00.000Z",
          responseSha256: `0x${"b".repeat(64)}`,
        },
      ],
    },
    current: vi.fn(async () => header(10)),
    block: vi.fn(async (n) => header(n)),
    recheck: vi.fn(async () => {}),
    snapshot: vi.fn(async (_a, _c, h) => ({
      controls: sample(controls(h.number === 10 ? address : zero)),
    })),
  };
}
describe("claim service", () => {
  it("shows different current and post-time results and shares a snapshot per block", async () => {
    const s = session(),
      source = new ClaimCheckService(() => s);
    const result = await source.check({
      ...request,
      claims: [...request.claims, { type: "paused", expected: true }],
      postTime: new Date(1002000).toISOString(),
    });
    expect(result.current.block).toMatchObject({
      number: 10,
      label: "current, not final",
    });
    expect(result.post?.block).toMatchObject({ number: 5, label: "post time" });
    expect(result.current.results[0]?.status).toBe("differs");
    expect(result.post?.results[0]?.status).toBe("agrees");
    expect(s.snapshot).toHaveBeenCalledTimes(2);
    expect(s.recheck).toHaveBeenCalledTimes(3);
  });
  it.each([999, 1006])(
    "returns an explicit unavailable post block for %i",
    async (seconds) => {
      const s = session(),
        result = await new ClaimCheckService(() => s).check({
          ...request,
          postTime: new Date(seconds * 1000).toISOString(),
        });
      expect(result.post?.block).toBeNull();
      expect(result.post?.results[0]?.status).toBe("can't check");
      expect(s.snapshot).toHaveBeenCalledTimes(1);
    },
  );
  it("refuses confirmation bypass, budget failures and changed anchors", async () => {
    const s = session(),
      source = new ClaimCheckService(() => s);
    await expect(
      source.check({ ...request, confirmed: false } as never),
    ).rejects.toThrow("Confirm");
    expect(s.current).not.toHaveBeenCalled();
    vi.mocked(s.snapshot).mockRejectedValueOnce(
      new AppError("CLAIM_CHECK_DAILY_BUDGET_EXCEEDED", 503, "budget reached"),
    );
    await expect(source.check(request)).rejects.toThrow("budget reached");
    vi.mocked(s.recheck).mockRejectedValueOnce(new Error("changed anchor"));
    await expect(source.check(request)).rejects.toThrow("changed anchor");
  });
  it("issues a receipt with typed inputs and both observations, and refuses a missing signer", async () => {
    const account = privateKeyToAccount(`0x${"22".repeat(32)}`),
      now = () => Date.parse("2026-10-19T00:00:00.000Z");
    const receipts = new ReceiptService(
      {
        address: account.address,
        signDigest: (h) => account.sign({ hash: h }),
      },
      [
        {
          address: account.address,
          validFrom: new Date(0).toISOString(),
          validTo: null,
        },
      ],
      "a".repeat(40),
      now,
    );
    const result = await new ClaimCheckService(session, receipts, true).check({
      ...request,
      postTime: new Date(1002000).toISOString(),
    });
    expect(result.receipt?.inputs).toEqual({
      address,
      claims: request.claims,
      postTime: new Date(1002000).toISOString(),
    });
    expect(result.receipt?.outputs).toHaveProperty("post");
    expect(canonicalize(result.receipt)).not.toContain("matchedText");
    await expect(
      new ClaimCheckService(session, undefined, true).check(request),
    ).rejects.toThrow("Receipt evidence unavailable");
  });
});
describe("budget and guarded route", () => {
  it("refuses daily exhaustion, resets UTC day and fails closed with a missing production ledger", async () => {
    let now = new Date("2026-10-19T00:00:00Z");
    const b = createClaimCheckBudget(
      env({ CLAIM_CHECK_DAILY_RPC_UNIT_BUDGET: "100" }),
      undefined,
      () => now,
    );
    await b.consume(100);
    await expect(b.consume(1)).rejects.toThrow("budget has been reached");
    now = new Date("2026-10-20T00:00:00Z");
    await b.consume(1);
    await expect(
      createClaimCheckBudget({ ...env(), NODE_ENV: "production" }).consume(1),
    ).rejects.toThrow("guard is unavailable");
  });
  it("requires explicit address confirmation and rejects raw text and unknown fields", async () => {
    const app = Fastify(),
      config = env(),
      source = { check: vi.fn(async () => ({}) as never) };
    installErrorHandler(app);
    await claimRoutes(app, config, source);
    try {
      for (const payload of [
        { ...request, confirmed: false },
        { address, claims: request.claims },
        { confirmed: true, claims: request.claims },
        { ...request, rawText: "LP burned" },
        {
          ...request,
          claims: [{ ...request.claims[0], matchedText: "renounced" }],
        },
        {
          ...request,
          claims: [{ type: "top10", percent: "101", comparison: "under" }],
        },
      ])
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/v1/private/opsis/claims",
              payload,
            })
          ).statusCode,
        ).toBe(400);
      expect(source.check).not.toHaveBeenCalled();
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/private/opsis/claims",
            payload: request,
          })
        ).statusCode,
      ).toBe(200);
      expect(source.check).toHaveBeenCalledWith(request);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/private/opsis/claims",
            payload: { ...request, claims: [{ type: "unlisted_type" }] },
          })
        ).statusCode,
      ).toBe(200);
      expect(source.check).toHaveBeenLastCalledWith({
        ...request,
        claims: [{ type: "unsupported" }],
      });
    } finally {
      await app.close();
    }
  });
  it.each([
    { CLAIM_CHECK_ENABLED: false },
    { PRIVATE_MODE_ENABLED: false },
    { OPSIS_WORKSPACES_ENABLED: false },
  ])("refuses disabled capability before checker work: %j", async (change) => {
    const app = Fastify(),
      source = { check: vi.fn() },
      config = { ...env(), ...change };
    installErrorHandler(app);
    await claimRoutes(app, config, source);
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/private/opsis/claims",
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
      expect(source.check).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it("publishes an always-present row with flag parity and protects private access", async () => {
    expect(loadEnv({ NODE_ENV: "test" }).CLAIM_CHECK_ENABLED).toBe(false);
    for (const enabled of [false, true]) {
      const app = Fastify(),
        config = { ...env(), CLAIM_CHECK_ENABLED: enabled };
      installErrorHandler(app);
      installOpsisPreviewGuard(app, config);
      await opsisRoutes(app, config);
      await claimRoutes(app, config, { check: vi.fn() });
      try {
        const response = (
          await app.inject({
            method: "POST",
            url: "/v1/private/opsis/access",
            payload: {},
          })
        ).json();
        expect(response.claimCheck).toBe(enabled);
        expect(
          response.manifest.capabilities.find(
            (r: { id: string }) => r.id === "claimCheck",
          ).enabled,
        ).toBe(enabled);
        config.OPSIS_PUBLIC_ACCESS_ENABLED = false;
        expect(
          (
            await app.inject({
              method: "POST",
              url: "/v1/private/opsis/claims",
              payload: request,
            })
          ).statusCode,
        ).toBe(404);
      } finally {
        await app.close();
      }
    }
  });
});
describe("engine composition with synthetic RPC", () => {
  const now = () => 1005000;
  const rpc = () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const requestJson = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body as string);
      calls.push(body);
      let result: unknown;
      if (body.method === "eth_chainId") result = "0x1237";
      else if (body.method === "eth_getBlockByNumber") {
        const h = header(
          body.params[0] === "latest" ? 10 : Number(BigInt(body.params[0])),
        );
        result = {
          number: `0x${h.number.toString(16)}`,
          hash: h.hash,
          timestamp: `0x${h.seconds.toString(16)}`,
        };
      } else if (body.method === "eth_getCode") result = "0x01";
      else if (body.method === "eth_getStorageAt")
        result = `0x${"0".repeat(64)}`;
      else if (body.method === "eth_call")
        result = `0x${((body.params[0] as { data: string }).data === "0x18160ddd" ? "3e8" : "0").padStart(64, "0")}`;
      else if (body.method === "eth_getLogs") result = [];
      else throw new Error("Unexpected fixture method");
      return { jsonrpc: "2.0", id: body.id, result };
    });
    return { calls, rpc: { requestJson } as unknown as ProviderHttp };
  };
  it("reads historical controls and shares them across ownership and pause", async () => {
    const fixture = rpc(),
      budget = { consume: vi.fn(async () => {}) };
    const service = new ClaimCheckService(
      () =>
        new EngineClaimSession(
          env(),
          budget,
          budget,
          budget,
          undefined,
          fixture.rpc,
          now,
        ),
    );
    const result = await service.check({
      ...request,
      claims: [...request.claims, { type: "paused", expected: false }],
      postTime: new Date(1002000).toISOString(),
    });
    expect(result.post?.results.map((r) => r.status)).toEqual([
      "agrees",
      "agrees",
    ]);
    const owners = fixture.calls.filter(
      (c) =>
        c.method === "eth_call" &&
        (c.params[0] as { data: string }).data === "0x8da5cb5b",
    );
    expect(owners).toHaveLength(2);
    expect(owners.map((c) => c.params[1])).toEqual(["0xa", "0x5"]);
  });

  it("shares one launch observation for registry, LP and deployer claims, with pinned balances", async () => {
    const fixture = rpc(),
      budget = { consume: vi.fn(async () => {}) };
    const card = {
      permissions: { state: "partial", value: controls() },
      launch: {
        state: "available",
        value: { adapter: "launcher", deployer: address },
      },
      lpStatus: { state: "available", value: { finalPositionRecipient: dead } },
      otherLaunches: [],
      coverage: {},
    };
    const launch = vi
      .spyOn(LaunchCardsService.prototype, "cardAt")
      .mockResolvedValue(card);
    const s = new EngineClaimSession(
      env(),
      budget,
      budget,
      budget,
      undefined,
      fixture.rpc,
      now,
    );
    const claims: Claim[] = [
      { type: "ownership", expected: true },
      { type: "launchpad", launchpad: "launcher" },
      { type: "deployer", comparison: "under", percent: "3" },
      { type: "lpBurned", expected: true },
    ];
    const snapshot = await s.snapshot(address, claims, header(5), true);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch.mock.calls[0]?.[1]).toEqual(header(5));
    expect(claims.map((c) => checkClaim(c, 5, snapshot).status)).toEqual([
      "agrees",
      "agrees",
      "agrees",
      "agrees",
    ]);
    expect(
      fixture.calls
        .filter((c) => c.method === "eth_call")
        .map((c) => c.params[1]),
    ).toEqual(["0x5", "0x5"]);
    card.launch.state = "partial";
    card.lpStatus.state = "partial";
    expect(
      (await s.snapshot(address, claims, header(5), true)).lp,
    ).toHaveProperty("reason");
    expect(
      (await s.snapshot(address, claims, header(5), true)).launchpad,
    ).toHaveProperty("value", "launcher");
    card.lpStatus.state = "available";
    card.lpStatus.value.finalPositionRecipient = address;
    expect(
      (await s.snapshot(address, claims, header(5), true)).lp,
    ).toHaveProperty("reason");
  });
  it("shares one current explorer sample and never reuses it for the post-time block", async () => {
    const fixture = rpc(),
      budget = { consume: vi.fn(async () => {}) };
    const market = vi
      .spyOn(EngineCardSources.prototype, "market")
      .mockResolvedValue({
        source: "blockscout",
        observedAt: "2026-10-19T00:00:00.000Z",
        priceUsd: null,
        concentration: { state: "unknown", reason: "fixture" },
        explorerClaims: {
          share: { numerator: "10", denominator: "100" },
          verified: false,
          observedAt: "2026-10-19T00:00:00.000Z",
        },
      });
    const s = new EngineClaimSession(
        env(),
        budget,
        budget,
        budget,
        undefined,
        fixture.rpc,
        now,
      ),
      claims: Claim[] = [
        { type: "top10", comparison: "under", percent: "15" },
        { type: "verified", expected: true },
      ];
    const snapshot = await s.snapshot(address, claims, header(10), false);
    expect(claims.map((c) => checkClaim(c, 10, snapshot).status)).toEqual([
      "agrees",
      "differs",
    ]);
    expect(market).toHaveBeenCalledTimes(1);
    const historical = await s.snapshot(address, claims, header(5), true);
    expect(claims.map((c) => checkClaim(c, 5, historical).status)).toEqual([
      "can't check",
      "can't check",
    ]);
    expect(market).toHaveBeenCalledTimes(1);
  });
  it("refuses budget before provider work and retains existing ledger reservations", async () => {
    const fixture = rpc(),
      deny = {
        consume: vi.fn(async () => {
          throw new AppError(
            "CLAIM_CHECK_DAILY_BUDGET_EXCEEDED",
            503,
            "budget reached",
          );
        }),
      },
      existing = { consume: vi.fn(async () => {}) };
    const s = new EngineClaimSession(
      env(),
      deny,
      existing,
      existing,
      undefined,
      fixture.rpc,
      now,
    );
    await expect(s.current()).rejects.toThrow("budget reached");
    expect(fixture.calls).toHaveLength(0);
    expect(existing.consume).not.toHaveBeenCalled();
  });
  it("keeps missing launch facts and historical explorer evidence uncheckable", async () => {
    // Release 48 tries explorer creation receipts before archive code discovery.
    // This fixture covers the unavailable-explorer fallback without live reads.
    vi.spyOn(BlockscoutProvider.prototype, "getAddress").mockRejectedValue(
      new AppError("BLOCKSCOUT_UNAVAILABLE", 503, "Fixture explorer unavailable"),
    );
    const fixture = rpc(),
      budget = { consume: vi.fn(async () => {}) },
      s = new EngineClaimSession(
        env(),
        budget,
        budget,
        budget,
        undefined,
        fixture.rpc,
        now,
      );
    await s.current();
    const snapshot = await s.snapshot(
      address,
      [
        { type: "launchpad", launchpad: "pons" },
        { type: "deployer", comparison: "under", percent: "5" },
        { type: "lpBurned", expected: true },
        { type: "verified", expected: true },
        { type: "top10", comparison: "over", percent: "10" },
      ],
      header(5),
      true,
    );
    expect(snapshot.launchpad).toHaveProperty("reason");
    expect(snapshot.deployer).toHaveProperty("reason");
    expect(snapshot.lp).toHaveProperty("reason");
    expect(snapshot.top10).toHaveProperty("reason");
    expect(snapshot.verified).toHaveProperty("reason");
    expect(budget.consume).toHaveBeenCalled();
    expect(s.evidence.sources.length).toBeGreaterThan(0);
  });
});

describe("explorer share reused from the card source", () => {
  const doc = (path: string, responseJson: unknown): SourceDocumentInput => ({
    id: path,
    provider: "blockscout",
    chainId: 4663,
    entityType: "token",
    entityValue: address,
    requestUrl: `https://explorer.example/api/v2${path}`,
    responseJson,
    fetchedAt: "2026-10-19T00:00:00.000Z",
  });
  it("includes pools and burns, uses exact units, and preserves the older card metric", async () => {
    const docs = [
      doc(`/tokens/${address}`, { total_supply: "1000" }),
      doc(`/tokens/${address}/holders`, {
        items: [
          {
            value: "500",
            address: { hash: address, is_contract: true, name: "Uniswap pool" },
          },
          { value: "250", address: { hash: dead } },
          { value: "125", address: { hash: `0x${"2".repeat(40)}` } },
        ],
        next_page_params: null,
      }),
      doc(`/smart-contracts/${address}`, { is_verified: true }),
    ];
    const budget = { consume: vi.fn(async () => {}) },
      evidence = { sources: [], rpcCalls: [] };
    const source = new EngineCardSources(env(), budget, undefined, undefined, {
      getToken: vi.fn(async () => docs),
    });
    const result = await source.market(address, evidence);
    expect(result.explorerClaims?.share).toEqual({
      numerator: "875",
      denominator: "1000",
    });
    expect(result.explorerClaims?.verified).toBe(true);
    expect(result.concentration).toMatchObject({
      state: "available",
      value: { top10Percent: 12.5 },
    });
    expect(evidence.sources).toHaveLength(3);
    expect(budget.consume).toHaveBeenCalledWith(6);
    docs[1]!.responseJson = {
      items: [{ value: "100", address: { hash: address } }],
      next_page_params: { cursor: "fixture" },
    };
    expect((await source.market(address)).explorerClaims?.share).toBeNull();
    docs[1]!.responseJson = {
      items: [{ value: "bad" }],
      next_page_params: null,
    };
    expect((await source.market(address)).explorerClaims?.share).toBeNull();
    docs[2]!.responseJson = {};
    expect((await source.market(address)).explorerClaims?.verified).toBeNull();
  });
  it("fails closed for Redis refusal, malformed replies and unavailable storage", async () => {
    for (const value of [[-1, 100], null]) {
      const redis = { eval: vi.fn(async () => value) } as unknown as Redis;
      await expect(
        createClaimCheckBudget(env(), redis).consume(1),
      ).rejects.toThrow();
    }
    const redis = {
      eval: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    } as unknown as Redis;
    await expect(
      createClaimCheckBudget(env(), redis).consume(1),
    ).rejects.toThrow("guard is unavailable");
  });
});
