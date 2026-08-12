import { describe, expect, it } from "vitest";
import { productAvailability } from "./availability";

describe("product build availability", () => {
  it("fails gated tools closed in production unless the exact flag is true", () => {
    expect(productAvailability({
      collectibleCatalog: undefined,
      marketInventory: "false",
      development: false,
    })).toEqual({ collectibleCatalog: false, marketInventory: false });

    expect(productAvailability({
      collectibleCatalog: "true",
      marketInventory: "true",
      development: false,
    })).toEqual({ collectibleCatalog: true, marketInventory: true });
  });

  it("keeps local development enabled by default but honors an explicit false", () => {
    expect(productAvailability({
      collectibleCatalog: undefined,
      marketInventory: "false",
      development: true,
    })).toEqual({ collectibleCatalog: true, marketInventory: false });
  });
});
