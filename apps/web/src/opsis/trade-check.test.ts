import { describe, expect, it } from "vitest";
import { EXIT_CHECK_TOKENS } from "../exit-check/api";
import { differentOutput } from "./trade-check";

describe("Trade Check output selection", () => {
  it("defaults WETH to USDG regardless of case or symbol input", () => {
    for (const input of [EXIT_CHECK_TOKENS.WETH.address, EXIT_CHECK_TOKENS.WETH.address.toLowerCase(), " weth "]) {
      expect(differentOutput(input, "WETH")).toBe("USDG");
      expect(differentOutput(input, "USDG")).toBe("USDG");
    }
  });
  it("corrects USDG to WETH and preserves other valid selections", () => {
    expect(differentOutput("USDG", "USDG")).toBe("WETH");
    expect(differentOutput("AAPL", "WETH")).toBe("WETH");
    expect(differentOutput("AAPL", "USDG")).toBe("USDG");
    expect(differentOutput("", "WETH")).toBe("WETH");
    expect(differentOutput("unknown", "WETH")).toBe("WETH");
  });
});
