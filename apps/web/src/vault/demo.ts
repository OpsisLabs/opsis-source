import type { VaultAsset, VaultAssetDraft } from "./types";
import { translateCurrent } from "../i18n/translate";

export const VAULT_DEMO_MARKER = "CHAINSCOUT DEMO DATA V1";

export function isVaultDemoAsset(asset: Pick<VaultAsset, "notes">): boolean {
  return asset.notes.startsWith(VAULT_DEMO_MARKER);
}

export function promoteVaultDemoDraft(draft: VaultAssetDraft): VaultAssetDraft {
  if (!draft.notes.startsWith(VAULT_DEMO_MARKER)) return draft;
  return {
    ...draft,
    name: draft.name.replace(/^\[DEMO\]\s*/u, ""),
    notes: draft.notes.replace(VAULT_DEMO_MARKER, translateCurrent("vault.demo.converted")),
  };
}

export function createVaultDemoDrafts(): VaultAssetDraft[] {
  return [
    {
      name: "[DEMO] Wrapped Ether",
      assetType: "crypto",
      identifier: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      lots: [
        {
          quantity: "0.42",
          unitPrice: "2450.00",
          currency: "USD",
          acquiredAt: "2026-05-18",
        },
      ],
      notes: `${VAULT_DEMO_MARKER} · ${translateCurrent("vault.demo.note.weth")}`,
    },
    {
      name: "[DEMO] Charizard · Base Set",
      assetType: "collectible",
      identifier: "tcgdex:en:base1-4",
      lots: [
        {
          quantity: "1",
          unitPrice: "185.00",
          currency: "USD",
          acquiredAt: "2025-11-02",
        },
      ],
      notes: `${VAULT_DEMO_MARKER} · ${translateCurrent("vault.demo.note.charizard")}`,
      collectible: {
        catalog: null,
        ownerPrinting: "Holo · owner entered",
        condition: "near-mint",
        grader: "ungraded",
        grade: "",
        certificate: "",
        photoSource: null,
        photoAddedAt: null,
        references: [
          {
            id: "98bb327b-08bd-4e06-ad6d-6b8c320d7311",
            value: "210.00",
            currency: "USD",
            observedAt: "2026-05-10",
            sourceUrl: "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
            label: translateCurrent("vault.demo.ref.manual"),
          },
          {
            id: "d63b4f6c-88e8-4738-baaa-da54f79796f0",
            value: "235.00",
            currency: "USD",
            observedAt: "2026-08-10",
            sourceUrl: "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
            label: translateCurrent("vault.demo.ref.followup"),
          },
        ],
      },
    },
    {
      name: "[DEMO] Apple Stock Token",
      assetType: "rwa",
      identifier: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
      lots: [
        {
          quantity: "3",
          unitPrice: "225.50",
          currency: "USD",
          acquiredAt: "2026-03-14",
        },
      ],
      notes: `${VAULT_DEMO_MARKER} · ${translateCurrent("vault.demo.note.apple")}`,
    },
    {
      name: "[DEMO] Robinhood Chain Collectible #42",
      assetType: "nft",
      identifier: "demo:robinhood-chain:nft:42",
      lots: [
        {
          quantity: "1",
          unitPrice: "0.08",
          currency: "ETH",
          acquiredAt: "2026-01-22",
        },
      ],
      notes: `${VAULT_DEMO_MARKER} · ${translateCurrent("vault.demo.note.nft")}`,
    },
  ];
}
