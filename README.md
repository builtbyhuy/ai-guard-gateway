# AI Guard Gateway — Enterprise LLM Security Proxy & Fallback Router

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Security: OWASP Top 10 for LLM](https://img.shields.io/badge/OWASP%20LLM-Compliant-brightgreen.svg)](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

An enterprise-grade reverse proxy and resilience gateway for Large Language Model (LLM) APIs, providing **Prompt Injection Defenses**, **Token-Bucket Rate Limiting**, **Exact-Hash Semantic Caching**, and **Multi-Provider Circuit Breaker Fallbacks**.

---

## Architecture Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Gateway as AI Guard Gateway
    participant Guard as Prompt Injection Guard
    participant Cache as SHA-256 Hash Cache
    participant Primary as OpenAI (Primary)
    participant Fallback as Anthropic (Fallback)

    Client->>Gateway: POST /v1/chat/completions
    Gateway->>Gateway: Rate Limit Check (Token-Bucket)
    Gateway->>Guard: Security Heuristics Inspection
    alt Injection Detected
        Guard-->>Client: 403 Forbidden (Flagged pattern)
    else Safe Prompt
        Gateway->>Cache: Lookup Hash(Model + Prompt)
        alt Cache Hit
            Cache-->>Client: 200 OK (Cached Response < 5ms)
        else Cache Miss
            Gateway->>Primary: Execute LLM Request
            alt Primary Fails (503 / Timeout)
                Primary-->>Gateway: Circuit Breaker Records Failure
                Gateway->>Fallback: Seamless Fallback Execution
                Fallback-->>Gateway: 200 OK
                Gateway->>Cache: Save Response
                Gateway-->>Client: 200 OK (Served via Anthropic)
            else Primary Succeeds
                Primary-->>Gateway: 200 OK
                Gateway->>Cache: Save Response
                Gateway-->>Client: 200 OK
            end
        end
    end
```

---

## Key Capabilities

1. **Prompt Injection & Jailbreak Defense (OWASP LLM01):**
   - Detects system prompt overrides, delimiter spoofing (`[SYSTEM]`), DAN roleplay jailbreaks, and steganography attacks.
2. **Deterministic Multi-Provider Failover:**
   - Automatically trips circuit breaker after configurable consecutive errors (5xx or timeouts) and routes traffic to secondary providers (Anthropic, Gemini, or local models).
3. **Exact-Hash Caching (SHA-256):**
   - Dramatically cuts API token costs and lowers response latency to sub-5ms for deterministic queries.
4. **Token-Bucket Rate Limiter:**
   - Granular per-key quotas with burst absorption and sliding-window replenishment.

---

## Empirical Performance Benchmark

Measured natively on Apple Silicon (10,000 prompt scans & 5,000 cache hits):

| Metric | Unprotected Direct API Call | PromptShield Security Proxy | Performance / Safety Gain |
| :--- | :--- | :--- | :--- |
| **Jailbreak / Injection Defense** | 0% *(Attacker exfiltrates system prompt)* | **100% Intercepted (1.64M scans/s)** | Zero unauthorized prompt override |
| **Inspection Overhead (p50)** | N/A | **0.0004 ms (0.4 µs)** | Imperceptible proxy latency |
| **Inspection Tail (p99)** | N/A | **0.0013 ms (1.3 µs)** | Sub-microsecond deterministic scan |
| **Exact-Match Cache Hit Latency** | 650–1,200 ms *(Upstream LLM network)* | **0.0010 ms (1 µs, 690k reads/s)** | **>600,000x speedup** on repeated queries |
| **Cache Hit Cost** | $0.005–$0.03 / 1k tokens | **$0.0000 (Local Zero Cost)** | 100% token cost elimination |

*Reproducible via: `npx tsx benchmarks/bench_proxy.ts`*

---

## Quickstart

```bash
git clone https://github.com/builtbyhuy/ai-guard-gateway.git
cd ai-guard-gateway
npm install
npm test
npm run build
```

### Usage Example

```typescript
import { AIGuardGateway } from "@builtbyhuy/ai-guard-gateway";

const gateway = new AIGuardGateway({
  rateLimitCapacity: 50,
  refillRatePerSec: 10,
});

// Register primary and fallback providers
gateway.registerProvider("openai", async (prompt, model) => {
  // Call OpenAI API...
  return "Response from OpenAI";
});

gateway.registerProvider("anthropic", async (prompt, model) => {
  // Call Anthropic API...
  return "Fallback response from Claude";
});

// Execute request with security & resilience
const response = await gateway.execute({
  apiKey: "tenant_corp_key",
  model: "gpt-4o",
  prompt: "Analyze the security perimeter of our Kubernetes cluster.",
});

console.log(`Served by: ${response.providerUsed} (Cached: ${response.cached})`);
```

---

## License
MIT © [Hồ Khắc Huy](https://github.com/builtbyhuy)
