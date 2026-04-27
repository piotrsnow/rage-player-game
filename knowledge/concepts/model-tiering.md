# Model Tiering

Three tiers. Each tier picks the cheapest model that can do the job. Nothing cheap enough for nano gets sent to premium, nothing quality-sensitive goes to nano.

## Files

- [src/services/ai/models.js](../../src/services/ai/models.js) — `AI_MODELS`, `MODEL_MAP`, `TASK_TIER_OVERRIDE`, `selectModel`, `resolveModel`
- [src/services/ai/service.js](../../src/services/ai/service.js) — `aiService` object: `generateCampaign`, `generateSceneViaBackendStream`, `generateRecap`, `generateStoryPrompt`, `generateCombatCommentary`, `verifyObjective`. All dispatch to backend endpoints.
- [src/services/ai/index.js](../../src/services/ai/index.js) — barrel re-export
- [backend/src/services/aiJsonCall.js](../../backend/src/services/aiJsonCall.js) — shared helper for single-shot non-streaming JSON calls. Handles OpenAI + Anthropic, accepts `userApiKeys` for per-user key resolution via `requireServerApiKey`.

## Tiers

| Tier             | OpenAI default    | Anthropic default     | Used for |
|------------------|-------------------|-----------------------|----------|
| nano             | `gpt-4.1-nano`    | `claude-haiku-4-5`    | intent classification, quest objective check, skill check inference — **critical-path**, blocks scene gen |
| nanoReasoning    | `gpt-5.4-nano`    | `claude-haiku-4-5`    | memory compression, location summary — **async post-scene**, reasoning helps judgment |
| standard         | `gpt-4.1-mini`    | `claude-haiku-4-5`    | combat fast-path narrative (shortcuts.js), recaps (chunked), story prompts, objective verify |
| premium          | `gpt-4.1`         | `claude-sonnet-4`     | scene generation, campaign creation — creative writing + streaming JSON |

Model IDs live in [backend/src/config.js](../../backend/src/config.js) `aiModels` (canonical) and [src/services/ai/models.js](../../src/services/ai/models.js) (FE mirror). Backend selection: `config.aiModels[tier][provider]`. FE selection via `selectModel(provider, tier, taskType)`.

## Reasoning vs non-reasoning — when each tier wins

**Non-reasoning** (`gpt-4.1*`, `claude-sonnet-4`) — fast TTFT, no thinking tokens, less verbose output. Right for:
- Critical-path classifiers where latency blocks the user (intent, quest check).
- Streaming creative writing (premium scene gen) — reasoning tokens arrive before stream starts and inflate dialogue length without narrative gain.
- Fast-path narratives (2-3 sentence combat opener).

**Reasoning** (`gpt-5.4-nano`, o-series) — spends thinking tokens before output. Right for:
- Async "what matters?" judgment (memory compression picks which facts to keep; location summary picks what defines a place) — post-scene path, latency is free.
- Any task where input volume >> output volume AND selection quality > speed.

**The principle**: reasoning on async paths, non-reasoning on critical paths. Premium scene gen is critical-path creative writing, so it's non-reasoning even though it's the most expensive tier. This is why `premium` is `gpt-4.1`.

### Gotcha: maxTokens must budget for thinking tokens

When switching a task to a reasoning model, `maxTokens` covers **output + thinking**, not just output. Empirical baseline from 4.1-nano → 5.4-nano migration: a task with 79T real output needed `maxTokens: 1200` (~15x headroom) to avoid truncation during reasoning. A task with 118T output needed 500. Under-budgeting truncates the final JSON and fails Zod parse silently.

## Providers

Multi-provider via `src/services/ai/providers.js` + backend services:

- **OpenAI** — primary for scene gen, nano, standard
- **Anthropic** — fallback + premium for long campaigns; Haiku 4.5 is a valid nano replacement
- **Gemini** — available via proxy; used for some image + select text tasks
- **Local models** — `localAI.js` for Ollama / LM Studio (for offline dev; not a prod path)

Backend services fall back across providers: scene gen starts on the primary provider, retries on Anthropic if OpenAI fails, etc. Retry + provider-fallback logic lives in `multiplayerAI/aiClient.js` and `sceneGenerator/streamingClient.js`.

## Why tiering at all

Nano calls (intent, fact extraction, quest check) run 3-5 times per scene. Sending those to premium would multiply scene cost by 10-20x for zero narrative improvement. Nano cost is a rounding error — the project input budget to nano hovers around 500-1000 tokens per call, and nano pricing makes it effectively free.

**Batch nano compression was rejected.** Design alternative: stack N scenes, call nano once to summarize them in bulk (-60% nano calls). Rejected because the per-scene + 15-fact cap keeps input size bounded and fact quality high; batching would risk worse fact retention to save money that wasn't a problem.

## When debugging tiering

1. **"Scene generation cost exploded."** A task that should be nano is running on premium. Check `TASK_TIER_OVERRIDE` and `resolveModel` call sites in the scene gen pipeline. Also check for hardcoded model IDs bypassing config — `intentClassifier.js`, `shortcuts.js`, and `memoryCompressor.js` previously did this; now all read from `config.aiModels`.
2. **"Fallback never fires."** The primary provider is returning a non-retriable error (4xx). Retry logic only triggers on 5xx + transient failures. Check `aiClient.js` retry classification.
3. **"Anthropic Haiku picked when OpenAI should have won."** `selectModel` uses the DM setting `aiModelTier` + user key availability. If user only has an Anthropic key, nano goes Anthropic.
4. **"Nano compression output is truncated / Zod parse fails."** `maxTokens` doesn't include thinking budget for reasoning models. Bump `maxTokens` (see "Gotcha" above) or switch the task to non-reasoning nano.

## Related

- [scene-generation.md](scene-generation.md) — where the premium call lives
- [ai-context-assembly.md](ai-context-assembly.md) — where the nano calls live
- [auth.md](auth.md) — per-user API key resolution via `loadUserApiKeys`
