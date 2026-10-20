import { linkedBubbleOption } from "./linked-wallets-chart";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LinkedWalletGraph } from "@rh-chain/shared";
import LinkedWallets, { LinkedWalletObservation } from "./LinkedWallets";
import {
  loadLinkedWallets,
  shareText,
  validLinkedGraph,
} from "./linked-wallets-model";
import { unlockPreview } from "./model";
import { capabilityRows } from "./status-model";
import { statusDetails } from "./status-copy";
const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("./copy", () => ({
  useCopy: () => (en: string, zh: string) => (language.chinese ? zh : en),
}));
vi.mock("../charts/EvidenceChart", () => ({
  EvidenceChart: ({ label }: { label: string }) => (
    <div role="img" aria-label={label} />
  ),
}));
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const token = addr(1000),
  a = addr(1),
  b = addr(2),
  funder = addr(2000);
function graph(): LinkedWalletGraph {
  const share = { numerator: "2", denominator: "100" };
  return {
    schemaVersion: 1,
    chainId: 4663,
    token,
    state: "partial",
    servedFrom: "cache",
    observedAt: "2026-10-19T12:00:00Z",
    expiresAt: "2026-10-19T12:10:00Z",
    anchor: {
      blockNumber: 100,
      blockHash: hash(101),
      timestamp: "2026-10-19T12:00:00Z",
    },
    methodVersion: "linked-by-funding/2",
    registryVersion: "funding-hubs/1",
    holders: [
      {
        wallet: a,
        balanceRaw: "1",
        share: { numerator: "1", denominator: "100" },
        funding: "checked",
      },
      {
        wallet: b,
        balanceRaw: "1",
        share: { numerator: "1", denominator: "100" },
        funding: "not checked (cap)",
      },
    ],
    excluded: [],
    groups: [
      {
        id: a,
        members: [a, b],
        share,
        status: "linked by funding",
        links: [
          {
            from: funder,
            to: a,
            kind: "first_funding",
            transactionHashes: [hash(1)],
          },
          {
            from: funder,
            to: b,
            kind: "first_funding",
            transactionHashes: [hash(2)],
          },
        ],
      },
    ],
    weakLinks: [
      {
        from: a,
        to: b,
        kind: "same_second",
        transactionHashes: [hash(3), hash(4)],
      },
    ],
    cappedLinks: [],
    hubs: [{ wallet: addr(6000), reason: "fan_out", fanOut: 51 }],
    notChecked: [{ wallet: b, reason: "not checked (cap)" }],
    totals: {
      largestGroup: share,
      largestSingleWallet: { numerator: "1", denominator: "100" },
    },
    coverage: {
      explorerCalls: 5,
      explorerCreditsReserved: 250,
      rpcCalls: 8,
      holderSelection: "explorer latest, not block-pinned",
      holderListComplete: true,
      launchFacts: "checked",
      reasons: ["Funding read budget or cap reached"],
    },
    limits: "Funding inferences only",
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  language.chinese = false;
});
it("capability off renders no section and makes no request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(
    renderToStaticMarkup(<LinkedWallets token={token} enabled={false} />),
  ).toBe("");
  expect(await loadLinkedWallets(token, false)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it("shows the limits before any request, in both languages", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const en = renderToStaticMarkup(<LinkedWallets token={token} enabled />);
  expect(en).toContain("Wallets linked by funding");
  expect(en).toContain("Linked wallets are inferences from funding.");
  expect(en).toContain(
    "Linked wallets may belong to different people, and one actor can avoid links.",
  );
  expect(en).toContain("Hubs are excluded. Not investment advice.");
  language.chinese = true;
  const zh = renderToStaticMarkup(<LinkedWallets token={token} enabled />);
  expect(zh).toContain("资金关联钱包");
  expect(zh).toContain("非投资建议");
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([false, true])(
  "renders groups, equivalent holder table, weak links and unchecked holders in Chinese=%s",
  (chinese) => {
    language.chinese = chinese;
    const html = renderToStaticMarkup(
      <LinkedWalletObservation data={graph()} />,
    );
    expect(html).toContain(
      chinese ? "持有人等效表格" : "Holder table equivalent",
    );
    expect(html).toContain(chinese ? "资金关联组" : "Funding groups");
    expect(html).toContain(
      chinese ? "未检查（达到上限）" : "not checked (cap)",
    );
    expect(html).toContain(chinese ? "缓存" : "Cached");
    expect(html).toContain("2026-10-19T12:00:00Z");
    expect(html).toContain("2.00% (2/100)");
    expect(html).toContain(
      `https://robinhoodchain.blockscout.com/tx/${hash(1)}`,
    );
    for (const wallet of [a, b, funder]) expect(html).toContain(`href="https://robinhoodchain.blockscout.com/address/${wallet}"`);
    expect(html).not.toContain(`/tx/${graph().anchor.blockHash}`);
    expect(html).toContain(chinese ? "在 Blockscout 查看 ↗" : "View on Blockscout ↗");
    expect(html).toContain(chinese ? "自动标记" : "Auto-flagged");
    expect(html).toContain(
      chinese ? "同秒购买（弱关联）" : "Buys in the same second (weak)",
    );
  },
);
it("bubble sizes use exact fractions for conversion, colours follow groups and animation is disabled", () => {
  const option = linkedBubbleOption(graph());
  const data = option.series[0].data;
  expect(option.animation).toBe(false);
  expect(data).toHaveLength(2);
  expect(data[0].itemStyle.color).toBe(data[1].itemStyle.color);
  expect(data[0].name).toContain(a);
  expect(data[0].symbolSize).toBeGreaterThan(8);
  expect(
    shareText(
      { numerator: "9007199254740993", denominator: "10000000000000000" },
      "Unknown",
    ),
  ).toBe("90.07% (9007199254740993/10000000000000000)");
  expect(shareText(null, "未知")).toBe("未知");
});
it("requests only a public token using GET and rejects malformed responses", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(graph())));
  vi.stubGlobal("fetch", fetcher);
  expect((await loadLinkedWallets(token, true))?.servedFrom).toBe("cache");
  expect(fetcher.mock.calls[0][0]).toContain(
    `/v1/private/opsis/linked-wallets/${token}`,
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: "GET",
    credentials: "omit",
    cache: "no-store",
  });
  expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  fetcher.mockResolvedValueOnce(new Response("{}"));
  await expect(loadLinkedWallets(token, true)).rejects.toThrow(
    "Invalid linked-wallet observation",
  );
  fetcher.mockResolvedValueOnce(new Response("", { status: 503 }));
  await expect(loadLinkedWallets(token, true)).rejects.toThrow("unavailable");
});
it("validates token, fractions, link hashes and group membership", () => {
  expect(validLinkedGraph(graph(), token)).toBe(true);
  for (const mutation of [
    (g: LinkedWalletGraph) => {
      g.token = a;
    },
    (g: LinkedWalletGraph) => {
      g.groups[0].share = { numerator: "2", denominator: "0" };
    },
    (g: LinkedWalletGraph) => {
      g.groups[0].links[0].transactionHashes = ["javascript:alert(1)"];
    },
    (g: LinkedWalletGraph) => {
      g.groups[0].members = [a, a];
    },
  ]) {
    const g = graph();
    mutation(g);
    expect(validLinkedGraph(g, token)).toBe(false);
  }
});

