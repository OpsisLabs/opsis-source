import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { installCloudWorkspaceGuard } from "../src/http/cloud-workspace.js";
import { buildApp } from "../src/app.js";

describe("cloud storage boundary", () => {
  it("protects the real application routes before creating a wallet challenge", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "development", LOG_LEVEL: "silent" }));
    const response = await app.inject({ method: "POST", url: "/v1/auth/wallet/nonce", payload: { address: "0x0000000000000000000000000000000000000001" } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("CLOUD_WORKSPACE_UNAVAILABLE");
    expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(200);
    await app.close();
  });

  it("rejects new accounts and research without persistence, preserving recovery and private tools", async () => {
    const app = Fastify();
    installCloudWorkspaceGuard(app, loadEnv({ NODE_ENV: "development" }), false);
    const blocked = ["/v1/auth/register", "/v1/auth/login", "/v1/auth/wallet/nonce", "/v1/auth/wallet/verify", "/v1/chat/sessions", "/v1/chat/sessions/demo/messages"];
    const allowed = ["/v1/auth/refresh", "/v1/auth/logout", "/v1/private/analyze"];
    for (const url of [...blocked, ...allowed]) app.post(url, async () => ({ reached: true }));
    app.get("/v1/account/export", async () => ({ reached: true }));
    app.delete("/v1/account", async () => ({ reached: true }));
    for (const url of blocked) {
      const response = await app.inject({ method: "POST", url: `${url}?test=1` });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("CLOUD_WORKSPACE_UNAVAILABLE");
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    for (const url of allowed) expect((await app.inject({ method: "POST", url })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/account/export" })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: "/v1/account" })).statusCode).toBe(200);
    await app.close();
  });

  it("allows durable cloud writes and isolated in-memory tests", async () => {
    for (const [mode, persistent] of [["development", true], ["test", false]] as const) {
      const app = Fastify();
      installCloudWorkspaceGuard(app, loadEnv({ NODE_ENV: mode }), persistent);
      app.post("/v1/chat/sessions", async () => ({ reached: true }));
      expect((await app.inject({ method: "POST", url: "/v1/chat/sessions" })).statusCode).toBe(200);
      await app.close();
    }
  });
});
