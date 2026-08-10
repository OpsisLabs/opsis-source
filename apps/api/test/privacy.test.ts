import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { rateLimitKey } from "../src/http/authenticate.js";
import type { FastifyRequest } from "fastify";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("privacy-preserving request limits", () => {
  it("never places a raw IP address in a rate-limit key", () => {
    const env = loadEnv({ NODE_ENV: "test", JWT_ACCESS_SECRET: "test_access_secret_for_hashing" });
    const request = {
      headers: {},
      ip: "203.0.113.42"
    } as FastifyRequest;
    const key = rateLimitKey(request, env);

    expect(key).toMatch(/^ip:[a-f0-9]{64}$/);
    expect(key).not.toContain(request.ip);
    expect(rateLimitKey(request, env)).toBe(key);
  });

  it("derives the client IP from Railway's trusted proxy hop", async () => {
    const app = await buildApp(loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent"
    }));
    apps.push(app);
    app.get("/test-client-ip", async (request) => ({ ip: request.ip }));

    const response = await app.inject({
      method: "GET",
      url: "/test-client-ip",
      headers: { "x-forwarded-for": "203.0.113.10" },
      remoteAddress: "127.0.0.1"
    });
    expect(response.json()).toEqual({ ip: "203.0.113.10" });
  });
});
