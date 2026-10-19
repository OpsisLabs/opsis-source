import { strict as assert } from "node:assert";
import { generateKeyPairSync, verify } from "node:crypto";
import { test } from "node:test";
import { appJwt, validateApp, validateTokenScope, withAppToken } from "./push-public-as-bot.mjs";

const app = { id: 7, slug: "opsis-bot", owner: { login: "OpsisLabs" } };
const installation = { id: 8, app_id: 7, account: { login: "OpsisLabs" }, repository_selection: "selected", suspended_at: null };
const scoped = { token: "fixture-installation-token", repositories: [{ full_name: "OpsisLabs/opsis-source", private: false }], permissions: { contents: "write", workflows: "write", metadata: "read" } };

test("JWT is signed with a short lifetime and clock-drift allowance", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const [header, payload, signature] = appJwt("fixture-client", privateKey, 1000).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), { iss: "fixture-client", iat: 940, exp: 1540 });
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")), true);
  assert.throws(() => appJwt("", privateKey));
});
test("other owners, apps, installations and repository scopes are refused", () => {
  validateApp(app, installation); validateTokenScope(scoped);
  assert.throws(() => validateApp({ ...app, owner: { login: "demo-account" } }, installation));
  assert.throws(() => validateApp({ ...app, slug: "other-bot" }, installation));
  for (const change of [{ app_id: 9 }, { repository_selection: "all" }, { suspended_at: "2026-01-01" }, { account: { login: "demo-account" } }]) assert.throws(() => validateApp(app, { ...installation, ...change }));
  for (const repositories of [[], [...scoped.repositories, { full_name: "demo-org/other" }], [{ full_name: "OpsisLabs/opsis-source", private: true }]]) assert.throws(() => validateTokenScope({ ...scoped, repositories }));
  assert.throws(() => validateTokenScope({ ...scoped, permissions: { ...scoped.permissions, administration: "write" } }));
});
test("token is explicitly scoped and revoked after success, push failure or validation failure", async () => {
  for (const failure of ["none", "push", "scope"]) {
    const calls = [];
    const request = async (method, path, token, body) => {
      calls.push({ method, path, body });
      if (path === "/app") return app;
      if (path.endsWith("/installation")) return installation;
      if (method === "POST") return failure === "scope" ? { ...scoped, repositories: [] } : scoped;
    };
    let used = false;
    const run = withAppToken("fixture-jwt", request, async token => {
      used = true; assert.equal(token, scoped.token);
      if (failure === "push") throw new Error("push refused");
    });
    if (failure === "none") await run; else await assert.rejects(run);
    assert.equal(used, failure !== "scope");
    assert.deepEqual(calls.find(call => call.method === "POST").body, { repositories: ["opsis-source"], permissions: { contents: "write", workflows: "write" } });
    assert.deepEqual(calls.at(-1), { method: "DELETE", path: "/installation/token", body: undefined });
  }
});
