import { afterEach, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";

afterEach(() => vi.unstubAllGlobals());

it("reports success only after writing the exact text", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  expect(await copyText("exact text\nsecond line")).toBe(true);
  expect(writeText).toHaveBeenCalledWith("exact text\nsecond line");
});

it("handles rejected and unavailable clipboard access without a rejected promise", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) } });
  expect(await copyText("exact text")).toBe(false);
  vi.stubGlobal("navigator", {});
  expect(await copyText("exact text")).toBe(false);
});
