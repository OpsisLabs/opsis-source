import type { Prisma, PrismaClient } from "@prisma/client";
import type { AiExplorerAnswer, ChainEntityType } from "@rh-chain/shared";
import type { ResolvedEntity } from "../chain/types.js";
import {
  CHAIN_PERSIST_TX_OPTIONS,
  persistEntityReferenceWithClient,
  persistResolutionWithClient,
  type ChainEntityReference
} from "../chain/persistence.js";
import { memoryStore, type MemoryMessage, type MemorySession } from "../db/memory.js";

export type ChatSessionRecord = MemorySession;
export type ChatMessageRecord = MemoryMessage | Prisma.ChatMessageGetPayload<Record<string, never>>;

export class ChatRepository {
  constructor(private readonly prisma?: PrismaClient) {}

  async createSession(userId: string, title: string, entity?: ChainEntityReference): Promise<ChatSessionRecord> {
    if (!this.prisma) {
      const session = memoryStore.createSession(userId, title);
      if (entity) session.activeEntity = { type: entity.type, value: entity.value };
      return session;
    }
    if (!entity) return this.prisma.chatSession.create({ data: { userId, title } });
    return this.prisma.$transaction(async (tx) => {
      const activeEntityId = await persistEntityReferenceWithClient(tx, entity);
      return tx.chatSession.create({ data: { userId, title, activeEntityId } });
    }, CHAIN_PERSIST_TX_OPTIONS);
  }

  /**
   * Sessions carry their active entity so clients can label a session and load
   * its entity panel without a lookup per session.
   */
  async listSessions(userId: string): Promise<ChatSessionRecord[]> {
    if (!this.prisma) {
      return [...memoryStore.sessions.values()]
        .filter((session) => session.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { activeEntity: { select: { type: true, value: true } } }
    });
    return sessions.map(({ activeEntity, ...session }) => ({
      ...session,
      activeEntity: activeEntity
        ? { type: activeEntity.type.toLowerCase() as ChainEntityType, value: activeEntity.value }
        : undefined
    }));
  }

  async ownsSession(sessionId: string, userId: string): Promise<boolean> {
    if (!this.prisma) return memoryStore.sessions.get(sessionId)?.userId === userId;
    return Boolean(await this.prisma.chatSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } }));
  }

  async activeEntity(sessionId: string, userId: string): Promise<{ type: ChainEntityType; value: string } | null> {
    if (!this.prisma) {
      const session = memoryStore.sessions.get(sessionId);
      return session?.userId === userId ? session.activeEntity ?? null : null;
    }
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      select: { activeEntity: { select: { type: true, value: true } } }
    });
    if (!session?.activeEntity) return null;
    return { type: session.activeEntity.type.toLowerCase() as ChainEntityType, value: session.activeEntity.value };
  }

  async listMessages(sessionId: string, userId: string): Promise<ChatMessageRecord[] | null> {
    if (!this.prisma) {
      if (memoryStore.sessions.get(sessionId)?.userId !== userId) return null;
      return memoryStore.messages.get(sessionId) ?? [];
    }
    const session = await this.prisma.chatSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
    if (!session) return null;
    return this.prisma.chatMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
  }

  async addExchange(
    sessionId: string,
    userId: string,
    question: string,
    answer: AiExplorerAnswer,
    resolution: ResolvedEntity
  ): Promise<ChatMessageRecord | null> {
    if (!this.prisma) {
      const session = memoryStore.sessions.get(sessionId);
      if (!session || session.userId !== userId) return null;
      memoryStore.addMessage({ sessionId, role: "USER", content: question });
      const message = memoryStore.addMessage({
        sessionId,
        role: "ASSISTANT",
        content: answer.answer,
        aiResponseJson: answer,
        tokenUsageJson: answer.tokenUsage
      });
      session.updatedAt = new Date();
      session.activeEntity = { type: resolution.entity.type, value: resolution.entity.value };
      return message;
    }

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.chatSession.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
      if (!session) return null;

      const activeEntityId = await persistResolutionWithClient(tx, resolution);
      await tx.chatSession.update({ where: { id: sessionId }, data: { activeEntityId } });
      await tx.chatMessage.create({ data: { sessionId, role: "USER", content: question } });
      const message = await tx.chatMessage.create({
        data: {
          sessionId,
          role: "ASSISTANT",
          content: answer.answer,
          aiResponseJson: answer as unknown as Prisma.InputJsonValue,
          tokenUsageJson: answer.tokenUsage as Prisma.InputJsonValue | undefined
        }
      });
      if (resolution.sources.length > 0) {
        await tx.messageSource.createMany({
          data: resolution.sources.map((source) => ({
            messageId: message.id,
            sourceDocumentId: source.id,
            fieldsUsed: answer.citations.find((citation) => citation.id === source.id)?.fieldsUsed ?? []
          })),
          skipDuplicates: true
        });
      }
      return message;
    }, CHAIN_PERSIST_TX_OPTIONS);
  }
}
