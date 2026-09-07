import { describe, expect, it } from "vitest";
import { deploymentSchemaRequired } from "../src/ops/deployment-schema-policy.js";

describe("deployment schema policy", () => {
  it.each(["false", "FALSE", "False"])("allows no database only for explicit %s", (flag) => {
    expect(deploymentSchemaRequired({ CLOUD_WORKSPACE_ENABLED: flag })).toBe(false);
    expect(deploymentSchemaRequired({ DATABASE_URL: "", CLOUD_WORKSPACE_ENABLED: flag })).toBe(false);
  });

  it.each([undefined, "", "true", "TRUE", "0", "off", " false "])("fails closed without a database for %s", (flag) => {
    expect(() => deploymentSchemaRequired({ CLOUD_WORKSPACE_ENABLED: flag })).toThrow("DATABASE_URL is required");
  });

  it.each([undefined, "", "true", "false", "invalid"])("still verifies any attached database with flag %s", (flag) => {
    expect(deploymentSchemaRequired({ DATABASE_URL: "postgresql://example.invalid/test", CLOUD_WORKSPACE_ENABLED: flag })).toBe(true);
  });
});