describe("linkedWallets capability compatibility and parity", () => {
  function body() {
    return {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      chainId: 4663,
      research: true,
      tokenControls: false,
      exitCheck: false,
      watch: false,
      rwa: false,
      observedTrades: false,
      perpExecution: false,
      manifest: {
        version: 1,
        chain: { id: 4663, name: "Robinhood Chain" },
        build: null,
        capabilities: [
          "research",
          "tokenControls",
          "exitCheck",
          "watch",
          "rwa",
          "observedTrades",
        ].map((id) => ({
          id,
          enabled: id === "research",
          scope: "scope",
          origin: "on request",
          freshness: "per request",
          coverage: "bounded",
          limits: "partial",
        })),
      },
    };
  }
  const row = (enabled: boolean) => ({
    id: "linkedWallets",
    enabled,
    scope: "top holders",
    origin: "on request",
    freshness: "cached",
    coverage: "bounded",
    limits: "funding inferences",
  });
  async function parse(value: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(value))),
    );
    return unlockPreview("", new AbortController().signal);
  }
  it("accepts older manifests and either boolean with matching new row", async () => {
    expect((await parse(body())).linkedWallets).toBeUndefined();
    for (const enabled of [false, true]) {
      const v = { ...body(), linkedWallets: enabled };
      v.manifest.capabilities.push(row(enabled));
      expect((await parse(v)).linkedWallets).toBe(enabled);
    }
  });
  it("rejects missing enabled rows, mismatches and malformed flags", async () => {
    await expect(parse({ ...body(), linkedWallets: true })).rejects.toThrow(
      "Invalid preview response",
    );
    for (const [flag, manifestFlag] of [
      [true, false],
      [false, true],
      [undefined, true],
      [null, true],
      [1, true],
      ["true", true],
    ]) {
      const v = { ...body(), linkedWallets: flag };
      v.manifest.capabilities.push(row(manifestFlag as boolean));
      await expect(parse(v)).rejects.toThrow("Invalid preview response");
    }
  });
  it("adds a disabled Data status row with bilingual limits for older servers", async () => {
    const rows = capabilityRows(
      await parse({ ...body(), manifest: undefined }),
    );
    expect(rows.find((r) => r.id === "linkedWallets")?.enabled).toBe(false);
    expect(statusDetails.linkedWallets.label).toEqual([
      "Wallets linked by funding",
      "资金关联钱包",
    ]);
    expect(statusDetails.linkedWallets.limits[1]).toContain("非投资建议");
  });
});

it.each([false, true])(
  "accepts and displays top-N and hub exclusions in Chinese=%s",
  (chinese) => {
    const data = graph();
    data.holders[0]!.funding = "not checked (known hub)";
    data.holders[1]!.funding = "not checked (beyond top N)";
    data.notChecked = [
      { wallet: a, reason: "not checked (known hub)" },
      { wallet: b, reason: "not checked (beyond top 20)" },
    ];
    expect(validLinkedGraph(data, token)).toBe(true);
    language.chinese = chinese;
    const html = renderToStaticMarkup(<LinkedWalletObservation data={data} />);
    expect(html).toContain(
      chinese ? "不在前 20 名内" : "not checked (beyond top 20)",
    );
    expect(html).toContain(chinese ? "已知枢纽" : "not checked (known hub)");
  },
);
