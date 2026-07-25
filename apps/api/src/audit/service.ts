import type { Prisma, PrismaClient } from "@prisma/client";
import { memoryStore } from "../db/memory.js";
import { hashIp } from "../security/hash.js";

export type AuditAction =
  | "AUTH_REGISTER_SUCCEEDED"
  | "AUTH_REGISTER_REJECTED"
  | "AUTH_LOGIN_SUCCEEDED"
  | "AUTH_LOGIN_FAILED"
  | "AUTH_REFRESH_SUCCEEDED"
  | "AUTH_REFRESH_FAILED"
  | "AUTH_LOGOUT"
  | "AUTH_EMAIL_VERIFIED"
  | "AUTH_VERIFICATION_REQUESTED"
  | "AUTH_PASSWORD_RESET_REQUESTED"
  | "AUTH_PASSWORD_RESET_COMPLETED";

export type AuditEvent = {
  action: AuditAction;
  userId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, string | number | boolean>;
};

export class AuditService {
  constructor(private readonly prisma?: PrismaClient) {}

  async record(event: AuditEvent): Promise<void> {
    const data = {
      userId: event.userId,
      action: event.action,
      ipHash: hashIp(event.ip),
      userAgent: event.userAgent,
      metadata: event.metadata
    };
    if (!this.prisma) {
      memoryStore.addAuditLog(data);
      return;
    }
    await this.prisma.auditLog.create({
      data: { ...data, metadata: event.metadata as Prisma.InputJsonValue | undefined }
    });
  }
}
