import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  decryptWorkspace,
  encryptWorkspace,
  validateWorkspace,
  readDeviceWorkspace,
  writeDeviceWorkspace,
} from "./workspace";
describe("private KOL workspace backups", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("atomically preserves ciphertext when two tabs try to replace the same revision", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    expect(await readDeviceWorkspace()).toBeNull();
    const a=await encryptWorkspace({watched:["adam"],saved:[]},"a private research passphrase");
    const b=await encryptWorkspace({watched:["ansem"],saved:[]},"a private research passphrase");
    const outcomes=await Promise.allSettled([writeDeviceWorkspace(a,null),writeDeviceWorkspace(b,null)]);
    expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const stored=await readDeviceWorkspace();
    expect([a,b]).toContain(stored);
    expect(stored).not.toContain("adam");expect(stored).not.toContain("ansem");
    await expect(writeDeviceWorkspace(b,null)).rejects.toThrow();
    expect(await readDeviceWorkspace()).toBe(stored);
    await writeDeviceWorkspace(b,stored);
    expect((await decryptWorkspace((await readDeviceWorkspace())!,"a private research passphrase")).watched).toEqual(["ansem"]);
  });
  it("round trips a watchlist and receipts without plaintext identifiers", async () => {
    const state = {
      watched: ["ansem", "adam"],
      saved: ["2090108668930830569"],
    };
    const text = await encryptWorkspace(state, "a private long passphrase");
    expect(text).not.toContain("ansem");
    expect(text).not.toContain("2090108668930830569");
    expect(await decryptWorkspace(text, "a private long passphrase")).toEqual(
      state,
    );
    await expect(
      decryptWorkspace(text, "incorrect long passphrase"),
    ).rejects.toThrow();
    const changed = JSON.parse(text);
    changed.data =
      (changed.data[0] === "A" ? "B" : "A") + changed.data.slice(1);
    await expect(
      decryptWorkspace(JSON.stringify(changed), "a private long passphrase"),
    ).rejects.toThrow();
  });
  it("rejects invalid imports and short passwords before changing a workspace", async () => {
    expect(() =>
      validateWorkspace({ watched: ["unverified"], saved: [] }),
    ).toThrow();
    expect(() => validateWorkspace({ watched: [], saved: [1] })).toThrow();
    await expect(
      encryptWorkspace({ watched: [], saved: [] }, "short"),
    ).rejects.toThrow();
    await expect(
      decryptWorkspace("x".repeat(100001), "a long passphrase"),
    ).rejects.toThrow();
  });
});

it("keeps the legacy authenticated envelope and reads ciphertext already stored in the legacy database", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const state = { watched: [], saved: [] };
  const text = await encryptWorkspace(state, "a private long passphrase");
  expect(JSON.parse(text).format).toBe("chainscout-kol-v1");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("chainscout-kol-research", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").put(text, "current");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
  expect(await readDeviceWorkspace()).toBe(text);
  expect(await decryptWorkspace(text, "a private long passphrase")).toEqual(state);
});
