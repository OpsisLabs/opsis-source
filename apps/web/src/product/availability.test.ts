import { describe, expect, it } from "vitest";
import { productAvailability, vaultWorkspaceFromSearch } from "./availability";

describe("product build availability", () => {
  it("fails gated tools closed in production unless the exact flag is true", () => {
    expect(productAvailability({
      collectibleCatalog: undefined,
      marketInventory: "false",
      replayActions: undefined,
      openDataApi: undefined,
      development: false,
    })).toEqual({ collectibleCatalog: false, marketInventory: false, replayActions: false, openDataApi: false });

    expect(productAvailability({
      collectibleCatalog: "true",
      marketInventory: "true",
      replayActions: "true",
      openDataApi: "true",
      development: false,
    })).toEqual({ collectibleCatalog: true, marketInventory: true, replayActions: true, openDataApi: true });
  });

  it("keeps local development enabled by default but honors an explicit false", () => {
    expect(productAvailability({
      collectibleCatalog: undefined,
      marketInventory: "false",
      replayActions: undefined,
      openDataApi: undefined,
      development: true,
    })).toEqual({ collectibleCatalog: true, marketInventory: false, replayActions: true, openDataApi: true });
  });

  it("fails a direct gated Vault link closed to manual assets", () => {
    const flags = {
      collectibleCatalog: false,
      marketInventory: false,
      replayActions: false,
      openDataApi: false,
    };
    expect(vaultWorkspaceFromSearch(new URLSearchParams("view=replay"), flags)).toBe("assets");
    expect(vaultWorkspaceFromSearch(new URLSearchParams("view=market"), flags)).toBe("assets");
    expect(vaultWorkspaceFromSearch(new URLSearchParams("view=portfolio"), flags)).toBe("portfolio");
    expect(vaultWorkspaceFromSearch(
      new URLSearchParams("view=replay"),
      { ...flags, replayActions: true },
    )).toBe("replay");
  });

  it("fails the developer API page closed unless the exact web flag is true", () => {
    expect(productAvailability({ collectibleCatalog: "false", marketInventory: "false", replayActions: "false", openDataApi: undefined, development: false }).openDataApi).toBe(false);
    expect(productAvailability({ collectibleCatalog: "false", marketInventory: "false", replayActions: "false", openDataApi: "true", development: false }).openDataApi).toBe(true);
  });
});
