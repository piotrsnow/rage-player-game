# Authentication

Cookie-based refresh + short-lived JWT access tokens. Double-submit CSRF. Access token lives in memory only — no localStorage. Page reload → `bootstrapAuth()` exchanges the refresh cookie for a new access token.

## Files

- [backend/src/routes/auth.js](../../backend/src/routes/auth.js) — all `/v1/auth/*` endpoints: /register, /login, /refresh, /logout, /me, /settings, /api-keys
- [backend/src/services/refreshTokenService.js](../../backend/src/services/refreshTokenService.js) — opaque random refresh tokens in Postgres (`RefreshToken` table, btree index on `expiresAt`, reaped by an in-process 10-min `setInterval`). Cookie format `<userId>.<tokenId>`, 30d TTL. Exports `issueRefreshToken`, `verifyRefreshToken`, `revokeRefreshToken`, `revokeAllUserRefreshTokens`, `startPeriodicCleanup`/`stopPeriodicCleanup`. No Redis dependency — see [decisions/cloud-run-no-redis.md](../decisions/cloud-run-no-redis.md).
- [backend/src/services/apiKeyService.js](../../backend/src/services/apiKeyService.js) — AES-256 encryption for user-provided LLM API keys. `encrypt`, `decrypt`, `resolveApiKey(encryptedUserKeys, keyName)` (per-user precedence with env fallback), `requireServerApiKey(keyName, encryptedKeys?, providerLabel)` (throws 503 if neither configured), `loadUserApiKeys(prisma, userId)` (fetches `User.apiKeys` row)
- [backend/src/plugins/csrf.js](../../backend/src/plugins/csrf.js) — double-submit cookie CSRF. Opt-in per route via `config: { csrf: true }`. Constant-time compare. Applied to `/v1/auth/refresh` and `/v1/auth/logout`.
- [backend/src/middleware/requireAuth.js](../../backend/src/middleware/requireAuth.js) + [backend/src/plugins/auth.js](../../backend/src/plugins/auth.js) — JWT verification + `fastify.authenticate` decorator
- [src/services/apiClient.js](../../src/services/apiClient.js) — FE auth client: in-memory `accessToken`, `bootstrapAuth()` on mount, auto-refresh on 401 (deduped via `_refreshInFlight` promise), `credentials: 'include'`, X-CSRF-Token auto-injection
- [src/contexts/SettingsContext.jsx](../../src/contexts/SettingsContext.jsx) — calls `apiClient.bootstrapAuth()` in its mount effect, sets `backendUser` state from the refresh response

## Flow

### Register / Login

```
POST /v1/auth/register { email, password }
POST /v1/auth/login    { email, password }
```

Both return `{ accessToken, user }` in the response body AND set an httpOnly refresh cookie + a readable CSRF cookie.

- **Access token:** short-lived JWT (15min), signed with `JWT_SECRET`, returned in JSON body. FE stores in memory only. Payload: `{ id, email, isAdmin }` — the `isAdmin` claim is what `fastify.requireAdmin` reads (no per-request DB lookup).
- **Refresh token:** opaque random string (32 bytes hex), stored server-side in the Postgres `RefreshToken` table (btree index on `expiresAt`, in-process reaper). 30d TTL. Sent as httpOnly cookie, path `/v1/auth`, SameSite=Strict.
- **CSRF token:** random 32-byte hex, path `/` (so FE can read it from anywhere), NOT httpOnly (JS needs to read it to inject X-CSRF-Token header).

### Refresh

```
POST /v1/auth/refresh  (no body, cookies carry everything)
  Header: X-CSRF-Token: <csrf-cookie-value>
```

Backend:

1. Reads `refresh_token` cookie → parses `<userId>.<tokenId>`
2. Reads `X-CSRF-Token` header, compares to `csrf_token` cookie via constant-time compare (in `csrf.js` plugin)
3. Verifies the `RefreshToken` row exists in Postgres and hasn't expired (`verifyRefreshToken` reaps eagerly on miss to short-circuit reuse of an expired cookie between reaper ticks)
4. Reads `isAdmin` off the User row and mints a new 15min access token with it baked in
5. **No refresh rotation yet** — same refresh token stays valid for its full TTL (deferred until a real threat model demands it)

### Logout

```
POST /v1/auth/logout
```

CSRF-protected. Deletes the `RefreshToken` row for the current token and clears both cookies.

### Bootstrap on mount

Frontend `bootstrapAuth()` (called from `SettingsContext.jsx` mount effect):

1. POST to `/v1/auth/refresh`
2. If 200: store access token in memory, hydrate `backendUser` state, trigger `fetchBackendKeys` + `gameData.loadAll`
3. If 401: user is logged out, clear state
4. Deduped via `_refreshInFlight` promise — React StrictMode double-mount doesn't fire two refresh requests

