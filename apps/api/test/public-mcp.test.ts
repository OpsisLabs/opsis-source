import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import Ajv from "ajv";
import {
  STOCK_DESK_LINE,
  type ClaimResponse,
  type StockDeskResult,
} from "@rh-chain/shared";
import { buildApp } from "../src/app.js";
import { loadEnv, type Env } from "../src/config/env.js";
import { ADVICE } from "../src/cards/service.js";
import { AppError } from "../src/http/errors.js";
import { CardProofOfWork } from "../src/open-data/card-guard.js";
import {
  STOCK_DESK_ASSETS,
  type StockDeskSource,
} from "../src/stock-desk/service.js";
import { claimRequestSchema } from "../src/routes/claims.js";
import {
  MCP_TOOLS,
  publicMcpRoutes,
  type McpResearchSources,
} from "../src/routes/public-mcp.js";

const endpoint = "/v1/public/open-data/v1/mcp";
const secret = "s".repeat(32);
const address = `0x${"1".repeat(40)}`;
const asset = STOCK_DESK_ASSETS[0]!;
const receipt = { signature: "fixture-receipt" };
const unknown = { state: "unknown", reason: "SOURCE_UNAVAILABLE" };
const desk = {
  address: asset.address,
  reference: unknown,
  gapBps: unknown,
  feed: unknown,
  depth: [{ notionalUsd: "1000", quote: unknown }],
  disclaimer: STOCK_DESK_LINE,
  receipt,
};
const launch = {
  launch: unknown,
  buyers: unknown,
  rules: [{ id: "early-buyer-v1", text: "Published rule / 已公布的规则" }],
  deployer: unknown,
  lp: unknown,
  permissions: unknown,
  sellTest: { state: "refused", reason: "SIMULATION_UNAVAILABLE" },
  disclaimer: ADVICE,
  receipt,
};
const claims: ClaimResponse = {
  chainId: 4663,
  address,
  current: {
    block: null,
    results: ["agrees", "differs", "can't check"].map((status) => ({
      claim: { type: "paused", expected: false },
      definition: "Standard pause getter / 标准暂停读取方法",
      status: status as "agrees" | "differs" | "can't check",
      wording: status,
      evidence: {},
      ...(status === "can't check" ? { reason: "SOURCE_UNAVAILABLE" } : {}),
    })),
  },
};
const claimArgs = {
  address,
  confirmed: true,
  claims: [{ type: "paused", expected: false }],
  postTime: "2026-10-19T12:00:00+00:00",
};
const tools = [
  {
    name: "stock_desk",
    args: { token: asset.symbol.toLowerCase() },
    reason: "STOCK_DESK",
  },
  { name: "launch_card", args: { address }, reason: "LAUNCH_CARDS" },
  { name: "claim_check", args: claimArgs, reason: "CLAIM_CHECK" },
];
const base = loadEnv({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  PUBLIC_MCP_ENABLED: "true",
  OPEN_DATA_API_ENABLED: "true",
  PUBLIC_CARDS_HMAC_SECRET: secret,
});
const allEnabled = {
  ...base,
  PRIVATE_MODE_ENABLED: true,
  OPSIS_WORKSPACES_ENABLED: true,
  RWA_VERIFY_ENABLED: true,
  EXIT_CHECK_ENABLED: true,
  STOCK_DESK_ENABLED: true,
  LAUNCH_CARDS_ENABLED: true,
  CLAIM_CHECK_ENABLED: true,
};
const apps: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function mocks() {
  return {
    stockDesk: {
      desk: vi
        .fn<StockDeskSource["desk"]>()
        .mockResolvedValue(desk as unknown as StockDeskResult),
      index: vi.fn<StockDeskSource["index"]>(),
    },
    launchCards: { card: vi.fn(async () => launch), feed: vi.fn() },
    claims: { check: vi.fn(async () => claims) },
  };
}
function cap() {
  return {
    consume: vi.fn(async () => ({
      limit: 60,
      remaining: 59,
      resetSeconds: 60,
    })),
  };
}
function send(
  app: ReturnType<typeof Fastify>,
  method: string,
  params?: unknown,
  headers = {},
) {
  return app.inject({
    method: "POST",
    url: endpoint,
    headers,
    payload: { jsonrpc: "2.0", id: 7, method, ...(params ? { params } : {}) },
  });
}
function call(
  app: ReturnType<typeof Fastify>,
  tool: (typeof tools)[number],
  headers = {},
) {
  return send(
    app,
    "tools/call",
    { name: tool.name, arguments: tool.args },
    headers,
  );
}
async function fixture(
  overrides: Partial<Env> = {},
  supplied?: McpResearchSources,
) {
  const app = Fastify();
  apps.push(app);
  const sources = mocks(),
    limiter = cap();
  const cards = { card: vi.fn() };
  await publicMcpRoutes(
    app,
    { ...allEnabled, ...overrides },
    limiter,
    cards,
    undefined,
    supplied ?? sources,
  );
  return { app, sources, cards, limiter };
}
function solve(token: string) {
  for (let i = 0; ; i++) {
    const value = String(i);
    const digest = createHash("sha256").update(`${token}:${value}`).digest();
    if (digest[0] === 0 && digest[1] === 0 && (digest[2]! & 0xc0) === 0)
      return value;
  }
}
const challenge = new CardProofOfWork(secret).issue();
const headers = {
  "x-opsis-pow-challenge": challenge.token,
  "x-opsis-pow-solution": solve(challenge.token),
};

