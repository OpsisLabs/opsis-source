import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { translate } from "../i18n/translate";
import OneOffCheck from "./OneOffCheck";
import WatchPage from "./WatchPage";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ locale: "en" as "en" | "zh-CN", error: "watch.error.address", injected: false, phase: "empty" }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useState: (initial: unknown) => {
    // Seed the existing error state; the later snapshot state stays empty.
    if (initial === null && !state.injected) {
      state.injected = true;
      return [state.error, vi.fn()];
    }
    return react.useState(initial);
  } };
});
vi.mock("react-router", () => ({
  useSearchParams: () => [new URLSearchParams()],
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("../opsis/presentation", () => ({ OPSIS_PRESENTATION: false }));
vi.mock("./useWatchVault", () => ({ useWatchVault: () => ({
  phase: state.phase, watches: [], busy: false, error: "", recovery: "", epoch: 0,
}) }));
vi.mock("../opsis/copy", () => ({ useCopy: () => (en: string, zh: string) => state.locale === "zh-CN" ? zh : en }));
vi.mock("../i18n", () => ({ useI18n: () => ({ t: (key: Parameters<typeof translate>[1]) => translate(state.locale, key) }) }));

describe("Watch visible error localization", () => {
  for (const key of ["watch.error.address", "watch.error.refresh"] as const) {
    it(`renders the retained ${key} in the current locale`, () => {
      state.error = key;
      for (const locale of ["en", "zh-CN", "en"] as const) {
        state.locale = locale;
        state.injected = false;
        const html = renderToStaticMarkup(<OneOffCheck onSave={() => {}} />);
        expect(html).toContain(translate(locale, key));
        expect(html).not.toContain(translate(locale === "en" ? "zh-CN" : "en", key));
      }
    });
  }
  for (const [phase, key] of [["empty", "watch.error.confirm"], ["unlocked", "watch.error.address"]] as const) {
    it(`renders the saved-watch ${phase} validation in the current locale`, () => {
      state.phase = phase;
      state.error = key;
      for (const locale of ["en", "zh-CN", "en"] as const) {
        state.locale = locale;
        state.injected = false;
        expect(renderToStaticMarkup(<WatchPage />)).toContain(translate(locale, key));
      }
    });
  }

});