### Auto-refresh on 401

Any `apiClient.get/post/put/patch/delete` that gets a 401 response:

1. Calls `refreshAccessToken()` (deduped)
2. On success, retries the original request once with the new token
3. On failure, clears auth state and throws

User doesn't see 401s from stale access tokens — they just see the retry land.

## Persistence

Refresh tokens live in Postgres with a btree index on `expiresAt` — no Redis dependency. The `RefreshToken` row is created on register/login and deleted on logout; expired rows are reaped by an in-process timer.

`refreshTokenService.startPeriodicCleanup()` runs a `setInterval` every 10 min via `server.js`; each tick `DELETE`s rows where `expiresAt < now()`. `verifyRefreshToken` also reaps eagerly to short-circuit reuse of an expired cookie between ticks. No one-time index script — the migration owns the schema.

## Admin flag

Admin gating reads `request.user.isAdmin` — the claim is minted into the access token at login/refresh by `signAccessToken` (source of truth: `User.isAdmin` on the Prisma row). [backend/src/plugins/requireAdmin.js](../../backend/src/plugins/requireAdmin.js) checks the claim without touching the DB, so admin-panel live-refresh doesn't hammer Prisma.

Trade-off: promoting or demoting an admin takes at most one access-token TTL (15 min) to propagate. For a role that changes rarely, that's fine.

## CSRF scope

CSRF is only enforced on `/v1/auth/refresh` and `/v1/auth/logout` — the two endpoints that are authenticated purely via the httpOnly refresh cookie. Every other mutating route authenticates via the bearer access token in the Authorization header, which is immune to CSRF by design (cross-origin JS cannot read the in-memory access token).

When adding a new bearer-authed route, **don't add `config: { csrf: true }`** — it's not needed and will cause confusion. CSRF is a cookie-auth concern.

## User API keys

Users can store their own provider API keys via `PUT /v1/auth/settings { apiKeys: {...} }`. Backend encrypts each value with AES-256 (`apiKeyService.encrypt`) and stores on `User.apiKeys`.

Resolution precedence in backend services:

```js
const userApiKeys = await loadUserApiKeys(prisma, userId);
const key = requireServerApiKey('OPENAI_API_KEY', userApiKeys, 'OpenAI');
//  ↑ user key > env var > 503
```

Threaded through scene generation via the `userApiKeys` option — `sceneGenerator/generateSceneStream.js`, `campaignGenerator.js`, `storyPromptGenerator.js`, all single-shot services via `aiJsonCall.js`. Nano/compression paths still use env-only (background jobs, not charged to a specific user).

## When debugging auth

1. **"Logged out on every page reload."** `bootstrapAuth()` isn't firing or failing. Check SettingsContext mount effect + Network tab for POST /refresh. Likely the refresh cookie wasn't set (CORS `credentials: 'include'` misconfigured) or the cookie points at a row that was never persisted.
2. **"CSRF errors on refresh."** FE isn't reading the `csrf_token` cookie or not injecting `X-CSRF-Token`. Check `apiClient.js` header injection path.
3. **"Auto-refresh loops."** Refresh itself returning 401 — the refresh token expired or was revoked. Should be caught and clear auth state; if it's looping, `_refreshInFlight` dedup is broken.
4. **"Admin panel returns 403 for a user who IS admin."** The `isAdmin` claim was minted in an older token — stale for up to 15 min. Refresh access token (client will do it automatically on next 401) or re-login to pick up the new claim.
5. **"User key doesn't work."** `resolveApiKey` precedence: per-user encrypted bundle > env var. If env is set, it wins UNLESS the user key is present. Check `User.apiKeys` row actually has the encrypted value.
6. **"Refresh silently fails."** Cookie-to-row lookup either misses (row reaped early — check `expiresAt`) or the userId in the cookie doesn't match the stored row (sanity check in `verifyRefreshToken`). If reaper isn't running, expired rows accumulate but verify still works.

## Deferred / not yet shipped

- **Admin session revoke endpoint** (`/v1/admin/sessions/:userId/revoke`) — service primitive `revokeAllUserRefreshTokens` exists; wire up the route when a use-case emerges.
- **Refresh rotation on use** — complicates multi-tab races; defer until real threat model.
- **SSE/WS token expiry mid-connection** — snapshot-at-connect model unchanged. Acceptable for pre-prod.

## Related

- [decisions/no-byok.md](../decisions/no-byok.md) — why the FE-direct proxy/BYOK path was removed
- [persistence.md](persistence.md) — how `apiClient` threads auth through every data call
