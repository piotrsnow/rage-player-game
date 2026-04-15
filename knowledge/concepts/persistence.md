# Persistence & Storage

How campaign state is saved and loaded. The frontend owns an in-memory Zustand store; persistence is a **separate concern** driven by an auto-save queue that pushes to the backend. No localStorage persist middleware, no offline mode — every load reads from the backend.

## Files

### Frontend

- [src/services/storage.js](../../src/services/storage.js) — `storage.saveCampaign`, `storage.loadCampaign`, `autoSave`, `flushPendingSave`, save-queue dedup, `_parseBackendCampaign` (the canonical payload → state shape converter)
- [src/services/apiClient.js](../../src/services/apiClient.js) — fetch wrapper with JWT auth, 401 auto-retry via `refreshAccessToken()`, X-CSRF-Token auto-injection, `buildIdempotencyHeader` for opt-in idempotency keys
- [src/hooks/useCampaignLoader.js](../../src/hooks/useCampaignLoader.js) — on `/play/:id` navigation, fires `storage.loadCampaign(id)` if no campaign active, then dispatches `LOAD_CAMPAIGN`

### Backend

- [backend/src/routes/campaigns/](../../backend/src/routes/campaigns/) — split route group:
  - `public.js` — unauth'd: `GET /public`, `GET /public/:id`, `GET /share/:token`, `POST /share/:token/tts`
  - `crud.js` — authed: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`
  - `sharing.js` — `POST /:id/share`, `DELETE /:id/share`, `PATCH /:id/publish`
  - `recaps.js` — `GET /:id/recaps`, `POST /:id/recaps`
  - `schemas.js` — `CAMPAIGN_WRITE_SCHEMA`, `RECAP_SAVE_SCHEMA`
- [backend/src/services/campaignSerialize.js](../../backend/src/services/campaignSerialize.js) — pure helpers: `extractTotalCost`, `stripNormalizedFromCoreState`, `SCENE_CLIENT_SELECT`, `dedupeScenesByIndexAsc`, `buildDistinctSceneCountMap`
- [backend/src/services/campaignSync.js](../../backend/src/services/campaignSync.js) — DB side effects: `withRetry` (Prisma P2034/P2028 transaction retry), `fetchCampaignCharacters`, `syncNPCsToNormalized`, `syncKnowledgeToNormalized`, `syncQuestsToNormalized`, `reconstructFromNormalized`
- [backend/src/services/campaignRecap.js](../../backend/src/services/campaignRecap.js) — recap cache helpers

## Database model (MongoDB via Prisma)

| Model | Purpose |
|---|---|
| `User` | Auth, encrypted API keys, settings |
| `Campaign` | `coreState` (lean ~15-25KB JSON string), metadata, totalCost, share tokens |
| `CampaignScene` | Normalized scene rows with Atlas Vector Search embeddings |
| `CampaignNPC` | NPC rows with embeddings + lock fields (`lockedCampaignId`, `lockedCampaignName`, `lockedLocation`) |
| `CampaignKnowledge` | Running facts, events, decisions, plot threads, location summaries |
| `CampaignCodex` | Lore entries with embeddings |
| `CampaignQuest` | Quest rows with status + objectives |
| `Character` | Reusable character library. Owns the character-to-campaign lock. |
| `MultiplayerSession` | Room state backup for crash recovery |
| `MediaAsset` | User-generated images/music/TTS (content-addressable) |
| `PrefabAsset`, `Wanted3D` | 3D model catalog |
| `Achievement` | Per-user unlocked achievements |

## `coreState` vs normalized collections

`Campaign.coreState` is a **lean JSON string** holding everything the frontend needs to rehydrate a game session: character snapshots, combat state, world state (time/weather/location/facts), chat history, quest indexes, scene pointers, ai cost totals.

Heavier per-entity data lives in normalized collections (`CampaignNPC`, `CampaignQuest`, `CampaignKnowledge`, `CampaignCodex`, `CampaignScene`) with embeddings for Atlas Vector Search.

On save:

1. Frontend builds `coreState` via `storage.saveCampaign(state)` — filters out normalized entities (`stripNormalizedFromCoreState`)
2. `PUT /v1/campaigns/:id { coreState: JSON.stringify(...), totalCost }` — single-row Campaign update
3. Scenes are saved separately via `POST /v1/ai/campaigns/:id/scenes` (after scene generation completes) or `POST /v1/ai/campaigns/:id/scenes/bulk`
4. Backend `syncNPCsToNormalized`, `syncKnowledgeToNormalized`, `syncQuestsToNormalized` sync the normalized collections from the embedded subset in `coreState`

On load:

1. `storage.loadCampaign(id)` → `GET /v1/campaigns/:id` → backend returns `{id, userId, name, genre, tone, coreState (string), characters[], characterIds, scenes[], totalCost, lastSaved, shareToken}`
2. Backend `reconstructFromNormalized` merges normalized entities into the returned `coreState`
3. Frontend `_parseBackendCampaign(full)` parses `coreState` string, copies `characters[0]` onto `state.character`, hydrates the rest of the state shape
4. `gameDispatch({type: 'LOAD_CAMPAIGN', payload: data})` drops it into the store

## JSON fields stored as strings

Prisma on MongoDB does NOT support native JSON fields — arrays of complex objects must be serialized to strings and parsed on read. This applies to:

- `Campaign.coreState`
- `CampaignNPC.details`, `CampaignNPC.personality` (any nested object field)
- `CampaignQuest.objectives`, `CampaignQuest.rewards`
- ...and so on

When adding a new `String` Prisma field that holds JSON, always pair the DB access with `JSON.parse` on read and `JSON.stringify` on write. Check existing examples in `campaignSync.js` and `storage.js`.

**Exception:** embeddings. Atlas Vector Search requires native BSON arrays of doubles. These are written via `mongoNative.js` using the raw MongoDB driver — see [decisions/embeddings-native-driver.md](../decisions/embeddings-native-driver.md).

## Auto-save queue

`autoSave(state)` in `storage.js`:

1. Dedups rapid-fire calls via `pendingSaveRef`
2. Debounces by ~1.5s
3. Calls `storage.saveCampaign(state)` → `PUT /v1/campaigns/:id`
4. Retries with exponential backoff on network failure
5. `flushPendingSave()` on window `beforeunload` (triggered from the main Layout component or the store itself)

Scenes are saved separately from the campaign auto-save: `POST /scenes` is called right after scene generation completes (not via the queue), and `POST /scenes/bulk` is used for batch imports.

## Idempotency

Three routes opt into the idempotency plugin via `config: { idempotency: true }`:

- `POST /v1/campaigns` (create)
- `POST /v1/ai/campaigns/:id/scenes`
- `POST /v1/ai/campaigns/:id/scenes/bulk`

Frontend `apiClient.post/put/patch` accepts an optional third arg:

- `{ idempotent: true }` → auto-generates a fresh UUID per call via `crypto.randomUUID()` (prevents double-click / React Strict Mode double-render duplicates; does NOT dedup across network retries)
- `{ idempotencyKey: '<stable>' }` → caller provides a stable key (for retry-with-same-key flows)

The plugin uses Redis SET NX with a `__pending__` marker + 60s TTL for race protection. Concurrent second request sees pending → 409 Conflict. Sequential second request after completion gets the cached response with `idempotent-replay: true` header. **Non-2xx responses release the lock** so client retries aren't poisoned by cached errors.

## Character-to-campaign lock

A saved character can only be in one active campaign at a time. `Character` has three fields:

- `lockedCampaignId` — the campaign holding this character
- `lockedCampaignName` — display name for tooltips
- `lockedLocation` — current in-game location (updated each scene)

Lifecycle:

- **`POST /v1/campaigns`** locks all `characterIds` to the new campaign
- **`DELETE /v1/campaigns/:id`** releases all locked characters
- **`PUT /v1/campaigns/:id` rename** syncs `lockedCampaignName` on every linked character
- **Scene generation** updates `lockedLocation` whenever `stateChanges.currentLocation` is set (in `applyCharacterStateChanges`)

A character is available to pick iff `!lockedCampaignId || isSafeLocation(lockedLocation)`. Frontend pickers (`CharacterPicker`, `JoinRoomPage`) gray out unavailable characters with a tooltip. `isSafeLocation` + `SAFE_LOCATION_RE` live in [shared/domain/safeLocation.js](../../shared/domain/safeLocation.js).

**Known gaps:** MP guest join in `multiplayer/handlers/lobby.js` doesn't yet write the lock — only host characters get locked via `POST /v1/campaigns`. No "force release" escape hatch; if a campaign is broken, `DELETE /v1/campaigns/:id` frees the character.

## When debugging persistence

1. **"My changes aren't saving."** Check `autoSave` queue — is `pendingSaveRef` set? Has the PUT gone out? Check Network tab.
2. **"Load returns stale data."** `_parseBackendCampaign` vs the current state shape. Add a `console.log` before the dispatch. Also check `reconstructFromNormalized` on backend — maybe a new normalized field wasn't merged back.
3. **"Scene count mismatch."** `dedupeScenesByIndexAsc` — backend has duplicates (same sceneIndex). Usually from a split save between `PUT /campaigns` and `POST /scenes` that lost the order.
4. **"NPC lost personality after reload."** Prisma field holds a JSON string; you forgot to `JSON.parse`. Check `syncNPCsToNormalized` and the read path.
5. **"Character locked to a campaign I deleted."** The DELETE handler should clear lock fields; if it didn't, check if you're hitting the right delete path and that `Character.lockedCampaignId` is nulled.
6. **"Double row created after a retry."** Missing `{ idempotent: true }` on a POST that should have it. Check the 3 routes that opt in and match them in `apiClient.js` call sites.

## Related

- [decisions/embeddings-native-driver.md](../decisions/embeddings-native-driver.md) — why embeddings bypass Prisma
- [decisions/atlas-only-no-local-mongo.md](../decisions/atlas-only-no-local-mongo.md) — why dev requires Atlas
- [game-state.md](game-state.md) — the store that gets serialized
- [scene-generation.md](scene-generation.md) — where scenes are produced before saving
- [auth.md](auth.md) — how `apiClient` gets the JWT access token
