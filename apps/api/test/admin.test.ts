import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { signAccessToken } from "../src/security/jwt.js";
import { memoryStore } from "../src/db/memory.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  memoryStore.users.clear();
  memoryStore.usersByEmail.clear();
});

describe("admin status", () => {
  it("allows administrators and rejects regular users without exposing secrets", async () => {
    const env = loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      OPENAI_API_KEY: "private-openai-key",
      ALCHEMY_API_KEY: "private-alchemy-key"
    });
    const app = await buildApp(env);
    apps.push(app);
    const user = memoryStore.createUser("user@example.com", "test");
    const admin = memoryStore.createUser("admin@example.com", "test");
    admin.role = "ADMIN";
    const userToken = signAccessToken(env, { sub: user.id, email: "user@example.com", role: "USER" });
    const adminToken = signAccessToken(env, { sub: admin.id, email: "admin@example.com", role: "ADMIN" });

    const denied = await app.inject({ method: "GET", url: "/v1/admin/status", headers: { authorization: `Bearer ${userToken}` } });
    const allowed = await app.inject({ method: "GET", url: "/v1/admin/status", headers: { authorization: `Bearer ${adminToken}` } });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      storage: "memory",
      services: { alchemy: true, openai: true, retention: false }
    });
    expect(allowed.body).not.toContain("private-openai-key");
    expect(allowed.body).not.toContain("private-alchemy-key");
  });
});
