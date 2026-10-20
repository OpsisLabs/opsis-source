import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AiExplorerAnswer, NormalizedEntity } from "@rh-chain/shared";
import { contractFacts } from "../src/chain/contract-facts.js";
import type { SourceDocumentInput } from "../src/chain/types.js";
import { loadEnv } from "../src/config/env.js";
import { opsisRoutes } from "../src/routes/opsis.js";
import { privateRoutes } from "../src/routes/private.js";

const address = `0x${"1".repeat(40)}`;
const implementation = `0x${"2".repeat(40)}`;
const fetchedAt = "2026-10-20T12:00:00.000Z";
const verified = { is_verified: true, name: "SampleToken", compiler_version: "v0.8.30+commit.73712a01", optimization_enabled: true,
  proxy_type: null, implementations: [], verified_at: "2026-07-13T23:55:17.954502Z" };
function doc(responseJson: unknown = verified, endpoint = "smart-contracts"): SourceDocumentInput {
  return { id: "contract-source", chainId: 4663, entityType: "token", entityValue: address, provider: "blockscout",
    requestUrl: `https://explorer.test/api/v2/${endpoint}/${address}`, fetchedAt, responseJson };
}

describe("Blockscout contract facts", () => {
  it("parses verified metadata and keeps a source and original time for every fact", () => {
    const facts = contractFacts(4663, address, [doc()]);
    expect(facts).toMatchObject({ sourceVerified: { value: true }, name: { value: "SampleToken" },
      compilerVersion: { value: verified.compiler_version }, optimizationEnabled: { value: true }, proxy: { value: false },
      implementations: { value: [] }, verifiedAt: { value: verified.verified_at } });
    for (const fact of Object.values(facts)) {
      expect(fact.reason).toBeNull();
      expect(fact.source).toMatchObject({ provider: "blockscout", fetchedAt, url: doc().requestUrl });
      expect(fact.source?.fieldsUsed.length).toBeGreaterThan(0);
    }
  });

  it("requires an explicit false for unverified, and preserves optimisation off", () => {
    const facts = contractFacts(4663, address, [doc({ ...verified, is_verified: false, optimization_enabled: false, verified_at: null })]);
    expect(facts.sourceVerified.value).toBe(false);
    expect(facts.optimizationEnabled.value).toBe(false);
    expect(facts.name).toMatchObject({ value: null, reason: "not_reported" });
    expect(facts.verifiedAt).toMatchObject({ value: null, reason: "not_reported" });
    expect(contractFacts(4663, address, [doc({ ...verified, is_verified: undefined })]).sourceVerified.value).toBeNull();
  });

  it("reads proxy implementation addresses and bytecode verification without following them", () => {
    const facts = contractFacts(4663, address, [doc({ ...verified, is_verified: false, is_verified_via_eth_bytecode_db: true,
      proxy_type: "eip1967", implementations: [{ address_hash: implementation, name: "SampleImplementation" }] })]);
    expect(facts.sourceVerified.value).toBe(true);
    expect(facts.proxy.value).toBe(true);
    expect(facts.implementations.value).toEqual([implementation]);
  });

  it("can use the address document's explicit verification and proxy fields", () => {
    const facts = contractFacts(4663, address, [doc({ is_verified: false, proxy_type: "eip1967", implementations: [{ address_hash: implementation }] }, "addresses")]);
    expect(facts.sourceVerified).toMatchObject({ value: false, source: { url: doc({}, "addresses").requestUrl } });
    expect(facts.proxy.value).toBe(true);
    expect(facts.implementations.value).toEqual([implementation]);
    expect(facts.compilerVersion).toMatchObject({ value: null, reason: "explorer_unavailable" });
  });

  it("uses address verification when the smart-contract document does not report it", () => {
    const facts = contractFacts(4663, address, [doc({ proxy_type: null, implementations: [] }), doc({ is_verified: false }, "addresses")]);
    expect(facts.sourceVerified).toMatchObject({ value: false, source: { url: doc({}, "addresses").requestUrl } });
    expect(facts.name.value).toBeNull();
  });

  it.each([null, [], "invalid", {}, { message: "Not found" }])("never guesses unverified from malformed document %j", (body) => {
    const facts = contractFacts(4663, address, [doc(body)]);
    expect(facts.sourceVerified).toMatchObject({ value: null, reason: "malformed" });
    expect(facts.proxy.value).toBeNull();
  });

  it("rejects malformed field types, dates and implementation addresses", () => {
    const facts = contractFacts(4663, address, [doc({ is_verified: "false", name: 42, compiler_version: {}, optimization_enabled: "false",
      proxy_type: 42, implementations: [{ address_hash: "invalid" }], verified_at: "2026-02-30T00:00:00Z" })]);
    for (const fact of Object.values(facts)) expect(fact).toMatchObject({ value: null, reason: "malformed" });
  });

  it("keeps absent optional fields unknown with a reason", () => {
    const facts = contractFacts(4663, address, [doc({ is_verified: true })]);
    expect(facts.proxy).toMatchObject({ value: null, reason: "not_reported" });
    expect(facts.compilerVersion).toMatchObject({ value: null, reason: "not_reported" });
  });

  it("reports unavailable when the explorer failed or only another entity's data exists", () => {
    for (const docs of [[], [{ ...doc(), chainId: 1 }], [{ ...doc(), entityValue: implementation }], [{ ...doc(), provider: "rpc" }], [doc({}, "tokens")]]) {
      for (const fact of Object.values(contractFacts(4663, address, docs))) {
        expect(fact).toEqual({ value: null, reason: "explorer_unavailable", source: null });
      }
    }
  });

  it("strips credentials and refuses unknown read times", () => {
    const source = { ...doc(), requestUrl: `${doc().requestUrl}?apikey=sample-key` };
    expect(JSON.stringify(contractFacts(4663, address, [source]))).not.toContain("sample-key");
    expect(contractFacts(4663, address, [{ ...source, fetchedAt: "invalid" }]).sourceVerified)
      .toEqual({ value: null, reason: "malformed", source: null });
  });
});

