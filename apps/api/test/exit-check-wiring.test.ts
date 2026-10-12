import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { JsonCache } from "../src/cache/service.js";
import { loadEnv } from "../src/config/env.js";
import { installErrorHandler } from "../src/http/errors.js";
import { exitCheckRoutes } from "../src/routes/exit-check.js";

const { redisInstances } = vi.hoisted(() => ({
  redisInstances: [] as Array<{
    eval: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("ioredis", () => {
  class FakeRedis {
    rateLimit?: (...args: unknown[]) => void;
    rateLimitRead?: (...args: unknown[]) => void;
    eval = vi.fn(async () => [1, 999]);
    get = vi.fn(async () => null);
    set = vi.fn(async () => "OK");
    ping = vi.fn(async () => "PONG");
    connect = vi.fn(async () => {});
    quit = vi.fn(async () => "OK");
    constructor() {
      redisInstances.push(this as never);
    }
    defineCommand(name: string) {
      (this as Record<string, unknown>)[name] = (
        _key: string,
        ...args: unknown[]
      ) => {
        const callback = args[args.length - 1];
        if (typeof callback === "function") {
          (callback as (error: unknown, result: unknown) => void)(null, [
            1, 60_000,
          ]);
        }
      };
    }
  }
  return { default: FakeRedis };
});

vi.mock("../src/chain/provider-http.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/chain/provider-http.js")>();
  class FakeProviderHttpClient {
    requestJson = async () => {
      throw new actual.ProviderRequestError("PROVIDER_HTTP_429", true);
    };
  }
  return {
    ...actual,
    ProviderHttpClient: FakeProviderHttpClient,
    createProviderHttp: () => new FakeProviderHttpClient(),
  };
});

function productionEnv() {
  return loadEnv({
    NODE_ENV: "production",
    ROBINHOOD_RPC_PROVIDER: "drpc",
    DRPC_API_KEY: "test-drpc-key-0123456789abcdef",
    LOG_LEVEL: "silent",
    APP_ORIGIN: "https://opsis.example",
    JWT_ACCESS_SECRET: "configured-access-secret-at-least-32",
    JWT_REFRESH_SECRET: "configured-refresh-secret-at-least-32",
    REDIS_URL: "rediss://cache.example.com",
    METRICS_TOKEN: "metrics-secret-at-least-32-characters",
    RETENTION_ENABLED: "false",
    EXIT_CHECK_ENABLED: "true",
  });
}

const requestBody = {
  token: "0x1111111111111111111111111111111111111111",
  amount: "1",
};

describe("exit check production budget wiring", () => {
  it("shares the redis budget with the default ExitCheckService through the real buildApp route", async () => {
    redisInstances.length = 0;
    const env = productionEnv();
    const app = await buildApp(env);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/private/exit-check/quote",
        headers: { origin: env.APP_ORIGIN, "x-opsis-csrf": "1" },
        payload: requestBody,
      });
      const redis = redisInstances[0];
      // The default service must consume the shared redis-backed budget; with
      // the original omission the production guard threw before any read.
      expect(redis?.eval).toHaveBeenCalled();
      expect(response.statusCode, response.body).toBe(503);
      expect(response.json().error?.code).toBe("EXIT_CHECK_RATE_LIMITED");
    } finally {
      await app.close();
    }
  });

  it("fails closed for the default ExitCheckService when production has no redis budget", async () => {
    const app = Fastify();
    installErrorHandler(app);
    try {
      await exitCheckRoutes(app, productionEnv(), new JsonCache());
      const response = await app.inject({
        method: "POST",
        url: "/v1/private/exit-check/quote",
        payload: requestBody,
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("EXIT_CHECK_BUDGET_UNAVAILABLE");
    } finally {
      await app.close();
    }
  });
});
