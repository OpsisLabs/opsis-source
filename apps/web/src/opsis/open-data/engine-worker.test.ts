import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ instantiate: vi.fn(), terminate: vi.fn(), open: vi.fn(), Worker: vi.fn(), workerTerminate: vi.fn() }));
vi.mock("@duckdb/duckdb-wasm", () => ({
  VoidLogger: class {},
  AsyncDuckDB: class {
    instantiate = mocks.instantiate;
    terminate = mocks.terminate;
    open = mocks.open;
  },
}));
import { createSqlEngine } from "./engine";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe("EH engine worker ownership", () => {
  it("creates a self-hosted EH worker and terminates it once, including startup failures", async () => {
    vi.stubGlobal("Worker", class { constructor(url: string) { mocks.Worker(url); } terminate = mocks.workerTerminate; });
    mocks.terminate.mockResolvedValue(undefined);
    mocks.instantiate.mockRejectedValue(new Error("WASM EH unsupported"));
    const engine = createSqlEngine();
    await expect(engine.run([], "SELECT 1", 10_000)).rejects.toMatchObject({ code: "unsupported" });
    expect(mocks.Worker.mock.calls[0][0]).toMatch(/^\/(?:@fs\/.*)?[^?]*duckdb-browser-eh\.worker\.js/);
    expect(mocks.instantiate.mock.calls[0][0]).toMatch(/duckdb-eh\.wasm/);
    expect(mocks.instantiate.mock.calls[0][0]).not.toMatch(/https?:|mvp|coi/);
    expect(mocks.open).not.toHaveBeenCalled();
    engine.terminate(); engine.terminate();
    expect(mocks.terminate).toHaveBeenCalledTimes(1); expect(mocks.workerTerminate).toHaveBeenCalledTimes(1);
  });
  it("guards before engine instantiation or query dispatch", async () => {
    vi.stubGlobal("Worker", class { terminate = mocks.workerTerminate; });
    mocks.terminate.mockResolvedValue(undefined);
    const engine = createSqlEngine();
    await expect(engine.run([], "/* prefix */ LoAd httpfs", 10_000)).rejects.toThrow("Query refused");
    expect(mocks.instantiate).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
    engine.terminate();
  });
});
