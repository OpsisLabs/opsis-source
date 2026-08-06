import type { Prisma, PrismaClient } from "@prisma/client";
import type { ChainEntityType } from "@rh-chain/shared";
import type { ResolvedEntity, SourceDocumentInput } from "./types.js";
import { sha256 } from "../security/hash.js";

type PersistenceClient = Prisma.TransactionClient;

export type ChainEntityReference = {
  chainId: number;
  type: ChainEntityType;
  value: string;
};

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

/** Attach a validated entity to a session without blocking on live provider enrichment. */
export async function persistEntityReferenceWithClient(
  client: PersistenceClient,
  entity: ChainEntityReference
): Promise<string> {
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
      value: entity.value
    },
    // Preserve richer labels and metadata from any earlier full resolution.
    update: { value: entity.value }
  });
  return chainEntity.id;
}

/**
 * A resolution for a busy address can carry dozens of source documents, each
 * holding a full provider response. Writing them all sequentially overruns
 * Prisma's 5s default interactive-transaction timeout and fails with P2028
 * ("Transaction already closed"), which surfaced as a 500 on active wallets.
 */
export const CHAIN_PERSIST_TX_OPTIONS = { maxWait: 15_000, timeout: 45_000 };

export async function persistResolution(prisma: PrismaClient, resolution: ResolvedEntity): Promise<string> {
  return prisma.$transaction((tx) => persistResolutionWithClient(tx, resolution), CHAIN_PERSIST_TX_OPTIONS);
}