describe("MCP research tool discovery", () => {
  it.each(Array.from({ length: 8 }, (_, bits) => bits))(
    "lists exactly the enabled tools for flag mask %i",
    async (bits) => {
      const { app } = await fixture({
        STOCK_DESK_ENABLED: Boolean(bits & 1),
        LAUNCH_CARDS_ENABLED: Boolean(bits & 2),
        CLAIM_CHECK_ENABLED: Boolean(bits & 4),
      });
      const response = await send(app, "tools/list");
      expect(
        response.json().result.tools.map((tool: { name: string }) => tool.name),
      ).toEqual([
        "token_card",
        "verify_receipt",
        "open_data_assets",
        ...tools.filter((_, i) => bits & (1 << i)).map((tool) => tool.name),
      ]);
      for (const [i, tool] of tools.entries()) {
        if (!(bits & (1 << i)))
          expect((await call(app, tool, headers)).json().error).toMatchObject({
            code: -32000,
            data: { reason: `${tool.reason}_DISABLED` },
          });
      }
    },
  );
  it.each([
    ["RWA_VERIFY_ENABLED", ["stock_desk"]],
    ["EXIT_CHECK_ENABLED", ["stock_desk"]],
    ["PRIVATE_MODE_ENABLED", ["launch_card", "claim_check"]],
    ["OPSIS_WORKSPACES_ENABLED", ["launch_card", "claim_check"]],
  ] as const)("honors prerequisite %s", async (flag, hidden) => {
    const { app, sources } = await fixture({ [flag]: false });
    const listed = (await send(app, "tools/list"))
      .json()
      .result.tools.map((tool: { name: string }) => tool.name);
    for (const name of hidden) {
      expect(listed).not.toContain(name);
      const tool = tools.find((tool) => tool.name === name)!;
      expect((await call(app, tool)).json()).toMatchObject({
        jsonrpc: "2.0",
        id: 7,
        error: { code: -32000, data: { reason: `${tool.reason}_DISABLED` } },
      });
    }
    expect(sources.stockDesk.desk).not.toHaveBeenCalled();
    expect(sources.launchCards.card).not.toHaveBeenCalled();
    expect(sources.claims.check).not.toHaveBeenCalled();
  });
  it.each(["PUBLIC_MCP_ENABLED", "OPEN_DATA_API_ENABLED"] as const)(
    "conceals the endpoint when %s is off",
    async (flag) => {
      const { app } = await fixture({ [flag]: false });
      expect((await send(app, "tools/list")).statusCode).toBe(404);
      for (const tool of tools)
        expect((await call(app, tool, headers)).statusCode).toBe(404);
    },
  );
  it("keeps descriptions bilingual, read-only and informational", () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.description.toLowerCase()).toContain("read-only");
      expect(tool.description.toLowerCase()).toContain("not investment advice");
      expect(tool.description).toContain("只读");
      expect(tool.description).toContain("不构成投资建议");
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });
});

