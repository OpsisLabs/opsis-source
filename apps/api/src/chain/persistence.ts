import type { Prisma, PrismaClient } from "@prisma/client";
import type { ChainEntityType } from "@rh-chain/shared";
import type { ResolvedEntity, SourceDocumentInput } from "./types.js";
import { sha256 } from "../security/hash.js";

type PersistenceClient = Prisma.TransactionClient;

const entityTypes: Record<ChainEntityType, "WALLET" | "TRANSACTION" | "TOKEN" | "CONTRACT" | "BLOCK" | "UNKNOWN"> = {
  wallet: "WALLET",
  transaction: "TRANSACTION",
  token: "TOKEN",
  contract: "CONTRACT",
  block: "BLOCK",
  unknown: "UNKNOWN"
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function sourceDocumentData(
  source: SourceDocumentInput,
  normalized: ResolvedEntity["entity"]
): Prisma.SourceDocumentUncheckedCreateInput {
  return {
    id: source.id,
    provider: source.provider,
    chainId: source.chainId,
    entityType: entityTypes[source.entityType],
    entityValue: source.entityValue,
    requestUrl: source.requestUrl,
    requestHash: sha256(JSON.stringify({
      provider: source.provider,
      chainId: source.chainId,
      entityType: source.entityType,
      entityValue: source.entityValue,
      requestUrl: source.requestUrl,
      responseJson: source.responseJson
    })),
    responseJson: json(source.responseJson),
    normalizedJson: json(normalized),
    fetchedAt: new Date(source.fetchedAt)
  };
}

export async function persistResolutionWithClient(client: PersistenceClient, resolution: ResolvedEntity): Promise<string> {
  const { entity, sources } = resolution;
  const chainEntity = await client.chainEntity.upsert({
    where: {
      chainId_type_value: {
        chainId: entity.chainId,
        type: entityTypes[entity.type],
        value: entity.value
      }
    },
    create: {
      chainId: entity.chainId,
      type: entityTypes[entity.type],
      value: entity.value,
      label: entity.label,
      metadata: json({ facts: entity.facts, riskNotes: entity.riskNotes })
    },
    update: {
      label: entity.label,
      metadata: json({ facts: entity.facts, riskNotes: entity.riskNotes })
    }
  });

  for (const source of sources) {
    await client.sourceDocument.upsert({
      where: { id: source.id },
      create: sourceDocumentData(source, entity),
      update: {}
    });
  }

  return chainEntity.id;
}

export async function persistResolution(prisma: PrismaClient, resolution: ResolvedEntity): Promise<string> {
  return prisma.$transaction((tx) => persistResolutionWithClient(tx, resolution));
}
