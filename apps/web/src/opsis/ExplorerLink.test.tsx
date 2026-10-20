import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExplorerLink, type ExplorerKind } from "./ExplorerLink";

const language = vi.hoisted(() => ({ chinese: false }));
vi.mock("./copy", () => ({ useCopy: () => (en: string, zh: string) => language.chinese ? zh : en }));
const address = `0x${"aB".repeat(20)}`;
const hash = `0x${"cD".repeat(32)}`;
const render = (kind: ExplorerKind, value: string) => renderToStaticMarkup(<ExplorerLink kind={kind} value={value} />);
afterEach(() => { language.chinese = false; vi.restoreAllMocks(); });

describe("public Blockscout links", () => {
  it.each(["address", "token", "tx"] as const)("builds an exact %s URL without fetching", (kind) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const value = kind === "tx" ? hash : address;
    const html = render(kind, value);
    expect(html).toContain(`href="https://robinhoodchain.blockscout.com/${kind}/${value}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain(`aria-label="View ${value.slice(0, 6)}…${value.slice(-4)} on Blockscout"`);
    expect(html).toContain('title="View on Blockscout ↗"');
    expect(html).toContain('<span aria-hidden="true">↗</span>');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["address", "token", "tx"] as const)("rejects malformed or wrong-length %s values", (kind) => {
    const value = kind === "tx" ? hash : address;
    for (const invalid of ["", "0x", value.slice(2), `0X${value.slice(2)}`, value.slice(0, -1), `${value}0`,
      `${value}\n`, `${value}\r\n`, ` ${value}`, `${value} `, `${value}?tab=logs`, `${value}/extra`,
      `${value.slice(0, -1)}g`, `${value.slice(0, -1)}０`, "javascript:alert(1)", "https://example.test/", kind === "tx" ? address : hash]) {
      expect(render(kind, invalid), invalid).toBe("");
    }
  });

  it("fails closed for malformed runtime props", () => {
    expect(render("block" as ExplorerKind, hash)).toBe("");
    expect(render("address", null as unknown as string)).toBe("");
    expect(render("address", undefined as unknown as string)).toBe("");
  });

  it("accepts the zero address and localizes the title and accessible name", () => {
    language.chinese = true;
    const html = render("address", `0x${"0".repeat(40)}`);
    expect(html).toContain('title="在 Blockscout 查看 ↗"');
    expect(html).toContain('aria-label="在 Blockscout 查看 0x0000…0000"');
    expect(html).not.toContain("View");
  });
});