describe("MCP research tool calls", () => {
  it.each(tools)(
    "requires genuine work before $name, including repeated requests",
    async (tool) => {
      const { app, sources, cards, limiter } = await fixture();
      const reads = [
        sources.stockDesk.desk,
        sources.launchCards.card,
        sources.claims.check,
      ];
      const expired = new CardProofOfWork(
        secret,
        () => Date.now() - 121_000,
      ).issue();
      for (const proofHeaders of [
        {},
        { ...headers, "x-opsis-pow-solution": "invalid" },
        { ...headers, "x-opsis-pow-challenge": `${challenge.token}x` },
        { ...headers, "x-opsis-pow-challenge": expired.token },
      ]) {
        const response = await call(app, tool, proofHeaders);
        expect(response.statusCode).toBe(428);
        expect(response.json()).toMatchObject({
          jsonrpc: "2.0",
          id: 7,
          error: { data: { reason: "PROOF_REQUIRED" } },
          challenge: { difficulty: 18 },
        });
      }
      for (const read of reads) expect(read).not.toHaveBeenCalled();
      expect((await call(app, tool, headers)).json().result.isError).toBe(
        false,
      );
      expect((await call(app, tool)).statusCode).toBe(428);
      expect(reads.reduce((sum, read) => sum + read.mock.calls.length, 0)).toBe(
        1,
      );
      expect(cards.card).not.toHaveBeenCalled();
      expect(limiter.consume).toHaveBeenCalledTimes(6);
    },
  );
  it("uses the same app services as private routes and preserves facts, rules, reasons and receipts", async () => {
    const fetch = vi.fn(() => {
      throw new Error("Network forbidden in fixtures");
    });
    vi.stubGlobal("fetch", fetch);
    const sources = mocks();
    const app = await buildApp(allEnabled, undefined, {
      ...sources,
      openDataLimiter: cap(),
      tokenCards: { card: vi.fn() },
    });
    apps.push(app);
    for (const [i, tool] of tools.entries()) {
      const response = await call(app, tool, headers);
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(JSON.parse(response.json().result.content[0].text)).toEqual(
        [desk, launch, { ...claims, disclaimer: ADVICE }][i],
      );
    }
    expect(sources.stockDesk.desk).toHaveBeenCalledWith(asset.address);
    expect(sources.launchCards.card).toHaveBeenCalledWith(address);
    expect(sources.claims.check).toHaveBeenCalledWith(claimArgs);
    const byAddress = {
      ...tools[0]!,
      args: { token: asset.address.toLowerCase() },
    };
    await call(app, byAddress, headers);
    expect(sources.stockDesk.desk).toHaveBeenLastCalledWith(asset.address);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(tools)(
    "returns a JSON-RPC reason when $name has no service",
    async (tool) => {
      const { app } = await fixture({}, {});
      expect((await call(app, tool, headers)).json()).toMatchObject({
        jsonrpc: "2.0",
        id: 7,
        error: { code: -32000, data: { reason: `${tool.reason}_UNAVAILABLE` } },
      });
    },
  );
  it.each(tools)(
    "preserves budget and receipt refusal codes from $name without exposing messages",
    async (tool) => {
      const { app, sources } = await fixture({ RECEIPTS_ENABLED: true });
      const read =
        tool.name === "stock_desk"
          ? sources.stockDesk.desk
          : tool.name === "launch_card"
            ? sources.launchCards.card
            : sources.claims.check;
      for (const [failure, code, reason] of [
        [
          new AppError("DAILY_BUDGET_EXCEEDED", 429, "internal detail"),
          -32000,
          "DAILY_BUDGET_EXCEEDED",
        ],
        [
          new AppError("RECEIPTS_UNAVAILABLE", 503, "internal detail"),
          -32000,
          "RECEIPTS_UNAVAILABLE",
        ],
        [
          new AppError("CLAIM_CONFIRMATION_REQUIRED", 400, "internal detail"),
          -32602,
          "CLAIM_CONFIRMATION_REQUIRED",
        ],
        [new Error("internal detail"), -32000, `${tool.reason}_UNAVAILABLE`],
      ] as const) {
        read.mockRejectedValueOnce(failure);
        const response = await call(app, tool, headers);
        expect(response.json()).toMatchObject({
          jsonrpc: "2.0",
          id: 7,
          error: { code, data: { reason } },
        });
        expect(response.body).not.toContain("internal detail");
        expect(response.json().result).toBeUndefined();
      }
    },
  );
  it.each(["USDG", "WETH", "OTHER", address])(
    "refuses unreviewed Stock Token %s before reading a service",
    async (token) => {
      const { app, sources } = await fixture();
      const response = await send(
        app,
        "tools/call",
        { name: "stock_desk", arguments: { token } },
        headers,
      );
      expect(response.json().error).toMatchObject({
        code: -32602,
        data: { reason: "STOCK_TOKEN_NOT_REVIEWED" },
      });
      expect(sources.stockDesk.desk).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["stock_desk", { token: asset.symbol, notes: "private sample" }],
    ["launch_card", { address: "AAPL" }],
    ["launch_card", { address, calldata: "0x1234" }],
    ["claim_check", { ...claimArgs, confirmed: false }],
    ["claim_check", { ...claimArgs, confirmed: undefined }],
    ["claim_check", { ...claimArgs, address: `0x${"0".repeat(40)}` }],
    ["claim_check", { ...claimArgs, claims: [] }],
    [
      "claim_check",
      { ...claimArgs, claims: Array(33).fill({ type: "unsupported" }) },
    ],
    ["claim_check", { ...claimArgs, postTime: "yesterday" }],
    [
      "claim_check",
      {
        ...claimArgs,
        claims: [{ type: "top10", comparison: "under", percent: "100.1" }],
      },
    ],
    ["claim_check", { ...claimArgs, notes: "private sample" }],
  ])("validates %s arguments before invoking services", async (name, args) => {
    const { app, sources } = await fixture();
    const response = await send(
      app,
      "tools/call",
      { name, arguments: args },
      headers,
    );
    expect(response.json().error).toMatchObject({
      code: -32602,
      data: { reason: "INVALID_TOOL_ARGUMENTS" },
    });
    expect(response.body).not.toContain("private sample");
    expect(sources.stockDesk.desk).not.toHaveBeenCalled();
    expect(sources.launchCards.card).not.toHaveBeenCalled();
    expect(sources.claims.check).not.toHaveBeenCalled();
  });
  it("normalizes unknown claim types with the private validator", async () => {
    const { app, sources } = await fixture();
    const args = { ...claimArgs, claims: [{ type: "custom_claim" }] };
    await send(
      app,
      "tools/call",
      { name: "claim_check", arguments: args },
      headers,
    );
    expect(sources.claims.check).toHaveBeenCalledWith({
      ...args,
      claims: [{ type: "unsupported" }],
    });
  });
});

describe("MCP claim JSON Schema", () => {
  it("matches the private validator for every claim shape and percentage bounds", () => {
    const schema = MCP_TOOLS.find(
      (tool) => tool.name === "claim_check",
    )!.inputSchema;
    const validate = new Ajv({ strict: false, validateFormats: false }).compile(
      schema,
    );
    const candidates = [
      ...["ownership", "paused", "lpBurned", "verified"].map((type) => ({
        type,
        expected: false,
      })),
      ...[
        "0",
        "000",
        "001.001",
        "99.999999",
        "100",
        "100.000000",
        "101",
        "100.000001",
        "1.0000001",
        "-1",
        "1e1",
      ].map((percent) => ({ type: "top10", comparison: "under", percent })),
      { type: "deployer", comparison: "equal", percent: "2.5" },
      { type: "launchpad", launchpad: "pons" },
      { type: "launchpad", launchpad: "other" },
      { type: "tax", buy: null, sell: "0" },
      { type: "tax", buy: "101", sell: "0" },
      { type: "unsupported" },
      { type: "custom_claim" },
      { type: "paused" },
      { type: "custom_claim", text: "untrusted" },
    ];
    for (const claim of candidates) {
      const args = { ...claimArgs, claims: [claim] };
      expect(Boolean(validate(args)), JSON.stringify(claim)).toBe(
        claimRequestSchema.safeParse(args).success,
      );
    }
    for (const contract of [
      address.replace("0x", "0X"),
      `0X${"0".repeat(40)}`,
    ]) {
      const args = { ...claimArgs, address: contract };
      expect(Boolean(validate(args))).toBe(
        claimRequestSchema.safeParse(args).success,
      );
    }
  });
});
