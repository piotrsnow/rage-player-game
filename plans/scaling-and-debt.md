# Scaling & debt — outstanding work after Postgres migration

**Status (2026-04-26):** live work queue. Konsoliduje wszystkie outstanding tasks po F1-F5b retrospektywach, plus pre-scale optimizations wykryte w audycie pipeline'u (165 queries/scenę typical) dla skali 1k-180k scen/dzień. Hosting decyzja (CSQL vs Neon) zostaje w [postgres-migration.md F6](postgres-migration.md#f6--production-scale-out-metric-driven).

## Priority tiers

- **P0** — pre-50k scen/dzień (real scaling cliffs, blocking before public exposure)
- **P1** — known debt (cleanup at next file touch)
- **P2** — measurement-driven (F6 territory, trigger-only)
- **P3** — playtest verification (no code change, just confirm)

**Order of attack:** P0 by ROI when traffic approaches cliff (start: connection pool/PgBouncer + assignGoals N+1). P1 opportunistically. P2 never preemptively. P3 on next focused playtest sweep.

---

## P0 — pre-50k scen/dzień (real scaling cliffs)

### P0.1 — N+1 in `assignGoalsForCampaign` (biggest ROI)

**Why:** `questGoalAssigner/index.js` runs **2x per scene** (once w `processStateChanges`, raz w `postSceneWork`). Loops every CampaignNPC, conditionally fires `worldNPC.findUnique` + always fires `campaignNPC.update`. With 10 NPCs = 20-40 round-trips × 2 = ~60 wasted queries/scenę.

Przy 50k scen/dzień = **~3M wasted queries/dzień (~10% query budget)**.

**Fix:** batch `worldNPC` lookups z `findMany({where: { id: { in: ids }}})`, batch updates z `updateMany` (per-status grupy).

**Effort:** 2-3h. Pure factory + integration test.

**Files:** [backend/src/services/livingWorld/questGoalAssigner/index.js](../backend/src/services/livingWorld/questGoalAssigner/index.js).

### P0.2 — Connection pool exhaustion (~5k scen/dzień)

**Status (2026-04-27):** częściowo rozwiązane — hosting decision = Neon Launch ([knowledge/decisions/postgres-prod-hosting.md](../knowledge/decisions/postgres-prod-hosting.md)). Neon ships built-in PgBouncer (`-pooler` endpoint, free); użycie tej formy connection stringa kasuje immediate breakpoint. **Pozostała praca = PgBouncer sidecar w Cloud Run** triggered TYLKO gdy zmigrujemy na Cloud SQL (CSQL nie ma wbudowanego poolera).

**Why:** `assembleContext` livingWorld builder fans out **22-27 parallel queries** per scene (worldLore + npc baseline + hearsay + reputation + dmAgent + saturation + ...). Przy 5 concurrent scene gen × 25 parallel = 125 connections demand. Postgres default `max_connections=100` insufficient.

**Fix:**
- **Neon (current):** confirm DATABASE_URL używa `-pooler` host w prod. ✅ resolved by hosting choice.
- **Cloud SQL (post-migration):** PgBouncer sidecar w Cloud Run, transaction mode, pool size ~25 per Cloud Run instance. Trigger tej pracy = decyzja użytkownika o migracji Neon → CSQL (patrz playbook w postgres-prod-hosting.md).

**Effort:** Neon path = 0 (już rozwiązane connection-stringiem). CSQL path = 1-2 dni gdy migracja triggered.

**Files (CSQL path):** `cloudbuild.yaml`, `backend/.env.example`, `knowledge/decisions/postgres-prod-hosting.md`.

### P0.3 — `processNpcChanges` per-NPC delete+insert relationships

**Why:** `processStateChanges/npcs.js` robi N×2 queries dla N NPCs (delete relationships + create relationships per NPC). Dla typical N=3-5 OK, dla MP cascade/quest update z N=10+ bottleneck.

**Fix:** bulk `deleteMany({where: {campaignNpcId: {in: ids}}})` + bulk `createMany`.

**Effort:** 3-4h.

**Files:** [backend/src/services/sceneGenerator/processStateChanges/npcs.js](../backend/src/services/sceneGenerator/processStateChanges/npcs.js).

### P0.4 — `processQuestObjectiveUpdates` re-fetches active quests

**Why:** Każdy objective tick wywołuje `resolveActiveQuest`, który robi `findMany` wszystkich active quests. 5 quests × 3 ticks/scenę = 15 redundant findMany.

**Fix:** cache active-quest lookup na początku `processQuestObjectiveUpdates`.

**Effort:** 1-2h.

