import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { memoryStore } from "../src/db/memory.js";
import { sha256 } from "../src/security/hash.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  resetMemory();
});

describe("legacy cloud account portability", () => {
  it("exports owned data without credential material", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
    apps.push(app);
    const first = await register(app, "export-owner@example.com");
    await register(app, "unrelated@example.com");
    const created = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions",
      headers: { authorization: `Bearer ${first.accessToken}` },
      payload: { title: "My saved research" }
    });
    expect(created.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/v1/account/export",
      headers: { authorization: `Bearer ${first.accessToken}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["content-disposition"]).toContain("chainscout-account-export-");
    expect(response.json()).toMatchObject({
      schemaVersion: "chainscout.account-export.v1",
      profile: { id: first.user.id, email: "export-owner@example.com" },
      sessions: [{ title: "My saved research", messages: [] }]
    });
    const serialized = response.body.toLowerCase();
    expect(serialized).not.toContain("passwordhash");
    expect(serialized).not.toContain("tokenhash");
    expect(serialized).not.toContain(first.accessToken.toLowerCase());
    expect(serialized).not.toContain(first.refreshToken.toLowerCase());
    expect(serialized).not.toContain("unrelated@example.com");
  });

  it("deletes every linked in-memory record and index while preserving other users", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
    apps.push(app);
    const owner = await register(app, "delete-owner@example.com");
    const other = await register(app, "delete-other@example.com");
    const session = memoryStore.createSession(owner.user.id, "Private saved session");
    memoryStore.addMessage({ sessionId: session.id, role: "USER", content: "private message" });
    memoryStore.usage.push({ userId: owner.user.id, eventType: "CHAIN_LOOKUP", quantity: 1, createdAt: new Date() });
    memoryStore.addAuditLog({ userId: owner.user.id, action: "AUTH_LOGIN_SUCCEEDED" });
    memoryStore.addAuditLog({
      action: "AUTH_LOGIN_FAILED",
      metadata: { emailHash: sha256("delete-owner@example.com") }
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/account",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { confirmation: "DELETE MY CHAINSCOUT ACCOUNT" }
    });

    expect(response.statusCode).toBe(204);
    expect(memoryStore.users.has(owner.user.id)).toBe(false);
    expect(memoryStore.usersByEmail.has("delete-owner@example.com")).toBe(false);
    expect([...memoryStore.refreshTokens.values()].some((token) => token.userId === owner.user.id)).toBe(false);
    expect([...memoryStore.authTokens.values()].some((token) => token.userId === owner.user.id)).toBe(false);
    expect([...memoryStore.sessions.values()].some((item) => item.userId === owner.user.id)).toBe(false);
    expect(memoryStore.messages.has(session.id)).toBe(false);
    expect(memoryStore.usage.some((event) => event.userId === owner.user.id)).toBe(false);
    expect(memoryStore.auditLogs.some((event) => event.userId === owner.user.id)).toBe(false);
    expect(JSON.stringify(memoryStore.auditLogs)).not.toContain(sha256("delete-owner@example.com"));
    expect(memoryStore.users.has(other.user.id)).toBe(true);
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("requires the exact destructive confirmation", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
    apps.push(app);
    const owner = await register(app, "confirm-owner@example.com");

    const response = await app.inject({
      method: "DELETE",
      url: "/v1/account",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { confirmation: "DELETE" }
    });

    expect(response.statusCode).toBe(400);
    expect(memoryStore.users.has(owner.user.id)).toBe(true);
  });
});

async function register(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email, password: "correct-horse-battery-staple" }
  });
  expect(response.statusCode).toBe(200);
  return response.json() as {
    user: { id: string };
    accessToken: string;
    refreshToken: string;
  };
}

function resetMemory() {
  memoryStore.users.clear();
  memoryStore.usersByEmail.clear();
  memoryStore.usersByWallet.clear();
  memoryStore.usernames.clear();
  memoryStore.refreshTokens.clear();
  memoryStore.authTokens.clear();
  memoryStore.sessions.clear();
  memoryStore.messages.clear();
  memoryStore.usage = [];
  memoryStore.auditLogs = [];
}
