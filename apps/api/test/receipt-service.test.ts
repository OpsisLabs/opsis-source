import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "../src/config/env.js";
import { ReceiptService, configuredReceiptService } from "../src/receipts/service.js";
import { receiptRoutes } from "../src/routes/receipts.js";
import { opsisRoutes } from "../src/routes/opsis.js";
import { installErrorHandler } from "../src/http/errors.js";
import type { ReceiptBody } from "@rh-chain/shared";
const fixtureKey = `0x${"11".repeat(32)}` as const;
const base = { NODE_ENV: "test", OPSIS_WORKSPACES_ENABLED: "true", OPSIS_PUBLIC_ACCESS_ENABLED: "true", BUILD_SHA: "a".repeat(40) };
describe("receipt startup config and published keys", () => {
  it("defaults off and creates no signer", () => {
    const env = loadEnv(base); expect(env.RECEIPTS_ENABLED).toBe(false); expect(env.RECEIPT_SIGNING_KEY).toBeUndefined(); expect(configuredReceiptService(env)).toBeUndefined();
  });
  it("rejects missing, malformed, zero and out-of-range keys without echoing them", () => {
    for (const key of [undefined, "malformed-fixture-material", `0x${"00".repeat(32)}`, `0x${"ff".repeat(32)}`]) {
      try { loadEnv({ ...base, RECEIPTS_ENABLED: "true", RECEIPT_SIGNING_KEY: key }); throw new Error("unexpected success"); }
      catch (error) { expect(String(error)).toContain("valid receipt signing key"); if (key) expect(String(error)).not.toContain(key); }
    }
  });
  it("refuses to enable receipts without a build commit to record", () => {
    expect(() => loadEnv({ ...base, BUILD_SHA: undefined, RECEIPTS_ENABLED: "true", RECEIPT_SIGNING_KEY: fixtureKey })).toThrow("Receipts record the build commit");
  });
  it("exposes only public metadata and gates the key route plus capability", async () => {
    for (const enabled of [false, true]) {
      const env = loadEnv({ ...base, RECEIPTS_ENABLED: String(enabled), ...(enabled ? { RECEIPT_SIGNING_KEY: fixtureKey } : {}) });
      const app = Fastify(); installErrorHandler(app); await receiptRoutes(app, env, configuredReceiptService(env)); await opsisRoutes(app, env);
      const result = await app.inject({ method: "GET", url: "/v1/private/opsis/receipts/keys" }); expect(result.statusCode).toBe(enabled ? 200 : 404);
      expect(result.body).not.toContain(fixtureKey);
      if (enabled) expect(result.json()).toEqual([{ address: privateKeyToAccount(fixtureKey).address, validFrom: "2026-10-19T00:00:00.000Z", validTo: null }]);
      const access = (await app.inject({ method: "POST", url: "/v1/private/opsis/access" })).json();
      expect(access.receipts).toBe(enabled); expect(access.manifest.capabilities.find((c: { id: string }) => c.id === "receipts").enabled).toBe(enabled);
      await app.close();
    }
  });
  it("refuses an out-of-window key and signing errors", async () => {
    const account = privateKeyToAccount(fixtureKey);
    const input: Omit<ReceiptBody, "version" | "codeSha" | "issuedAt"> = { tool: "fixture", inputs: {}, chainId: 4663, block: { number: "1", hash: `0x${"aa".repeat(32)}`, timestamp: "2026-10-19T00:00:00.000Z" }, rpcCalls: [], sources: [], outputs: {}, labelsetVersion: "none" };
    const signDigest = vi.fn().mockRejectedValue(new Error("fixture signer unavailable"));
    const now = () => Date.parse("2026-10-19T00:00:01.000Z");
    await expect(new ReceiptService({ address: account.address, signDigest }, [], "a".repeat(40), now).issue(input)).rejects.toThrow("outside validity"); expect(signDigest).not.toHaveBeenCalled();
    await expect(new ReceiptService({ address: account.address, signDigest }, [{ address: account.address, validFrom: input.block.timestamp, validTo: null }], "a".repeat(40), now).issue(input)).rejects.toThrow("fixture signer unavailable");
  });
});

it("keeps published keys behind private-mode and workspace gates", async () => {
  const env = loadEnv({ ...base, RECEIPTS_ENABLED: "true", RECEIPT_SIGNING_KEY: fixtureKey });
  for (const override of [{ PRIVATE_MODE_ENABLED: false }, { OPSIS_WORKSPACES_ENABLED: false }]) {
    const app = Fastify(); installErrorHandler(app); await receiptRoutes(app, { ...env, ...override }, configuredReceiptService(env));
    expect((await app.inject({ method: "GET", url: "/v1/private/opsis/receipts/keys" })).statusCode).toBe(404); await app.close();
  }
});
it("signs an immutable snapshot even if the caller changes data during signing", async () => {
  const { verifyReceipt, canonicalize } = await import("@rh-chain/shared");
  const { keccak256, recoverAddress } = await import("viem");
  const account = privateKeyToAccount(fixtureKey), issuedAt = "2026-10-19T00:00:01.000Z";
  const keys = [{ address: account.address, validFrom: "2026-10-19T00:00:00.000Z", validTo: null }];
  const input = { tool: "fixture", inputs: { amount: "123" }, chainId: 4663, block: { number: "1", hash: `0x${"aa".repeat(32)}` as const, timestamp: keys[0]!.validFrom }, rpcCalls: [], sources: [], outputs: {}, labelsetVersion: "none" };
  const service = new ReceiptService({ address: account.address, signDigest: async (hash) => { input.inputs.amount = "999"; return account.sign({ hash }); } }, keys, "a".repeat(40), () => Date.parse(issuedAt));
  const receipt = await service.issue(input); expect(receipt.inputs).toEqual({ amount: "123" });
  expect((await verifyReceipt(canonicalize(receipt), keys, { keccak256, recoverAddress })).valid).toBe(true);
});
