import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("released private feature production builds", () => {
  it.each(["APPROVAL_MANAGER", "TRADE_SIMULATOR", "CARD_PRICE_CHECK"])("%s defaults off and passes the explicit Railway build flag through Docker", (feature) => {
    const dockerfile = readFileSync(new URL("../../web/Dockerfile", import.meta.url), "utf8");
    const build = dockerfile.split(/^FROM nginx/m)[0];
    expect(build).toMatch(new RegExp(`^ARG VITE_${feature}_ENABLED=false$`, "m"));
    expect(build).toMatch(new RegExp(`^ENV VITE_${feature}_ENABLED=\\$VITE_${feature}_ENABLED$`, "m"));
    expect(build.indexOf(`ENV VITE_${feature}_ENABLED=`)).toBeLessThan(build.indexOf("RUN pnpm --filter @rh-chain/shared build"));
  });
});
