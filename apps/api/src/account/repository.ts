import type { Prisma, PrismaClient } from "@prisma/client";
import { memoryStore, type MemoryUser } from "../db/memory.js";
import { sha256 } from "../security/hash.js";

export type AccountExportV1 = {
  schemaVersion: "chainscout.account-export.v1";
  exportedAt: string;
  profile: {
    id: string;
    email: string | null;
    username: string | null;
    walletAddress: string | null;
    role: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  authenticationSessions: Array<{
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    userAgent: string | null;
    ipHash: string | null;
  }>;
  sessions: Array<{
    id: string;
    title: string;
    activeEntity: { type: string; value: string } | null;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      aiResponse: unknown;
      createdAt: string;
      citationReferences: Array<{ sourceDocumentId: string; fieldsUsed: string[] }>;
    }>;
  }>;
  usageEvents: Array<{ eventType: string; quantity: number; metadata: unknown; createdAt: string }>;
  auditEvents: Array<{
    action: string;
    ipHash: string | null;
    userAgent: string | null;
    metadata: unknown;
    createdAt: string;
  }>;
  retainedSharedData: string[];
};

export class AccountRepository {
  constructor(private readonly prisma?: PrismaClient) {}

  async exportUser(userId: string): Promise<AccountExportV1 | null> {
    if (!this.prisma) return exportMemoryUser(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        walletAddress: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        chatSessions: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            activeEntity: { select: { type: true, value: true } },
            messages: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                role: true,
                content: true,
                aiResponseJson: true,
                createdAt: true,
                sources: { select: { sourceDocumentId: true, fieldsUsed: true } }
              }
            }
          }
        },
        refreshTokens: {
          orderBy: { createdAt: "asc" },
          select: { createdAt: true, expiresAt: true, revokedAt: true, userAgent: true, ipHash: true }
        },
        usageEvents: {
          orderBy: { createdAt: "asc" },
          select: { eventType: true, quantity: true, metadata: true, createdAt: true }
        },
        auditLogs: {
          orderBy: { createdAt: "asc" },
          select: { action: true, ipHash: true, userAgent: true, metadata: true, createdAt: true }
        }
      }
    });
    if (!user) return null;
    return {
      schemaVersion: "chainscout.account-export.v1",
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        username: user.username,
        walletAddress: user.walletAddress,
        role: String(user.role),
        status: String(user.status),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      },
      authenticationSessions: user.refreshTokens.map((session) => ({
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString() ?? null,
        userAgent: session.userAgent,
        ipHash: session.ipHash
      })),
      sessions: user.chatSessions.map((session) => ({
        id: session.id,
        title: session.title,
        activeEntity: session.activeEntity
          ? { type: String(session.activeEntity.type).toLowerCase(), value: session.activeEntity.value }
          : null,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        messages: session.messages.map((message) => ({
          id: message.id,
          role: String(message.role),
          content: message.content,
          aiResponse: message.aiResponseJson,
          createdAt: message.createdAt.toISOString(),
          citationReferences: message.sources
        }))
      })),
      usageEvents: user.usageEvents.map((event) => ({
        eventType: String(event.eventType),
        quantity: event.quantity,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString()
      })),
      auditEvents: user.auditLogs.map((event) => ({
        action: event.action,
        ipHash: event.ipHash,
        userAgent: event.userAgent,
        metadata: event.metadata,
        createdAt: event.createdAt.toISOString()
      })),
      retainedSharedData: retainedSharedDataDisclosure()
    };
  }

  async deleteUser(userId: string): Promise<boolean> {
    if (!this.prisma) return deleteMemoryUser(userId);
    return this.prisma.$transaction((tx) => deletePrismaUserAccount(tx, userId));
  }
}

/**
 * Runs every user-linked delete inside the caller's transaction. Keeping the
 * transaction body explicit also lets the integration suite inject a failure
 * after this function returns and prove PostgreSQL restores every row.
 */
