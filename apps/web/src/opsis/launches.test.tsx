import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import LaunchCard, { LaunchCardView } from "./LaunchCard";
import LaunchRadar, { LaunchFeedView } from "./LaunchRadar";
import {
  correctionUrl,
  readLaunches,
  sortLaunches,
  type LaunchCardData,
  type LaunchFeed,
} from "./launch-model";
import { unlockPreview } from "./model";
import { researchToolPaths, routeTitle, toolGroups } from "./shell-model";
import { capabilityRows } from "./status-model";
import { statusDetails } from "./status-copy";
import { readFileSync } from "node:fs";
const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("./copy", () => ({
  useCopy: () => (en: string, zh: string) => (language.chinese ? zh : en),
}));
const token = `0x${"1".repeat(40)}`,
  other = `0x${"2".repeat(40)}`,
  wallet = `0x${"3".repeat(40)}`,
  hash = `0x${"a".repeat(64)}`;
const time = "2026-10-20T00:00:00.000Z",
  label = "Simulation at block 12345; behaviour can change.";
const rule = {
  text: "early buyer (rule v1): received the token from the launch's curve or pool within 10 seconds of trading opening, in a transaction this wallet signed itself.",
  version: "v1",
};
const unknown = {
  state: "unknown" as const,
  reason: "Fixture evidence missing",
};
const card: LaunchCardData = {
  token,
  anchor: { blockNumber: 12345, blockHash: hash, timestamp: time },
  launch: {
    state: "partial",
    reason: "Registry scan capped",
    value: {
      launchpad: "Pons",
      created: { timestamp: time },
      t0: null,
      unknownReasons: {
        t0: "Trading start unknown",
        deployer: "Factory event lacks deployer",
      },
      confirmation: "unconfirmed by the launchpad",
      sourceNote: "Fixture registry",
    },
  },
  buyers: {
    state: "partial",
    reason: "Transaction cap reached",
    value: {
      windows: [
        {
          tags: [{ kind: "early buyer", wallet, transactionHash: hash, rule }],
        },
      ],
    },
  },
  supplyByTag: {
    state: "partial",
    reason: "Balance cap reached",
    value: {
      byTag: [
        {
          tag: "early buyer",
          supplyShare: {
            state: "partial",
            reason: "1 of 2 balances checked",
            value: {
              numerator: "123456789012345678901",
              denominator: "1000000000000000000000",
            },
          },
          checked: 1,
          discovered: 2,
        },
      ],
    },
  },
  deployerHistory: {
    state: "partial",
    reason: "History window capped",
    value: {
      count: 1,
      launches: [{ token: other, launchTime: time }],
      liquidityHistory: unknown,
    },
  },
  deployerDistributions: unknown,
  lpStatus: unknown,
  permissions: unknown,
  sellTest: {
    label,
    results: [
      {
        notionalUsd: "100",
        delaySeconds: 0,
        label,
        state: "available",
        spentRaw: "100000000",
        boughtRaw: "10",
        receivedRaw: "99000000",
        roundTripCost: {
          numerator: "1000000",
          denominator: "100000000",
          decimal: "0.010000",
        },
        buyTax: unknown,
        sellTax: unknown,
      },
      {
        notionalUsd: "1000",
        delaySeconds: 3600,
        label,
        state: "sell reverted",
        revertData: "0xdeadbeef",
      },
      {
        notionalUsd: "10000",
        delaySeconds: 86400,
        label,
        state: "unavailable",
        reason: "Method not supported",
      },
    ],
    limitations: ["Fixture simulation limitation"],
  },
  disclaimer: "Not investment advice",
};
const feed: LaunchFeed = {
  minutes: 30,
  anchor: { blockNumber: 12345, timestamp: time },
  observedAt: time,
  expiresAt: "2026-10-20T00:01:00.000Z",
  coverage: { state: "partial", fromBlock: 100, toBlock: 12345, t0Unknown: 1 },
  entries: [
    {
      token,
      launchpad: "Pons",
      deployer: null,
      created: { timestamp: time },
      t0: null,
      unknownReasons: {
        t0: "Trading start unknown",
        deployer: "Factory event lacks deployer",
      },
      partial: true,
    },
    {
      token: other,
      launchpad: "Long",
      deployer: wallet,
      created: { timestamp: "2026-10-19T23:59:00.000Z" },
      t0: { timestamp: time },
      unknownReasons: {},
    },
  ],
};
afterEach(() => {
  language.chinese = false;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("launch fact fixture presentation", () => {
  it.each([false, true])(
    "renders facts, exact rule tooltips and partial/unknown reasons in Chinese=%s",
    (chinese) => {
      language.chinese = chinese;
      const html = renderToStaticMarkup(<LaunchCardView card={card} />);
      for (const reason of [
        "Registry scan capped",
        "Transaction cap reached",
        "Balance cap reached",
        "History window capped",
        "Fixture evidence missing",
        "Method not supported",
        "Trading start unknown",
      ])
        expect(html).toContain(reason);
      expect(html).toContain(rule.text.replaceAll("'", "&#x27;"));
      expect(html).toContain('role="tooltip"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain("v1");
      for (const fact of [
        "123456789012345678901",
        "1000000000000000000000",
        "0xdeadbeef",
        "0.010000",
        other,
      ])
        expect(html).toContain(fact);
      expect(html).toContain(chinese ? "部署者历史" : "Deployer history");
      expect(html).toContain(chinese ? "非投资建议" : "Not investment advice");
      expect(html).not.toMatch(
        /\b(safe|scam|rug|honeypot|sniper|insider|guaranteed|will|best|recommended)\b/i,
      );
      expect(html).not.toContain("<button");
      expect(html).not.toContain("Dispute");
      expect(html.split(label).length - 1).toBe(4);
    },
  );
  it("shows correction links on tags and labels only when configured", () => {
    vi.stubEnv("VITE_CORRECTION_URL", "https://corrections.example/channel");
    const html = renderToStaticMarkup(<LaunchCardView card={card} />);
    expect(html).toContain('href="https://corrections.example/channel"');
    expect(html.match(/>Dispute<\/a>/g)!.length).toBeGreaterThan(10);
    for (const value of [
      "",
      "javascript:alert(1)",
      "https://user:password@example.test",
    ])
      expect(correctionUrl(value)).toBeNull();
  });
  it("renders no feature or requests while off, including direct client calls", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      renderToStaticMarkup(<LaunchCard enabled={false} token={token} />),
    ).toBe("");
    expect(renderToStaticMarkup(<LaunchRadar enabled={false} />)).toBe("");
    await expect(readLaunches(false, token)).rejects.toThrow("unavailable");
    await expect(readLaunches(false)).rejects.toThrow("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fetches only the explicit public token or feed with no cookies or cache", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(card)));
    vi.stubGlobal("fetch", fetcher);
    expect(await readLaunches(true, token)).toEqual(card);
    expect(fetcher).toHaveBeenCalledWith(
      `/v1/private/opsis/launches/${token}`,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-store",
      }),
    );
    fetcher.mockResolvedValue(new Response(JSON.stringify(feed)));
    expect(await readLaunches(true)).toEqual(feed);
    expect(fetcher).toHaveBeenLastCalledWith(
      "/v1/private/opsis/launches",
      expect.anything(),
    );
    fetcher.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(readLaunches(true)).rejects.toThrow("503");
    fetcher.mockResolvedValue(new Response("{}"));
    await expect(readLaunches(true)).rejects.toThrow("malformed");
    fetcher.mockClear();
    await expect(readLaunches(true, "invalid")).rejects.toThrow(
      "Invalid token",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "renders feed read window and token links in Chinese=%s",
    (chinese) => {
      language.chinese = chinese;
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LaunchFeedView feed={feed} />
        </MemoryRouter>,
      );
      expect(html).toContain(chinese ? "部分数据" : "Partial feed");
      expect(html).toContain(chinese ? "读取范围" : "Read window");
      expect(html).toContain("30");
      expect(html).toContain('value="launchpad"');
      expect(html).toContain('value="deployer"');
      expect(html).toContain(`/research?entity=${token}`);
      expect(html).toContain("Factory event lacks deployer");
      expect(html).toContain("Trading start unknown");
      expect(html.indexOf(token)).toBeLessThan(html.indexOf(other));
      expect(html).not.toMatch(/top picks|score/i);
    },
  );
  it.each([false, true])(
    "retains unknown-time feed entries and their block in Chinese=%s",
    async (chinese) => {
      language.chinese = chinese;
      const unknownTime: LaunchFeed = {
        ...feed,
        minutes: 10,
        entries: [
          {
            ...feed.entries[0]!,
            created: { timestamp: null, blockNumber: 12340 },
            t0: null,
          },
        ],
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify(unknownTime))),
      );
      expect(await readLaunches(true)).toEqual(unknownTime);
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <LaunchFeedView feed={unknownTime} />
        </MemoryRouter>,
      );
      expect(html).toContain(chinese ? "时间未知" : "Time unknown");
      expect(html).toContain("12340");
      expect(html).toContain(token);
    },
  );
  it("sorts by event time, launchpad or deployer without mutating feed order", () => {
    expect(sortLaunches(feed.entries, "time").map((row) => row.token)).toEqual([
      token,
      other,
    ]);
    expect(
      sortLaunches(feed.entries, "launchpad").map((row) => row.token),
    ).toEqual([other, token]);
    expect(sortLaunches(feed.entries, "deployer")[0]!.token).toBe(token);
    expect(feed.entries[0]!.token).toBe(token);
  });
  it("registers the guarded lazy route, title, retry chunks and Look up tool", () => {
    const base = {
      expiresAt: time,
      chainId: 4663 as const,
      research: true,
      exitCheck: false,
      watch: false,
      rwa: false,
      observedTrades: false,
      perpExecution: false as const,
    };
    expect(researchToolPaths(base)).not.toContain("/research/launches");
    expect(researchToolPaths({ ...base, launchCards: true })).toContain(
      "/research/launches",
    );
    expect(
      toolGroups({ ...base, launchCards: true })[0]!.tools.some(
        (t) => t.path === "/research/launches",
      ),
    ).toBe(true);
    expect(routeTitle("/research/launches", "en")).toBe("Opsis · Launch Radar");
    expect(routeTitle("/research/launches", "zh-CN")).toContain("发行雷达");
    const app = readFileSync(
      new URL("./OpsisApp.tsx", import.meta.url),
      "utf8",
    );
    expect(app).toContain("lazy(chunks.LaunchRadar.load)");
    expect(app).toMatch(
      /path="\/research\/launches"[^\n]*access.launchCards === true/,
    );
    const retries = readFileSync(
      new URL("../product/page-imports.ts", import.meta.url),
      "utf8",
    );
    expect(retries.match(/\/src\/opsis\/LaunchRadar.tsx/g)).toHaveLength(2);
    expect(
      capabilityRows({ ...base, launchCards: false }).find(
        (row) => row.id === "launchCards",
      )?.enabled,
    ).toBe(false);
    expect(statusDetails.launchCards.label[1]).toContain("发行");
  });
  it("accepts optional launchCards parity and refuses mismatched or malformed rows", async () => {
    const base = {
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      chainId: 4663,
      research: true,
      tokenControls: false,
      exitCheck: false,
      watch: false,
      rwa: false,
      observedTrades: false,
      perpExecution: false,
    };
    const parse = async (body: unknown) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(body))),
      );
      return unlockPreview("", new AbortController().signal);
    };
    expect((await parse(base)).launchCards).toBeUndefined();
    const rows = Object.entries(base)
      .filter(([key]) =>
        [
          "research",
          "tokenControls",
          "exitCheck",
          "watch",
          "rwa",
          "observedTrades",
        ].includes(key),
      )
      .map(([id, enabled]) => ({
        id,
        enabled,
        scope: "fixture",
        origin: "fixture",
        freshness: "fixture",
        coverage: "partial",
        limits: "unknown",
      }));
    const manifest = {
      version: 1,
      chain: { id: 4663, name: "Robinhood Chain" },
      build: null,
      capabilities: rows,
    };
    for (const enabled of [false, true]) {
      const withRow = {
        ...manifest,
        capabilities: [
          ...rows,
          {
            id: "launchCards",
            enabled,
            scope: "fixture",
            origin: "fixture",
            freshness: "fixture",
            coverage: "partial",
            limits: "unknown",
          },
        ],
      };
      expect(
        (await parse({ ...base, launchCards: enabled, manifest: withRow }))
          .launchCards,
      ).toBe(enabled);
      await expect(
        parse({ ...base, launchCards: !enabled, manifest: withRow }),
      ).rejects.toThrow("Invalid preview response");
    }
    await expect(
      parse({ ...base, launchCards: true, manifest }),
    ).rejects.toThrow();
    for (const invalid of [null, "true", 1, {}, []])
      await expect(parse({ ...base, launchCards: invalid })).rejects.toThrow();
  });
});
