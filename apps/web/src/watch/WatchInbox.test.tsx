import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import WatchInbox from "./WatchInbox";
import { captureWatch } from "./model";
import { watchFixture } from "./fixture";

const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("../opsis/copy", () => ({ useCopy: () => (en: string, zh: string) => language.chinese ? zh : en }));

describe("Watch inbox token labels", () => {
  it.each([false, true])("renders names, visible symbols and localized lookalike tags in options and changed rows: Chinese=%s", (chinese) => {
    language.chinese = chinese;
    const before = watchFixture();
    before.tokens[0].name = "Reported\u202ename";
    before.tokens[0].symbol = "N\u200bVDA";
    const after = watchFixture(101);
    after.tokens[0] = { ...before.tokens[0], quantity: "5", rawBalance: "5000000000000000000" };
    const watch = captureWatch(after, "Sample wallet", captureWatch(before, "Sample wallet"));
    const html = renderToStaticMarkup(<MemoryRouter><WatchInbox watches={[watch]} /></MemoryRouter>);
    expect(html).toContain("Reported[U+202E]name · N[U+200B]VDA");
    expect(html).toContain(chinese ? "同符号不同合约" : "Lookalike");
    expect(html).not.toContain("\u200b");
    expect(html).not.toContain("\u202e");
  });

  it("renders a baseline without tokens", () => {
    const snapshot = watchFixture();
    snapshot.tokens = [];
    expect(renderToStaticMarkup(<MemoryRouter><WatchInbox watches={[captureWatch(snapshot, "Sample wallet")]} /></MemoryRouter>)).toContain("ETH");
  });
});
