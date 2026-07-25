import { describe, expect, it } from "vitest";
import type { ResolvedEntity, SourceDocumentInput } from "../src/chain/types.js";
import { sourceDocumentData } from "../src/chain/persistence.js";

describe("chain source persistence mapping", () => {
  it("maps normalized source data to the Prisma record shape with a stable request hash", () => {
    const source: SourceDocumentInput = {
      id: "source-1",
      provider: "fixture",
      chainId: 4663,
      entityType: "contract",
      entityValue: "0x0000000000000000000000000000000000000001",
      requestUrl: "https://example.test/contracts/1",
      responseJson: { is_verified: true },
      fetchedAt: "2026-07-10T08:00:00.000Z"
    };
    const entity: ResolvedEntity["entity"] = {
      chainId: 4663,
      type: "contract",
      value: source.entityValue,
      facts: { verified: true },
      citations: [],
      riskNotes: []
    };

    const first = sourceDocumentData(source, entity);
    const second = sourceDocumentData(source, entity);

    expect(first).toMatchObject({
      id: "source-1",
      provider: "fixture",
      chainId: 4663,
      entityType: "CONTRACT",
      entityValue: source.entityValue,
      requestUrl: source.requestUrl,
      responseJson: source.responseJson,
      normalizedJson: entity
    });
    expect(first.fetchedAt).toEqual(new Date(source.fetchedAt));
    expect(first.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.requestHash).toBe(second.requestHash);
  });
});
