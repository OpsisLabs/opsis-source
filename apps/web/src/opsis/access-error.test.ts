import { afterEach, expect, it, vi } from "vitest";
import { PreviewAccessError, unlockPreview } from "./model";

afterEach(() => vi.unstubAllGlobals());

it("carries refusal status and usable Retry-After without reading server text", async () => {
  const response = new Response("server-only detail", { status: 429, headers: { "Retry-After": " 2 " } });
  const read = vi.spyOn(response, "json");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const error = await unlockPreview("", new AbortController().signal).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(PreviewAccessError);
  expect(error).toMatchObject({ status: 429, retryAfter: 2 });
  expect(read).not.toHaveBeenCalled();
  expect((error as Error).message).not.toContain("server-only detail");
});

it("ignores missing, malformed, date and excessive wait headers", async () => {
  for (const header of [null, "0", "1.5", "-2", "later", "Tue, 13 Oct 2026 00:00:00 GMT", "86401"]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", {
      status: 503, headers: header === null ? {} : { "Retry-After": header },
    })));
    await expect(unlockPreview("", new AbortController().signal)).rejects.toMatchObject({ status: 503, retryAfter: undefined });
  }
});

it("keeps network, abort and invalid-response failures distinct from HTTP refusals", async () => {
  for (const failure of [new TypeError("Network unavailable"), new DOMException("Aborted", "AbortError")]) {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
    await expect(unlockPreview("", new AbortController().signal)).rejects.toBe(failure);
  }
  for (const body of ["not JSON", "{}", "null"]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    const error = await unlockPreview("", new AbortController().signal).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PreviewAccessError);
  }
});
