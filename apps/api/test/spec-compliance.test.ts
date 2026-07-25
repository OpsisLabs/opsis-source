import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function register(app: Awaited<ReturnType<typeof buildApp>>, label: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email: `${label}-${Date.now()}-${Math.random()}@example.com`, password: "strong-password" }
  });
  expect(response.statusCode).toBe(200);
  return response.json().accessToken as string;
}

describe("product specification API compatibility", () => {
  it("supports GET entity resolution and active-entity chat messages", async () => {
    const app = await buildApp(loadEnv({ NODE_ENV: "test", LOG_LEVEL: "silent" }));
    apps.push(app);
    const accessToken = await register(app, "compatibility");
    const headers = { authorization: `Bearer ${accessToken}` };

    const resolved = await app.inject({ method: "GET", url: "/v1/entities/resolve?q=fixture", headers });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({ query: "fixture", entity: { type: "unknown", value: "fixture" } });

    const created = await app.inject({
      method: "POST",
      url: "/v1/chat/sessions",
      headers,
      payload: { title: "Active context", initialEntity: "fixture" }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ entity: { type: "unknown", chainId: 4663, id: "fixture" } });

    const sent = await app.inject({
      method: "POST",
      url: `/v1/chat/sessions/${created.json().session.id}/messages`,
      headers,
      payload: { message: "Explain this in plain English." }
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().messageId).toBeTypeOf("string");
    expect(sent.json().confirmedFacts).toBeInstanceOf(Array);
    expect(sent.json().suggestedFollowUps).toBeInstanceOf(Array);
    expect(sent.json().citations.length).toBeGreaterThan(0);
  });

  it("enforces monthly quotas and returns the documented usage window", async () => {
    const app = await buildApp(loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      QUOTA_AI_MESSAGES_PER_MONTH: "1",
      QUOTA_CHAIN_LOOKUPS_PER_MONTH: "1"
    }));
    apps.push(app);
    const accessToken = await register(app, "quota");
    const headers = { authorization: `Bearer ${accessToken}` };

    expect((await app.inject({ method: "GET", url: "/v1/entities/resolve?q=first", headers })).statusCode).toBe(200);
    const denied = await app.inject({ method: "GET", url: "/v1/entities/resolve?q=second", headers });
    expect(denied.statusCode).toBe(429);
    expect(denied.json().error.code).toBe("MONTHLY_QUOTA_EXCEEDED");

    const usage = await app.inject({ method: "GET", url: "/v1/usage/me", headers });
    expect(usage.statusCode).toBe(200);
    expect(usage.json()).toMatchObject({
      chainLookups: 1,
      aiMessages: 0,
      quota: { chainLookups: 1, aiMessages: 1 }
    });
    expect(usage.json().periodStart).toMatch(/T00:00:00\.000Z$/);
    expect(usage.json().periodEnd).toMatch(/T00:00:00\.000Z$/);
  });

  it("keys authenticated lookup limits by user rather than shared IP", async () => {
    const app = await buildApp(loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      RATE_LIMIT_LOOKUP_PER_HOUR: "1",
      RATE_LIMIT_PUBLIC_PER_HOUR: "20"
    }));
    apps.push(app);
    const first = { authorization: `Bearer ${await register(app, "rate-first")}` };
    const second = { authorization: `Bearer ${await register(app, "rate-second")}` };

    expect((await app.inject({ method: "GET", url: "/v1/entities/resolve?q=one", headers: first })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/entities/resolve?q=two", headers: second })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/entities/resolve?q=three", headers: first })).statusCode).toBe(429);
  });
});
