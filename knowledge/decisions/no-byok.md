# Decision — Backend is the sole AI dispatch path (no FE BYOK)

## Context

Originally the frontend had a "proxy mode" where users could paste their own provider API keys and the FE would build prompts, call the provider directly, parse the response, and feed it back to the game. This predated the backend scene-gen pipeline.

Over time the backend grew a leaner pipeline ([two-stage-pipeline.md](two-stage-pipeline.md)) with compression, context assembly, and model tiering. The FE proxy-mode pipeline became a parallel, drifting copy — duplicate prompt building, duplicate parsing, duplicate provider dispatch, duplicate key management. Every fix had to land in both places.

## Options considered

### A) Keep BYOK (bring-your-own-key) mode on the frontend

- ✓ Privacy story: user's calls don't route through our backend
- ✓ User can use their own rate limit / their own provider tier
- ✗ Duplicate code: ~1.5k lines of parallel prompt building, parsing, dispatch
- ✗ Drift: FE proxy mode had different prompts, different validation, different fallbacks — bugs fixed in one didn't propagate
- ✗ Can't use the two-stage pipeline from the FE (no access to the DB for context assembly)
- ✗ Can't use embeddings / vector search / memory compression
- ✗ Can't do model tiering properly — the FE only had one code path per provider
- ✗ Can't enforce state validation server-side — FE-dispatched responses bypass the validator
- ✗ Key management complexity — FE encryption is weaker than backend encryption

### B) Backend as sole AI dispatch path — CHOSEN

Every AI call goes through a backend route. Users can still store their own provider keys (paste in Settings → stored encrypted in `User.apiKeys`), and the backend decrypts and uses them for that user's requests server-side.

- ✓ Single code path for prompts, parsing, dispatch, validation
- ✓ Two-stage pipeline + memory compression + context assembly available on every call
- ✓ Server-side state validation enforced
- ✓ Per-user billing possible (keys are user-specific)
- ✓ Model tiering + provider fallback + cost tracking centralized
- ✗ Weaker privacy story — user's calls route through our backend
- ✗ Backend must stay up for the game to work

The privacy tradeoff is acceptable because:

1. Backend stores keys encrypted (AES-256 via `apiKeyService.js`).
2. The feature was never part of the product's main distribution story.
3. Prod-A is single-VM, same-origin, no third-party AI traffic re-route.

## How per-user keys work

1. User pastes keys via `KeysModal` → `PUT /v1/auth/settings { apiKeys: {...} }`
2. Backend route encrypts each value via `apiKeyService.encrypt` and stores on `User.apiKeys`
3. Services that need AI call `loadUserApiKeys(prisma, userId)` → decrypted bundle
4. Pass the bundle as `userApiKeys` option to scene gen / campaign gen / single-shot calls
5. Inside, `requireServerApiKey(keyName, userApiKeys, label)` resolves: **user key > env var > 503**
6. Call uses the resolved key with the provider

Services threaded with per-user key resolution:

- `sceneGenerator/generateSceneStream.js` (scene path via `streamingClient.js`)
- `campaignGenerator.js`
- `storyPromptGenerator.js`
- Single-shot services via `aiJsonCall.js` (combat commentary, verify objective, recap)

Nano / memory compressor / intent classifier use **env-only** — they're server-internal background jobs, not charged to a specific user.

## Don't

- **Don't reintroduce FE-direct provider dispatch.** "No" means "no," not "maybe later." If you're tempted to "just call OpenAI quickly from the FE," that's the sign to add a proper backend endpoint.
- **Don't re-add `src/services/ai/providers.js` or a parallel `aiStream.js`.** They were deleted deliberately. All FE AI dispatch goes through `apiClient.post('/ai/...')`.
- **Don't skip `requireServerApiKey` when adding a new provider call.** It's the central choke point for user-key precedence + 503 fallback.

## Related

- [concepts/auth.md](../concepts/auth.md) — how user keys get stored and retrieved
- [concepts/scene-generation.md](../concepts/scene-generation.md) — how keys flow through the scene pipeline
- [patterns/backend-proxy.md](../patterns/backend-proxy.md) — the proxy routes for non-scene AI calls
