import { readFileSync } from "node:fs";
import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PerpHandoff from "./PerpHandoff";
import type { Capabilities } from "./model";

// The existing runner is Node-only. Capture real event handlers and rerender
// their state without installing a DOM or launching a browser.
const harness = vi.hoisted(() => ({ states: [null, null] as unknown[], index: 0, locale: "en" }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useId: () => "handoff-test", useState: (initial: unknown) => {
    const index = harness.index++;
    return [harness.states[index] === undefined ? initial : harness.states[index], (next: unknown) => { harness.states[index] = next; }];
  } };
});
vi.mock("../i18n", () => ({ useI18n: () => ({ locale: harness.locale }) }));
const capabilities: Capabilities = {
  expiresAt: "2026-10-12T01:00:00Z", chainId: 4663,
  research: true, exitCheck: false, watch: false, rwa: false,
  observedTrades: false, perpExecution: false, perpHandoff: true,
};
const summary = ["Hypothetical estimate", "Collateral: 100 USD", "The venue's own figure governs."];
function tree(lines: string[] | null = summary, flags = capabilities) {
  harness.index = 0;
  return PerpHandoff({ capabilities: flags, summary: lines });
}
function markup(lines: string[] | null = summary, flags = capabilities) {
  return renderToStaticMarkup(tree(lines, flags));
}
function elements(node: ReactNode): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [{ type: node.type, props: node.props }, ...elements(node.props.children as ReactNode)];
}
async function clickCopy(lines: string[] = summary) {
  const button = elements(tree(lines)).find((element) => element.type === "button");
  expect(button).toBeDefined();
  await (button!.props.onClick as () => Promise<void>)();
}
beforeEach(() => {
  harness.states = [null, null];
  harness.index = 0;
  harness.locale = "en";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PerpHandoff", () => {
  it("renders nothing for absent or disabled capability", () => {
    expect(markup(null, { ...capabilities, perpHandoff: false })).toBe("");
    expect(markup(null, { ...capabilities, perpHandoff: undefined })).toBe("");
  });
  it("starts with no selected region, disclosure and no venue cards", () => {
    const html = markup(null);
    expect(html).toContain("Opsis has no perp trading.");
    expect(html).toContain("Not investment advice.");
    expect(html).toContain("Where do you live?");
    expect(html).not.toContain("checked=\"\"");
    expect(html).not.toContain("opsis-perp-venue\"");
    expect(html).toContain("Complete the scenario above");
    expect(html).not.toContain("Copy summary");
  });
  it("updates a radio choice in component state", () => {
    const radio = elements(tree()).find((element) => element.type === "input" && element.props.value === "ca");
    (radio!.props.onChange as () => void)();
    expect(markup()).toContain("No venue in this directory offers perpetual futures to retail customers in Canada.");
  });
  it("shows the US cards alphabetically with exact boundaries and clean links", () => {
    harness.states[0] = "us";
    const html = markup();
    expect(html.indexOf("<h3>Coinbase</h3>")).toBeLessThan(html.indexOf("<h3>Kalshi</h3>"));
    expect(html.indexOf("<h3>Kalshi</h3>")).toBeLessThan(html.indexOf("<h3>Kraken</h3>"));
    expect(html).toContain("Availability can differ by state");
    expect(html).toContain("6x");
    expect(html).toContain("Checked 12 October 2026");
    expect(html).toContain("derivatives accounts are funded in US dollars");
    expect(html).toContain("eligible US clients");
    expect(html).not.toContain("Not offered to residents");
    const links = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
    expect(links).toHaveLength(9);
    for (const link of links) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain("↗</a>");
      expect(link.match(/href="([^"]+)"/)?.[1]).not.toMatch(/[?#]|ref|utm|affiliate/i);
    }
  });
  it("makes Canadian retail absence explicit before the restricted Coinbase card", () => {
    harness.states[0] = "ca";
    const html = markup();
    expect(html.indexOf("No venue in this directory")).toBeLessThan(html.indexOf("<h3>Coinbase</h3>"));
    expect(html).toContain("Eligible customers only");
    expect(html).toContain("at least $5 million excluding real estate");
    expect(html).toContain("registration as an investment adviser or dealer");
    expect(html).toContain("customers attest to eligibility during onboarding");
    expect(html).toContain("collateral is US dollars");
    expect(html).toContain("Not offered to residents of Canada");
    expect(html.indexOf("<h4>Kalshi</h4>")).toBeLessThan(html.indexOf("<h4>Kraken</h4>"));
    expect(html).not.toContain("Open Kalshi");
    expect(html).not.toContain("Open Kraken");
    expect(html).toContain("Kraken&#x27;s eligibility page lists Canada as not eligible for its derivatives");
  });
  it("shows only a coverage boundary for elsewhere", () => {
    harness.states[0] = "other";
    const html = markup();
    expect(html).toContain("Opsis has reviewed venues for the United States and Canada only");
    expect(html).not.toContain("<article");
    expect(html).not.toContain("href=");
  });
  it("marks stale review and replaces offered card wording", () => {
    harness.states[0] = "us";
    vi.setSystemTime(new Date("2027-02-10T00:00:00.001Z"));
    const html = markup();
    expect(html).toContain("is due for review");
    expect(html).toContain("Listed when last checked");
    expect(html).not.toContain("Offered, per");
    expect(html).toContain("Confirm on each venue&#x27;s own page");
    harness.states[0] = "ca";
    expect(markup()).toContain("Eligible customers only");
  });
  it("localizes every directory state and date in Simplified Chinese", () => {
    harness.locale = "zh-CN";
    for (const region of [null, "us", "ca", "other"]) {
      harness.states[0] = region;
      const html = markup(["假设情景估算"]);
      expect(html).toContain("带着情景前往交易场所");
      expect(html).toContain("您住在哪里？");
      expect(html).toContain("复制摘要");
      expect(html).not.toContain("What the venue says");
      expect(html).not.toContain("United States");
      if (region === "us" || region === "ca") expect(html).toContain("2026年10月12日");
    }
    harness.states[0] = "ca";
    expect(markup()).toContain("此目录中没有场所向加拿大零售客户提供永续期货");
    vi.setSystemTime(new Date("2027-02-11T00:00:00Z"));
    expect(markup()).toContain("现需再次查阅");
  });
  it("copies the caller's plain-text lines and announces success only after resolution", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const pending = clickCopy();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(summary.join("\n"));
    expect(markup()).not.toContain(">Copied<");
    resolve();
    await pending;
    expect(markup()).toContain(">Copied<");
    expect(markup(["New estimate"])).not.toContain(">Copied<");
  });
  it.each(["rejected", "missing"])("offers selectable text when clipboard is %s", async (mode) => {
    vi.stubGlobal("navigator", mode === "missing" ? {} : { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    await clickCopy();
    const html = markup();
    expect(html).toContain("Copy failed. Select the text and copy it yourself.");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Hypothetical estimate\nCollateral: 100 USD");
  });
  it("keeps network, persistence and location APIs out of the perp hand-off sources", () => {
    const prohibited = ["fetch(", "XMLHttpRequest", "sendBeacon", "localStorage", "sessionStorage", "document.cookie", "navigator.geolocation", "location.search"];
    for (const filename of ["PerpHandoff.tsx", "perp-venues.ts"]) {
      const source = readFileSync(new URL(filename, import.meta.url), "utf8");
      for (const token of prohibited) expect(source, filename).not.toContain(token);
    }
  });
});
