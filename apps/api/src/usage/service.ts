import type { PrismaClient } from "@prisma/client";
import { memoryStore } from "../db/memory.js";
import { AppError } from "../http/errors.js";

export type UsageQuota = { aiMessages: number; chainLookups: number };
export type UsageSummary = {
  periodStart: string;
  periodEnd: string;
  aiMessages: number;
  chainLookups: number;
  quota: UsageQuota;
};

export class UsageService {
  constructor(private readonly prisma?: PrismaClient) {}

  async record(userId: string | undefined, eventType: "AI_MESSAGE" | "CHAIN_LOOKUP" | "PROVIDER_CALL" | "CACHE_HIT" | "CACHE_MISS" | "AUTH_LOGIN", quantity = 1): Promise<void> {
    if (!this.prisma) {
      memoryStore.usage.push({ userId, eventType, quantity, createdAt: new Date() });
      return;
    }
    await this.prisma.usageEvent.create({ data: { userId, eventType, quantity } });
  }

  async forUser(userId: string, quota: UsageQuota): Promise<UsageSummary> {
    const { start, end } = currentMonth();
    if (!this.prisma) {
      const counts = memoryStore.usage
        .filter((event) => event.userId === userId && event.createdAt >= start && event.createdAt < end)
        .reduce<Record<string, number>>((acc, event) => {
          acc[event.eventType] = (acc[event.eventType] ?? 0) + event.quantity;
          return acc;
        }, {});
      return summary(start, end, counts, quota);
    }
    const grouped = await this.prisma.usageEvent.groupBy({
      by: ["eventType"],
      where: { userId, createdAt: { gte: start, lt: end } },
      _sum: { quantity: true }
    });
    const counts = Object.fromEntries(grouped.map((item: { eventType: string; _sum: { quantity: number | null } }) => [item.eventType, item._sum.quantity ?? 0]));
    return summary(start, end, counts, quota);
  }

  async assertAvailable(userId: string, eventType: "AI_MESSAGE" | "CHAIN_LOOKUP", quota: UsageQuota): Promise<void> {
    const usage = await this.forUser(userId, quota);
    const exhausted = eventType === "AI_MESSAGE"
      ? usage.aiMessages >= usage.quota.aiMessages
      : usage.chainLookups >= usage.quota.chainLookups;
    if (exhausted) throw new AppError("MONTHLY_QUOTA_EXCEEDED", 429, "Monthly usage quota exceeded", usage);
  }
}

function currentMonth(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

function summary(start: Date, end: Date, counts: Record<string, number>, quota: UsageQuota): UsageSummary {
  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    aiMessages: counts.AI_MESSAGE ?? 0,
    chainLookups: counts.CHAIN_LOOKUP ?? 0,
    quota
  };
}