**Files:** [backend/src/services/sceneGenerator/processStateChanges/quests.js](../backend/src/services/sceneGenerator/processStateChanges/quests.js).

### P0.5 — `fetchCampaignCharacters` N×4 includes (multiplayer)

**Why:** MP z 4 graczami = 4 character rows + 4×3 child queries = 16 queries na każdy context load. F4 zostawiło jako "akceptowalne, single-digit ms" — przy 1800 DAU MP to dolicz.

**Fix:** single query z all relations (Prisma `include` issues separate SQL ale shares connection lease) lub raw `$queryRaw` z JOINami.

**Effort:** 4-6h. Bench before/after.

**Files:** [backend/src/services/campaignSync.js](../backend/src/services/campaignSync.js) `fetchCampaignCharacters`.

### P0.6 — Atomic per-field character updates (replace-strategy → atomic UPDATE)

**Why:** `persistCharacterSnapshot` robi delete-all + createMany dla skills/inventory/materials przy każdym character write. Dla partial change (np. +1 XP na Skradanie) wastes write IO. F4 znany dług #1.

**Fix:** emit per-field updates (`UPDATE skill SET xp = xp + N`, `UPDATE material SET quantity = quantity + N`) dla known-additive deltas. Replace-strategy zostaje jako fallback dla full-snapshot writes.

**Effort:** 1-2 dni. Risk: invariants na equipped FK jeśli writes obchodzą `clearStaleEquipped`.

**Files:** [backend/src/services/characterRelations.js](../backend/src/services/characterRelations.js), [characterMutations.js](../backend/src/services/characterMutations.js).

### P0.7 — `mergeUpdateBody` PUT chars full-snapshot replace

**Why:** `PUT /v1/characters/:id` z `{name: 'X'}` przepisuje inventory + skills + materials też. F4 znany dług #7 — zużywa transakcję na rzeczy które nie zmienione.

**Fix:** detect partial-payload PUT, skip child-table writes gdy field nie w payload.

**Effort:** 2-3h.

**Files:** [backend/src/routes/characters.js](../backend/src/routes/characters.js).

---

## P1 — known debt (cleanup at next file touch)

