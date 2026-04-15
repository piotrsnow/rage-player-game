# Pattern — Backend proxy for AI calls

Frontend never talks directly to OpenAI / Anthropic / Gemini / ElevenLabs / Stability / Meshy. Every upstream call goes through backend proxy routes.

## Proxy routes

`backend/src/routes/proxy/` — one file per upstream:

- `openai.js` — chat completions + image gen
- `anthropic.js` — chat completions
- `gemini.js` — chat + image
- `elevenlabs.js` — TTS
- `stability.js` — image gen
- `meshy.js` — 3D model gen

## Why proxy, not FE-direct

- **API keys stay server-side.** Encrypted in `User.apiKeys` via `apiKeyService.js`. FE never sees them.
- **Centralized retry + fallback + cost tracking.** Retries, provider fallback, and cost logging live in one place instead of being duplicated in the FE.
- **CORS-free.** No upstream CORS headache.
- **Model routing.** The backend picks the right tier per task via `resolveModel` ([concepts/model-tiering.md](../concepts/model-tiering.md)).
- **Observability.** Every upstream call lands in bull-board / logs / cost tracker.

## Frontend AI dispatch (preferred)

The frontend uses `src/services/ai/service.js` → every method dispatches to a backend endpoint:

- `generateCampaign` → `POST /v1/ai/generate-campaign` (SSE via BullMQ + pub/sub bridge, inline SSE fallback)
- `generateSceneViaBackendStream` → `POST /v1/ai/campaigns/:id/generate-scene-stream` (SSE via BullMQ + pub/sub bridge)
- `generateStoryPrompt` → `POST /v1/ai/generate-story-prompt` (non-streaming nano)
- `generateCombatCommentary` → `POST /v1/ai/combat-commentary`
- `verifyObjective` → `POST /v1/ai/verify-objective`
- `generateRecap` → `POST /v1/ai/generate-recap` (chunked for long campaigns)

For images / TTS / 3D, the FE hits the proxy routes directly:

- `src/services/imageGen.js` → `/v1/proxy/openai`, `/v1/proxy/stability`, `/v1/proxy/gemini`
- `src/services/elevenlabs.js` → `/v1/proxy/elevenlabs` (except the public share-token TTS endpoint which is unauth'd)
- `src/services/meshyClient.js` → `/v1/proxy/meshy`

## Per-user API keys

Users can paste their own API keys via `PUT /v1/auth/settings { apiKeys: {...} }`. Backend encrypts and stores on `User.apiKeys`.

Resolution precedence in backend services:

```js
const userApiKeys = await loadUserApiKeys(prisma, userId);
const key = requireServerApiKey('OPENAI_API_KEY', userApiKeys, 'OpenAI');
// user key > env var > throw 503
```

Threaded through scene generation via the `userApiKeys` option — `sceneGenerator/generateSceneStream.js`, `campaignGenerator.js`, `storyPromptGenerator.js`, single-shot services via `aiJsonCall.js`. Nano / memory compressor / intent classifier still use env-only (background jobs, not user-billed).

## No FE-direct dispatch

There is **no fallback path** where the frontend calls upstream providers directly. `src/services/ai/providers.js` was deleted; `src/services/aiStream.js` was deleted. Per [decisions/no-byok.md](../decisions/no-byok.md), backend is the sole AI dispatch path.

When adding a new AI feature:

1. Write the service in `backend/src/services/` (use `aiJsonCall.js` for single-shot JSON calls, `streamingClient.js` pattern for streaming)
2. Expose via a route in `backend/src/routes/ai.js` or a new file
3. Call from FE via `apiClient.post/get` or `src/services/ai/service.js`

Never reach for "I'll just call OpenAI from the frontend quickly" — there isn't a quick path, and adding one violates the no-BYOK architecture.

## Related

- [concepts/scene-generation.md](../concepts/scene-generation.md) — how the main streaming endpoint is wired
- [concepts/model-tiering.md](../concepts/model-tiering.md) — tier selection inside the proxy layer
- [concepts/auth.md](../concepts/auth.md) — how per-user keys flow from settings to services
- [decisions/no-byok.md](../decisions/no-byok.md) — why FE-direct dispatch was removed
