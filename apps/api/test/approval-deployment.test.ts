import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Approval Manager production build", () => {
  it("defaults off and passes the explicit Railway build flag through Docker", () => {
    const dockerfile = readFileSync(new URL("../../web/Dockerfile", import.meta.url), "utf8");
    const build = dockerfile.split(/^FROM nginx/m)[0];
    expect(build).toMatch(/^ARG VITE_APPROVAL_MANAGER_ENABLED=false$/m);
    expect(build).toMatch(/^ENV VITE_APPROVAL_MANAGER_ENABLED=\$VITE_APPROVAL_MANAGER_ENABLED$/m);
    expect(build.indexOf("ENV VITE_APPROVAL_MANAGER_ENABLED=")).toBeLessThan(build.indexOf("RUN pnpm --filter @rh-chain/shared build"));
  });
});