### F1 debt
- **`LocationPromotionCandidate.stats` stringify w test fixtures** — kolumny są `Json` w schemie, prod write paths używają obiektu. Update mocks at next test touch.
- **`CampaignNPC.smallModelVerdict` = `String?`** (nie `Json`) — verdict stored-as-blob, nikt go nie filtruje SQLem. Trzymać tak chyba że emerge use case.
- **`locationType` boundary validation** — AI mid-play może emit nieznany `locationType` → throw na enuma. Defensywny coerce-to-`generic` w [processStateChanges/locations.js:158](../backend/src/services/sceneGenerator/processStateChanges/locations.js#L158) (przy `BLOCKED_MIDPLAY_LOCATION_TYPES`) odłożony do "as-needed". Jeśli playtest pokaże throw — dodać.
- **`bestiary.js` używa WFRP `characteristics` (ws/bs/s/t/...)** — combat-data refactor WFRP→RPGon, osobny task, nie część migracji.

### F2 debt
- **`coreState.world.knowledgeBase` w `campaignSerialize`/`campaignSync`** — to in-memory JS shape, NIE pole DB. Zostaje (zniknie gdy F5 monolit decompose).
- **Comment-rot** — kilka plików ma stale docstringi po F2. Naprawić przy najbliższym dotyku.
- **`prisma migrate dev` non-interactive blocks** na data-loss warnings — workaround `db:reset` + `migrate deploy`. Provision shadow DB w docker-compose dla proper `migrate dev` flow. **F5b znany dług #3 to samo.**

### F3 debt
- **Idempotent prereq sync replace-strategy** (`deleteMany + createMany`) — jeśli kiedyś prereq history potrzebna (audit), zmień na incremental upsert.
- **`hasDiscovered({userId, locationId})` brak campaignId-aware path** — caller potrzebujący per-campaign check musi użyć `loadCampaignFog`. Dodać explicit campaignId param jeśli emerge use case.
- **`processStateChanges/locations.js` deferred non-canonical sub-location handling** — komentarz mówi "discoveredSubLocationIds wymagana", reader robi parent-FK detection. Sprawdzić w playtest fog-of-war na sub-lokacjach (rooms w dungeonach). **→ P3.**

### F4 debt
- **`CharacterInventoryItem.id` BigInt dropped** — items keyed `(characterId, itemKey)`. Dwa miecze z różnymi `props` (np. enchantami) zlepią się w jeden stack po nazwie, props ostatniego wygrywają. Akceptowalne dla mass-produced equipment; AI emit unique names dla unikalnych itemów (np. "Miecz Olafa +1" vs "Miecz Olafa +2").
- **Equipped bez FK constraint** — invariant trzymany app-side przez `clearStaleEquipped`. Każdy nowy custom write path do character musi go wywołać sam (lub przejść przez `persistCharacterSnapshot`).
- **`CampaignQuestObjective` BigInt PK nie jest stabilne między quest-updates** — `syncQuestsToNormalized` robi delete+createMany. `obj.id`-based dedup w `checkQuestObjectives` (memoryCompressor) jest no-op. Niski impact (nano cost).

### F5 debt
- **Brak FK na `currentLocationName`** — pure string, can drift jeśli WorldLocation z tym `displayName` deleted/renamed. Wait for biome-tiles lub similar refactor który da FK target.
- **`/ai/campaigns/:id/core` PATCH lift w deepMerge** — defensive only, route nie jest wołany z FE today. Drop lub document.
- **`Campaign.lockedLocation` na Character** — flavor string snapshot "gdzie character był przy bind", nie ruszony. Czystszy fix przyszedłby z CampaignLocation FK.

### F5b debt
- **`questGoalAssigner` "go home" check kind+id mismatch** — porównuje shadow `lastLocationId` z `WorldNPC.homeLocationId`. Gdy shadow w CampaignLocation a canonical home jest WorldLocation, comparison zawsze niezgodne → sztuczny "wracam do swojego miejsca" goal. Drobny noise. Fix: dedicated kind+id check lub skip gdy shadow kind=campaign.
- **AI-emitted locations bez terrain context** — `currentLocation: "X"` mid-narrative gives backend zero clue about biome/danger/placement. Hearsay placeholder-stub deferred — **superseded by [biome-tiles idea](../knowledge/ideas/biome-tiles.md)** który solves root cause. Cross-ref: feature track.
- **`maxSubLocations` cap dropped** z creation flow per user spec; column nadal w schemie jako future re-enabling lever.

### Other code health (CLAUDE.md known gaps)
- **`src/services/diceRollInference.js` legacy aliases** — fold w `shared/domain/diceRollInference.js` przy najbliższym dotyku.
- **MP guest join nie pisze character campaign lock** — fix w [backend/src/routes/multiplayer/handlers/lobby.js](../backend/src/routes/multiplayer/handlers/lobby.js) jeśli guests reportują losing characters.
- **`useNarrator.js` ~945L** — biggest remaining monolith hook. Split playtest-driven, nie urgent.
- **`seedWorld.js` ~1146L** runs on every boot (idempotent upsert). Add seed-completion guard (env flag lub DB marker) to skip no-op I/O na warm starts.
- **No token budget enforcement w `assembleContext()`** — total prompt zwykle 3.5-7k tokens, ale runaway selection mógłby przekroczyć. Add explicit counting jeśli scenes hit context limits / cost spikes.
- **Prisma compound indexes brakuje** na Living World models: `WorldEvent` needs `@@index([eventType, visibility, createdAt])` dla admin events feed; `CampaignNPC` needs `@@index([campaignId, canonicalWorldNpcId])` dla shadow lookups. Verify w `schema.prisma` przed next migration.

### Admin / security hygiene (post-review-cleanup carryover)

- **`PUT /lore/:slug` — add `maxLength: 100000` body schema** (admin może wkleić megabyty lore; admin-controlled blast radius ale higieniczne). 5 min fix w [backend/src/routes/adminLivingWorld.js](../backend/src/routes/adminLivingWorld.js). Test: spróbuj wkleić >100k → spodziewany 400.
- **`PUT /lore/:slug` — add `config: { idempotency: true }`** (plugin już istnieje, używany w `/ai/campaigns/:id/scenes`). Double-click przy edycji powoduje drugi upsert — brak realnego damage, ale brzydkie. 2 min fix.
- **DOMPurify w AdminWorldLoreTab markdown preview** — najpierw sprawdź czy preview używa `dangerouslySetInnerHTML` z raw markdown. Jeśli używa react-markdown lub podobnego z domyślnym escape'em → skreśl. Admin-only write + admin-only render = niski priorytet.
- **CSP enable** — backend [server.js:61](../backend/src/server.js#L61) ma `contentSecurityPolicy: false`. Audit z 2026-04-14 dał ready-to-ship policy (whitelist origins for OpenAI/Anthropic/Stability/ElevenLabs/Meshy + GCS + Google Fonts). **Blocker:** trzeba staging env żeby zweryfikować że Three.js scene rendering, ElevenLabs TTS i image gen nie pękną. Plan: ship as `Content-Security-Policy-Report-Only` first, watch logs week, flip to enforce. **Po no-BYOK cleanup connect-src allowlist można uprościć** — FE rozmawia tylko z własnym BE (zostaje `'self'` + `wss:`).
- **Proxy route middleware extraction** — `backend/src/routes/proxy/{openai,anthropic,elevenlabs,meshy,stability,gemini}.js` (6 plików) duplikują validation + API key resolution + rate-limit headers + error shape + cache-through-DB. Wymaga dedicated design session — variance między text-gen / image-gen+DB cache / TTS stream / 3D URL-only jest za duża dla shallow refactoru. **Blocker:** najpierw audit po no-BYOK cleanup czy któreś proxy routes nie są już dead code.

---

## P0' — deployment readiness (przed pierwszym publicznym deployem)

Te items blokują prod deploy, nie skalowanie. Atak: przed pierwszym deployem na prod hosting (CSQL/Neon decision z F6).

### `JWT_SECRET` rotation w production env

Tokeny wydane pod starym secret są ważne do ich TTL (15min access + 30d refresh). Rotacja secret kasuje je wszystkie. **Akcja:** zaktualizować `JWT_SECRET` env var na Cloud Run przy najbliższym deploy — wszyscy active users zostaną wylogowani (jednorazowy koszt, akceptowalny pre-prod). Konfig już ma guard w [backend/src/config.js:5-6](../backend/src/config.js#L5) dla missing/weak default.

### OpenAI model IDs verify

Jedyny model z rodziny gpt-5.4 na default-path to `gpt-5.4-nano` w slocie `nanoReasoning` ([backend/src/config.js](../backend/src/config.js) — używany przez memoryCompressor + location summary). Przed release potwierdzić że to ID wciąż resolvuje u OpenAI. **Akcja:** `curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" | grep gpt-5.4-nano`. W razie 404 ustawić `AI_MODEL_NANO_REASONING_OPENAI=gpt-4.1-nano` (fallback na non-reasoning nano — działa, lekko gorszy reasoning quality dla extraction tasks).

### Cloud Tasks queue setup (prod)

Region MUSI matchować Cloud Run service ([cloudbuild.yaml](../cloudbuild.yaml) — `europe-west1`):
- `gcloud tasks queues create post-scene-work --location=europe-west1`
- Service account `rage-player-game-runtime@$PROJECT_ID.iam.gserviceaccount.com` istnieje już z deployu Cloud Run. Grant:
  - `gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:rage-player-game-runtime@$PROJECT_ID.iam.gserviceaccount.com" --role="roles/cloudtasks.enqueuer"`
  - `gcloud iam service-accounts add-iam-policy-binding rage-player-game-runtime@$PROJECT_ID.iam.gserviceaccount.com --member="serviceAccount:rage-player-game-runtime@$PROJECT_ID.iam.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator"` (wymagane do mintowania OIDC tokenów dla Cloud Tasks → Cloud Run callback auth)
- OIDC verify już jest w [oidcVerify.js](../backend/src/services/oidcVerify.js)

---

## P2 — measurement-driven (F6 territory)

Trigger-driven, nie spekulatywne. Każdy punkt wymaga konkretnego pomiaru. Detail w [postgres-migration.md F6](postgres-migration.md#f6--production-scale-out-metric-driven), tu jako short-form queue.

| Punkt | Trigger | Akcja |
|---|---|---|
| Read replica | Read QPS > 70% capacity / read p95 grows | CSQL replica + Prisma `replicas` extension |
| `WorldEvent` partition | row count > 1M | Range partition po `createdAt` (monthly) |
| `CampaignScene` partition | row count > 5M | Range partition po `createdAt` |
| Embedding pruning | DB storage growth > 50GB/mc | Drop `CampaignScene.embedding` >30 dni (RAG primary w `WorldEntityEmbedding`, scene text zostaje) |
| Materialized views | Slow aggregate query > 500ms | Konkretna query → MV + refresh strategy |
| `pg_cron` zamiast `setInterval` | Hosting wspiera | `RefreshToken` cleanup, `WorldEvent` >N dni cleanup |
| HNSW tuning | Vector recall < 90% w testach | `m`, `ef_construction`, `ef_search` |
| Bulk UNNEST raw SQL (F2 deferred) | Profile pokaże `createMany`+row-loop hot spot | Replace z `INSERT … FROM UNNEST(…)` |
| `CampaignNPC` shadow GC | Storage growth visible w `CampaignNPC` table (1000+ campaigns × 100 NPCs ≈ 100k rows) | TTL na `updatedAt` (90d threshold) lub batch GC `Campaign.updatedAt < 90d AND status != 'active'` → kaskada usuwa shadow + child tables |
| `WorldNPC` tick-batch concurrency cap | Auto-dispatch włączony (dziś manual-only) lub `tick-batch` bije w 429 z OpenAI/Anthropic | Concurrency cap per batch (max 10 równocześnie); skip NPCs gdzie `activeGoal`+`goalProgress` nie zmienił się; rollup grupuj po location → jedno group-nano. Patrz [knowledge/ideas/living-world-npc-auto-dispatch.md](../knowledge/ideas/living-world-npc-auto-dispatch.md). |

---

## P3 — playtest verification debts

No code change — confirm w playtest.

### F1
- Vector search end-to-end (RAG query w Living World)
- Multiplayer save/restore z `MultiplayerSessionPlayer` join table
- Post-campaign writeback flow (Phase 12 promotion + memory)
- Cloud Tasks deploy (gated na F6 hosting)

### F2
- E2E save → load → save campaign (czy bulk upsert reconstructs OK po pełnym cyklu)
- Cross-campaign Stage 2b (post-campaign experienceLog → WorldNpcKnowledge promotion)
- Multiplayer save/restore (F2 nie tknęło MP, ale worth confirming)
- Admin Living World NPC view (rows z child tables)

### F3
- E2E discover location → fog-of-war na map FE
- `loadCampaignFog` dla campaign z mieszanką canonical + non-canonical (visited + heard)
- Sublokacje (`parentLocationId`) drill-down w PlayerWorldMap
- Edge discovery podczas trawelu (multiplayer dwóch graczy → dwa `UserDiscoveredEdge` rows + jeden `CampaignEdgeDiscovery`)
- Quest prerequisites — `assignGoalsForCampaign` po kompletnym save/load cyklu
- NPC explicit known locations — seed → re-seed (czy `seedNpcKnowledge` replace-by-grantedBy='seed' nie dropuje promotion/dialog grants)

### F4
- E2E save → load → save character (inventory stack collapse na BE round-trip)
- Equipped slot przy USE_MANA_CRYSTAL (decrement) + `removeItems` (pełen drop)
- Quest objective `onComplete.moveNpcToPlayer` trigger po F4 (metadata bridge)
- Multiplayer save/restore — characters z relations po `loadActiveSessionsFromDB`
- Campaign generator initial quest seed → `objectives` w child table z metadata
- `postCampaignLocationPromotion` skoring po objective metadata locationId/locationName

### F5 / F5b
- E2E save → load → save campaign'u — `currentLocation` round-trip przez column
- Living World seed flow — `worldBounds` 4-col write + reads (saturation hint w runtime)
- Multiplayer save — host's MP autosave lifts currentLocation do column
- Public share `/share/:token` — koreState ma `world.currentLocation` zsynthesizowane
- Quest auto-trigger `onComplete.moveNpcToPlayer` używa column-first lookup teraz
- Full E2E: nowa kampania → AI mid-play creates CampaignLocation → admin promote → relink polymorphic refs visible w DB
- Travel-by-selection działa dla CampaignLocations (Euclidean distance computed correctly w UI)
- Player map renderuje seeded settlement (CampaignLocation) z poprawnymi coords
- `markLocationDiscovered` route routing dla world vs campaign kind (fog persistence per kind)
- Round-trip: campaign delete → cascading cleanup CampaignLocation + CampaignDiscoveredLocation + LocationPromotionCandidate

---

## When to attack each tier

- **P0** (scaling cliffs): gdy realistycznie zbliżasz się do 5k+ scen/dzień (lub przed publicznym exposure). Order: connection pool/PgBouncer first (P0.2), potem `assignGoalsForCampaign` N+1 (P0.1), reszta według ROI.
- **P0'** (deployment readiness): przed pierwszym publicznym deployem (jednorazowo). JWT rotation + model ID verify + Cloud Tasks queue setup.
- **P1** (known debt): opportunistically — przy każdym dotknięciu pliku z listy, fix lokalny dług przy okazji.
- **P2** (measurement-driven): never preemptively. Wait for trigger metric, then act.
- **P3** (playtest verification): na next focused playtest sweep — bring this list, confirm or break.

## Cross-references

- [postgres-migration.md](postgres-migration.md) — historical migration record (F1-F5b retrospektywy with full per-phase debt lists, source for this consolidation)
- [postgres-migration.md F6](postgres-migration.md#f6--production-scale-out-metric-driven) — hosting decision (CSQL vs Neon) + breakpoint table 1k-180k scen/dzień
- [knowledge/ideas/biome-tiles.md](../knowledge/ideas/biome-tiles.md) — feature track, supersedes F5b debt #2
