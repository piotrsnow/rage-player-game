# Code Review: PR `new_rpg_system` -> `main`

## Context
Branch `new_rpg_system` (25 commits, 321 files, ~60k LOC changed) - massive refactor replacing WFRP system with custom RPGon system + frontend decomposition from monolithic god-files to modular architecture with Zustand store.

---

## CRITICAL

### 1. Secrets committed to repo
**Files:** `barnaba.md`, `quirky-chasing-iverson.md` (root directory)  
Both contain JWT tokens with embedded user IDs and email addresses. Tokens expire ~April 2026.  
**Action:** Remove from repo before merge. Consider scrubbing from git history if JWT_SECRET is shared with production.

### 2. CORS wildcard vulnerability
**File:** `backend/src/routes/ai.js:43,107`  
SSE endpoints reflect `request.headers.origin` directly as `Access-Control-Allow-Origin` with credentials enabled. Any origin can make authenticated requests.  
**Action:** Validate origin against a whitelist.

### 3. Character ownership bypass in multiplayer join
**File:** `backend/src/routes/multiplayer.js:251-273`  
When joining a room, if `msg.characterId` is absent, `normalizeJoinCharacter(msg.characterData)` accepts client-supplied character data without ownership verification.  
**Action:** Always validate character ownership server-side.

---

## HIGH

### 4. GameplayPage defeats granular selectors
**File:** `src/components/gameplay/GameplayPage.jsx:116-146`  
Subscribes to 23 granular Zustand selectors, then reconstructs full `state` object via `useMemo`. Any slice change invalidates the memo, causing cascading re-renders of all children.  
**Action:** Pass individual slices to children, or use a single `useGameState()` selector if full state is actually needed everywhere.

### 5. SettingsContext overly broad effect dependency
**File:** `src/contexts/SettingsContext.jsx:175`  
`useEffect` depends on entire `settings` object instead of `settings.backendUrl` and `settings.useBackend`. Any settings change (language, volume, etc.) re-triggers backend auth check.  
**Action:** Use granular deps: `[settings.backendUrl, settings.useBackend, backendUser]`

### 6. Prompt injection via seedText
**File:** `backend/src/services/storyPromptGenerator.js:20-25`  
User-provided `seedText` embedded directly in AI prompt without sanitization.  
**Action:** Add basic sanitization (length limit, strip control chars).

### 7. Race condition in character persistence
**File:** `backend/src/routes/multiplayer.js:47-76`  
`persistMultiplayerCharactersToDB` is fire-and-forget. DB failures silently desync game state from persistence.  
**Action:** At minimum log failures prominently; consider retry or user notification.

---

## MEDIUM

### 8. Dual state trees for multiplayer/solo
**File:** `src/components/gameplay/GameplayPage.jsx:159-220`  
Multiple ternary operations switching between Zustand state and MultiplayerContext state. Leaky abstraction.  
**Action:** Create `useGameStateOrMultiplayer()` hook returning consistent shape.

### 9. Campaign route returns 200 with error object
**File:** `backend/src/routes/campaigns.js:636-645`  
Character ownership validation returns `{ error: ... }` with HTTP 200 instead of proper 400/403.  
**Action:** Use `reply.code(400).send({ error: ... })`.

### 10. 18-dependency callback in useSceneGeneration
**File:** `src/hooks/sceneGeneration/useSceneGeneration.js:299`  
Callback regenerates on any of 18 deps including full `settings`.  
**Action:** Group config into a memoized object to reduce dependency count.

### 11. Race condition in useImageRepairQueue migration
**File:** `src/hooks/useImageRepairQueue.js:174-234`  
Async migration effect uses local `cancelled` flag; fast re-renders can create concurrent repairs.  
**Action:** Use generation ref pattern instead of local variable.

### 12. Removed Fate system without migration path
**File:** `backend/src/routes/multiplayer.js:1074-1088`  
Fate point mechanics removed. Existing characters with fate points will behave differently (instant death instead of fate burn).  
**Action:** Document behavior change; consider migration for existing campaigns.

### 13. Media asset upsert race condition
**File:** `backend/src/routes/proxy/*`  
Changed `.create()` to `.upsert()` with empty `update: {}`. Concurrent requests for same cache key may create duplicates.  
**Action:** The prune script mitigates this, but consider adding unique index.

### 14. Hardcoded AI model names
**File:** `backend/src/services/campaignGenerator.js:4-7`  
`MODEL_MAP` hardcodes `gpt-5.4` and `claude-sonnet-4-20250514` with no fallback.  
**Action:** Make configurable or add fallback mechanism.

---

## LOW

### 15. Constant in dependency array
**File:** `src/hooks/useSummary.js:359`  
`narrator.STATES.PLAYING` is a string constant in useEffect deps - harmless but unnecessary.

### 16. useNarrator is 35KB / 1000+ lines
**File:** `src/hooks/useNarrator.js`  
Consider extracting pure logic to a service module.

### 17. Utility re-exported from GameContext
**File:** `src/contexts/GameContext.jsx:4`  
`createDefaultNeeds` is a utility, not context API. Export from `gameReducer` directly.

---

## POSITIVE OBSERVATIONS

- Handler decomposition in `gameReducer.js` is excellent - clean domain separation
- Granular selectors pattern in `gameSelectors.js` is well-designed
- Multiplayer/solo state separation is architecturally sound
- Character serialization is defensive with comprehensive fallbacks
- Backend scripts are safe (prune is dry-run by default)
- All WFRP references cleanly removed, no orphaned imports
- Test coverage maintained and expanded for new engines
- No SQL/NoSQL injection, no `eval()`, no hardcoded API keys

---

## DEPLOYMENT CHECKLIST

1. Remove `barnaba.md` and `quirky-chasing-iverson.md` from repo
2. Fix CORS origin validation in `backend/src/routes/ai.js`
3. Fix character ownership check in multiplayer join
4. Run `cd backend && npm run db:push && npx prisma generate`
5. Test character create -> save -> reload cycle (verify attributes persist)
6. Run `inspectMediaAssetDuplicates.js` then `pruneMediaAssetDuplicates.js --apply`
7. Smoke test: load campaign, verify character data integrity

**Overall grade: B+** - Solid architectural refactor with good patterns. Fix the critical security issues and the GameplayPage re-render problem before merge.