describe("Research contract facts flag", () => {
  it.each([undefined, "false", "true"])("gates the response and manifest with CONTRACT_FACTS_ENABLED=%s", async (flag) => {
    const env = loadEnv({ NODE_ENV: "test", OPSIS_WORKSPACES_ENABLED: "true", OPSIS_PUBLIC_ACCESS_ENABLED: "true", ...(flag ? { CONTRACT_FACTS_ENABLED: flag } : {}) });
    const entity: NormalizedEntity = { chainId: 4663, type: "token", value: address, facts: {}, citations: [], riskNotes: [] };
    const answer: AiExplorerAnswer = { answer: "", summaryBullets: [], confirmedFacts: [], inferences: [], facts: {}, uncertainty: [], riskNotes: [], citations: [], suggestedQuestions: [], suggestedFollowUps: [] };
    const resolve = vi.fn(async () => ({ entity, sources: [doc()], providerDestinations: ["blockscout"] }));
    const app = Fastify();
    await privateRoutes(app, env, undefined, undefined, { resolve, answer: async () => answer });
    await opsisRoutes(app, env);
    try {
      const response = await app.inject({ method: "POST", url: "/v1/private/analyze", payload: { entity: address, entityType: "token" } });
      expect(response.statusCode).toBe(200);
      expect(response.json().contractFacts).toEqual(flag === "true" ? contractFacts(4663, address, [doc()]) : undefined);
      const access = (await app.inject({ method: "POST", url: "/v1/private/opsis/access", payload: {} })).json();
      expect(access.contractFacts).toBe(flag === "true");
      expect(access.manifest.capabilities).toContainEqual(expect.objectContaining({ id: "contractFacts", enabled: flag === "true" }));
      entity.type = "wallet";
      expect((await app.inject({ method: "POST", url: "/v1/private/analyze", payload: { entity: address } })).json().contractFacts).toBeUndefined();
      entity.type = "contract";
      const contractResponse = (await app.inject({ method: "POST", url: "/v1/private/analyze", payload: { entity: address, entityType: "contract" } })).json();
      expect(contractResponse.contractFacts?.sourceVerified.value).toBe(flag === "true" ? true : undefined);
      resolve.mockResolvedValue({ entity, sources: [], providerDestinations: ["blockscout"] });
      const unavailable = (await app.inject({ method: "POST", url: "/v1/private/analyze", payload: { entity: address, entityType: "contract" } })).json();
      expect(unavailable.contractFacts?.sourceVerified).toEqual(flag === "true" ? { value: null, reason: "explorer_unavailable", source: null } : undefined);
    } finally { await app.close(); }
  });
});
