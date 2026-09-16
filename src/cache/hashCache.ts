import { createHash } from "crypto";

export interface CacheEntry<T = unknown> {
  data: T;
  expiresAt: number;
}

export class ExactHashCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();

  constructor(private defaultTtlMs: number = 60000) {}

  static computeHash(model: string, prompt: string, temperature: number = 0): string {
    return createHash("sha256")
      .update(`${model}:${temperature}:${prompt.trim()}`)
      .digest("hex");
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
