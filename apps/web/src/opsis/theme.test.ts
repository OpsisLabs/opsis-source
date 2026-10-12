/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { initialTheme, persistTheme, savedTheme } from "./theme";
afterEach(() => vi.unstubAllGlobals());

function preference(dark: boolean) {
  vi.stubGlobal("window", { matchMedia: vi.fn().mockReturnValue({ matches: dark }) });
}
it("uses the system preference only without a valid saved choice", () => {
  const storage = { getItem: vi.fn().mockReturnValue(null) };
  vi.stubGlobal("localStorage", storage);
  preference(true);
  expect(initialTheme()).toBe("dark");
  preference(false);
  expect(initialTheme()).toBe("light");
  storage.getItem.mockReturnValue("dark");
  expect(initialTheme()).toBe("dark");
  storage.getItem.mockReturnValue("invalid");
  expect(initialTheme()).toBe("light");
});
it("persists either theme using only the theme key", () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key),
    setItem: (key: string, value: string) => values.set(key, value),
  });
  for (const theme of ["dark", "light"] as const) {
    persistTheme(theme);
    expect(initialTheme()).toBe(theme);
  }
  expect([...values.keys()]).toEqual(["opsis-theme"]);
});
it("tolerates both storage methods and the localStorage getter throwing", () => {
  preference(true);
  const unavailable = () => { throw new Error("Storage unavailable"); };
  vi.stubGlobal("localStorage", { getItem: unavailable, setItem: unavailable });
  expect(savedTheme()).toBeNull();
  expect(initialTheme()).toBe("dark");
  expect(() => persistTheme("light")).not.toThrow();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: unavailable });
  expect(initialTheme()).toBe("dark");
  expect(() => persistTheme("light")).not.toThrow();
});

function luminance(hex: string) {
  if (hex.length === 4) hex = `#${hex.slice(1).split("").map((digit) => digit + digit).join("")}`;
  const rgb = hex.slice(1).match(/.{2}/g)!.map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(first: string, second: string) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
it("keeps text, controls and status tokens at AA contrast on both work surfaces", () => {
  const css = readFileSync(new URL("./opsis.css", import.meta.url), "utf8");
  const blocks = [css.match(/\.opsis \{([^}]+)\}/)![1], css.match(/\.opsis\[data-theme="light"\] \{([^}]+)\}/)![1]];
  for (const block of blocks) {
    const tokens = Object.fromEntries([...block.matchAll(/--surface-([\w-]+): (#[\da-f]+);/g)].map((m) => [m[1], m[2]]));
    for (const ground of [tokens.ground, tokens.panel]) {
      for (const text of [tokens.ink, tokens.soft, tokens.accent, tokens.negative, tokens.positive, tokens.info, tokens.purple]) {
        expect(contrast(text, ground)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tokens.line, ground)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(tokens.button, tokens["button-ink"])).toBeGreaterThanOrEqual(4.5);
  }
});
