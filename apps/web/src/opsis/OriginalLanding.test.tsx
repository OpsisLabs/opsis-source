import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import OriginalLanding from "./OriginalLanding";
import { connectFilm } from "./OriginalLanding.bridge";

vi.mock("../i18n", () => ({ useI18n: () => ({ locale: "en" }) }));

// The existing Vitest setup runs in Node. EventTarget exercises the real bridge;
// server rendering checks the React iframe without adding a DOM dependency.
function film() {
  const lock = { hidden: false };
  const document = Object.assign(new EventTarget(), {
    getElementById: (id: string) => id === "lock-preview" ? lock : null,
  }) as unknown as Document;
  const navigate = vi.fn();
  const capabilities = vi.fn();
  document.addEventListener("opsis:capabilities", (event) =>
    capabilities((event as CustomEvent).detail),
  );
  const open = (tool: unknown, entity?: string) => document.dispatchEvent(
    new CustomEvent("opsis:navigate", { detail: { type: "opsis:open-tool", tool, entity } }),
  );
  return { document, lock, navigate, capabilities, open };
}

describe("OriginalLanding", () => {
  it("dispatches default capabilities after host-ready and hides the optional lock", () => {
    const f = film();
    const sequence: string[] = [];
    for (const name of ["opsis:host-ready", "opsis:capabilities"])
      f.document.addEventListener(name, () => sequence.push(name));
    connectFilm(f.document, () => f.document, f.navigate);
    expect(sequence).toEqual(["opsis:host-ready", "opsis:capabilities"]);
    expect(f.capabilities).toHaveBeenCalledWith({
      enabled: ["research", "check", "watch", "rwa", "quant", "world", "saved", "guide"],
    });
    expect(f.lock.hidden).toBe(true);
    f.open("swap");
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it("dispatches custom and changed capabilities, dropping unknown destination ids", () => {
    const f = film();
    const tools = ["research", "swap", "unknown"] as const;
    const cleanup = connectFilm(f.document, () => f.document, f.navigate, tools);
    expect(f.capabilities).toHaveBeenLastCalledWith({ enabled: ["research", "swap"] });
    cleanup();
    connectFilm(f.document, () => f.document, f.navigate, ["watch"]);
    expect(f.capabilities).toHaveBeenLastCalledWith({ enabled: ["watch"] });
    f.open("research");
    expect(f.navigate).not.toHaveBeenCalled();
    f.open("watch");
    expect(f.navigate).toHaveBeenCalledExactlyOnceWith("/watch");
  });

  it("ignores disabled, unknown, retired and malformed destinations", () => {
    const f = film();
    connectFilm(f.document, () => f.document, f.navigate, ["research", "unknown"]);
    for (const tool of ["check", "swap", "unknown", "explorer", "portfolio", "toString", "__proto__", null, {}])
      f.open(tool);
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it.each([
    ["research", "/research"], ["check", "/check"], ["watch", "/watch"],
    ["rwa", "/rwa"], ["quant", "/lab"], ["world", "/research/events"],
    ["saved", "/saved"], ["guide", "/guide"], ["swap", "/swap"],
  ])("maps %s to %s", (tool, path) => {
    const f = film();
    connectFilm(f.document, () => f.document, f.navigate, [tool]);
    f.open(tool);
    expect(f.navigate).toHaveBeenCalledExactlyOnceWith(path);
  });

  it("carries only a validated public identity to Research", () => {
    const f = film();
    connectFilm(f.document, () => f.document, f.navigate);
    const entity = `0x${"a".repeat(40)}`;
    f.open("research", entity);
    expect(f.navigate).toHaveBeenLastCalledWith(`/research?entity=${entity}`);
    f.open("research", "private note");
    expect(f.navigate).toHaveBeenLastCalledWith("/research");
    f.open("check", entity);
    expect(f.navigate).toHaveBeenLastCalledWith("/check");
  });

  it("rejects an obsolete document and cleans up its navigation listener", () => {
    const f = film();
    let current: Document | null = f.document;
    const cleanup = connectFilm(f.document, () => current, f.navigate);
    current = null;
    f.open("research");
    expect(f.navigate).not.toHaveBeenCalled();
    current = f.document;
    cleanup();
    f.open("research");
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it("shows lock only when supplied, and dispatches no route for lock", () => {
    const f = film();
    const onLock = vi.fn();
    connectFilm(f.document, () => f.document, f.navigate, [], onLock);
    expect(f.lock.hidden).toBe(false);
    f.document.dispatchEvent(new CustomEvent("opsis:navigate", { detail: { type: "opsis:lock" } }));
    expect(onLock).toHaveBeenCalledOnce();
    expect(f.navigate).not.toHaveBeenCalled();
  });

  it("renders a focusable, accessible overview frame and defers it on an unvisited tool", () => {
    const render = (path: string) => renderToStaticMarkup(
      <MemoryRouter initialEntries={[path]}><OriginalLanding /></MemoryRouter>,
    );
    expect(render("/")).toContain('tabindex="0"');
    expect(render("/")).toContain('aria-hidden="false"');
    expect(render("/")).not.toContain('inert=""');
    expect(render("/research")).toBe("");
  });
});
