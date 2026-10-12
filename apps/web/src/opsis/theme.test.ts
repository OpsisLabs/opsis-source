/// <reference types="node" />
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { initialTheme, persistTheme, savedTheme } from "./theme";
afterEach(() => vi.unstubAllGlobals());

function cookieJar(initial = "") {
  let jar = initial;
  const written: string[] = [];
  vi.stubGlobal("location", { protocol: "https:" });
  vi.stubGlobal("document", {
    get cookie() { return jar; },
    set cookie(value: string) {
      written.push(value);
      const [pair] = value.split(";");
      const [name] = pair.split("=");
      jar = [...jar.split(";").map((part) => part.trim()).filter((part) => part && !part.startsWith(`${name}=`)), pair].join("; ");
    },
  });
  return written;
}
it("uses the light paper default without a valid saved choice", () => {
  cookieJar("");
  expect(initialTheme()).toBe("light");
  cookieJar("other=1; opsis_theme=dark");
  expect(initialTheme()).toBe("dark");
  cookieJar("opsis_theme=invalid");
  expect(initialTheme()).toBe("light");
});
it("remembers either theme in one first-party preference cookie", () => {
  const written = cookieJar("");
  for (const theme of ["dark", "light"] as const) {
    persistTheme(theme);
    expect(savedTheme()).toBe(theme);
  }
  expect(written.every((value) => /^opsis_theme=(dark|light); Max-Age=31536000; Path=\/; SameSite=Strict; Secure$/.test(value))).toBe(true);
});
it("tolerates cookies being unavailable", () => {
  const unavailable = () => { throw new Error("Cookies unavailable"); };
  vi.stubGlobal("document", { get cookie() { return unavailable(); }, set cookie(_value: string) { unavailable(); } });
  expect(savedTheme()).toBeNull();
  expect(initialTheme()).toBe("light");
  expect(() => persistTheme("dark")).not.toThrow();
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
