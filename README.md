# AI Guard Gateway — Heuristic Filtering and Fallback Sample

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A TypeScript library experiment combining prompt-pattern heuristics, in-memory
token buckets, a hash-keyed response cache and ordered provider callbacks with
circuit-breaker state.

This is an independent local sample. It is not an HTTP reverse proxy, an OWASP
certification, a complete prompt-injection defense or a connected-provider
reliability result.

## Implementation

- `PromptGuard` assigns weights to a small set of regex patterns and a
  zero-width-character heuristic. A score threshold decides whether to allow
  the prompt; detection and blocking are different results.
- `TokenBucketLimiter` keeps caller-key buckets in process memory.
- `ExactHashCache` hashes model, temperature and trimmed prompt text. This
  is hash-keyed caching, not semantic retrieval.
- `AIGuardGateway` tries registered callbacks in order, recording failures and
  moving to another available callback after an exception.
- Counters expose requests, blocked prompts, rate limits, cache hits and fallbacks.

## Quick start

```bash
git clone https://github.com/builtbyhuy/ai-guard-gateway.git
cd ai-guard-gateway
npm ci
npm test
npm run build
```

```typescript
import { AIGuardGateway } from "./src/gateway.js";

const gateway = new AIGuardGateway({
  rateLimitCapacity: 50,
  refillRatePerSec: 10,
});

gateway.registerProvider("local-example", async (prompt, model) => {
  return `Synthetic response for ${model}: ${prompt}`;
});

const response = await gateway.execute({
  apiKey: "demo-caller",
  model: "demo-model",
  prompt: "Summarize this synthetic example",
});

console.log(response.providerUsed, response.cached);
```

Provider callbacks are supplied by the caller. Registering a callback does not
connect OpenAI, Anthropic or another service automatically; the checked-in
example and tests use synthetic responses.

## Verification scope

The checked-in tests cover selected benign and attack strings, token-bucket
capacity, a failing primary callback followed by a successful fallback, and
repeated cache hits. They do not establish general jailbreak resistance,
real-provider failover or distributed quota enforcement. Run the suite on the
revision being reviewed; no fresh execution result is asserted here.

## Benchmark scope

```bash
npx tsx benchmarks/bench_proxy.ts
```

The script times repeated heuristic inspections and 5,000 warm-cache gateway
calls using a synthetic provider callback. It does not call a paid LLM API or
measure network response times. The inspection loop does not assert detection
accuracy and visits only a subset of its listed prompts. It therefore cannot
establish a 100% attack-blocking rate, a network speedup or financial savings.

## Known limitations

- Pattern matching can miss attacks and flag ordinary text. Threat scores
  are manually assigned heuristics, not calibrated probabilities.
- The cache key excludes caller and provider identity. Do not assume tenant
  isolation or equivalent outputs from different providers.
- Hash input uses delimiter concatenation and prompt trimming; arbitrary
  model/prompt strings are not encoded with an unambiguous structured format.
- Limiters, caches, circuit state and counters are per-process and disappear
  on restart. There is no shared distributed state.
- Provider callbacks have no built-in request timeout, cancellation contract
  or provider-specific model mapping. The request temperature affects the cache
  key but is not passed to the callback by this interface.
- The included circuit breaker does not limit half-open probes to one caller.
- Production authentication, provider integrations, adversarial evaluation and
  operational monitoring require separate implementation and verification.

## License

MIT © [Hồ Khắc Huy](https://github.com/builtbyhuy)
