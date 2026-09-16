export interface TokenBucketOptions {
  capacity: number; // Max burst tokens
  refillRatePerSec: number; // Tokens added per second
}

export class TokenBucketLimiter {
  private buckets = new Map<
    string,
    {
      tokens: number;
      lastRefill: number;
    }
  >();

  constructor(private defaultOptions: TokenBucketOptions) {}

  /**
   * Attempts to consume N tokens for a given key (e.g. client API key or IP).
   * Returns true if allowed, false if rate limited.
   */
  consume(key: string, tokens: number = 1, options?: Partial<TokenBucketOptions>): boolean {
    const capacity = options?.capacity ?? this.defaultOptions.capacity;
    const refillRate = options?.refillRatePerSec ?? this.defaultOptions.refillRatePerSec;

    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      // Refill tokens based on elapsed time
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      const addedTokens = elapsedSec * refillRate;
      bucket.tokens = Math.min(capacity, bucket.tokens + addedTokens);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  getAvailableTokens(key: string): number {
    const bucket = this.buckets.get(key);
    return bucket ? bucket.tokens : this.defaultOptions.capacity;
  }
}
