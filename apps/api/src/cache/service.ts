import { observeCache } from "../observability/metrics.js";

export type CacheClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
};

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

export class JsonCache {
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(
    private readonly redis?: CacheClient,
    private readonly ttlSeconds = 60
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const cacheKey = `rh:cache:${key}`;
    if (this.redis) {
      try {
        const value = await this.redis.get(cacheKey);
        observeCache(value ? "hit" : "miss");
        return value ? (JSON.parse(value) as T) : undefined;
      } catch {
        observeCache("error");
        return undefined;
      }
    }
    const entry = this.memory.get(cacheKey);
    if (!entry) {
      observeCache("miss");
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(cacheKey);
      observeCache("miss");
      return undefined;
    }
    observeCache("hit");
    return JSON.parse(entry.value) as T;
  }

  async set(key: string, value: unknown, ttlSeconds = this.ttlSeconds): Promise<void> {
    const cacheKey = `rh:cache:${key}`;
    const serialized = JSON.stringify(value);
    if (this.redis) {
      try {
        await this.redis.set(cacheKey, serialized, "EX", ttlSeconds);
      } catch {
        return;
      }
      return;
    }
    this.memory.set(cacheKey, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}
