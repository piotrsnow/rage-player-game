# Model Tiering

Three tiers. Each tier picks the cheapest model that can do the job. Nothing cheap enough for nano gets sent to premium, nothing quality-sensitive goes to nano.

## Files

- [src/services/ai/models.js](../../src/services/ai/models.js) — `AI_MODELS`, `MODEL_MAP`, `TASK_TIER_OVERRIDE`, `selectModel`, `resolveModel`
- [src/services/ai/service.js](../../src/services/ai/service.js) — `aiService` object: `generateCampaign`, `generateSceneViaBackendStream`, `generateRecap`, `generateStoryPrompt`, `generateCombatCommentary`, `verifyObjective`. All dispatch to backend endpoints.
- [src/services/ai/index.js](../../src/services/ai/index.js) — barrel re-export
- [backend/src/services/aiJsonCall.js](../../backend/src/services/aiJsonCall.js) — shared helper for single-shot non-streaming JSON calls. Handles OpenAI + Anthropic, accepts `userApiKeys` for per-user key resolution via `requireServerApiKey`.

## Tiers

| Tier     | Models                             | Used for |
|----------|------------------------------------|----------|
| nano     | `gpt-5.4-nano`, `gpt-4.1-nano`, `claude-haiku-4-5` | intent classification, memory compression, quest objective check, skill check inference, location summaries |
| standard | `gpt-5.4-mini`, `claude-haiku-4-5` | combat commentary, story prompt generation, recap generation (chunked), objective verification |
| premium  | `gpt-5.4`, `claude-sonnet-4`       | scene generation, campaign creation |

Model IDs live in [src/services/ai/models.js](../../src/services/ai/models.js) and the backend mirrors them. Tier selection via `resolveModel(tier, provider, taskOverride?)`.

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

1. **"Scene generation cost exploded."** A task that should be nano is running on premium. Check `TASK_TIER_OVERRIDE` and `resolveModel` call sites in the scene gen pipeline.
2. **"Fallback never fires."** The primary provider is returning a non-retriable error (4xx). Retry logic only triggers on 5xx + transient failures. Check `aiClient.js` retry classification.
3. **"Anthropic Haiku picked when OpenAI should have won."** `selectModel` uses the DM setting `aiModelTier` + user key availability. If user only has an Anthropic key, nano goes Anthropic.

## Related

- [scene-generation.md](scene-generation.md) — where the premium call lives
- [ai-context-assembly.md](ai-context-assembly.md) — where the nano calls live
- [auth.md](auth.md) — per-user API key resolution via `loadUserApiKeys`
