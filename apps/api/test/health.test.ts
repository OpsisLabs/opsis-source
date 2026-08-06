import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadEnv } from "../src/config/env.js";
import { healthRoutes } from "../src/routes/health.js";

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("readiness reporting", () => {
  it("reports provider configuration without claiming unchecked providers are healthy", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    await healthRoutes(app, loadEnv({
      NODE_ENV: "test",
      ALCHEMY_API_KEY: "configured",
      GOLDRUSH_ENABLED: "false"
    }));

    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      database: "memory",
      redis: "disabled",
      providers: {
        blockscout: { configured: true, status: "not_checked" },
        alchemy: { configured: true, status: "not_checked" },
        goldrush: { configured: false, status: "disabled" }
      }
    });
  });

  it("fails readiness when an owned dependency is unavailable", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    const prisma = { $queryRaw: vi.fn().mockRejectedValue(new Error("database down")) } as unknown as PrismaClient;
    const redis = { ping: vi.fn().mockResolvedValue("PONG") };
    await healthRoutes(app, loadEnv({ NODE_ENV: "test" }), prisma, redis);

    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ ok: false, database: "unavailable", redis: "up" });
  });
});
