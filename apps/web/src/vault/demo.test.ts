import { describe, expect, it } from "vitest";
import { createAsset } from "./crypto";
import {
  createVaultDemoDrafts,
  isVaultDemoAsset,
  promoteVaultDemoDraft,
  VAULT_DEMO_MARKER,
} from "./demo";

describe("Vault demo records", () => {
  it("creates four valid, removable, clearly labeled local-only examples", () => {
    const drafts = createVaultDemoDrafts();
    const assets = drafts.map((draft) => createAsset(draft));

    expect(assets).toHaveLength(4);
    expect(new Set(assets.map((asset) => asset.assetType))).toEqual(
      new Set(["crypto", "collectible", "rwa", "nft"]),
    );
    expect(assets.every((asset) => asset.name.startsWith("[DEMO]"))).toBe(true);
    expect(assets.every(isVaultDemoAsset)).toBe(true);
    expect(assets.every((asset) => asset.notes.startsWith(VAULT_DEMO_MARKER))).toBe(true);
    expect(assets.every((asset) => asset.photo === undefined)).toBe(true);

    const collectible = assets.find((asset) => asset.assetType === "collectible");
    expect(collectible?.collectible?.references).toHaveLength(2);
    expect(collectible?.collectible?.catalog).toBeNull();
  });

  it("does not classify a user record as removable demo content", () => {
    const userAsset = createAsset({
      name: "My Charizard",
      assetType: "collectible",
      identifier: "",
      lots: [{ quantity: "1", unitPrice: "", currency: "USD", acquiredAt: "" }],
      notes: "A normal private record",
      collectible: {
        catalog: null,
        ownerPrinting: "",
        condition: "unknown",
        grader: "ungraded",
        grade: "",
        certificate: "",
        photoSource: null,
        photoAddedAt: null,
        references: [],
      },
    });
    expect(isVaultDemoAsset(userAsset)).toBe(false);
  });

  it("turns an edited demo into a normal user record before saving", () => {
    const promoted = promoteVaultDemoDraft(createVaultDemoDrafts()[0]);
    const asset = createAsset(promoted);
    expect(asset.name).toBe("Wrapped Ether");
    expect(asset.notes).toMatch(/^Converted from an Opsis demo record/u);
    expect(isVaultDemoAsset(asset)).toBe(false);
  });
});

it("recognizes and promotes persisted legacy demo notes", () => {
  const draft = { ...createVaultDemoDrafts()[0], notes: "CHAINSCOUT DEMO DATA V1 · sample" };
  expect(isVaultDemoAsset(createAsset(draft))).toBe(true);
  const promoted = promoteVaultDemoDraft(draft);
  expect(isVaultDemoAsset(createAsset(promoted))).toBe(false);
  expect(promoted.notes).not.toContain("CHAINSCOUT DEMO DATA V1");
});
