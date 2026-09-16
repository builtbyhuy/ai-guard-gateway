import { PromptGuard, ThreatInspectionResult } from "./security/guard.js";
import { TokenBucketLimiter } from "./limiter/tokenBucket.js";
import { CircuitBreaker } from "./routing/circuitBreaker.js";
import { ExactHashCache } from "./cache/hashCache.js";

export interface LLMRequest {
  apiKey: string;
  model: string;
  prompt: string;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  providerUsed: string;
  cached: boolean;
  latencyMs: number;
}

export interface GatewayMetrics {
  requestsTotal: number;
  blockedInjections: number;
  rateLimited: number;
  cacheHits: number;
  fallbacksTriggered: number;
}

export type LLMExecutor = (prompt: string, model: string) => Promise<string>;

export class AIGuardGateway {
  private guard = new PromptGuard();
  private limiter: TokenBucketLimiter;
  private cache = new ExactHashCache<string>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private providers = new Map<string, LLMExecutor>();
  private providerPriority: string[] = [];

  public metrics: GatewayMetrics = {
    requestsTotal: 0,
    blockedInjections: 0,
    rateLimited: 0,
    cacheHits: 0,
    fallbacksTriggered: 0,
  };

  constructor(options?: {
    rateLimitCapacity?: number;
    refillRatePerSec?: number;
  }) {
    this.limiter = new TokenBucketLimiter({
      capacity: options?.rateLimitCapacity ?? 20,
      refillRatePerSec: options?.refillRatePerSec ?? 5,
    });
  }

  registerProvider(name: string, executor: LLMExecutor, failureThreshold: number = 2): this {
    this.providers.set(name, executor);
    this.circuitBreakers.set(name, new CircuitBreaker(name, { failureThreshold, resetTimeoutMs: 5000 }));
    this.providerPriority.push(name);
    return this;
  }

  async execute(req: LLMRequest): Promise<LLMResponse> {
    this.metrics.requestsTotal++;
    const startTime = performance.now();

    // 1. Rate Limiting Check
    const allowedByRateLimit = this.limiter.consume(req.apiKey, 1);
    if (!allowedByRateLimit) {
      this.metrics.rateLimited++;
      throw new Error(`Rate limit exceeded for key: ${req.apiKey}`);
    }

    // 2. Prompt Injection Security Inspection
    const threat = this.guard.inspect(req.prompt);
    if (!threat.isAllowed) {
      this.metrics.blockedInjections++;
      throw new Error(`Security Violation: ${threat.reason}`);
    }

    // 3. Exact-Hash Caching
    const cacheKey = ExactHashCache.computeHash(req.model, req.prompt, req.temperature ?? 0);
    const cachedResponse = this.cache.get(cacheKey);
    if (cachedResponse) {
      this.metrics.cacheHits++;
      return {
        content: cachedResponse,
        providerUsed: "cache",
        cached: true,
        latencyMs: performance.now() - startTime,
      };
    }

    // 4. Multi-Provider Routing with Circuit Breakers
    let lastError: Error | null = null;
    let fallbackCount = 0;

    for (const providerName of this.providerPriority) {
      const breaker = this.circuitBreakers.get(providerName)!;
      if (!breaker.isAvailable()) {
        continue; // Skip open circuit
      }

      const executor = this.providers.get(providerName)!;
      try {
        const content = await executor(req.prompt, req.model);
        breaker.recordSuccess();

        // Populate Cache
        this.cache.set(cacheKey, content);

        if (fallbackCount > 0) {
          this.metrics.fallbacksTriggered++;
        }

        return {
          content,
          providerUsed: providerName,
          cached: false,
          latencyMs: performance.now() - startTime,
        };
      } catch (err: unknown) {
        breaker.recordFailure();
        lastError = err instanceof Error ? err : new Error(String(err));
        fallbackCount++;
        // Continue to next provider in priority list
      }
    }

    throw new Error(
      `All available LLM providers failed or circuits are open. Last error: ${lastError?.message}`
    );
  }
}
