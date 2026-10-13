import { describe, expect, it, vi } from "vitest";
import { importPage } from "./page-imports";

const attempts = vi.hoisted(() => ({ order: [] as string[] }));
vi.mock("./lazy-retry", async (importOriginal) => {
  const original = await importOriginal<typeof import("./lazy-retry")>();
  return { retryImport: <T,>(importer: () => Promise<T>) => original.retryImport(importer, async () => {}) };
});
vi.mock("../opsis/Research.tsx?opsis-code-retry=1", () => {
  attempts.order.push("second URL");
  throw new TypeError("Importing a module script failed.");
});
vi.mock("../opsis/Research.tsx?opsis-code-retry=2", () => {
  attempts.order.push("third URL");
  return { default: "downloaded page" };
});

describe("page import URLs", () => {
  it("uses distinct bundled URLs after the original URL fails", async () => {
    const importer = vi.fn(async () => {
      attempts.order.push("original URL");
      throw new TypeError("Importing a module script failed.");
    });
    await expect(importPage("/src/opsis/Research.tsx", importer)).resolves.toEqual({ default: "downloaded page" });
    expect(attempts.order).toEqual(["original URL", "second URL", "third URL"]);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
