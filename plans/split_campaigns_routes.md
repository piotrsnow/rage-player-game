# Plan B.1 — Split backend/src/routes/campaigns.js

**Status:** in progress (session 6, 2026-04-13)
**Source:** [backend/src/routes/campaigns.js](../backend/src/routes/campaigns.js) 935L → thin entrypoint + 8 files

## Goal

Break 935L Fastify route into topical sub-plugins (routes layer) + helper modules (services layer). Zero HTTP contract change, zero server.js bootstrap change, zero test file changes (re-export path preserved).

## Target structure

```
backend/src/routes/campaigns.js                  — thin entrypoint (~35L)
  • imports extractTotalCost + stripNormalizedFromCoreState from campaignSerialize
    and re-exports them so campaigns.saveState.test.js keeps working unchanged
  • registers public sub-plugin (no auth)
  • registers child scope with `onRequest: authenticate`, then crud/sharing/recaps

backend/src/routes/campaigns/
├── schemas.js      (~30L)  — CAMPAIGN_WRITE_SCHEMA, RECAP_SAVE_SCHEMA
├── public.js       (~220L) — GET /public, GET /public/:id, GET /share/:token, POST /share/:token/tts
├── crud.js         (~220L) — GET /, GET /:id, POST /, PUT /:id, DELETE /:id
├── sharing.js      (~70L)  — POST /:id/share, DELETE /:id/share, PATCH /:id/publish
└── recaps.js       (~90L)  — GET /:id/recaps, POST /:id/recaps

backend/src/services/
├── campaignSerialize.js  (~70L)  — pure helpers
│    • extractTotalCost, stripNormalizedFromCoreState (already exported, test coverage)
│    • dedupeScenesByIndexAsc, buildDistinctSceneCountMap
│    • SCENE_CLIENT_SELECT (Prisma select shape — pure, no runtime side-effects)
├── campaignSync.js       (~220L) — DB side-effects
│    • withRetry (Prisma P2034/P2028) — generic enough but only used here; keeps import graph tight
│    • fetchCampaignCharacters, syncNPCsToNormalized, syncKnowledgeToNormalized,
│      syncQuestsToNormalized, reconstructFromNormalized
└── campaignRecap.js      (~30L)  — normalizeRecapCacheKey, buildRecapAssetKey,
                                    parseRecapMetadata, SUMMARY_CACHE_MAX_ITEMS constant
```

All files under the senior_baseline soft limits (400L files, 300L services).

## Open questions — resolved

1. **Test import strategy:** Option 1 (re-export from thin entrypoint). Zero test changes.
2. **Naming:** Drop `Routes` suffix — `public.js` / `crud.js` / `sharing.js` / `recaps.js` for consistency with `routes/proxy/openai.js` convention.
3. **SCENE_CLIENT_SELECT location:** campaignSerialize.js (pure shape, used in public + crud, not recap-specific).
4. **Imports beyond server.js + test:** verified — only those two callers grep-positive.

## Dependency direction check (§3 senior_baseline)

```
routes/campaigns/*.js  →  services/campaign*.js  →  lib/prisma, lib/logger, config
```

Services import nothing from `routes/` and never touch fastify `request`/`reply`. ✓

## Risks

- **Fastify encapsulation order:** public plugin must register *before* the authed child scope so its routes don't inherit the `onRequest` hook. Preserved by matching original order.
- **Vitest mock resolution:** test mocks `../config.js`, `../lib/prisma.js` etc. relative to `routes/`. Sub-plugins in `routes/campaigns/` import via `../../config.js` — resolves to the same absolute module path, so `vi.mock` hoisting still applies.
- **`log` binding parity:** each sub-plugin creates its own `childLogger({ module: 'campaigns' })`. Same binding as today — log stream unchanged.

## Git strategy

One commit for the whole split. Cohesive refactor, nothing else. Commit after tests green.

Validation: `npm test -w backend` + `node -e "import('./backend/src/routes/campaigns.js').then(m => console.log('ok', Object.keys(m)))"` smoke import from repo root.
