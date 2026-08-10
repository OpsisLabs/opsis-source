import { randomUUID } from "node:crypto";
import type { AiExplorerAnswer, ChainEntityType } from "@rh-chain/shared";

export type MemoryUser = {
  id: string;
  // A user is identified by an email or a wallet address, never neither.
  email: string | null;
  passwordHash: string | null;
  walletAddress: string | null;
  username: string | null;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "DISABLED";
  emailVerifiedAt: Date | null;
  createdAt: Date;
};

export type MemorySession = {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  activeEntity?: { type: ChainEntityType; value: string };
};

export type MemoryMessage = {
  id: string;
  sessionId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  aiResponseJson?: AiExplorerAnswer;
  createdAt: Date;
};

export type MemoryAuditLog = {
  id: string;
  userId?: string;
  action: string;
  ipHash?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean>;
  createdAt: Date;
};

export class MemoryStore {
  users = new Map<string, MemoryUser>();
  usersByEmail = new Map<string, MemoryUser>();
  usersByWallet = new Map<string, MemoryUser>();
  usernames = new Set<string>();
  refreshTokens = new Map<string, {
    userId: string;
    expiresAt: Date;
    revokedAt?: Date;
    createdAt: Date;
    userAgent?: string;
    ipHash?: string;
  }>();
  authTokens = new Map<string, { userId: string; kind: "EMAIL_VERIFICATION" | "PASSWORD_RESET"; expiresAt: Date; usedAt?: Date }>();
  sessions = new Map<string, MemorySession>();
  messages = new Map<string, MemoryMessage[]>();
  usage: Array<{ userId?: string; eventType: string; quantity: number; createdAt: Date }> = [];
  auditLogs: MemoryAuditLog[] = [];

  createUser(email: string, passwordHash: string): MemoryUser {
    const user: MemoryUser = {
      id: randomUUID(),
      email,
      passwordHash,
      walletAddress: null,
      username: null,
      role: "USER",
      status: "ACTIVE",
      emailVerifiedAt: null,
      createdAt: new Date()
    };
    this.users.set(user.id, user);
    this.usersByEmail.set(email.toLowerCase(), user);
    return user;
  }

  createWalletUser(walletAddress: string, username: string): MemoryUser {
    const user: MemoryUser = {
      id: randomUUID(),
      email: null,
      passwordHash: null,
      walletAddress,
      username,
      role: "USER",
      status: "ACTIVE",
      emailVerifiedAt: null,
      createdAt: new Date()
    };
    this.users.set(user.id, user);
    this.usersByWallet.set(walletAddress.toLowerCase(), user);
    this.usernames.add(username.toLowerCase());
    return user;
  }

  createSession(userId: string, title: string): MemorySession {
    const session = { id: randomUUID(), userId, title, createdAt: new Date(), updatedAt: new Date() };
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return session;
  }

  addMessage(message: Omit<MemoryMessage, "id" | "createdAt">): MemoryMessage {
    const created = { ...message, id: randomUUID(), createdAt: new Date() };
    this.messages.get(message.sessionId)?.push(created);
    return created;
  }

  addAuditLog(log: Omit<MemoryAuditLog, "id" | "createdAt">): MemoryAuditLog {
    const created = { ...log, id: randomUUID(), createdAt: new Date() };
    this.auditLogs.push(created);
    return created;
  }
}

export const memoryStore = new MemoryStore();
