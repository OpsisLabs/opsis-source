import type { PrismaClient } from "@prisma/client";
import { memoryStore, type MemoryUser } from "../db/memory.js";
import { hashIp, sha256 } from "../security/hash.js";

export type AuthUser = {
  id: string;
  email: string | null;
  passwordHash: string | null;
  walletAddress: string | null;
  username: string | null;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "DISABLED";
  emailVerifiedAt: Date | null;
};

export type AuthTokenKind = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export class AuthRepository {
  constructor(private readonly prisma?: PrismaClient) {}

  async findByEmail(email: string): Promise<AuthUser | null> {
    if (!this.prisma) return memoryStore.usersByEmail.get(email.toLowerCase()) ?? null;
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } }) as Promise<AuthUser | null>;
  }

  async findById(id: string): Promise<AuthUser | null> {
    if (!this.prisma) return memoryStore.users.get(id) ?? null;
    return this.prisma.user.findUnique({ where: { id } }) as Promise<AuthUser | null>;
  }

  async createUser(email: string, passwordHash: string): Promise<AuthUser> {
    if (!this.prisma) return memoryStore.createUser(email.toLowerCase(), passwordHash);
    return this.prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash }
    }) as Promise<AuthUser>;
  }

  async findByWallet(address: string): Promise<AuthUser | null> {
    if (!this.prisma) return memoryStore.usersByWallet.get(address.toLowerCase()) ?? null;
    return this.prisma.user.findUnique({ where: { walletAddress: address } }) as Promise<AuthUser | null>;
  }

  async isUsernameTaken(username: string): Promise<boolean> {
    if (!this.prisma) return memoryStore.usernames.has(username.toLowerCase());
    const existing = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
      select: { id: true }
    });
    return existing !== null;
  }

  /** Wallet addresses are stored checksummed so they render correctly in the UI. */
  async createWalletUser(address: string, username: string): Promise<AuthUser> {
    if (!this.prisma) return memoryStore.createWalletUser(address, username);
    return this.prisma.user.create({ data: { walletAddress: address, username } }) as Promise<AuthUser>;
  }

  async storeAuthToken(userId: string, token: string, kind: AuthTokenKind, expiresAt: Date): Promise<void> {
    const tokenHash = sha256(token);
    const now = new Date();
    if (!this.prisma) {
      for (const stored of memoryStore.authTokens.values()) {
        if (stored.userId === userId && stored.kind === kind && !stored.usedAt) stored.usedAt = now;
      }
      memoryStore.authTokens.set(tokenHash, { userId, kind, expiresAt });
      return;
    }
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({ where: { userId, kind, usedAt: null }, data: { usedAt: now } }),
      this.prisma.authToken.create({ data: { userId, tokenHash, kind, expiresAt } })
    ]);
  }

  async verifyEmail(token: string): Promise<AuthUser | null> {
    const tokenHash = sha256(token);
    const now = new Date();
    if (!this.prisma) {
      const stored = memoryStore.authTokens.get(tokenHash);
      if (!stored || stored.kind !== "EMAIL_VERIFICATION" || stored.usedAt || stored.expiresAt <= now) return null;
      const user = memoryStore.users.get(stored.userId);
      if (!user) return null;
      stored.usedAt = now;
      user.emailVerifiedAt = now;
      return user;
    }
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.authToken.findUnique({ where: { tokenHash } });
      if (!stored || stored.kind !== "EMAIL_VERIFICATION" || stored.usedAt || stored.expiresAt <= now) return null;
      const consumed = await tx.authToken.updateMany({ where: { id: stored.id, usedAt: null }, data: { usedAt: now } });
      if (consumed.count !== 1) return null;
      return tx.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: now } }) as Promise<AuthUser>;
    });
  }

  async resetPassword(token: string, passwordHash: string): Promise<AuthUser | null> {
    const tokenHash = sha256(token);
    const now = new Date();
    if (!this.prisma) {
      const stored = memoryStore.authTokens.get(tokenHash);
      if (!stored || stored.kind !== "PASSWORD_RESET" || stored.usedAt || stored.expiresAt <= now) return null;
      const user = memoryStore.users.get(stored.userId);
      if (!user) return null;
      stored.usedAt = now;
      user.passwordHash = passwordHash;
      for (const refresh of memoryStore.refreshTokens.values()) {
        if (refresh.userId === user.id) refresh.revokedAt = now;
      }
      return user;
    }
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.authToken.findUnique({ where: { tokenHash } });
      if (!stored || stored.kind !== "PASSWORD_RESET" || stored.usedAt || stored.expiresAt <= now) return null;
      const consumed = await tx.authToken.updateMany({ where: { id: stored.id, usedAt: null }, data: { usedAt: now } });
      if (consumed.count !== 1) return null;
      const user = await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: now } });
      return user as AuthUser;
    });
  }

  async storeRefreshToken(userId: string, token: string, expiresAt: Date, userAgent?: string, ip?: string): Promise<void> {
    const tokenHash = sha256(token);
    if (!this.prisma) {
      memoryStore.refreshTokens.set(tokenHash, { userId, expiresAt });
      return;
    }
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, userAgent, ipHash: hashIp(ip) }
    });
  }

  async rotateRefreshToken(oldToken: string, newToken: string, expiresAt: Date, userAgent?: string, ip?: string): Promise<AuthUser | null> {
    const oldHash = sha256(oldToken);
    if (!this.prisma) {
      const stored = memoryStore.refreshTokens.get(oldHash);
      if (!stored || stored.revokedAt || stored.expiresAt < new Date()) return null;
      stored.revokedAt = new Date();
      memoryStore.refreshTokens.set(sha256(newToken), { userId: stored.userId, expiresAt });
      return memoryStore.users.get(stored.userId) ?? null;
    }
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: oldHash }, include: { user: true } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.user.status !== "ACTIVE") return null;
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      this.prisma.refreshToken.create({
        data: { userId: stored.userId, tokenHash: sha256(newToken), expiresAt, userAgent, ipHash: hashIp(ip) }
      })
    ]);
    return stored.user as AuthUser;
  }

  async revokeRefreshToken(token: string): Promise<string | undefined> {
    const tokenHash = sha256(token);
    if (!this.prisma) {
      const stored = memoryStore.refreshTokens.get(tokenHash);
      if (stored) stored.revokedAt = new Date();
      return stored?.userId;
    }
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    await this.prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
    return stored?.userId;
  }
}
