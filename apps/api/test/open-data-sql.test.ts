import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";
import { opsisRoutes } from "../src/routes/opsis.js";
describe("browser SQL capability", () => {
  it("defaults off and advertises flag parity without a SQL endpoint", async () => {
    expect(loadEnv({ NODE_ENV: "test" }).OPEN_DATA_SQL_ENABLED).toBe(false);
    expect(loadEnv({ NODE_ENV: "test" }).OPEN_DATA_DATASETS_ENABLED).toBe(
      false,
    );
    for (const datasets of [false, true])
      for (const enabled of [false, true]) {
        const app = Fastify();
        const config = loadEnv({
          NODE_ENV: "test",
          OPSIS_WORKSPACES_ENABLED: "true",
          OPSIS_PUBLIC_ACCESS_ENABLED: "true",
          OPEN_DATA_DATASETS_ENABLED: String(datasets),
          OPEN_DATA_SQL_ENABLED: String(enabled),
        });
        await opsisRoutes(app, config);
        try {
          const response = await app.inject({
            method: "POST",
            url: "/v1/private/opsis/access",
            payload: {},
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.openDataDatasets).toBe(enabled && datasets);
          expect(
            body.manifest.capabilities.find(
              (r: { id: string }) => r.id === "openDataDatasets",
            ),
          ).toMatchObject({ enabled: enabled && datasets });
          expect(body.openDataSql).toBe(enabled);
          expect(
            body.manifest.capabilities.find(
              (row: { id: string }) => row.id === "openDataSql",
            ),
          ).toMatchObject({ enabled });
          expect(
            (
              await app.inject({
                method: "POST",
                url: "/v1/private/opsis/sql",
                payload: { query: "SELECT 1" },
              })
            ).statusCode,
          ).toBe(404);
        } finally {
          await app.close();
        }
      }
  });
});
