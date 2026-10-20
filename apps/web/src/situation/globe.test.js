import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGlobe } from "./globe";

const { mount, renderer } = vi.hoisted(() => {
  const renderer = {
    select: vi.fn(),
    setLocale: vi.fn(),
    reset: vi.fn(),
    toggle: vi.fn(),
    dispose: vi.fn(),
  };
  return { renderer, mount: vi.fn(() => renderer) };
});
vi.mock("./globe-renderer.js", () => ({ createGlobe: mount }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

describe("deferred globe", () => {
  it("mounts only on demand and replays controls once the renderer loads", async () => {
    expect(mount).not.toHaveBeenCalled();
    const el = {};
    const select = vi.fn();
    const globe = createGlobe(el, [], select);
    expect(mount).not.toHaveBeenCalled();
    globe.setLocale("zh-CN");
    globe.reset();
    globe.select(2);
    await vi.dynamicImportSettled();
    expect(mount).toHaveBeenCalledWith(el, [], select);
    expect(renderer.setLocale).toHaveBeenCalledWith("zh-CN");
    globe.setLocale("en");
    expect(renderer.setLocale).toHaveBeenLastCalledWith("en");
    expect(renderer.reset).toHaveBeenCalledOnce();
    expect(renderer.select).toHaveBeenCalledWith(2);
    globe.dispose();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
  it("does not mount or request textures after leaving before import completion", async () => {
    const globe = createGlobe({}, [], vi.fn());
    globe.dispose();
    await vi.dynamicImportSettled();
    expect(mount).not.toHaveBeenCalled();
  });
  it("keeps a text fallback when rendering fails", async () => {
    mount.mockImplementationOnce(() => {
      throw new Error("WebGL unavailable");
    });
    const notice = { setAttribute: vi.fn(), textContent: "" };
    vi.stubGlobal("document", {
      documentElement: { lang: "zh-CN" },
      createElement: () => notice,
    });
    const el = { replaceChildren: vi.fn() };
    createGlobe(el, [], vi.fn());
    await vi.dynamicImportSettled();
    expect(el.replaceChildren).toHaveBeenCalledWith(notice);
    expect(notice.textContent).toContain("无法加载地球视图");
  });
});
