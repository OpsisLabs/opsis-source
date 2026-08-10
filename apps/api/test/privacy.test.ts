import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";
import { rateLimitClientAddress, rateLimitKey } from "../src/http/authenticate.js";
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

  it("uses Railway's X-Real-IP only behind a trusted proxy and ignores spoofable X-Forwarded-For", async () => {
    const app = await buildApp(loadEnv({
      NODE_ENV: "test",
      LOG_LEVEL: "silent"
    }));
    apps.push(app);
    app.get("/test-client-ip", async (request) => ({
      ip: rateLimitClientAddress(request),
      key: rateLimitKey(request, loadEnv({ NODE_ENV: "test", JWT_ACCESS_SECRET: "test_access_secret_for_hashing" }))
    }));

    const first = await app.inject({
      method: "GET",
      url: "/test-client-ip",
      headers: { "x-forwarded-for": "198.51.100.1", "x-real-ip": "203.0.113.10" },
      remoteAddress: "127.0.0.1"
    });
    const second = await app.inject({
      method: "GET",
      url: "/test-client-ip",
      headers: { "x-forwarded-for": "198.51.100.2", "x-real-ip": "203.0.113.10" },
      remoteAddress: "127.0.0.1"
    });
    expect(first.json()).toMatchObject({ ip: "203.0.113.10" });
    expect(second.json()).toMatchObject({ ip: "203.0.113.10", key: first.json().key });
  });

  it("rejects a forged X-Real-IP from an untrusted socket peer", () => {
    const request = {
      headers: { "x-real-ip": "198.51.100.99" },
      ip: "203.0.113.42",
      raw: { socket: { remoteAddress: "203.0.113.42" } }
    } as unknown as FastifyRequest;
    expect(rateLimitClientAddress(request)).toBe("203.0.113.42");
  });
});