export async function deletePrismaUserAccount(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return false;
  const legacyEmailHash = user.email ? sha256(user.email.toLowerCase()) : undefined;
  await tx.usageEvent.deleteMany({ where: { userId } });
  await tx.auditLog.deleteMany({
    where: {
      OR: [
        { userId },
        ...(legacyEmailHash
          ? [{ metadata: { path: ["emailHash"], equals: legacyEmailHash } } as Prisma.AuditLogWhereInput]
          : [])
      ]
    }
  });
  const deleted = await tx.user.deleteMany({ where: { id: userId } });
  return deleted.count === 1;
}

function exportMemoryUser(userId: string): AccountExportV1 | null {
  const user = memoryStore.users.get(userId);
  if (!user) return null;
  const sessions = [...memoryStore.sessions.values()]
    .filter((session) => session.userId === userId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((session) => ({
      id: session.id,
      title: session.title,
      activeEntity: session.activeEntity ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messages: (memoryStore.messages.get(session.id) ?? []).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        aiResponse: message.aiResponseJson ?? null,
        createdAt: message.createdAt.toISOString(),
        citationReferences: []
      }))
    }));
  return {
    schemaVersion: "chainscout.account-export.v1",
    exportedAt: new Date().toISOString(),
    profile: publicMemoryProfile(user),
    authenticationSessions: [...memoryStore.refreshTokens.values()]
      .filter((session) => session.userId === userId)
      .map((session) => ({
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString() ?? null,
        userAgent: session.userAgent ?? null,
        ipHash: session.ipHash ?? null
      })),
    sessions,
    usageEvents: memoryStore.usage
      .filter((event) => event.userId === userId)
      .map((event) => ({ eventType: event.eventType, quantity: event.quantity, metadata: null, createdAt: event.createdAt.toISOString() })),
    auditEvents: memoryStore.auditLogs
      .filter((event) => event.userId === userId)
      .map((event) => ({
        action: event.action,
        ipHash: event.ipHash ?? null,
        userAgent: event.userAgent ?? null,
        metadata: event.metadata ?? null,
        createdAt: event.createdAt.toISOString()
      })),
    retainedSharedData: retainedSharedDataDisclosure()
  };
}

function publicMemoryProfile(user: MemoryUser): AccountExportV1["profile"] {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    walletAddress: user.walletAddress,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.createdAt.toISOString()
  };
}

function deleteMemoryUser(userId: string): boolean {
  const user = memoryStore.users.get(userId);
  if (!user) return false;
  const legacyEmailHash = user.email ? sha256(user.email.toLowerCase()) : undefined;
  for (const [token, stored] of memoryStore.refreshTokens) {
    if (stored.userId === userId) memoryStore.refreshTokens.delete(token);
  }
  for (const [token, stored] of memoryStore.authTokens) {
    if (stored.userId === userId) memoryStore.authTokens.delete(token);
  }
  for (const [sessionId, session] of memoryStore.sessions) {
    if (session.userId !== userId) continue;
    memoryStore.sessions.delete(sessionId);
    memoryStore.messages.delete(sessionId);
  }
  memoryStore.usage = memoryStore.usage.filter((event) => event.userId !== userId);
  memoryStore.auditLogs = memoryStore.auditLogs.filter((event) =>
    event.userId !== userId && (!legacyEmailHash || event.metadata?.emailHash !== legacyEmailHash)
  );
  memoryStore.users.delete(userId);
  if (user.email && memoryStore.usersByEmail.get(user.email.toLowerCase())?.id === userId) {
    memoryStore.usersByEmail.delete(user.email.toLowerCase());
  }
  if (user.walletAddress && memoryStore.usersByWallet.get(user.walletAddress.toLowerCase())?.id === userId) {
    memoryStore.usersByWallet.delete(user.walletAddress.toLowerCase());
  }
  if (user.username) memoryStore.usernames.delete(user.username.toLowerCase());
  return true;
}

function retainedSharedDataDisclosure(): string[] {
  return [
    "Public blockchain data remains on Robinhood Chain.",
    "De-associated public chain source documents and short-lived provider caches may remain without an account or question link."
  ];
}
