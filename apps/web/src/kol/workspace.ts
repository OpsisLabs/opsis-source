import { calls, profiles } from "./model";
export type KolWorkspace = { watched: string[]; saved: string[] };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const iterations = 250_000;
export const workspaceChannel = "chainscout-kol-workspace-v1";
export const workspaceSource = crypto.randomUUID();
const databaseName = "chainscout-kol-research";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    let done = false;
    const fail = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error("Workspace storage unavailable"));
      }
    };
    const timer = setTimeout(fail, 3000);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("workspace");
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      clearTimeout(timer);
      if (done) request.result.close();
      else {
        done = true;
        resolve(request.result);
      }
    };
  });
}
export async function readDeviceWorkspace(): Promise<string | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspace", "readonly");
    const request = tx.objectStore("workspace").get("current");
    tx.oncomplete = () => {
      db.close();
      const value: unknown = request.result;
      if (
        value !== undefined &&
        (typeof value !== "string" || value.length > 100_000)
      )
        reject(new Error("Invalid workspace"));
      else resolve((value as string | undefined) ?? null);
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("Workspace read failed"));
    };
  });
}
export async function writeDeviceWorkspace(
  content: string,
  expected: string | null,
) {
  const envelope = JSON.parse(content);
  if (content.length > 100_000 || envelope.format !== "chainscout-kol-v1")
    throw new Error("Invalid workspace");
  const db = await database();
  // The revision check and ciphertext replacement share one atomic transaction.
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("workspace", "readwrite");
    const store = tx.objectStore("workspace");
    const request = store.get("current");
    request.onsuccess = () => {
      if ((request.result ?? null) !== expected) {
        tx.abort();
        return;
      }
      try {
        store.put(content, "current");
      } catch {
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("Workspace changed or storage unavailable"));
    };
  });
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(workspaceChannel);
    channel.postMessage({ type: "changed", source: workspaceSource });
    channel.close();
  }
}
const bytes64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const from64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function key(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  if (passphrase.length < 12 || passphrase.length > 1024)
    throw new Error("passphrase");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export function validateWorkspace(value: unknown): KolWorkspace {
  if (!value || typeof value !== "object") throw new Error("Invalid workspace");
  const obj = value as Record<string, unknown>;
  function ids(value: unknown, allowed: Set<string>) {
    if (
      !Array.isArray(value) ||
      value.length > 2000 ||
      !value.every((id) => typeof id === "string" && allowed.has(id))
    )
      throw new Error("Unknown workspace IDs");
    return [...new Set(value as string[])];
  }
  return {
    watched: ids(obj.watched, new Set(profiles.map((p) => p.id))),
    saved: ids(obj.saved, new Set(calls.map((p) => p.id))),
  };
}
export async function encryptWorkspace(
  value: KolWorkspace,
  passphrase: string,
) {
  const payload = validateWorkspace(value);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode("chainscout-kol-v1"),
    },
    await key(passphrase, salt),
    encoder.encode(JSON.stringify(payload)),
  );
  return JSON.stringify({
    format: "chainscout-kol-v1",
    salt: bytes64(salt),
    iv: bytes64(iv),
    data: bytes64(new Uint8Array(encrypted)),
  });
}
export async function decryptWorkspace(text: string, passphrase: string) {
  if (text.length > 100_000) throw new Error("Workspace too large");
  const obj = JSON.parse(text);
  if (
    obj?.format !== "chainscout-kol-v1" ||
    typeof obj.salt !== "string" ||
    typeof obj.iv !== "string" ||
    typeof obj.data !== "string"
  )
    throw new Error("Invalid backup");
  const salt = from64(obj.salt),
    iv = from64(obj.iv),
    data = from64(obj.data);
  if (salt.length !== 16 || iv.length !== 12 || data.length < 16)
    throw new Error("Invalid backup");
  const result = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode("chainscout-kol-v1"),
    },
    await key(passphrase, salt),
    data,
  );
  return validateWorkspace(JSON.parse(decoder.decode(result)));
}
