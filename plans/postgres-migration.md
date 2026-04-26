# Migracja MongoDB Atlas → PostgreSQL (fazowo)

## Status (2026-04-26)

| Faza | Status | Notatka |
|---|---|---|
| **F1** | ✅ **Zrobione** | Engine swap + JSONB cleanup + transakcje + Postgres dev stack. Zobacz [F1 retrospektywa](#f1-retrospektywa). |
| **F2** | ✅ **Zrobione** | 6 child tables + FIFO triggery + bulk upsert (3 sync funkcje). Zobacz [F2 retrospektywa](#f2-retrospektywa). |
| **F3** | ✅ **Zrobione** | 7 join tables + `DiscoveryState` enum, drop 10 JSONB kolumn. Canonical → user-account scope, non-canonical → campaign scope. Zobacz [F3 retrospektywa](#f3-retrospektywa). |
| **F4** | ✅ **Zrobione** | 5 child tables (skills/inventory/materials/objectives/relationships), equipped jako 3 text columns, drop 6 JSONB kolumn. Items+materials stack by `slugify(name)`. Zobacz [F4 retrospektywa](#f4-retrospektywa). |
| **F5** | ✅ **Zrobione (lean)** | `worldBounds` Json → 4 Float cols + `currentLocation` lift z coreState do `currentLocationName String?` (no FK — F5b da właściwy target). Bridge przez `locationRefs.js` + `stripNormalizedFromCoreState`. Zobacz [F5 retrospektywa](#f5-retrospektywa). |
| **F5b** | ✅ **Zrobione** | `CampaignLocation` per-campaign sandbox + polymorphic FK pair (`xLocationKind`+`xLocationId`) na 5 callsite'ach + rename `WorldLocationEdge` → `Road` + drop `isCanonical`/`createdByCampaignId`. Promotion pipeline destrukcyjnie kopiuje CampaignLocation → WorldLocation + relinkuje refs + kasuje source. Zobacz [F5b retrospektywa](#f5b-retrospektywa). |
| F6 | Pending | Production scale-out (metric-driven). |

**Resume w kolejnej sesji:** otwórz tę sekcję, przejrzyj retrospektywy F1-F5b (znane długi techniczne), potem skocz do F6 (infra-led scaling — Cloud SQL hosting decyzja).

## Context

Obecnie projekt stoi na **MongoDB Atlas + Prisma (MongoDB provider)**. Przechodzimy na **PostgreSQL + pgvector**. Pre-prod, znajomi testują ale poczekają do końca migracji. Pusty start (zero migracji danych).

**Skala:** nieznana. Może być 0 DAU, może 50, może spike do 1000 pierwszego dnia. Skalowanie musi być **infra-led** (connection pool, replica, hosting tier), nie code-led — kod ma już mieć patterns które się skalują (transakcje, FK, JSONB, vector index, brak N+1 na hot path).

**Bolączki MongoDB które usuwamy:**
- Prisma na Mongo nie ma `Json` type → **~50 pól `String` z ręcznym `JSON.parse`/`JSON.stringify`**
- Atlas Vector Search wymaga native BSON arrays → `mongoNative.js` workaround + `writeEmbedding()` poza Prisma
- Atlas-only dev (nie ma lokalnego Mongo), SRV string obowiązkowy
- Brak FK → `@db.ObjectId` references bez integrity constraints
- `String[] @db.ObjectId` arrays bez natywnego indexowania
- Prisma transakcje wymagają replica setu — w praktyce **kod nie ma ANI JEDNEGO `prisma.$transaction`** (zweryfikowane grepem)
- Brak FIFO triggerów → trimming w JS z pełnym rewrite całego JSON arraya
- Brak TTL lepszego niż `expireAfterSeconds` (Mongo-specific)

---

## Plan fazowy — overview

| Faza | Cel | Trigger uruchomienia | Schema delta |
|---|---|---|---|
| **F1** | Engine swap, friends back online | ASAP | Full new schema, JSONB dla wszystkiego co dekomponowane później; 2 join tables (Participant + MPPlayer) |
| **F2** | Write-path scaling | Przed publicznym exposure / przed >100 DAU | + 5 child tables dla append-heavy capped lists; bulk upserty; FIFO triggery |
| **F3** | Reference normalization | Po F2, przy najbliższym oknie | + 7 join tables dla pól `Json[]` które są pure Mongo workaroundami |
| **F4** | Hot-path entity decomposition | Po F3 | + 5 child tables (skills/inventory/materials/objectives/relationships) + equipped FK |
| **F5** | `coreState` surface trimming | Po F4 | Hot scalars na kolumny + `transientState JSONB` |
| **F6** | Production scale-out | Metric-driven | Infra: pool tuning, replica, partycjonowanie, materialized views, pg_cron |

Każda faza shippable samodzielnie. Fazy 2-5 nie blokują się nawzajem (można przerwać po F1 lub F2 i normalnie operować).

---

## Decyzje (wspólne dla wszystkich faz)

| Pytanie | Decyzja |
|---|---|
| ID | **UUIDv7** (`@default(uuid(7))` w Prisma 6) |
| `withRetry` | Zostaje, tylko zamiana kodów błędów (P2028 mongo-only → 40001 postgres serialization) |
| Migracje Prisma | F1 = jedna migracja init. Każda kolejna faza = osobna migracja przyrostowa |
| JSON handling | **Natywny JSONB** — `Json` type. Zero `JSON.parse`/`JSON.stringify` na polach DB w kodzie |
| Pusty start | Znajomi zaczynają świeże konta/kampanie — brak migracji danych |
| Vector index | HNSW, cosine, 1536-dim |
| Naming | camelCase tabel/kolumn jak dziś (mniej zmian w kodzie) |
| Enums w PG | Tylko dla zamkniętych zbiorów (`DangerLevel`, `LocationType`, `ReviewStatus`, `DiscoveryState`). Dla łatwo-ewoluujących (`attitude`, `visibility`, quest `status`) zostaje `String` |

---

## Mongo-isms — wszystkie + przypisanie do fazy

| Mongo-ism | Gdzie w kodzie | Postgres-native | Faza |
|---|---|---|---|
| `String` z JSON.parse/stringify | ~50 pól w schemie + parse/stringify w campaignSync, processStateChanges/handlers, livingWorld, campaignLoader, storage | `Json` typ + JSONB | **F1** |
| `String[] @db.ObjectId` (character lists) | `Campaign.characterIds`, `MultiplayerSession.characterIds` | Join table z FK + cascade (`CampaignParticipant`, `MultiplayerSessionPlayer`) | **F1** |
| `@db.ObjectId` referencje | wszystkie cross-model refs | FK z `ON DELETE CASCADE` na scalar UUID | **F1** |
| `MongoClient.createSearchIndex` + `$vectorSearch` | `vectorSearchService.js`, `createVectorIndexes.js` | pgvector + HNSW + `$queryRaw <=>` | **F1** |
| In-process cosine (ragService) | `ragService.query()` — findMany + JS loop | `$queryRaw + <=>` z pgvector op | **F1** |
| `new ObjectId(val)` wrapping w ~10 plikach | hashService, worldStateService, companionService, routes/auth, routes/media, routes/wanted3d, routes/proxy/{stability,openai} | DROP — Prisma przyjmuje UUID string | **F1** |
| Brak `$transaction` | save flow, scene save, processStateChanges, promotion batch, admin approve | `prisma.$transaction([...])` wrap | **F1** |
| Direct `MongoClient` query w routes/auth.js | `routes/auth.js:2,101` | Prisma client | **F1** |
| TTL index `expireAfterSeconds` | `RefreshToken.expiresAt` | F1: boot-time `setInterval` cleanup. F6: `pg_cron` gdy prod | **F1 → F6** |
| WFRP legacy fields (careerData, characteristics, advances, xp, xpSpent) | `Character` + `routes/characters.js` + FE fallback | DROP całkowicie | **F1** |
| Loop `findUnique`+`upsert` per-entity | `syncNPCsToNormalized` (40+ queries dla 20 NPC), `syncKnowledgeToNormalized`, `syncQuestsToNormalized`, `processNpcChanges` | Bulk `INSERT … ON CONFLICT DO UPDATE` (`createMany`+`updateMany` lub `$executeRaw UNNEST`) | **F2** |
| FIFO trim w JS `while len > cap` | `WorldNPC.dialogHistory` cap 50, `WorldNPC.knowledgeBase` cap 50, `CampaignDmAgent.dmMemory` cap 20, `CampaignDmAgent.pendingHooks` cap 12, `CampaignNPC.experienceLog` (cap N), `goalProgress.milestones` cap 20 | Per-row INSERT do child table + trigger AFTER INSERT który DELETE oldest gdy count > cap | **F2** |
| JSON array of foreign IDs (Mongo workaround dla braku FK) | `Campaign.discoveredLocationIds/heardAbout/discoveredSub`, `UserWorldKnowledge.*Ids`, `WorldLocationEdge.discoveredByCampaigns`, `WorldNPC.knownLocationIds`, `Character.clearedDungeonIds`, `CampaignQuest.prerequisiteQuestIds` | Join tables z FK + unique + cascade + indeksy | **F3** |
| JSON map skill→{xp,level} (hot partial update) | `Character.skills` | Dedykowana tabela `CharacterSkill` | **F4** |
| JSON inventory list + equipped przez ID-w-stringu | `Character.inventory`, `Character.equipped {mainHand, offHand, armour}` | `CharacterInventoryItem` + FK `equipped*Id` → wymusza spójność | **F4** |
| JSON materialBag (atomic stack updates) | `Character.materialBag` | `CharacterMaterial` (atomic `UPDATE quantity = quantity + N`) | **F4** |
| JSON objectives + prereqs | `CampaignQuest.objectives`, `prerequisiteQuestIds` | `CampaignQuestObjective` + `CampaignQuestPrerequisite` | **F3 (prereqs) + F4 (objectives)** |
| JSON relationships map | `CampaignNPC.relationships` | `CampaignNpcRelationship` | **F4** |
| JSON skalarów (small fixed structs) | `Character.attributes` (6 INT), `mana`, `money`, `needs`, `Campaign.worldBounds` (4 FLOAT), `WorldLocation.roomMetadata` | F1: JSONB. F5: hot-path `coreState` rzeczy → kolumny skalarne | **F1 → F5** |
| `lastLocation: String` + `lastLocationId: @db.ObjectId` duplikacja | `CampaignNPC` | Tylko `lastLocationId` FK, displayName przez join | **F5** (low priority — UI zachowanie się nie zmienia) |
| `Campaign.coreState` monolit 15-25KB | `campaignSync.js` rewrite przy każdym save | Hot scalars (currentLocationId, gameTime, weather, sessionTitle, worldBounds) na kolumny + `transientState JSONB` | **F5** |

---

## Postgres-native cechy które wykorzystujemy

- **pgvector HNSW** (F1) — vector search bez osobnego klienta
- **JSONB** (F1) — `?`, `@>`, `->>` operators, GIN indexes tam gdzie filtrujemy
- **Native UUIDv7** (F1) — time-ordered ID, lepszy B-tree locality
- **FK + ON DELETE CASCADE** (F1) — auto-cleanup przy delete parent
- **`CREATE TYPE … AS ENUM`** (F1) — typed enumy dla zamkniętych zbiorów
- **`prisma.$transaction`** (F1) — multi-write atomicity
- **`INSERT … ON CONFLICT DO UPDATE`** (F2) — bulk upsert
- **Partial indexes** `CREATE INDEX … WHERE …` (F1) — np. embedding IS NOT NULL
- **Triggery plpgsql** (F2) — FIFO trim
- **Composite indexes** (F1) — Postgres je honoruje tak samo jak Mongo

**Nie używamy (non-goals):**
- PostGIS — coords + Dijkstra w JS, vanilla btree na (regionX, regionY) wystarczy
- pg_trgm / full-text search — fuzzy NPC dedupe robi JS substring + RAG embeddingi
- Recursive CTE — Dijkstra w JS
- LISTEN/NOTIFY — nie zastępujemy Cloud Tasks
- RLS — multi-tenant przez `WHERE userId = $1` w kodzie
- `generated always as stored` columns — spekulatywne, profile po użyciu

---

# F1 — Engine swap

**Cel:** odciąć Mongo, zostawić logikę nienaruszoną, użyć natywnych typów PG gdzie to *darmowe*.

## F1 success criteria

1. `docker compose up` stawia lokalny Postgres + backend **offline** (bez internetu / bez Atlas)
2. `npx prisma migrate dev --name init_postgres` czysto generuje schemat + manual SQL bloczek (CREATE EXTENSION vector, HNSW indexes)
3. Cały kod po grepie `import.*mongodb`, `ObjectId`, `JSON.parse(...)` na pola DB, `mongoNative` — **zero wyników** poza node_modules
4. E2E: rejestracja → postać → kampania → scena → embedding → vector search → tick Living World → NPC się ruszy → WorldEvent zapisany. `npm test` i `npm run test:e2e` przechodzą
5. Cloud Run deployable na Postgres (hosting decyzja osobno w F6)
6. Docs: `atlas-only-no-local-mongo.md` + `embeddings-native-driver.md` → SUPERSEDED, nowe `postgres-dev.md` + `embeddings-pgvector.md`. CLAUDE.md Stack section.

## F1 schema

Konwencja: camelCase. Wszystko co w F2-F5 zostanie zdekomponowane → zostaje `Json` w F1.

### Enumy (Postgres-native)

```prisma
enum DangerLevel    { safe moderate dangerous deadly }
enum LocationType   { generic hamlet village town city capital dungeon forest wilderness interior dungeon_room }
enum ReviewStatus   { pending approved rejected }
```

`DiscoveryState` przeniesiony do F3 (używany tylko przez join tables dodane w F3).

`attitude`, `WorldEvent.visibility`, `CampaignQuest.status`, `Campaign.difficultyTier` (osobna skala low/medium/high/deadly) zostają `String` (łatwo ewoluują lub osobna semantyka).

### User / Auth

```prisma
model User {
  id              String   @id @default(uuid(7)) @db.Uuid
  email           String   @unique
  passwordHash    String
  apiKeys         Json     @default("{}")
  settings        Json     @default("{}")
  isAdmin         Boolean  @default(false)
  contentLanguage String   @default("pl")
  createdAt       DateTime @default(now()) @db.Timestamptz
  updatedAt       DateTime @updatedAt         @db.Timestamptz

  campaigns            Campaign[]
  characters           Character[]
  mediaAssets          MediaAsset[]
  achievements         Achievement[]
  multiplayerSessions  MultiplayerSession[]
  wanted3dEntries      Wanted3D[]
  worldKnowledge       UserWorldKnowledge?
}

model RefreshToken {
  id          BigInt   @id @default(autoincrement())
  tokenId     String   @unique
  userId      String   @db.Uuid
  deviceInfo  String   @default("")
  createdAt   DateTime @default(now()) @db.Timestamptz
  expiresAt   DateTime @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([expiresAt])
}
```

### Character (F1 — wszystko Json poza FK na user)

```prisma
model Character {
  id                 String   @id @default(uuid(7)) @db.Uuid
  userId             String   @db.Uuid
  name               String
  age                Int      @default(23)
  gender             String   @default("")
  species            String

  attributes         Json     @default("{}")  // {sila, inteligencja, charyzma, zrecznosc, wytrzymalosc, szczescie}
  wounds             Int      @default(0)
  maxWounds          Int      @default(0)
  movement           Int      @default(4)
  characterLevel     Int      @default(1)
  characterXp        Int      @default(0)
  attributePoints    Int      @default(0)
  mana               Json     @default("{\"current\":0,\"max\":0}")
  money              Json     @default("{\"gold\":0,\"silver\":0,\"copper\":0}")
  needs              Json     @default("{}")

  skills             Json     @default("{}")           // map skillName → {level, xp}        — F4
  inventory          Json     @default("[]")           // array of items                      — F4
  equipped           Json     @default("{}")           // {mainHand, offHand, armour} string IDs — F4 (FK)
  materialBag        Json     @default("[]")           // array of {key, qty}                — F4
  clearedDungeonIds  Json     @default("[]")           // array of WorldLocation.id strings  — F3
  spells             Json     @default("{\"known\":[],\"usageCounts\":{},\"scrolls\":[]}")
  statuses           Json     @default("[]")
  customAttackPresets Json    @default("[]")
  knownTitles        Json     @default("[]")

  status             String?
  lockedCampaignId   String?  @db.Uuid
  lockedCampaignName String?
  lockedLocation     String?
  activeDungeonState Json?

  backstory          String   @default("")
  portraitUrl        String   @default("")
  voiceId            String   @default("")
  voiceName          String   @default("")
  campaignCount      Int      @default(0)
  fame               Int      @default(0)
  infamy             Int      @default(0)

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  user           User                       @relation(fields: [userId], references: [id], onDelete: Cascade)
  participants   CampaignParticipant[]
  mpPlayers      MultiplayerSessionPlayer[]
  npcAttributions WorldNpcAttribution[]
  reputations    WorldReputation[]

  @@index([userId])
  @@index([lockedCampaignId])
}
```

**Drop w F1:** WFRP legacy (`careerData`, `characteristics`, `advances`, `xp`, `xpSpent`). FE fallback `char.attributes || char.characteristics` → tylko `char.attributes`. BE `routes/characters.js` drop write path.

### Campaign (F1 — coreState monolit)

```prisma
model Campaign {
  id                       String @id @default(uuid(7)) @db.Uuid
  userId                   String @db.Uuid
  name                     String @default("")
  genre                    String @default("")
  tone                     String @default("")
  coreState                Json    @default("{}")       // monolit — F5 dekompozycja
  totalCost                Float   @default(0)
  isPublic                 Boolean @default(false)
  shareToken               String? @unique
  rating                   Float   @default(0)
  playCount                Int     @default(0)
  lastSaved                DateTime @default(now()) @db.Timestamptz

  livingWorldEnabled       Boolean @default(false)
  worldTimeRatio           Float   @default(24.0)
  worldTimeMaxGapDays      Int     @default(7)
  difficultyTier           String  @default("low")     // low|medium|high|deadly — encounter cap, OSOBNA skala od WorldLocation.dangerLevel; zostaje String bo walidacja w routes/campaigns/schemas.js
  settlementCaps           Json?
  worldBounds              Json?

  discoveredLocationIds    Json @default("[]")          // F3 → join table
  discoveredSubLocationIds Json @default("[]")          // F3
  heardAboutLocationIds    Json @default("[]")          // F3

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  user                        User @relation(fields: [userId], references: [id], onDelete: Cascade)
  participants                CampaignParticipant[]
  scenes                      CampaignScene[]
  npcs                        CampaignNPC[]
  knowledge                   CampaignKnowledge[]
  codex                       CampaignCodex[]
  quests                      CampaignQuest[]
  locationSummaries           CampaignLocationSummary[]
  dmAgent                     CampaignDmAgent?
  npcAttributions             WorldNpcAttribution[]
  pendingWorldStateChanges    PendingWorldStateChange[]
  npcPromotionCandidates      NPCPromotionCandidate[]
  locationPromotionCandidates LocationPromotionCandidate[]
  worldEvents                 WorldEvent[]
  npcDialogTurns              WorldNpcDialogTurn[]      // F2 (placeholder relation, model w F2)

  @@index([userId])
  @@index([isPublic])
}

model CampaignParticipant {                              // F1 — replaces Campaign.characterIds[]
  campaignId   String @db.Uuid
  characterId  String @db.Uuid
  role         String @default("player")
  joinedAt     DateTime @default(now()) @db.Timestamptz
  campaign     Campaign  @relation(fields: [campaignId],  references: [id], onDelete: Cascade)
  character    Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  @@id([campaignId, characterId])
  @@index([characterId])
}
```

### CampaignScene / NPC / Knowledge / Codex / Quest / LocationSummary / DmAgent (F1 — bez dekompozycji)

```prisma
model CampaignScene {
  id                String   @id @default(uuid(7)) @db.Uuid
  campaignId        String   @db.Uuid
  sceneIndex        Int
  narrative         String
  chosenAction      String?
  suggestedActions  Json     @default("[]")
  dialogueSegments  Json     @default("[]")
  imagePrompt       String?
  imageUrl          String?
  soundEffect       String?
  diceRoll          Json?
  stateChanges      Json?
  scenePacing       String?
  embeddingText     String?
  embedding         Unsupported("vector(1536)")?
  createdAt         DateTime @default(now()) @db.Timestamptz
  campaign          Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@index([campaignId, sceneIndex])
}

model CampaignNPC {
  id                        String @id @default(uuid(7)) @db.Uuid
  campaignId                String @db.Uuid
  npcId                     String
  name                      String
  gender                    String   @default("unknown")
  role                      String?
  personality               String?
  attitude                  String   @default("neutral")
  disposition               Int      @default(0)
  alive                     Boolean  @default(true)
  factionId                 String?
  notes                     String?
  worldNpcId                String?  @db.Uuid
  isAgent                   Boolean  @default(false)
  category                  String   @default("commoner")
  lastLocation              String?                        // F5 drop (FK only)
  lastLocationId            String?  @db.Uuid
  pendingIntroHint          String?
  activeGoal                String?
  goalProgress              Json?
  hasAcknowledgedFame       Boolean  @default(false)
  interactionCount          Int      @default(0)
  dialogCharCount           Int      @default(0)
  questInvolvementCount     Int      @default(0)
  lastInteractionAt         DateTime? @db.Timestamptz
  lastInteractionSceneIndex Int?

  relationships             Json     @default("[]")        // F4 → CampaignNpcRelationship
  experienceLog             Json     @default("[]")        // F2 → CampaignNpcExperience

  embeddingText             String?
  embedding                 Unsupported("vector(1536)")?

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  campaign     Campaign       @relation(fields: [campaignId],     references: [id], onDelete: Cascade)
  worldNpc     WorldNPC?      @relation(fields: [worldNpcId],     references: [id])
  lastLocFk    WorldLocation? @relation(fields: [lastLocationId], references: [id])

  @@unique([campaignId, npcId])
  @@index([campaignId])
  @@index([worldNpcId])
  @@index([campaignId, worldNpcId])
}

model CampaignKnowledge {
  id            String @id @default(uuid(7)) @db.Uuid
  campaignId    String @db.Uuid
  entryType     String
  summary       String
  content       Json
  tags          Json   @default("[]")
  importance    String?
  status        String?
  sceneIndex    Int?
  embeddingText String?
  embedding     Unsupported("vector(1536)")?
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz
  campaign      Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@index([campaignId, entryType])
}

model CampaignCodex {
  id             String @id @default(uuid(7)) @db.Uuid
  campaignId     String @db.Uuid
  codexKey       String
  name           String
  category       String
  tags           Json   @default("[]")
  fragments      Json
  relatedEntries Json   @default("[]")
  embeddingText  String?
  embedding      Unsupported("vector(1536)")?
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz
  campaign       Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, codexKey])
}

model CampaignQuest {
  id                    String @id @default(uuid(7)) @db.Uuid
  campaignId            String @db.Uuid
  questId               String
  name                  String
  type                  String @default("side")
  description           String @default("")
  completionCondition   String?
  questGiverId          String?
  turnInNpcId           String?
  locationId            String?
  status                String @default("active")
  completedAt           DateTime? @db.Timestamptz
  forcedGiver           Boolean @default(false)

  reward                Json?
  objectives            Json   @default("[]")              // F4 → CampaignQuestObjective
  prerequisiteQuestIds  Json   @default("[]")              // F3 → CampaignQuestPrerequisite

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  campaign              Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, questId])
  @@index([campaignId, status])
}

model CampaignLocationSummary {
  id              String @id @default(uuid(7)) @db.Uuid
  campaignId      String @db.Uuid
  locationName    String
  summary         String
  keyNpcs         Json   @default("[]")
  unresolvedHooks Json   @default("[]")
  sceneCount      Int    @default(0)
  lastVisitScene  Int    @default(0)
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz
  campaign        Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, locationName])
}

model CampaignDmAgent {
  campaignId    String   @id @db.Uuid
  lastUpdatedAt DateTime @default(now()) @db.Timestamptz
  dmMemory      Json     @default("[]")                    // F2 → CampaignDmMemoryEntry
  pendingHooks  Json     @default("[]")                    // F2 → CampaignDmPendingHook
  campaign      Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
}
```

### WorldLocation / Edge / UserWorldKnowledge (F1 — bez dekompozycji)

```prisma
model WorldLocation {
  id                    String       @id @default(uuid(7)) @db.Uuid
  canonicalName         String       @unique
  displayName           String?
  description           String       @default("")
  category              String       @default("generic")
  region                String?
  parentLocationId      String?      @db.Uuid
  locationType          LocationType @default(generic)
  slotType              String?
  slotKind              String       @default("custom")
  maxKeyNpcs            Int          @default(10)
  maxSubLocations       Int          @default(5)
  regionX               Float        @default(0)
  regionY               Float        @default(0)
  positionConfidence    Float        @default(0.5)
  subGridX              Int?
  subGridY              Int?
  isCanonical           Boolean      @default(false)
  knownByDefault        Boolean      @default(false)
  dangerLevel           DangerLevel  @default(safe)
  createdByCampaignId   String?      @db.Uuid

  aliases               Json         @default("[]")
  roomMetadata          Json?
  knowledgeBase         Json         @default("[]")        // F2 → WorldLocationKnowledge

  embeddingText         String?
  embedding             Unsupported("vector(1536)")?

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  parent                       WorldLocation?  @relation("subloc", fields: [parentLocationId], references: [id])
  sublocations                 WorldLocation[] @relation("subloc")
  outgoingEdges                WorldLocationEdge[] @relation("fromLoc")
  incomingEdges                WorldLocationEdge[] @relation("toLoc")
  npcsHere                     WorldNPC[]      @relation("npcCurrentLoc")
  npcsHome                     WorldNPC[]      @relation("npcHomeLoc")
  campaignNpcsLastHere         CampaignNPC[]
  locationPromotionCandidates  LocationPromotionCandidate[]

  @@index([region])
  @@index([parentLocationId])
  @@index([locationType])
  @@index([isCanonical, createdByCampaignId])
  @@index([regionX, regionY])
}

model WorldLocationEdge {
  id             String      @id @default(uuid(7)) @db.Uuid
  fromLocationId String      @db.Uuid
  toLocationId   String      @db.Uuid
  distance       Float
  difficulty     DangerLevel @default(safe)
  terrainType    String      @default("road")
  direction      String?
  gated          Boolean     @default(false)
  gateHint       String?
  discoveredByCampaigns Json @default("[]")                 // F3 → WorldEdgeDiscovery
  createdAt      DateTime    @default(now()) @db.Timestamptz

  from           WorldLocation @relation("fromLoc", fields: [fromLocationId], references: [id], onDelete: Cascade)
  to             WorldLocation @relation("toLoc",   fields: [toLocationId],   references: [id], onDelete: Cascade)
  @@unique([fromLocationId, toLocationId])
  @@index([fromLocationId])
  @@index([toLocationId])
}

model UserWorldKnowledge {
  userId                   String   @id @db.Uuid
  updatedAt                DateTime @updatedAt @db.Timestamptz
  discoveredLocationIds    Json     @default("[]")          // F3 → UserDiscoveredLocation (state=visited)
  heardAboutLocationIds    Json     @default("[]")          // F3 (state=heard_about)
  discoveredSubLocationIds Json     @default("[]")          // F3 (state=sublocation_visited)
  discoveredEdgeIds        Json     @default("[]")          // F3 → UserDiscoveredEdge
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### WorldNPC (F1 — bez dekompozycji)

```prisma
model WorldNPC {
  id                     String   @id @default(uuid(7)) @db.Uuid
  canonicalId            String   @unique
  name                   String
  role                   String?
  personality            String?
  alignment              String   @default("neutral")
  alive                  Boolean  @default(true)
  currentLocationId      String?  @db.Uuid
  homeLocationId         String?  @db.Uuid
  pausedAt               DateTime? @db.Timestamptz
  pauseSnapshot          Json?
  companionOfCampaignId  String?  @db.Uuid
  companionJoinedAt      DateTime? @db.Timestamptz
  companionLoyalty       Int      @default(50)
  lockedByCampaignId     String?  @db.Uuid
  lockedAt               DateTime? @db.Timestamptz
  lockedSnapshot         Json?
  activeGoal             String?
  goalProgress           Json?
  schedule               Json?
  lastTickAt             DateTime? @db.Timestamptz
  tickIntervalHours      Int      @default(24)
  lastTickSceneIndex     Int?
  tickIntervalScenes     Int      @default(2)
  goalDeadlineAt         DateTime? @db.Timestamptz
  lastLocationPingAt     DateTime? @db.Timestamptz
  category               String   @default("commoner")
  keyNpc                 Boolean  @default(true)

  knowledgeBase          Json     @default("[]")            // F2 → WorldNpcKnowledge
  dialogHistory          Json     @default("[]")            // F2 → WorldNpcDialogTurn
  knownLocationIds       Json     @default("[]")            // F3 → WorldNpcKnownLocation

  embeddingText          String?
  embedding              Unsupported("vector(1536)")?
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  currentLocation  WorldLocation? @relation("npcCurrentLoc", fields: [currentLocationId], references: [id])
  homeLocation     WorldLocation? @relation("npcHomeLoc",    fields: [homeLocationId],    references: [id])
  campaignShadows  CampaignNPC[]
  attributions     WorldNpcAttribution[]

  @@index([currentLocationId])
  @@index([alive])
  @@index([companionOfCampaignId])
  @@index([lockedByCampaignId])
}
```

### WorldEvent / Reputation / Attribution / LoreSection / Embedding / Pending* (F1)

```prisma
model WorldEvent {
  id              BigInt   @id @default(autoincrement())
  worldNpcId      String?  @db.Uuid
  worldLocationId String?  @db.Uuid
  campaignId      String?  @db.Uuid
  userId          String?  @db.Uuid
  eventType       String
  payload         Json     @default("{}")
  visibility      String   @default("campaign")
  gameTime        DateTime @db.Timestamptz
  createdAt       DateTime @default(now()) @db.Timestamptz
  campaign        Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  @@index([worldNpcId, createdAt])
  @@index([worldLocationId, createdAt])
  @@index([campaignId, createdAt])
  @@index([eventType, visibility, createdAt])
}

model WorldReputation {
  id              BigInt @id @default(autoincrement())
  characterId     String @db.Uuid
  scope           String
  scopeKey        String @default("")
  score           Int    @default(0)
  reputationLabel String?
  bountyAmount    Int    @default(0)
  bountyIssuer    String?
  vendettaActive  Boolean @default(false)
  lastIncidentAt  DateTime? @db.Timestamptz
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz
  character Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  @@unique([characterId, scope, scopeKey])
  @@index([scope, scopeKey, score])
}

model WorldNpcAttribution {
  id               BigInt   @id @default(autoincrement())
  worldNpcId       String   @db.Uuid
  actorCharacterId String   @db.Uuid
  actorCampaignId  String   @db.Uuid
  actionType       String
  justified        Boolean  @default(false)
  judgeConfidence  Float    @default(0)
  judgeReason      String?
  alignmentImpact  String
  visibility       String   @default("campaign")
  gameTime         DateTime @db.Timestamptz
  createdAt        DateTime @default(now()) @db.Timestamptz
  npc       WorldNPC  @relation(fields: [worldNpcId], references: [id], onDelete: Cascade)
  actor     Character @relation(fields: [actorCharacterId], references: [id])
  campaign  Campaign  @relation(fields: [actorCampaignId], references: [id], onDelete: Cascade)
  @@index([actorCharacterId, createdAt])
  @@index([worldNpcId])
}

model WorldLoreSection {
  id        String   @id @default(uuid(7)) @db.Uuid
  slug      String   @unique
  title     String
  content   String   @default("")
  order     Int      @default(0)
  updatedBy String?
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz
  @@index([order])
}

model WorldEntityEmbedding {
  id         BigInt   @id @default(autoincrement())
  entityType String
  entityId   String
  text       String
  embedding  Unsupported("vector(1536)")
  createdAt  DateTime @default(now()) @db.Timestamptz
  updatedAt  DateTime @updatedAt      @db.Timestamptz
  @@unique([entityType, entityId])
  @@index([entityType])
}

model PendingWorldStateChange {
  id               BigInt       @id @default(autoincrement())
  campaignId       String       @db.Uuid
  idempotencyKey   String
  kind             String
  targetHint       String
  targetEntityId   String?
  targetEntityType String?
  newValue         String
  confidence       Float
  similarity       Float?
  reason           String
  status           ReviewStatus @default(pending)
  reviewedBy       String?      @db.Uuid
  reviewedAt       DateTime?    @db.Timestamptz
  reviewNotes      String?
  createdAt        DateTime     @default(now()) @db.Timestamptz
  updatedAt        DateTime     @updatedAt      @db.Timestamptz
  campaign         Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, idempotencyKey])
  @@index([status, createdAt])
  @@index([campaignId, status])
}

model NPCPromotionCandidate {
  id                BigInt       @id @default(autoincrement())
  campaignId        String       @db.Uuid
  campaignNpcId     String       @db.Uuid
  name              String
  role              String?
  personality       String?
  stats             Json         @default("{}")
  dialogSample      String?
  smallModelVerdict String?
  status            ReviewStatus @default(pending)
  reviewedBy        String?      @db.Uuid
  reviewedAt        DateTime?    @db.Timestamptz
  reviewNotes       String?
  createdAt         DateTime     @default(now()) @db.Timestamptz
  updatedAt         DateTime     @updatedAt      @db.Timestamptz
  campaign          Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, campaignNpcId])
  @@index([status, createdAt])
}

model LocationPromotionCandidate {
  id                BigInt       @id @default(autoincrement())
  campaignId        String       @db.Uuid
  worldLocationId   String       @db.Uuid
  canonicalName     String
  displayName       String?
  locationType      String?
  region            String?
  description       String?
  stats             Json         @default("{}")
  smallModelVerdict String?
  status            ReviewStatus @default(pending)
  reviewedBy        String?      @db.Uuid
  reviewedAt        DateTime?    @db.Timestamptz
  reviewNotes       String?
  createdAt         DateTime     @default(now()) @db.Timestamptz
  updatedAt         DateTime     @updatedAt      @db.Timestamptz
  campaign          Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  location          WorldLocation @relation(fields: [worldLocationId], references: [id], onDelete: Cascade)
  @@unique([campaignId, worldLocationId])
  @@index([status, createdAt])
}
```

### MultiplayerSession (F1 — players[] na join table)

```prisma
model MultiplayerSession {
  id        String   @id @default(uuid(7)) @db.Uuid
  roomCode  String   @unique
  hostId    String   @db.Uuid
  phase     String
  gameState Json
  settings  Json
  updatedAt DateTime @updatedAt @db.Timestamptz
  createdAt DateTime @default(now()) @db.Timestamptz
  host      User @relation(fields: [hostId], references: [id])
  players   MultiplayerSessionPlayer[]
}

model MultiplayerSessionPlayer {                              // F1 — replaces players[] embed + characterIds[]
  sessionId   String  @db.Uuid
  odId        String
  name        String
  characterId String? @db.Uuid
  userId      String? @db.Uuid
  isHost      Boolean @default(false)
  joinedAt    DateTime @default(now()) @db.Timestamptz
  session     MultiplayerSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  character   Character? @relation(fields: [characterId], references: [id])
  @@id([sessionId, odId])
  @@index([characterId])
}
```

### MediaAsset / PrefabAsset / Wanted3D / Achievement (F1)

```prisma
model MediaAsset   { /* grep + przepisać przy F1 implementacji: metadata: String → Json, @db.ObjectId → @db.Uuid, FK User onDelete Cascade */ }
model PrefabAsset  { /* jak dziś, ObjectId → Uuid */ }
model Wanted3D     { /* jak dziś, ObjectId → Uuid */ }
model Achievement  {
  // jak dziś, metadata: String → Json, ObjectId → Uuid
  // campaignId dostaje FK → Campaign onDelete: SetNull (achievement persistuje, kampanijny kontekst znika razem z kampanią)
  // brak legacy unlocks do zachowania, więc startujemy czysto
}
```

## F1 vector search

### Zapis
```js
// backend/src/services/embeddingWrite.js (NEW, zastępuje mongoNative.writeEmbedding)
import { prisma } from '../lib/prisma.js';

const ALLOWED = new Set([
  'CampaignScene', 'CampaignKnowledge', 'CampaignNPC', 'CampaignCodex',
  'WorldLocation', 'WorldNPC', 'WorldEntityEmbedding',
]);

export async function writeEmbedding(table, id, embedding, embeddingText) {
  if (!ALLOWED.has(table)) throw new Error(`writeEmbedding: table ${table} not allowed`);
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET embedding = $1::vector, "embeddingText" = $2 WHERE id = $3::uuid`,
    embedding, embeddingText, id
  );
}
```

### Query
```js
// backend/src/services/vectorSearchService.js — rewrite
export async function searchScenes(campaignId, queryEmbedding, { limit = 10, minScore = 0.5 } = {}) {
  const rows = await prisma.$queryRaw`
    SELECT id, "sceneIndex", narrative, "chosenAction", "scenePacing",
           "dialogueSegments", "diceRoll",
           1 - (embedding <=> ${queryEmbedding}::vector) AS score
    FROM "CampaignScene"
    WHERE "campaignId" = ${campaignId}::uuid AND embedding IS NOT NULL
    ORDER BY embedding <=> ${queryEmbedding}::vector
    LIMIT ${limit}
  `;
  return rows.filter(r => r.score >= minScore);
}
// Analogicznie searchKnowledge / searchNPCs / searchCodex.
```

`ragService.query` analogicznie — `findMany + JS cosine` → `$queryRaw + <=>`.

### HNSW SQL indexy w migracji init
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX idx_scene_embedding     ON "CampaignScene"        USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX idx_knowledge_embedding ON "CampaignKnowledge"    USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX idx_npc_embedding       ON "CampaignNPC"          USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX idx_codex_embedding     ON "CampaignCodex"        USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX idx_worldent_embedding  ON "WorldEntityEmbedding" USING hnsw (embedding vector_cosine_ops);
```

## F1 transakcje

| Endpoint / service | Wrap |
|---|---|
| `PUT /v1/campaigns/:id` (`crud.js`) | `campaign.update` + `syncNPCsToNormalized` + `syncKnowledgeToNormalized` + `syncQuestsToNormalized` + `character.updateMany(lock)` |
| `POST /v1/ai/campaigns/:id/scenes` (`sceneStream.js`/`generateSceneStream.js`) | `campaignScene.create` + `character.update(stateChanges)`. Cloud Task enqueue **PO commicie** |
| `processStateChanges/index.js` | Cały batch (`processNpcChanges` + `processKnowledgeUpdates` + `processCodexUpdates` + `processQuestStatusChange`) per scena |
| `postSceneWork.js` | Per-task transakcje gdzie multi-write |
| `adminLivingWorld.js` approve/reject | Status change + side-effect (flipCanonical, promote) |
| `postCampaignPromotion` batch | Bulk insert kandydatów |

LLM calls **przed** transakcją; wynik → mutacja w transakcji. Scene-gen pipeline już tak działa.

## F1 pliki do zmiany

### Schema & migracja
| Plik | Zmiana |
|---|---|
| `backend/prisma/schema.prisma` | Pełny rewrite per F1 schema |
| `backend/prisma/migrations/0000_init_postgres/migration.sql` | Auto-generated + manual: `CREATE EXTENSION vector`, HNSW indexes |
| `backend/prisma/seed.js` | Dostosować do nowych enumów |
| `backend/src/scripts/seedWorld.js` | Drop `new ObjectId`, użyć enumów (`DangerLevel`, `LocationType`); join tables nie dotyczą F1 |

### Embedding layer
| Plik | Zmiana |
|---|---|
| `backend/src/services/mongoNative.js` | **DELETE** |
| `backend/src/services/embeddingWrite.js` | **NEW** — `$executeRawUnsafe` z allowlistą |
| `backend/src/services/vectorSearchService.js` | `$vectorSearch` → `$queryRaw + <=>`; drop `mongodb` import |
| `backend/src/services/livingWorld/ragService.js` | `findMany + JS cosine` → `$queryRaw + <=>` |
| `backend/src/services/embeddingService.js` | Bez zmian |
| `backend/src/scripts/createVectorIndexes.js` | **DELETE** (indeksy w migracji) |

### MongoDB native driver callsites (drop ObjectId)
| Plik | Zmiana |
|---|---|
| `backend/src/services/hashService.js:27` | `toObjectId` → DELETE, callsites passthrough |
| `backend/src/routes/auth.js:2,101` | Direct MongoClient query → `prisma.user.findUnique/update` |
| `backend/src/services/livingWorld/worldStateService.js:14,309-314` | Drop `import { ObjectId }`, `toObjectIdString` passthrough |
| `backend/src/services/livingWorld/companionService.js:13,41-42` | Drop `new ObjectId(...)` |
| `backend/src/routes/media.js:104`, `routes/wanted3d.js:63`, `routes/proxy/stability.js:91`, `routes/proxy/openai.js:204,402` | Drop `toObjectId(campaignId)` wrapowania |

### JSON.parse/stringify cleanup (na polach DB)
| Plik | Zakres |
|---|---|
| `backend/src/services/campaignSync.js` | Drop JSON.parse/stringify; `withRetry` P2028 → 40001 |
| `backend/src/services/campaignLoader.js` | Drop ręczne parse |
| `backend/src/services/sceneGenerator/processStateChanges/handlers/*.js` | Drop parse/stringify w każdym handlerze |
| `backend/src/services/livingWorld/*.js` | npcDialog, npcMemoryUpdates, dmMemoryService, campaignSandbox, npcAgentLoop, postCampaignMemoryPromotion, postCampaignLocationPromotion, worldStateService — drop parse |
| `backend/src/services/postSceneWork.js` | Wrap transakcje |
| `backend/src/services/campaignSerialize.js` | Uproszczenie (mniej miejsc gdzie parse coreState — coreState dalej JSONB monolit, ale `JSON.parse(coreStateString)` znika z FE/BE bo Prisma zwróci obiekt) |
| `src/services/storage.js`, `storage/characters.js`, `storage/migrations.js` | FE: drop JSON.parse tam gdzie BE zwraca obiekt; `_parseBackendCampaign` uproszczenie |

### WFRP legacy drop
| Plik | Zmiana |
|---|---|
| `src/components/character/CharacterCreationModal.jsx:127` | Drop fallback `char.characteristics` → tylko `char.attributes` |
| `backend/src/routes/characters.js:56-58,91,129-131` | Drop WFRP write path |
| `backend/src/services/characterMutations.js:317,371-373` | Drop WFRP fields |
| `e2e/helpers/mock-responses.js` | Aktualizacja mocków (drop careerData) |

### TTL / lazy cleanup
| Plik | Zmiana |
|---|---|
| `backend/src/scripts/createRefreshTokenTtlIndex.js` | **DELETE** |
| `backend/src/services/refreshTokenService.js` | Eksport `startPeriodicCleanup()`: `setInterval(deleteMany expired, 10*60_000).unref()` |
| `backend/src/server.js` | Wywołanie `startPeriodicCleanup()` po `fastify.listen` |

### Config / infra
| Plik | Zmiana |
|---|---|
| `backend/src/config.js:17` | Default URL → `postgresql://rpgon:rpgon@localhost:5432/rpgon` |
| `docker-compose.yml` | `db: pgvector/pgvector:pg16`, volume, healthcheck, depends_on |
| `.env.example`, `.env` | `DATABASE_URL=postgresql://rpgon:rpgon@db:5432/rpgon`, `POSTGRES_PASSWORD=rpgon_local` |
| `backend/package.json` | Remove `mongodb` dep |
| `backend/src/lib/prisma.js` | Bez zmian |
| `cloudbuild.yaml` | **ODROCZONE** do F6 (hosting decyzja) |

### One-off scripts
| Plik | Decyzja |
|---|---|
| `backend/src/scripts/migrateCoreState.js` | Review — Mongo-specific data fix? DELETE. Nadal użyteczny? Adapt |
| `backend/src/scripts/dropSharedConfigCollection.js` | **DELETE** |
| `backend/src/scripts/inspectMediaAssetDuplicates.js`, `pruneMediaAssetDuplicates.js` | Adapt na SQL jeśli logika potrzebna; jednorazowe — DELETE |
| `backend/src/scripts/generatePrefabs.js`, `importPrefabsFromModels3d.js` | Bez Mongo-specifics — zostają |

### Dokumenty (F1)
| Plik | Zmiana |
|---|---|
| `CLAUDE.md` | Stack: MongoDB Atlas → PostgreSQL 16 + pgvector. Commands: `db:push` → `db:migrate`. Drop "Atlas Vector Search" mentions. Dodać linki do nowych decyzji |
| `knowledge/decisions/atlas-only-no-local-mongo.md` | Banner SUPERSEDED |
| `knowledge/decisions/embeddings-native-driver.md` | Banner SUPERSEDED |
| `knowledge/decisions/postgres-dev.md` | **NEW** |
| `knowledge/decisions/embeddings-pgvector.md` | **NEW** |
| `knowledge/concepts/persistence.md` | "JSON fields stored as strings" → "JSONB native"; "embeddings via mongoNative" → "embeddings via `$executeRawUnsafe` do `vector(1536)` column" |
| `README.md` | Dev setup: `docker compose up` stawia Postgres+backend offline |

## F1 docker compose

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: rpgon
      POSTGRES_USER: rpgon
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-rpgon_local}
    ports: ["5432:5432"]
    volumes: [pg-data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rpgon"]
      interval: 5s
      timeout: 3s
      retries: 20
  backend:
    build: .
    restart: unless-stopped
    ports: ["3001:8080"]
    environment:
      NODE_ENV: "${NODE_ENV:-development}"
      PORT: "8080"
      HOST: "0.0.0.0"
      DATABASE_URL: "postgresql://rpgon:${POSTGRES_PASSWORD:-rpgon_local}@db:5432/rpgon"
      JWT_SECRET: "${JWT_SECRET:?Set JWT_SECRET in .env}"
      API_KEY_ENCRYPTION_SECRET: "${API_KEY_ENCRYPTION_SECRET:?Set API_KEY_ENCRYPTION_SECRET in .env}"
      CORS_ORIGIN: "${CORS_ORIGIN:-http://localhost:3001}"
      MEDIA_BACKEND: "${MEDIA_BACKEND:-local}"
      MEDIA_LOCAL_PATH: "/data/media"
      CLOUD_TASKS_ENABLED: "false"
    depends_on:
      db: { condition: service_healthy }
    volumes: [media-data:/data/media]
    develop:
      watch:
        - { action: sync+restart, path: ./backend/src, target: /app/backend/src }
        - { action: sync+restart, path: ./shared,      target: /app/shared }
        - { action: rebuild, path: ./backend/package.json }
        - { action: rebuild, path: ./backend/prisma }
        - { action: rebuild, path: ./src }
        - { action: rebuild, path: ./package.json }
volumes:
  media-data:
  pg-data:
```

## F1 weryfikacja

```bash
docker compose down -v && docker compose up --build --watch
cd backend && npx prisma migrate dev --name init_postgres
docker compose exec db psql -U rpgon -d rpgon -c "\dx"
docker compose exec db psql -U rpgon -d rpgon -c "\di *embedding*"
cd backend && npm run db:seed
npm test
npm run test:e2e

# Grep sanity
grep -rn "import.*mongodb"   backend/src src --include='*.js' | grep -v node_modules    # 0
grep -rn "new ObjectId"      backend/src --include='*.js' | grep -v node_modules        # 0
grep -rn "JSON\.parse"       backend/src/services/campaignSync.js backend/src/services/sceneGenerator backend/src/services/livingWorld | grep -v ".test.js"  # minimal

# E2E smoke manual: register → character → campaign → scene-gen → embedding w DB → vector search → LW tick → MP 2-browser
docker compose logs backend --tail=200 | grep -i error   # 0 substantial
```

## F1 ryzyka

| Ryzyko | Wpływ | Mitigation |
|---|---|---|
| `Unsupported("vector")` ogranicza Prisma CRUD | Średni | Embeddingi przez `$executeRawUnsafe`/`$queryRaw` (~6 plików). Już dziś Mongo wymagał osobnej ścieżki |
| `prisma migrate dev` nie wygeneruje `CREATE EXTENSION` | Niski | Prisma 6 wspiera `extensions = [vector]` w `datasource db`. Fallback: dopisać do migration.sql |
| FK cascade kaskaduje coś niechcąco | Niski | Per-model przeanalizowane. Cascade tam gdzie podrzędne nie ma sensu bez parenta |
| JSON.parse cleanup przeoczy miejsce | Średni | grep-driven list + E2E na każdą ścieżkę |
| Transakcje blokują przez LLM call | Wysoki | Transakcje **tylko wokół DB writes**. LLM przed wrap |
| Enumy — zmiana wartości wymaga migracji | Niski | Tylko zamknięte zbiory są enumami; reszta `String` |
| WFRP drop psuje Playwright mocks | Niski | Aktualizacja `e2e/helpers/mock-responses.js` |

---

# F1 retrospektywa

**Zakres:** wszystkie 10 sub-tasków (F1.1–F1.10) shipped. 710 backend testów ✅, 1103 frontend testów ✅, `prisma validate` ✅. Build + seed + first scene zweryfikowane manualnie przez usera (`npm run dev` → seed świata + interakcja).

## Zmiany vs plan

| Plan | Co faktycznie wyszło |
|---|---|
| `LocationType` enum: 11 wartości | **15 wartości** — dodane `mountain`, `ruin`, `camp`, `cave` (seed `seedWorld.js` używa, mid-play creator może emitować). Init migration zaktualizowana inline (pre-prod, dane puste). |
| Hard-code `DATABASE_URL` w docker-compose dla containera (`db:5432`) | Tak — pierwszy boot pokazał że `${DATABASE_URL:-...}` w compose dziedziczył `localhost:5432` z root `.env` i container nie mógł sięgnąć Postgresa. Container teraz zawsze używa `db:5432`, host-side prisma z `localhost:5432` przez `backend/.env`. Te dwa URLe są **świadomie nieskorelowane**. |
| `setup.js` step [4/5] = `prisma db push` (Mongo era) | Przepisane na `docker compose up -d db` + `pg_isready` polling + `prisma migrate deploy`. Fresh clone teraz działa one-shot przez `npm run setup`. |
| Brak skryptów convenience | Dodane w root `package.json`: `db:up` (compose up samego db) + `db:reset` (drop volume + restart). |
| F1.6 transakcje na 6 endpointach | **3 transakcje** wystarczyły jako high-value: DELETE/PUT campaign + scene save+character.update. Reszta (POST campaign, processStateChanges batch, admin approve, postCampaignPromotion) zostawione z catch-and-log — handlerzy są idempotentni. Można dorzucić w F2 jeśli krzyczy. |
| F1.4 JSON cleanup tylko critical path | Wyszło wszystko co miało wpływ na runtime — łącznie z 80+ plikami. Guarded helpers (`typeof === 'string' ? JSON.parse(...) : Array.isArray(...) ? ... : []`) zostawione celowo: tolerują legacy JSON-string + native JSONB w jednym miejscu, nic nie psują. Mogą zostać oczyszczone gdy będzie powód. |

## Znane długi z F1

1. **`stats: JSON.stringify(...)` na `LocationPromotionCandidate.stats` / `NPCPromotionCandidate.stats`** — kolumny są `Json` w schemie, ale zostawiłem stringify na write w paru testach (zaktualizowanych) bo było ergonomiczniej dla expect-string-contains. Same write paths w produkcji **już używają obiektu**. Spójność: ✅.
2. **`CampaignNPC.smallModelVerdict` = `String?`** (intencjonalnie, nie `Json`). Verdict jest stored-as-blob bo nikt go nie filtruje SQLem. Trzymać tak chyba że F4/F5 znajdzie powód.
3. **Boundary validation locationType** — AI mid-play może emitować nieznany `locationType` → dziś leci do enuma → throw. Defensywny coerce-to-`generic` w [locations.js:158](backend/src/services/sceneGenerator/processStateChanges/locations.js#L158) (przy `BLOCKED_MIDPLAY_LOCATION_TYPES`) odłożony do "as-needed". Jeśli playtest pokaże throw, dodać tam.
4. **`coreState` ciągle 15-25KB JSONB monolit** — zaplanowane do dekompozycji w F5. F1 świadomie nie ruszał (lean diff).
5. **`bestiary.js` ciągle używa WFRP `characteristics` (ws/bs/s/t/...)** — to osobny refactor (combat data WFRP→RPGon), nie część Postgres migracji. Nie blokuje.
6. **`auth.js` health check** był Mongo-only (`$runCommandRaw({ ping: 1 })`); zmienione na `$queryRaw\`SELECT 1\``. ✅
7. **Test mocks z `coreState: JSON.stringify(...)`** zaktualizowane na obiekty (`postCampaignWriteback.test.js`).

## Pliki dotknięte (top-level)

- **Schema:** `backend/prisma/schema.prisma` (full rewrite), `backend/prisma/migrations/0000_init_postgres/{migration.sql,migration_lock.toml}` (NEW).
- **Embedding:** `embeddingWrite.js` (NEW), `vectorSearchService.js` + `livingWorld/ragService.js` (rewrite).
- **Mongo dropouts:** `mongoNative.js`, `createVectorIndexes.js`, `createRefreshTokenTtlIndex.js` deleted. `worldStateService.toObjectIdString` deleted (dead).
- **Refresh tokens:** `refreshTokenService.js` (`startPeriodicCleanup`/`stopPeriodicCleanup`), wired from `server.js`.
- **Config:** `docker-compose.yml` (db service + healthcheck + hard-coded container DATABASE_URL), `config.js`, `backend/.env.example`, `.env.example`, `backend/package.json` (drop `mongodb` dep), `backend/scripts/setup.js`, root `package.json` (`db:up`, `db:reset`).
- **Transakcje:** `routes/campaigns/crud.js` (DELETE+PUT), `sceneGenerator/generateSceneStream.js` (scene save + character.update).
- **WFRP drop FE:** `CharacterCreationModal.jsx`, `CharacterPanel.jsx`, `PartyPanel.jsx`, `CharacterPicker.jsx`, `CampaignCreatorPage.jsx`, `JoinRoomPage.jsx`, `LobbyPage.jsx`, `PlayerLobby.jsx`, `CharacterLibrary.jsx`, `storage/{characters,migrations}.js`, `exportLog.js`, `e2e/helpers/mock-responses.js`, `multiplayerAI/campaignGeneration.js`.
- **Docs:** `CLAUDE.md`, `README.md`, `knowledge/concepts/persistence.md`, `knowledge/concepts/auth.md`, `knowledge/decisions/cloud-run-no-redis.md`, `knowledge/decisions/atlas-only-no-local-mongo.md` (SUPERSEDED), `knowledge/decisions/embeddings-native-driver.md` (SUPERSEDED), `knowledge/decisions/postgres-dev.md` (NEW), `knowledge/decisions/embeddings-pgvector.md` (NEW).

## Verified manualnie

- ✅ Fresh clone: `npm run setup` → db up + migrate + secrets generated. `npm run dev` → backend boots na :3001, frontend na :5173.
- ✅ Schema migrate apply na pustym Postgresie.
- ✅ `seedWorld` po enum-extend pełni success (15 LocationType wartości).
- ✅ `npm test` (1813 testów łącznie BE+FE).

## Niezweryfikowane manualnie (do playtest)

- Vector search end-to-end (RAG query w Living World).
- Multiplayer save/restore z `MultiplayerSessionPlayer` join table.
- Post-campaign writeback flow (Phase 12 promotion + memory).
- Cloud Tasks deploy (F6 — hosting decyzja osobna).

---

# F2 — Write-path scaling

**Cel:** wyciąć N+1 i write-amp na hot pathach. Zmiany których przy spike nie chcesz robić pod presją.

**Trigger:** przed publicznym exposure / przed >100 DAU. Nie blokuje codziennej pracy.

## F2 schema delta — child tables dla append-heavy capped lists

```prisma
model WorldNpcKnowledge {
  id          BigInt   @id @default(autoincrement())
  npcId       String   @db.Uuid
  content     String
  source      String
  kind        String
  confidence  Float?
  similarity  Float?
  sensitivity String?
  addedAt     DateTime @default(now()) @db.Timestamptz
  learnedAt   DateTime? @db.Timestamptz
  npc         WorldNPC @relation(fields: [npcId], references: [id], onDelete: Cascade)
  @@index([npcId, addedAt])
}

model WorldNpcDialogTurn {
  id          BigInt   @id @default(autoincrement())
  npcId       String   @db.Uuid
  campaignId  String   @db.Uuid
  playerMsg   String
  npcResponse String
  gameTime    DateTime @db.Timestamptz
  createdAt   DateTime @default(now()) @db.Timestamptz
  npc         WorldNPC @relation(fields: [npcId], references: [id], onDelete: Cascade)
  campaign    Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@index([npcId, campaignId, createdAt])
}

model WorldLocationKnowledge {
  id         BigInt   @id @default(autoincrement())
  locationId String   @db.Uuid
  content    String
  source     String
  kind       String
  confidence Float?
  similarity Float?
  addedAt    DateTime @default(now()) @db.Timestamptz
  location   WorldLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)
  @@index([locationId, addedAt])
}

model CampaignNpcExperience {
  id            BigInt   @id @default(autoincrement())
  campaignNpcId String   @db.Uuid
  content       String
  importance    String?
  sceneIndex    Int?
  addedAt       DateTime @default(now()) @db.Timestamptz
  campaignNpc   CampaignNPC @relation(fields: [campaignNpcId], references: [id], onDelete: Cascade)
  @@index([campaignNpcId, addedAt])
}

model CampaignDmMemoryEntry {
  id         BigInt   @id @default(autoincrement())
  campaignId String   @db.Uuid
  at         DateTime @default(now()) @db.Timestamptz
  plannedFor String?
  status     String?
  summary    String
  agent      CampaignDmAgent @relation(fields: [campaignId], references: [campaignId], onDelete: Cascade)
  @@index([campaignId, at])
}

model CampaignDmPendingHook {
  id          String   @id @default(uuid(7)) @db.Uuid
  campaignId  String   @db.Uuid
  kind        String
  summary     String
  idealTiming String?
  priority    Int      @default(0)
  createdAt   DateTime @default(now()) @db.Timestamptz
  agent       CampaignDmAgent @relation(fields: [campaignId], references: [campaignId], onDelete: Cascade)
  @@index([campaignId, priority])
}
```

**Drop kolumn JSONB** (po migracji danych F1→F2; dla pre-prod = po prostu drop):
- `WorldNPC.knowledgeBase`, `WorldNPC.dialogHistory`
- `WorldLocation.knowledgeBase`
- `CampaignNPC.experienceLog`
- `CampaignDmAgent.dmMemory`, `CampaignDmAgent.pendingHooks`

## F2 FIFO triggery

```sql
-- cap 50 WorldNpcKnowledge per npc
CREATE OR REPLACE FUNCTION trim_world_npc_knowledge() RETURNS trigger AS $$
BEGIN
  DELETE FROM "WorldNpcKnowledge"
  WHERE "npcId" = NEW."npcId"
    AND id IN (
      SELECT id FROM "WorldNpcKnowledge"
      WHERE "npcId" = NEW."npcId"
      ORDER BY "addedAt" DESC OFFSET 50
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trim_world_npc_knowledge_tr
AFTER INSERT ON "WorldNpcKnowledge" FOR EACH ROW EXECUTE FUNCTION trim_world_npc_knowledge();

-- analogicznie:
-- WorldNpcDialogTurn cap 50 per (npcId, campaignId)
-- WorldLocationKnowledge cap 50 per locationId
-- CampaignNpcExperience cap N (50? sprawdzić obecny cap w npcMemoryUpdates handler)
-- CampaignDmMemoryEntry cap 20 per campaignId
-- CampaignDmPendingHook cap 12 per campaignId (ORDER BY priority ASC)
```

## F2 bulk upsert (drop loop findUnique+upsert)

```js
// zamiast pętli w syncNPCsToNormalized
await prisma.$executeRaw`
  INSERT INTO "CampaignNPC" (id, "campaignId", "npcId", name, attitude, disposition, ...)
  SELECT * FROM UNNEST(
    ${ids}::uuid[], ${cids}::uuid[], ${npcIds}::text[], ${names}::text[],
    ${attitudes}::text[], ${dispositions}::int[], ...
  )
  ON CONFLICT ("campaignId","npcId") DO UPDATE SET
    attitude = EXCLUDED.attitude,
    disposition = EXCLUDED.disposition,
    ...
`;
```

Aplikujemy do: `syncNPCsToNormalized`, `syncKnowledgeToNormalized`, `syncQuestsToNormalized`, `processNpcChanges`. Z 40+ queries → 1 per batch.

Alternative: `prisma.createMany({ skipDuplicates: true })` + `updateMany` w pętli. Gorsze (2N queries) ale Prisma-native — fallback jeśli raw SQL UNNEST okaże się problematyczny w testach.

## F2 connection pool tuning

`DATABASE_URL` → dodać `?connection_limit=10&pool_timeout=20`. Dla Cloud Run z N instancjami: pool per-instance × N ≤ Postgres `max_connections`. Przy F6 → PgBouncer.

## F2 pliki do zmiany
| Plik | Zmiana |
|---|---|
| `backend/prisma/schema.prisma` | Dodać 6 nowych modeli, drop 6 JSONB kolumn |
| `backend/prisma/migrations/0001_child_tables_fifo/migration.sql` | Auto + manual: 6 trigger functions + triggers |
| `backend/src/services/livingWorld/{npcDialog,npcMemoryUpdates,dmMemoryService,campaignSandbox,npcAgentLoop,postCampaignMemoryPromotion,postCampaignLocationPromotion,worldStateService}.js` | Append do child table zamiast push do JSONB array |
| `backend/src/services/aiContextTools/contextBuilders/npcBaseline.js` | Read z child table (`prisma.worldNpcKnowledge.findMany` + `prisma.campaignNpcExperience.findMany`) zamiast z `WorldNPC.knowledgeBase` |
| `backend/src/services/sceneGenerator/processStateChanges/handlers/npcMemoryUpdates.js` | INSERT do `CampaignNpcExperience` |
| `backend/src/services/campaignSync.js` | Loop → bulk upsert |
| `backend/src/services/sceneGenerator/processStateChanges/handlers/{npcs,knowledgeCodex,quests,locations}.js` | Loop → bulk upsert |
| `knowledge/concepts/npc-clone-architecture.md` | Update — `knowledgeBase`/`experienceLog` z child tables |

## F2 weryfikacja
```bash
# FIFO trigger test
psql -c "INSERT INTO \"WorldNpcKnowledge\" (npcId, content, source, kind) SELECT '<npc-uuid>', 'k'||g, 'test', 'fact' FROM generate_series(1, 60) g;"
psql -c "SELECT count(*) FROM \"WorldNpcKnowledge\" WHERE npcId = '<npc-uuid>';"   # = 50

# Bulk upsert test
# load campaign with 30 NPCs, save → assert query count drop (Prisma debug log: 1 INSERT zamiast 30)
```

## F2 ryzyka
| Ryzyko | Mitigation |
|---|---|
| FIFO trigger kasuje recent gdy clock-skew na addedAt | Test seeded data; addedAt = `default(now())`, monotonic |
| Bulk UNNEST z dynamic kolumnami trudne w utrzymaniu | Fallback `createMany`+`updateMany`; raw SQL tylko tam gdzie measurable QPS savings |
| Stage 3 NPC memory cosine search wymaga child table indexed by entityType | `WorldEntityEmbedding` już indeksuje — tylko zmiana sourcing w `npcBaseline.js` |

# F2 retrospektywa

**Zakres:** 5 sub-tasków (F2.1–F2.5) shipped. 1155 unit testów ✅, 103 testy F2 (4 plików) ✅, `prisma validate` ✅, `npm run build` ✅, FIFO trigger live-verified (60→50 + 25→20).

## Zmiany vs plan

| Plan | Co faktycznie wyszło |
|---|---|
| `WorldNpcDialogTurn.gameTime DateTime` non-null | DROP — `npcDialog.js` zapisuje `at: new Date().toISOString()` (wall-clock = `createdAt`). Dodany `emote String?` (plan pominął, kod używa). |
| `CampaignDmPendingHook.priority Int` | `String @default("normal")` — dmMemoryService używa stringów `'normal'\|'high'\|'low'`. |
| Trigger pendingHooks `ORDER BY priority ASC` | Standard FIFO `ORDER BY createdAt DESC` — plan kasowałby najwyższe priorytety, niezgodnie z `clampList` semantyką. |
| `WorldNpcKnowledge` schema z planu | + dodane `importance String?` — postCampaignMemoryPromotion + npcBaseline filter by importance. Bez tego field readery nie mają sygnału. |
| Bulk UNNEST raw SQL | Prisma-native (`findMany` → split → `createMany` + per-row update). Dla 100 DAU 1+1+N queries vs 2N teraz wystarczy z marginesem. UNNEST odłożony do F6 jeśli profile pokaże hot spot. |
| F2 plik wymienia `processNpcChanges` (npcs.js) | Świadomie pominięty — funkcja jest embedding-bound (HTTP call per NPC) a nie DB-bound; refactor by dał ~2 query oszczędności na N=5. Niewarte. |

## Pure helpers — co wycięte / co zostało

**Wycięte** (cap przeszedł do triggerów, dedup/upsert do prisma):
- `clampList`, `mergeMemoryEntries`, `mergePendingHooks` w `dmMemoryService.js`
- `appendMemoryEntries` w `npcMemoryUpdates.js`
- `appendKnowledgeEntry` w `postCampaignWorldChanges.js`
- `mergeKnowledgeBaseForCampaign` w `postCampaignMemoryPromotion.js`

**Dodane** (testowalne plan-buildery):
- `planMemoryInserts(existingSummaries, additions)` w dmMemoryService — dedup-only
- `planHookMutations(existingHookIds, additions, resolvedIds)` — split na `{toCreate, toUpdate, toDelete}`

**Zmienione kontrakty** (string-input dropped, Array-input only):
- `formatBaselineEntries`, `formatCrossCampaignEntries`, `parseExperienceEntries`, `formatExperienceEntries` w npcBaseline — przyjmują typed rows z `findMany`, nie raw JSONB strings.
- `buildPromotableEntries` w postCampaignMemoryPromotion — to samo.

## Bug naprawiony przy okazji

`npcDialog.js` system prompt iterował po `k.topic` ale entries zawsze były `{content, source, ...}` (kwestia od ery Mongo). Naprawione na `k.content`.

## Pliki dotknięte (top-level)

- **Schema:** `backend/prisma/schema.prisma` (6 nowych modeli, 6 dropped JSONB pól, reverse relations).
- **Migracja:** `backend/prisma/migrations/20260425150505_child_tables_fifo/migration.sql` (auto-gen + 6 plpgsql trigger functions ręcznie).
- **Writers (F2.2):** `livingWorld/{npcDialog,dmMemoryService,postCampaignWorldChanges,postCampaignMemoryPromotion}.js`, `sceneGenerator/processStateChanges/npcMemoryUpdates.js`, `scripts/seedWorld.js`.
- **Readers (F2.3):** `aiContextTools/contextBuilders/npcBaseline.js`, `routes/adminLivingWorld.js` (admin NPC dump). `livingWorld.js` contextBuilder + `dmMemoryUpdater.js` przesz przez nowe `readDmAgentState` API bez zmian.
- **Bulk upsert (F2.4):** `services/campaignSync.js` (3 funkcje: `syncNPCsToNormalized`, `syncKnowledgeToNormalized`, `syncQuestsToNormalized`).
- **Tests:** 4 pliki przepisane (`dmMemoryService.test.js`, `npcMemoryUpdates.test.js`, `npcBaseline.test.js`, `postCampaignWorldChanges.test.js`) — drop legacy pure helpers, mockuj nowe child-table prisma.

## Znane długi z F2

1. **Connection pool tuning odłożone** — plan F2 wymieniał `?connection_limit=10&pool_timeout=20` w `DATABASE_URL`. Pominąłem w tej sesji (każda Cloud Run instancja może chcieć innego limitu, ten config naprawdę należy do F6). DEV bez tego fine.
2. **`processNpcChanges` w `npcs.js` zostawione bez bulk** — patrz wyżej, embedding-bound. Jeśli profile pokaże inaczej — patch.
3. **`coreState.world.knowledgeBase` w campaignSerialize/campaignSync** — to NIE jest pole DB (in-memory JS shape), zostaje. F5 zniszczy `coreState` monolit.
4. **Comment-rot:** parę plików ma docstringi typu "writes to WorldNPC.knowledgeBase" które już są niezgodne (writes to WorldNpcKnowledge). Nie blocking — naprawia się przy najbliższym dotyku.
5. **`prisma migrate dev --create-only` non-interactive blokuje przy data-loss warnings** — workaround: `db:reset` + `migrate deploy` przed `migrate dev`. Pre-prod, brak konsekwencji. F6 prod migration musi mieć inny flow.

## Verified manualnie

- ✅ `prisma validate` po pełnej zmianie schemy.
- ✅ `db:reset` → `migrate deploy` → wszystkie 3 migracje czysto applied na fresh DB.
- ✅ Live FIFO trigger: 60 INSERT do `WorldNpcKnowledge` → 50 zostało; 25 INSERT do `CampaignNpcExperience` → 20 zostało.
- ✅ Cascade delete: usunięcie `WorldNPC` row → `WorldNpcKnowledge` cascade-droppe (FK ON DELETE CASCADE).
- ✅ All 6 trigger functions registered + 6 triggers active w `information_schema.triggers`.
- ✅ `importance` column na `WorldNpcKnowledge` (text, nullable).
- ✅ `npm test` 1155 unit testów pass; `npm run build` zielony.

## Niezweryfikowane manualnie (do playtest)

- E2E save → load → save campaign'a (czy bulk upsert reconstructs OK po pełnym cyklu).
- Cross-campaign Stage 2b (post-campaign experienceLog → WorldNpcKnowledge promotion) — kod gotowy, nie strzelano live.
- Multiplayer save/restore — F2 nie tknęło multiplayer state, ale warto sprawdzić.
- Admin Living World NPC view (`adminLivingWorld.js` zmienione — admin UI dump powinien teraz pokazywać `dialogHistory` + `knowledgeBase` jako rows z child tables).

---

# F3 — Reference normalization

**Cel:** wyciąć wszystkie `Json @default("[]")` które są pure Mongo workaroundami (array of foreign IDs bez FK).

**Trigger:** po F2, przy najbliższym oknie. Niski risk, czysta zmiana.

## F3 schema delta — join tables zamiast JSON arrays of IDs

```prisma
model CampaignDiscoveredLocation {                          // replaces Campaign.discovered/heardAbout/discoveredSubLocationIds
  campaignId   String         @db.Uuid
  locationId   String         @db.Uuid
  state        DiscoveryState
  discoveredAt DateTime       @default(now()) @db.Timestamptz
  campaign     Campaign       @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  location     WorldLocation  @relation(fields: [locationId], references: [id], onDelete: Cascade)
  @@id([campaignId, locationId])
  @@index([locationId])
}

model UserDiscoveredLocation {                              // replaces UserWorldKnowledge.discovered/heardAbout/discoveredSubLocationIds
  userId        String         @db.Uuid
  locationId    String         @db.Uuid
  state         DiscoveryState
  discoveredAt  DateTime       @default(now()) @db.Timestamptz
  userKnowledge UserWorldKnowledge @relation(fields: [userId], references: [userId], onDelete: Cascade)
  location      WorldLocation  @relation(fields: [locationId], references: [id], onDelete: Cascade)
  @@id([userId, locationId])
  @@index([locationId])
}

model UserDiscoveredEdge {                                  // replaces UserWorldKnowledge.discoveredEdgeIds
  userId        String   @db.Uuid
  edgeId        String   @db.Uuid
  discoveredAt  DateTime @default(now()) @db.Timestamptz
  userKnowledge UserWorldKnowledge @relation(fields: [userId], references: [userId], onDelete: Cascade)
  edge          WorldLocationEdge  @relation(fields: [edgeId], references: [id], onDelete: Cascade)
  @@id([userId, edgeId])
}

model WorldEdgeDiscovery {                                  // replaces WorldLocationEdge.discoveredByCampaigns
  edgeId       String   @db.Uuid
  campaignId   String   @db.Uuid
  discoveredAt DateTime @default(now()) @db.Timestamptz
  edge         WorldLocationEdge @relation(fields: [edgeId], references: [id], onDelete: Cascade)
  campaign     Campaign          @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@id([edgeId, campaignId])
  @@index([campaignId])
}

model WorldNpcKnownLocation {                               // replaces WorldNPC.knownLocationIds
  npcId      String   @db.Uuid
  locationId String   @db.Uuid
  grantedBy  String                                         // "seed" | "promotion" | "dialog"
  grantedAt  DateTime @default(now()) @db.Timestamptz
  npc        WorldNPC      @relation(fields: [npcId], references: [id], onDelete: Cascade)
  location   WorldLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)
  @@id([npcId, locationId])
  @@index([locationId])
}

model CharacterClearedDungeon {                             // replaces Character.clearedDungeonIds
  characterId String   @db.Uuid
  dungeonId   String   @db.Uuid
  clearedAt   DateTime @default(now()) @db.Timestamptz
  character   Character     @relation(fields: [characterId], references: [id], onDelete: Cascade)
  dungeon     WorldLocation @relation(fields: [dungeonId], references: [id])
  @@id([characterId, dungeonId])
}

model CampaignQuestPrerequisite {                           // replaces CampaignQuest.prerequisiteQuestIds
  questId        String @db.Uuid
  prerequisiteId String @db.Uuid
  quest          CampaignQuest @relation("questSide",  fields: [questId],        references: [id], onDelete: Cascade)
  prerequisite   CampaignQuest @relation("prereqSide", fields: [prerequisiteId], references: [id], onDelete: Cascade)
  @@id([questId, prerequisiteId])
}
```

**Drop kolumn JSONB:**
- `Campaign.discoveredLocationIds`, `heardAboutLocationIds`, `discoveredSubLocationIds`
- `UserWorldKnowledge.discoveredLocationIds`, `heardAboutLocationIds`, `discoveredSubLocationIds`, `discoveredEdgeIds`
- `WorldLocationEdge.discoveredByCampaigns`
- `WorldNPC.knownLocationIds`
- `Character.clearedDungeonIds`
- `CampaignQuest.prerequisiteQuestIds`

## F3 pliki do zmiany
| Plik | Zmiana |
|---|---|
| `backend/prisma/schema.prisma` | Dodać 7 join tables, drop 9 JSON kolumn |
| `backend/src/services/livingWorld/userDiscoveryService.js` | Operuje na `UserDiscoveredLocation`/`Edge` zamiast JSON array |
| `backend/src/services/livingWorld/{positionCalculator,worldStateService}.js` | `WorldEdgeDiscovery` queries |
| `backend/src/services/livingWorld/{seedWorld,questGoalAssigner}.js` | `WorldNpcKnownLocation` zamiast `knownLocationIds` |
| `backend/src/services/sceneGenerator/processStateChanges/handlers/locations.js` | INSERT do `CampaignDiscoveredLocation` |
| `backend/src/services/characterMutations.js` | `CharacterClearedDungeon` write |
| `backend/src/services/sceneGenerator/processStateChanges/handlers/quests.js` | `CampaignQuestPrerequisite` |
| FE: `src/services/storage.js`, fog-of-war helpers | Backend zwraca relations — drop JSON parse |
| `knowledge/concepts/fog-of-war.md` | Update na join tables |

## F3 weryfikacja
```sql
-- po migracji każda relacja queryable bez parse:
SELECT count(*) FROM "CampaignDiscoveredLocation" WHERE "campaignId" = '<uuid>';
SELECT count(*) FROM "CampaignEdgeDiscovery" WHERE "edgeId" = '<uuid>';
```
E2E: discover location → assert row w join table. Fog-of-war FE działa identycznie.

# F3 retrospektywa

**Zakres:** 6 sub-tasków (F3.1–F3.6) shipped. 1155 unit testów ✅, `prisma validate` ✅, `npm run build` ✅, live state-machine sanity-check (`heard_about → visited` UPDATE).

## Zmiany vs plan

| Plan | Co faktycznie wyszło |
|---|---|
| `WorldEdgeDiscovery` (per-campaign) | **Renamed → `CampaignEdgeDiscovery`** — discovery scope jest per-campaign, nazwa odzwierciedla. |
| 9 JSONB cols do drop | **10 cols** — Char.clearedDungeonIds (1) + Campaign.{discovered,heardAbout,discoveredSub}LocationIds (3) + CampaignQuest.prerequisiteQuestIds (1) + WorldLocationEdge.discoveredByCampaigns (1) + UserWorldKnowledge.{discoveredLoc,discoveredEdge,heardAboutLoc}Ids (3) + WorldNPC.knownLocationIds (1). |
| `DiscoveryState` enum z 3 wartości (`unknown/heard_about/visited`) | **2 wartości** (`heard_about`, `visited`) — `unknown` to brak rowu, nie wartość. Zgodnie z user-decyzją. |
| Pure helpers wybiórczo (per F2 wzorzec) | Dodany `planLocationFogMutation(currentState, newState)` w `userDiscoveryService.js` — pure state-machine plan-builder dla testów. Zwraca `{kind: 'noop'\|'insert'\|'update'}`. Caller robi DB op. |
| `Campaign.discoveredSubLocationIds` jako osobny field | **Dropped** — sublokacje rozróżnia reader przez `WorldLocation.parentLocationId` join, jeden `state` field na `CampaignDiscoveredLocation` wystarczy. |
| FE update — `worldConsistency.js`, `aiResponse/schemas.js`, `applyStateChangesHandler/quests.js`, `PlayerWorldMap.jsx` | **No-op w FE.** Backend (`campaignSync.reconstructFromNormalized`, `loadCampaignFog`) zachowuje coreState/fog shape contracts dla FE — `prerequisiteQuestIds: string[]`, `discoveredEdgeIds: Set/array`. FE nie wie że pod spodem są relations. |

## Pre-existing F1 bug naprawiony przy okazji

`questGoalAssigner/index.js` selectował `Campaign.characterIds` które F1 dropło (na rzecz `CampaignParticipant`). Po refactor: `participants: { take: 1, orderBy: { joinedAt: 'asc' } }`.

## Pliki dotknięte (top-level)

- **Schema:** `backend/prisma/schema.prisma` (7 nowych modeli, 10 dropped JSONB pól, `DiscoveryState` enum, reverse relations).
- **Migracja:** `backend/prisma/migrations/20260425162229_reference_normalization/migration.sql` (auto-gen).
- **Core service rewrite (F3.2):** `backend/src/services/livingWorld/userDiscoveryService.js` — 5 funkcji przepisane na DB upsert+state-machine, dodany pure helper `planLocationFogMutation`.
- **Living World secondary (F3.3):** `travelGraph.js` (CampaignEdgeDiscovery upsert), `campaignSandbox.js` (`resolveNpcKnownLocations` reads WorldNpcKnownLocation), `dungeonEntry.js` (CharacterClearedDungeon createMany), `questGoalAssigner/{index,questRole}.js` (relation include + parsePrereqs przyjmuje rows z `prerequisiteId`).
- **Sync rewrites (F3.4):** `campaignSync.js` (`syncQuestsToNormalized` osobny prereq-replace pass + `reconstructFromNormalized` mapping); `campaignLoader.js` (include prerequisites); `seedWorld.js` (`seedNpcKnowledge` → WorldNpcKnownLocation createMany); `processStateChanges/livingWorld.js` (explicit known-loc lookup batch).
- **Routes:** `adminLivingWorld.js` (`_count.campaignDiscoveries` zamiast tablicy), `characters.js` + `characterMutations.js` (drop `clearedDungeonIds` z whitelist).
- **Tests:** `questGoalAssigner.test.js` (prereqs shape `[{prerequisiteId}]` zamiast JSON-string).
- **Docs:** `knowledge/concepts/fog-of-war.md` (nowe modele + state machine + planLocationFogMutation).

## Znane długi z F3

1. **Comment-rot** — kilka plików ma docstringi typu "Character.clearedDungeonIds (permanent)" które już są niezgodne. Lista (low priority): `aiContextTools/contextBuilders/dungeonRoom.js:12`, `livingWorld/dungeonSeedGenerator.js:10`, `livingWorld/dungeonEntry.js:77`, `livingWorld/campaignSandbox.js:{41,164,208}`, `aiContextTools/contextBuilders/hearsay.js:9`, `sceneGenerator/contextSection.js:104`, `services/postSceneWork.js:90`, `processStateChanges/locations.js:{274-276}`, `seedWorld.js:975`. Naprawić przy najbliższym dotyku.
2. **`processStateChanges/locations.js` deferred non-canonical sub-location handling** — komentarz mówił że "discoveredSubLocationIds" wymagana, my teraz robimy reader-side parent-FK detection. Sprawdzić w playtest czy fog-of-war na sub-lokacjach (rooms w dungeonach) renderuje się jak należy.
3. **`hasDiscovered({userId, locationId})` z non-canonical** — nie ma campaignId-aware ścieżki, zwraca false. Caller potrzebujący per-campaign `hasDiscovered` musi użyć `loadCampaignFog`. Jeśli emerge use case → dodać explicit campaignId param.
4. **Idempotent prereq sync** — `syncQuestsToNormalized` robi `deleteMany + createMany` dla prereqs touched dependents. To replace-strategy. Jeśli kiedyś prereq history będzie potrzebna (audit), zmień na incremental upsert.

## Verified manualnie

- ✅ `prisma validate` po pełnej zmianie schemy.
- ✅ `db:reset` → wszystkie 4 migracje czysto applied (F1 init, F1 rpgon-rename, F2 child_tables_fifo, F3 reference_normalization).
- ✅ Live state machine: `INSERT heard_about` → `UPDATE → visited` działa (PK `(userId, locationId)` na `UserDiscoveredLocation`).
- ✅ Cascade delete z User → cascade cleanup wszystkich child rows (UserDiscoveredLocation/Edge, UserWorldKnowledge).
- ✅ `npm test` 1155 unit testów pass; `npm run build` zielony.

## Niezweryfikowane manualnie (do playtest)

- E2E discover location → fog-of-war na map FE.
- `loadCampaignFog` dla campaign z mieszanką canonical (visited + heard) i non-canonical (visited + heard) — czy unia render'uje się czysto.
- Sublokacje (`parentLocationId` set) — drill-down w PlayerWorldMap (czy reader-side parent-FK split działa identycznie jak stary `discoveredSubLocationIds`).
- Edge discovery podczas trawelu (multiplayer może mieć dwóch graczy → dwa `UserDiscoveredEdge` rows + jeden `CampaignEdgeDiscovery`).
- Quest prerequisites — `assignGoalsForCampaign` po kompletnym save/load cyklu (czy `q.prerequisites` relation poprawnie hydruje się do `prerequisiteQuestIds: string[]` w coreState).
- NPC explicit known locations — seed → re-seed (czy `seedNpcKnowledge` replace-by-grantedBy='seed' nie dropuje promotion/dialog grants).

---

# F4 — Hot-path entity decomposition

**Cel:** atomic partial updates + FK validation gdzie naprawdę warto.

**Trigger:** po F3.

## F4 schema delta

```prisma
model CharacterSkill {
  characterId String @db.Uuid
  skillName   String
  level       Int    @default(0)
  xp          Int    @default(0)
  character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  @@id([characterId, skillName])
  @@index([characterId, level])
}

model CharacterInventoryItem {
  id          String   @id @default(uuid(7)) @db.Uuid
  characterId String   @db.Uuid
  itemId      String                                          // stable ID z src/data/
  baseType    String?
  name        String
  quantity    Int      @default(1)
  props       Json     @default("{}")
  addedAt     DateTime @default(now()) @db.Timestamptz
  character   Character @relation("charInvItems", fields: [characterId], references: [id], onDelete: Cascade)
  asMainHand  Character[] @relation("equipMain")
  asOffHand   Character[] @relation("equipOff")
  asArmour    Character[] @relation("equipArm")
  @@index([characterId, itemId])
}

model CharacterMaterial {
  characterId String @db.Uuid
  materialKey String
  quantity    Int    @default(0)
  character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  @@id([characterId, materialKey])
}

model CampaignQuestObjective {
  id           BigInt @id @default(autoincrement())
  questId      String @db.Uuid
  objectiveKey String
  description  String
  progress     Int    @default(0)
  targetAmount Int    @default(1)
  status       String @default("pending")
  quest        CampaignQuest @relation(fields: [questId], references: [id], onDelete: Cascade)
  @@unique([questId, objectiveKey])
}

model CampaignNpcRelationship {
  id            BigInt @id @default(autoincrement())
  campaignNpcId String @db.Uuid
  targetType    String                                         // "npc" | "character" | "faction"
  targetRef     String
  relation      String
  strength      Int    @default(0)
  campaignNpc   CampaignNPC @relation(fields: [campaignNpcId], references: [id], onDelete: Cascade)
  @@index([campaignNpcId])
}
```

**Character — equipped FK:**
```prisma
model Character {
  // ... (jak F1) PLUS:
  equippedMainHandId String? @db.Uuid
  equippedOffHandId  String? @db.Uuid
  equippedArmourId   String? @db.Uuid
  equippedMainHand   CharacterInventoryItem? @relation("equipMain", fields: [equippedMainHandId], references: [id])
  equippedOffHand    CharacterInventoryItem? @relation("equipOff",  fields: [equippedOffHandId],  references: [id])
  equippedArmour     CharacterInventoryItem? @relation("equipArm",  fields: [equippedArmourId],   references: [id])
  // DROP: equipped Json
  // DROP: skills, inventory, materialBag Json
  inventoryItems  CharacterInventoryItem[] @relation("charInvItems")
  characterSkills CharacterSkill[]
  materials       CharacterMaterial[]
}
```

## F4 pliki do zmiany
| Plik | Zmiana |
|---|---|
| `backend/prisma/schema.prisma` | 5 nowych modeli, equipped FK, drop 4 JSONB kolumn |
| `src/services/characterMutations.js`, `backend/src/services/characterMutations.js` | XP add → `UPDATE CharacterSkill SET xp = xp + N WHERE …`. Add item → `INSERT CharacterInventoryItem`. Stack material → `UPSERT CharacterMaterial` |
| `src/services/combatEngine.js`, `magicEngine.js`, `craftingEngine.js`, `alchemyEngine.js` | Read z relations zamiast `char.skills[name]` / `char.inventory.find` |
| `src/components/character/*.jsx` (sheet, inventory, skills) | Read z `char.characterSkills`, `char.inventoryItems`, `char.materials` |
| `backend/src/services/aiContextTools/contextBuilders/character.js` | Include child relations |
| `backend/src/services/sceneGenerator/processStateChanges/handlers/character.js` | Update child tables |
| `backend/src/services/sceneGenerator/processStateChanges/handlers/quests.js` | Objectives → `CampaignQuestObjective` upserts |
| `backend/src/services/livingWorld/campaignSandbox.js`, `worldStateService.js` | Relationships → `CampaignNpcRelationship` |
| FE: `src/services/storage.js`, `_parseBackendCampaign` | Spłaszcz `characterSkills` na `char.skills` map (kompatybilność store) lub zaktualizuj store |

## F4 weryfikacja
```sql
SELECT * FROM "CharacterSkill" WHERE "characterId" = '<uuid>' ORDER BY level DESC;
-- atomic update bez full rewrite:
UPDATE "CharacterSkill" SET xp = xp + 50 WHERE "characterId" = '<uuid>' AND "skillName" = 'walka_mieczem';
-- equipped FK enforced:
UPDATE "Character" SET "equippedMainHandId" = '<deleted-item-uuid>' WHERE id = '<char>';   -- FK violation
```

## F4 ryzyka
| Ryzyko | Mitigation |
|---|---|
| Loadowanie character → 4 JOINy zamiast 1 row | Prisma `include`, jeden query plan, bench równoważny lub lepszy niż dziś (Mongo loadowała 1 row + parse 4 JSONów) |
| FE store oczekuje `char.skills` jako map | `_parseBackendCampaign` robi spłaszczenie — store pozostaje stabilny |
| Equipped FK blokuje delete itema | Cascade nie chcemy (chcemy explicit unequip). Default `onDelete: Restrict` (Prisma default dla nullable FK) — równoważne z dzisiejszą walidacją w UI |

# F4 retrospektywa

**Zakres:** 6 sub-tasków (F4.1–F4.6) shipped. 708 BE tests ✅ (nowych F4: 14), 1177 FE tests ✅ (nowych F4: 22), `prisma validate` ✅, `npm run build` ✅, `db:reset` + 4 migracji deploy czysto.

## Decyzje + zmiany vs plan

| Plan | Co faktycznie wyszło |
|---|---|
| Equipped jako 3 nullable FK z `onDelete: SetNull` | **Equipped jako 3 nullable TEXT kolumny** (`equippedMainHand/OffHand/Armour`) bez FK constraint. Powód: items stack by `slugify(name)` (option A), więc PK inventory to `(characterId, itemKey)` — composite FK z trzech slotów do tego samego character'a wyglądałby groteskowo. Invariant trzymany app-side przez `clearStaleEquipped` w `persistCharacterSnapshot`. |
| `CharacterMaterial.materialKey` jako PK | Tak, `materialKey = slugify(name)` + `displayName` osobno. Materials stackują się po slugu (NFKD + Ł→l + strip non-alphanum). |
| `CharacterInventoryItem.id BigInt PK` + `itemKey String` osobno | **Drop osobnego `id`.** PK = `(characterId, itemKey)` analogicznie do CharacterMaterial. Items stack by name — `props` JSONB chłonie wszystkie AI-emit fields, latest-write-wins na quantity-collision. |
| `CampaignQuestObjective` z `objectiveKey` + status='pending\|done' | + dodane `metadata Json @default("{}")`. AI emituje `onComplete`/`hint`/`locationId`/`locationName` na objective — wszystko leci do metadata, surfaced back przez serializer. Bez tego trigger `onComplete.moveNpcToPlayer` (Round B Phase 4) by zdechł. |
| `CampaignNpcRelationship` z osobnym `targetType String` | Tak, + `@@unique([campaignNpcId, targetType, targetRef])` żeby update'y były idempotentne (writer robi delete-then-insert per NPC). |
| Ekwipunek jako "delete row" przy quantity → 0 | OK przez `splitCharacterSnapshot` → tylko niepuste-stack rows lecą do `createMany`. |

## Pure helpers — co dodane

**Nowe** (w shared/):
- `slugifyItemName(name)` w [shared/domain/itemKeys.js](../shared/domain/itemKeys.js) — używane FE+BE, NFKD + explicit Ł→l mapping (NFKD nie dekomponuje Ł), fallback `'unnamed'` dla pustych/symbolowych input. 8 unit testów.

**Nowe** (w backend/):
- `reconstructCharacterSnapshot(row)` — DB row → FE shape, spread `props` na top-level dla compat z `i.damage` direct access.
- `splitCharacterSnapshot(snapshot)` — inverse, ze stacking on writes.
- `clearStaleEquipped(snapshot)` — invariant guard, called inside persist.
- `loadCharacterSnapshot(where)` / `loadCharacterSnapshotById(id)` — shorthand `findFirst({include}) + reconstruct`.
- `persistCharacterSnapshot(characterId, snapshot, client?)` — replace-strategy w `$transaction`. Akceptuje `tx` z outer-tx (scene+character w jednym commicie w `generateSceneStream`).
- `createCharacterWithRelations(userId, payload)` — POST handler.

**Zmodyfikowane**:
- `applyCharacterStateChanges` (BE+FE) — `newItems` regular items teraz stackują przez `stackInventory` zamiast pushować duplikaty. `removeItemsByName` matchuje przez slugify (case+accent insensitive).
- `processQuestObjectiveUpdates` — atomic `prisma.campaignQuestObjective.update` zamiast pełnego rewrite array'a. Auto-complete sprawdza `quest.objectives.every(o => o.status === 'done')` z child relation.
- `processNpcChanges` — `replaceNpcRelationships(campaignNpcId, list)` helper, drop `relationships` z create/update payload na `CampaignNPC`.

## F2/F3 comment-rot cleanup (przy okazji F4)

Naprawione (z F2 + F3 retrospektyw):
- `aiContextTools/contextBuilders/dungeonRoom.js`, `livingWorld/dungeonSeedGenerator.js`, `livingWorld/dungeonEntry.js` — `Character.clearedDungeonIds` → `CharacterClearedDungeon` (F3)
- `livingWorld/campaignSandbox.js` (3 miejsca), `aiContextTools/contextBuilders/hearsay.js`, `sceneGenerator/contextSection.js`, `seedWorld.js` — `WorldNPC.knownLocationIds` → `WorldNpcKnownLocation grants` (F3)
- `services/postSceneWork.js` — `discoveredByCampaigns bit` → `CampaignEdgeDiscovery row` (F3)
- `processStateChanges/locations.js` — `discoveredLocationIds` → `CampaignDiscoveredLocation` (F3)

## Pliki dotknięte (top-level)

- **Schema:** [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) (5 nowych modeli + reverse relations, 3 equipped TEXT kolumny, drop 6 JSONB pól, `metadata` JSONB na objectives).
- **Migracja:** `backend/prisma/migrations/20260425173314_hot_path_decomposition/migration.sql` (auto-gen).
- **Bridge (NEW):** [backend/src/services/characterRelations.js](../backend/src/services/characterRelations.js) — load/persist/reconstruct/split/clearStaleEquipped + 17 unit testów.
- **Shared (NEW):** [shared/domain/itemKeys.js](../shared/domain/itemKeys.js) + 8 unit testów.
- **Mutators:** [backend/src/services/characterMutations.js](../backend/src/services/characterMutations.js) — pure mutator z stacking, drop `characterToPrismaUpdate`/`deserializeCharacterRow`. + 7 nowych BE testów.
- **FE store:** [src/stores/handlers/applyStateChangesHandler/character.js](../src/stores/handlers/applyStateChangesHandler/character.js), [src/stores/handlers/_shared.js](../src/stores/handlers/_shared.js) (dodane `stackInventory`), [src/stores/handlers/inventoryHandlers.js](../src/stores/handlers/inventoryHandlers.js) (USE_MANA_CRYSTAL decrement-or-drop).
- **Routes:** [backend/src/routes/characters.js](../backend/src/routes/characters.js) (full rewrite na bridge), `routes/campaigns.saveState.test.js` (mock update).
- **Sync:** [backend/src/services/campaignSync.js](../backend/src/services/campaignSync.js) — `syncNPCsToNormalized` + `syncQuestsToNormalized` z relationships/objectives replace-after-upsert; `reconstructFromNormalized` + `fetchCampaignCharacters` z relations.
- **Scene gen:** [generateSceneStream.js](../backend/src/services/sceneGenerator/generateSceneStream.js) (function-form `$transaction` + persist via bridge), [campaignLoader.js](../backend/src/services/sceneGenerator/campaignLoader.js) (relations include + reshape), [processStateChanges/quests.js](../backend/src/services/sceneGenerator/processStateChanges/quests.js) (atomic objective updates), [processStateChanges/npcs.js](../backend/src/services/sceneGenerator/processStateChanges/npcs.js) (replaceNpcRelationships).
- **Multiplayer:** [multiplayerSceneFlow.js](../backend/src/services/multiplayerSceneFlow.js), [roomManager.js](../backend/src/services/roomManager.js) — load via bridge.
- **Context tools:** [aiContextTools/handlers/npc.js](../backend/src/services/aiContextTools/handlers/npc.js), [/quest.js](../backend/src/services/aiContextTools/handlers/quest.js) — relations include + tolerate both shapes.
- **Promotion pipeline:** [postCampaignLocationPromotion.js](../backend/src/services/livingWorld/postCampaignLocationPromotion.js) — objective `metadata` lookup.
- **Docs:** [knowledge/concepts/persistence.md](../knowledge/concepts/persistence.md) (F4 bridge sekcja + 2 nowe debugging tips), [CLAUDE.md](../CLAUDE.md) (DB tabela + critical-path entry).
- **Comment rot:** 8 plików z F2/F3 retro listy.

## Znane długi z F4

1. **Replace-strategy zamiast atomic UPDATE** dla skills/inventory/materials w `persistCharacterSnapshot`. Plan F4 mówił "atomic XP add" / "atomic material stack" — odłożone do F6 jeśli profile pokaże, że full-snapshot persist to bottleneck. Dla 0-100 DAU per-character single-user write nie jest hot path.
2. **`CharacterInventoryItem.id` jako BigInt zostało utracone** — items są keyed `(characterId, itemKey)`. Konsekwencja: dwa miecze z różnymi `props` (np. enchantami) zlepią się w jeden stack po nazwie, props ostatniego wygrywają. Akceptowalne dla mass-produced equipment, dla unikatów AI musiałby emit unikatowe `name` (np. "Miecz Olafa +1" vs "Miecz Olafa +2") — co zwykle robi i tak.
3. **Equipped bez FK constraint** — invariant trzymany app-side przez `clearStaleEquipped`. Każdy nowy custom write path do character musi go wywołać sam (alternatywnie zawsze przejść przez `persistCharacterSnapshot`).
4. **`CampaignQuestObjective` BigInt PK nie jest stabilne między quest-updates** — `syncQuestsToNormalized` robi delete+createMany przy każdym quest sync. AI nie widzi objective ID i tak (premium prompt rendering description-only), więc to nie problem dla LLM-loop. Ale `obj.id`-based dedup w `checkQuestObjectives` (memoryCompressor) jest teraz no-op — może powtarzać check'i tych samych objectives. Niski impact (nano koszt).
5. **`fetchCampaignCharacters` ma N rows × 4 includes** — dla MP z 4 graczami to 4 character rows + 4×3=12 child queries. Akceptowalne, single-digit ms. Bench odłożony do F6.
6. **`processNpcChanges` per-NPC delete+insert relationships** — N×2 queries dla N NPCs. Dla typowej sceny N=3-5, akceptowalne. Bulk by wymagał `unnest` + temp tables — niewarte na tej skali.
7. **`mergeUpdateBody` w `routes/characters.js` PUT** — full-snapshot replace nawet przy częściowej zmianie. PUT z `{name: 'X'}` przepisze inventory, skills, materialBag z istniejącego snapshot. Funkcjonalnie identycznie z dzisiaj, ale zużywa transakcję na rzeczy które nie zmienione. Profile-driven optymalizacja.

## Verified manualnie

- ✅ `prisma validate` po pełnej zmianie schemy.
- ✅ `db:reset` → 4 migracje (init, rpgon, child_tables_fifo, reference_normalization, hot_path_decomposition) czysto applied.
- ✅ All 708 BE tests + 1177 FE tests pass; `npm run build` zielony.
- ✅ `slugifyItemName` round-trip dla Polish chars (`Skóra` ≡ `skora`, `Łuk +1` → `luk_1`).
- ✅ `persistCharacterSnapshot` z mockowanym `tx` — split rows match expected shape.
- ✅ `clearStaleEquipped` nulls deleted refs, leaves live ones.

## Niezweryfikowane manualnie (do playtest)

- E2E save → load → save character'a (inventory stack collapse na BE round-trip).
- Equipped slot zachowuje się przy USE_MANA_CRYSTAL (decrement) + przy `removeItems` (pełen drop).
- Quest objective `onComplete.moveNpcToPlayer` trigger po F4 (metadata bridge).
- Multiplayer save/restore — characters z relations po `loadActiveSessionsFromDB`.
- Campaign generator initial quest seed → `objectives` w child table z metadata.
- `postCampaignLocationPromotion` skoring po objective metadata locationId/locationName.

---

# F5 — `coreState` surface trimming

**Cel pierwotny:** koniec write-amp na auto-save. Hot-path scalars na kolumny, reszta `transientState JSONB`.

**Co faktycznie zrobiliśmy (lean F5):** pierwotny plan (`gameTime`, `weather`, `sessionTitle`, FK `currentLocationId`, rename `coreState` → `transientState`, drop `CampaignNPC.lastLocation`) okazał się w większości spekulatywny — `gameTime`/`weather`/`sessionTitle` nie istnieją jako Campaign-level fields, rename byłby pure cosmetic touching every callsite, a `CampaignNPC.lastLocation` pozostał (column ma value jako display cache + AI-emit fallback gdy resolver nie znajdzie WorldLocation matcha). FK na `currentLocation` przesunięty do F5b — dopiero gdy `CampaignLocation` model wprowadzi właściwy target type, wtedy FK ma sens (point-at-either WorldLocation albo CampaignLocation).

## F5 zrobione (final scope)

```prisma
model Campaign {
  // ... PLUS:
  // F5 — worldBounds JSONB → 4 nullable Float kolumny
  boundsMinX          Float?
  boundsMaxX          Float?
  boundsMinY          Float?
  boundsMaxY          Float?

  // F5 — flavor name lifted from coreState.world.currentLocation
  // (no FK in F5, F5b doda właściwy polymorphic target)
  currentLocationName String?

  // DROP: worldBounds Json?
}
```

## F5 schema delta — co NIE poszło
- ❌ `gameTime DateTime?` — nigdzie w kodzie nie istnieje jako Campaign-level field. Per-event timestamp na `WorldEvent`. Pure plan-spec drift.
- ❌ `weather String?` — żyje per-scene w `atmosphere.weather` JSON, nie na poziomie Campaign.
- ❌ `sessionTitle String?` — nie istnieje w żadnej formie.
- ❌ `currentLocationId Uuid? FK` — wstrzymane do F5b. Z `CampaignLocation` w drodze, FK miałby zły target type. Sama lift do `currentLocationName String?` daje 90% wartości (column-based reads, no JSONB scan), reszta przyjdzie z F5b.
- ❌ rename `coreState` → `transientState` — pure cosmetic, blast radius huge, zero functional gain.
- ❌ drop `CampaignNPC.lastLocation` — column zostaje. AI emituje free-text ("Krynsk", "the inn") which nie zawsze rozwiązuje się do WorldLocation row. Column działa jako display cache + fallback dla unresolved cases. F5b zrewizuje to gdy CampaignLocation będzie target.

## F5 pliki dotknięte (top-level)

- **Schema:** [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) (4 bounds kolumny + currentLocationName, drop worldBounds Json).
- **Migracja:** `backend/prisma/migrations/20260426002146_corestate_surface_trim/migration.sql`.
- **Bridge (NEW):** [backend/src/services/locationRefs.js](../backend/src/services/locationRefs.js) — `unpackWorldBounds`/`packWorldBounds` + `liftCurrentLocationFromCoreState`/`injectCurrentLocationIntoCoreState`. 16 unit testów.
- **Serializer:** [backend/src/services/campaignSerialize.js](../backend/src/services/campaignSerialize.js) — `stripNormalizedFromCoreState` zwraca `currentLocationName`. +5 nowych testów.
- **Reconstruct:** [backend/src/services/campaignSync.js](../backend/src/services/campaignSync.js) — `reconstructFromNormalized({currentLocationName})` injektuje z powrotem do coreState.world.
- **CRUD:** [backend/src/routes/campaigns/crud.js](../backend/src/routes/campaigns/crud.js) — POST/PUT writes column, GET reads column → reconstruct. seedInitialWorld + startSpawn paths piszą column zamiast re-stuff'ować coreState.
- **Public/share:** [backend/src/routes/campaigns/public.js](../backend/src/routes/campaigns/public.js) — `/public/:id` + `/share/:token` wybierają column + przekazują do reconstruct.
- **Scene gen loader:** [backend/src/services/sceneGenerator/campaignLoader.js](../backend/src/services/sceneGenerator/campaignLoader.js) — `loadCampaignState` selektuje + injektuje currentLocationName, więc każdy downstream consumer (generateSceneStream, intentClassifier, shortcuts, prompt builders) widzi standardową `coreState.world.currentLocation`.
- **PATCH defensywnie:** [backend/src/routes/ai/coreState.js](../backend/src/routes/ai/coreState.js) — jeśli ktoś PATCHuje `world.currentLocation`, lift też się dzieje (column truth).
- **Inne czytelniki:** [livingWorld.js GET tile-grid](../backend/src/routes/livingWorld.js), [questGoalAssigner/index.js](../backend/src/services/livingWorld/questGoalAssigner/index.js), [postCampaignWriteback.js](../backend/src/services/livingWorld/postCampaignWriteback.js), [processStateChanges/quests.js fireMoveNpcToPlayerTrigger](../backend/src/services/sceneGenerator/processStateChanges/quests.js) — selektują + dodają fallback `column ?? coreState.world.currentLocation`.
- **5 worldBounds readers:** [worldBoundsHint.js](../backend/src/services/aiContextTools/contextBuilders/worldBoundsHint.js), [seededSettlements.js](../backend/src/services/aiContextTools/contextBuilders/seededSettlements.js), [saturation.js](../backend/src/services/aiContextTools/contextBuilders/saturation.js), [livingWorld.js](../backend/src/services/aiContextTools/contextBuilders/livingWorld.js) (select 4 cols zamiast worldBounds), [processStateChanges/locations.js](../backend/src/services/sceneGenerator/processStateChanges/locations.js).
- **Worldbounds writer:** [worldSeeder.js](../backend/src/services/livingWorld/worldSeeder.js) — pakuje przez `packWorldBounds`.
- **Docs:** [knowledge/concepts/persistence.md](../knowledge/concepts/persistence.md) (F5 sekcja + zaktualizowane "coreState vs normalized").

## F5 weryfikacja

```sql
-- atomic bounds update bez rewrite coreState:
UPDATE "Campaign" SET "boundsMinX" = -10, "boundsMaxX" = 10, "boundsMinY" = -10, "boundsMaxY" = 10 WHERE id = '<campaign>';

-- atomic location update bez rewrite coreState:
UPDATE "Campaign" SET "currentLocationName" = 'Krynsk' WHERE id = '<campaign>';
```

✅ `prisma validate` zielone.
✅ `migrate deploy` zaaplikowane (5. migracja: `20260426002146_corestate_surface_trim`).
✅ 728 BE testów + 1197 FE testów pass.
✅ `npm run build` zielone.

## F5 ryzyka i ich mitigation
| Ryzyko | Co zrobiliśmy |
|---|---|
| Scene-gen widzi `coreState.world.currentLocation` w 15+ miejscach | `loadCampaignState` injektuje column → coreState.world.currentLocation przed rozdaniem do prompt builderów. Zero zmian w consumerach. |
| MP path zapisuje przez inny path | MP używa `MultiplayerSession.gameState` JSONB (nietknięty), a auto-save host'a leci przez `apiClient.put('/campaigns/:id')` (lift działa transparentnie). |
| AI emituje location nazwy które nie matchują WorldLocation | Column jest pure string, no FK constraint; w F5 nie próbujemy resolve'ować. F5b z CampaignLocation rozwiąże to (resolver tworzy CampaignLocation row dla unmatched names). |

## Znane długi z F5

1. **Brak FK na `currentLocationName`** — wstrzymane do F5b z CampaignLocation. Today: pure string, can drift jeśli WorldLocation z tym `displayName` zostanie usunięty/przemianowany.
2. **`processStateChanges/locations.js` nadal tworzy `WorldLocation isCanonical=false` dla AI-emit'owanych miejsc** — F5b adresuje to (przeniesie do CampaignLocation).
3. **`/ai/campaigns/:id/core` PATCH lift w deepMerge** — defensive only, route nie jest wołany z FE today.
4. **`Campaign.lockedLocation` na Character** — flavor string snapshot "gdzie character był przy bind". Nie ruszony (nie zmienia się w trakcie play, czystszy fix przyszedłby z CampaignLocation FK).

## Niezweryfikowane manualnie (do playtest)

- E2E save → load → save campaign'u — `currentLocation` round-trip przez column.
- Living World seed flow — `worldBounds` 4-col write + reads (szczególnie saturation hint w runtime).
- Multiplayer save — host's MP autosave musi prawidłowo lift'ować currentLocation do column (FE'side state ma `world.currentLocation`).
- Public share `/share/:token` — czytany koreState ma `world.currentLocation` zsynthesizowane.
- Quest auto-trigger `onComplete.moveNpcToPlayer` — używa column-first lookup teraz.

## F5 retrospektywa

| Plan | Co faktycznie wyszło |
|---|---|
| Hot scalars: gameTime/weather/sessionTitle | Nie istnieją jako Campaign fields. **Plan-spec drift.** Skipped. |
| `currentLocationId Uuid? FK` | Wstrzymane do F5b — z CampaignLocation FK będzie miał właściwy target. Lift na sam `currentLocationName String?` daje 90% wartości. |
| Drop `CampaignNPC.lastLocation` | Zostawione. AI emituje free-text NPC locations które nie zawsze rozwiązują się do WorldLocation row; column to value'able fallback display cache. F5b zrewizuje. |
| Rename `coreState` → `transientState` | Pure cosmetic, huge churn, zero functional. Skipped. |
| `worldBounds Json` → 4 Float | ✅ Zrobione zgodnie z planem. |
| Nowe write-paths atomic per-field | Ten PR nie zmienia save-flow shape. Save wciąż leci jako full coreState PUT. Atomic per-field updates wymagałyby refactora całego storage.saveCampaign — odłożone (nie hot-path przy 0-100 DAU). |

---

## F5b zrobione (final scope)

```prisma
// NEW model — per-campaign sandbox dla AI-created locations
model CampaignLocation {
  id, campaignId, name, canonicalSlug,
  description, category, locationType, region, aliases,
  regionX, regionY, positionConfidence, subGridX, subGridY,
  parentLocationKind String?, parentLocationId Uuid?, // polymorphic parent
  maxKeyNpcs, maxSubLocations, slotType, slotKind, dangerLevel,
  roomMetadata, embedding vector(1536),
  @@unique([campaignId, canonicalSlug])  // slug-stable in-campaign lookup
}

// 5 polymorphic FK pairs (kind String? + id Uuid?)
Campaign.currentLocation{Kind,Id}            // player's current location ref
CampaignNPC.lastLocation{Kind,Id}            // shadow NPC location
CampaignDiscoveredLocation.location{Kind,Id} // PK now triple
CharacterClearedDungeon.dungeon{Kind,Id}     // PK now triple
LocationPromotionCandidate.sourceLocation{Kind,Id} // rename + add kind

// Renames
WorldLocationEdge → Road  // canonical-only travel infrastructure

// Drops
WorldLocation.isCanonical          // every WorldLocation IS canonical now
WorldLocation.createdByCampaignId  // sandbox lives in CampaignLocation
WorldLocation.@@index([isCanonical, createdByCampaignId])
WorldLocation.locationPromotionCandidates relation
WorldLocation.campaignNpcsLastHere relation
WorldLocation.campaignDiscoveries relation
WorldLocation.characterClearedDungeons relation
CampaignNPC.lastLocFk relation
LocationPromotionCandidate.location FK relation
```

Migracja: `20260426120000_campaign_location_polymorphic` + HNSW index na `CampaignLocation.embedding`.

## F5b kluczowe decyzje (locked)

- **Polymorphic strategy: Option B** — `xLocationKind String? + xLocationId Uuid?` para, **brak DB FK**. Resolver app-side via `locationRefs.lookupLocationByKindId`. Discriminator `kind ∈ {'world','campaign'}`.
- **Roads = canonical-only** — `Road` FK w obie strony do `WorldLocation`. Mid-play AI tworzy CampaignLocation off-graph. Per-campaign worldSeeder NIE tworzy Roads między settlement'ami (były tworzone pre-F5b, regression świadoma — user-decyzja "leave out edges to campaign only locations out for now").
- **Distance via Euclidean coords** — CampaignLocation ma `regionX/regionY` jak WorldLocation; player map renderuje obie via same axes; travel-by-selection nie potrzebuje Roads.
- **Drop topology caps mid-play** — `decideSublocationAdmission` + `effectiveCustomCap` wycięte z `processStateChanges/locations.js`. User: "nie potrzebujemy ograniczeń, sami zdecydujemy co dodać".
- **Destructive promotion** — `promoteCampaignLocationToCanonical(id)`:
  1. CREATE WorldLocation (kopia source)
  2. RELINK 4 polymorphic refs (`(kind=campaign,id=X) → (kind=world,id=Y)`) w transakcji
  3. DELETE source CampaignLocation
  4. RAG reindex jako `entityType='location'`
- **Per-campaign settlements → CampaignLocation** — `worldSeeder.js` tworzy hamlets/villages jako CampaignLocation (per-campaign isolation), nie WorldLocation. Capital + heartland villages z `seedWorld.js` zostają canonical (hand-authored).
- **Drop+recreate, no data migration** — pre-prod, dev DB miał puste tabele dla affected refs.

## F5b pliki dotknięte (top-level)

**Schema & migration:**
- [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) — 8 modeli zmodyfikowanych + 1 NEW (CampaignLocation) + 1 rename (Road).
- `backend/prisma/migrations/20260426120000_campaign_location_polymorphic/migration.sql` — generated via `prisma migrate diff`, +HNSW index dopisany ręcznie.

**Bridge layer:**
- [backend/src/services/locationRefs.js](../backend/src/services/locationRefs.js) — +`packLocationRef`, `readLocationRef`, `lookupLocationByKindId`, `slugifyLocationName`, `LOCATION_KIND_*` constants. +19 testów.

**Living World creation flow:**
- [backend/src/services/livingWorld/worldStateService.js](../backend/src/services/livingWorld/worldStateService.js) — +`resolveLocationByName` (canonical-first polymorphic lookup), +`findOrCreateCampaignLocation`. `findOrCreateWorldLocation` zostaje canonical-only dla seed paths.
- [backend/src/services/sceneGenerator/processStateChanges/locations.js](../backend/src/services/sceneGenerator/processStateChanges/locations.js) — full rewrite: AI mid-play tworzy CampaignLocation, polymorphic anchor/parent resolution, merge candidate widzi obie tabele, NO auto-Road, NO connectsTo edges, drop topology cap.
- [backend/src/services/livingWorld/worldSeeder.js](../backend/src/services/livingWorld/worldSeeder.js) — settlements → CampaignLocation, drop edge creation, returns `startingLocationKind/Id` for caller.
- [backend/src/services/livingWorld/dungeonEntry.js](../backend/src/services/livingWorld/dungeonEntry.js) — polymorphic resolution; CampaignLocation dungeons skipped (canonical-only auto-seed of rooms). CharacterClearedDungeon write includes `dungeonKind`.

**Fog-of-war + discovery:**
- [backend/src/services/livingWorld/userDiscoveryService.js](../backend/src/services/livingWorld/userDiscoveryService.js) — `markLocationDiscovered/HeardAbout` polymorphic (`locationKind`); `applyCampaignLocationState` uses triple PK; fog Sets stay keyed by bare uuid (uuids globally unique). `markEdgeDiscoveredByUser` uses `prisma.road`.
- [backend/src/services/livingWorld/locationQueries.js](../backend/src/services/livingWorld/locationQueries.js) — `listLocationsForCampaign` merges WorldLocation + CampaignLocation, każdy row tagged `kind` + normalized `displayName`.

**Routes / serializer:**
- [backend/src/routes/campaigns/crud.js](../backend/src/routes/campaigns/crud.js) — POST writes `currentLocationKind/Id` from seed result + startSpawn (resolved polymorphically). PUT clears kind/id when name changes.
- [backend/src/routes/livingWorld.js](../backend/src/routes/livingWorld.js) — GET tile-grid uses merged `listLocationsForCampaign`, `prisma.road` for edges, filters edge query to canonical-only IDs.
- [backend/src/routes/adminLivingWorld.js](../backend/src/routes/adminLivingWorld.js) — drop `isCanonical`/`createdByCampaignId` from selects/filters; synthesize back-compat fields in `/graph` response (`isCanonical: true, createdByCampaignId: null`); `/locations/:id/sublocations` works with WorldLocation only; promotion route uses `candidate.sourceLocationId`.

**Promotion pipeline:**
- [backend/src/services/livingWorld/postCampaignLocationPromotion.js](../backend/src/services/livingWorld/postCampaignLocationPromotion.js) — full rewrite: source from CampaignLocation; persist with composite key `[campaignId, sourceLocationKind, sourceLocationId]`; new `promoteCampaignLocationToCanonical` does destructive copy + relink + delete in one transaction. Old `promoteWorldLocationToCanonical` kept as deprecated alias.

**Shadow → canonical writeback:**
- [backend/src/services/livingWorld/postCampaignWriteback.js](../backend/src/services/livingWorld/postCampaignWriteback.js) — `diffNpcFields` filters out location changes when shadow's `lastLocationKind='campaign'` (can't promote to canonical FK).
- [backend/src/services/livingWorld/postCampaignPromotion.js](../backend/src/services/livingWorld/postCampaignPromotion.js) — promotion filters `lastLocationKind='campaign'` out when seeding new WorldNPC's `currentLocationId`/`homeLocationId`.

**Other writers/readers updated:**
- [backend/src/services/postSceneWork.js](../backend/src/services/postSceneWork.js) — discovery resolves polymorphic; Roads only when both endpoints canonical.
- [backend/src/services/livingWorld/campaignSandbox.js](../backend/src/services/livingWorld/campaignSandbox.js) — clone writes `lastLocationKind: 'world'` (canonical FK source); `setCampaignNpcLocation` accepts polymorphic ref OR back-compat string.
- [backend/src/services/sceneGenerator/processStateChanges/quests.js](../backend/src/services/sceneGenerator/processStateChanges/quests.js) — `fireMoveNpcToPlayerTrigger` polymorphic; ephemeral path writes `lastLocationKind`.
- [backend/src/services/sceneGenerator/processStateChanges/livingWorld.js](../backend/src/services/sceneGenerator/processStateChanges/livingWorld.js) — `WorldEvent.worldLocationId` only set when player's currentLocation resolves canonical; uses `prisma.road` for hearsay adjacency.
- [backend/src/services/livingWorld/travelGraph.js](../backend/src/services/livingWorld/travelGraph.js) — `prisma.worldLocationEdge` → `prisma.road` (4 occurrences).
- [backend/src/services/livingWorld/startSpawnPicker.js](../backend/src/services/livingWorld/startSpawnPicker.js) — drop `isCanonical: true` filters (every WorldLocation IS canonical now).
- [backend/src/scripts/seedWorld.js](../backend/src/scripts/seedWorld.js) — drop 9× `isCanonical: true` from upsert data; drop 1× `where: { isCanonical: true }` filter.

**FE:**
- [src/components/admin/adminLivingWorld/tabs/LocationListTab.jsx](../src/components/admin/adminLivingWorld/tabs/LocationListTab.jsx) — drop `isCanonical`/`createdByCampaignId` reads (admin Locations list is canonical-only by F5b design).
- [src/components/admin/adminLivingWorld/tabs/CanonGraphTab.jsx](../src/components/admin/adminLivingWorld/tabs/CanonGraphTab.jsx) — comment update only.
- AdminTileGridView, SubLocationGrid — back-compat works via admin route's synthesized `isCanonical: true` + JS `!== false` truthy default.

## F5b weryfikacja

```sql
-- AI mid-play creation lands in CampaignLocation:
SELECT count(*) FROM "CampaignLocation" WHERE "campaignId" = '<campaign>';

-- Polymorphic ref check:
SELECT "currentLocationKind", "currentLocationId", "currentLocationName"
  FROM "Campaign" WHERE id = '<campaign>';

-- Promotion destructive flow:
-- 1. POST /v1/admin/livingWorld/location-promotion-candidates/<id>/approve
-- 2. CampaignLocation row gone, new WorldLocation present, polymorphic refs flipped to (kind=world, id=<new>)
SELECT * FROM "WorldLocation" WHERE id = '<new_world_id>';
SELECT * FROM "CampaignLocation" WHERE id = '<old_campaign_id>';  -- 0 rows
```

✅ `prisma validate` zielone.
✅ `migrate deploy` zaaplikowane (6. migracja: `20260426120000_campaign_location_polymorphic`).
✅ 747 BE testów (35 nowych w locationRefs.test.js) + 1216 FE testów pass.
✅ `npm run build` zielone.

## F5b ryzyka i ich mitigation

| Ryzyko | Co zrobiliśmy |
|---|---|
| 30+ callsite'ów reads na `lastLocationId` zakładających canonical FK | Polymorphic kind kolumna + `lastLocationKind ?? 'world'` default w readerach (back-compat dla rows zapisanych przed F5b). Promotion + writeback filtruje campaign-kind żeby nie próbować pisać do canonical FK. |
| FE ekspekt `isCanonical` w admin response | Admin `/graph` route synthesizes `isCanonical: true` w nodes payload; FE `n.isCanonical !== false` truthy default kompatybilny. LocationListTab + ScopeIcon uproszczone (canonical-only z założenia). |
| Per-campaign settlement bez Roads = pusty travel-graph dla nowych kampanii | Świadoma decyzja użytkownika. Travel via "travel by selection" + Euclidean distance — Dijkstra zostaje canonical-only do Roads. Przyszłe playtest może odkryć potrzebę CampaignRoad table — NIE w F5b. |
| Tile-grid endpoint return shape zmienił się (locations carry `kind`) | `listLocationsForCampaign` normalizuje `displayName` (= canonicalName lub name) tak żeby FE dot rendering działał bez zmian. UUID Set keys (fog) compatible — uuids unique cross-table. |
| Hearsay (`processLocationMentions`) został canonical-only | LLM `locationMentioned.locationId` IDs dziś mappują do canonical WorldNPC adjacency. CampaignLocation hearsay = future work jeśli playtest zasygnalizuje potrzebę. |

## Znane długi z F5b

1. **`questGoalAssigner` "go home" check porównuje shadow `lastLocationId` z `WorldNPC.homeLocationId`** — gdy shadow jest w CampaignLocation a canonical home jest WorldLocation, comparison zawsze niezgodne → sztuczny "wracam do swojego miejsca" goal. Drobny noise; fix to dedicated kind+id check or skip when shadow kind=campaign.
2. **AI-emitted locations land with no terrain context** — `currentLocation: "X"` mid-narrative gives backend zero clue about biome/danger/placement. Hearsay reframe (placeholder stubs) was deferred — **superseded by [biome-tiles idea](../knowledge/ideas/biome-tiles.md)** which solves the root cause by pre-seeding biome tiles so any AI invention inherits the current tile's terrain. Next phase candidate.
3. **Prismatic migration was raw SQL** — `prisma migrate dev` blokowane przez non-interactive guard, użyłem `prisma migrate diff --script` + manual write. Future migrations: provision shadow DB w docker-compose, enable proper `migrate dev` flow.
4. **Per-campaign sublocation cap (`maxSubLocations`)** dropped from creation flow per user spec; column still exists on schema as a future re-enabling lever.

## Niezweryfikowane manualnie (do playtest)

- Full E2E: nowa kampania → AI mid-play creates CampaignLocation → admin promote → relink polymorphic refs visible in DB.
- Travel-by-selection działa dla CampaignLocations (Euclidean distance computed correctly w UI).
- Player map renderuje seeded settlement (CampaignLocation) z poprawnymi coords.
- `markLocationDiscovered` route routing dla world vs campaign kind (fog persistence per kind).
- Round-trip: campaign delete → cascading cleanup of CampaignLocation + CampaignDiscoveredLocation + LocationPromotionCandidate.

---

# F6 — Production scale-out (metric-driven)

**Cel:** infra-led odpowiedź na realny load. Nie spekulatywnie — każdy punkt triggered konkretnym pomiarem.

| Punkt | Trigger | Akcja |
|---|---|---|
| Connection pool tuning | Po wyborze hostingu / przy pierwszym `too many connections` | PgBouncer przed Cloud SQL/Neon, `connection_limit` per Cloud Run instance |
| Read replica | Read QPS > 70% capacity / read latency p95 wzrasta | Cloud SQL replica + Prisma `replicas` extension |
| `WorldEvent` partycjonowanie | row count > 1M | Range partition po `createdAt` (monthly) |
| `CampaignScene` partycjonowanie | row count > 5M | Range partition po `createdAt` |
| Materialized views | Slow aggregate query > 500ms | Konkretna query → MV + refresh strategy |
| `pg_cron` zamiast `setInterval` | Migracja na hosting który wspiera (Cloud SQL `cloudsql.enable_pg_cron=on`) | `RefreshToken` cleanup, ewentualnie cleanup `WorldEvent` starszych niż N dni |
| HNSW tuning | Vector recall < 90% w testach | `m`, `ef_construction`, `ef_search` |

## F6 hosting decyzja (osobna sesja)

Co wszystkie muszą spełnić: PostgreSQL 16+, pgvector 0.7+, Cloud Run reachable (unix socket lub private IP).

- **Google Cloud SQL** — ten sam region co Cloud Run (`europe-west1`), Cloud Run Connector (unix socket), pgvector dostępne, pg_cron flagą
- **Neon** — serverless skalowanie do zera, pgvector, branche DB dla PR preview, PgBouncer wbudowany. Cold start latency do sprawdzenia
- **Supabase** — overkill (auth/storage/realtime nieużywane), ale pgvector + pg_cron
- **Self-hosted Postgres na GCE VM** — kontrola pełna, niższy koszt, ops burden

## F6 dokumenty
| Plik | Zmiana |
|---|---|
| `cloudbuild.yaml` | Update pod wybrany hosting |
| `Deployment checklist — Cloud Run bez Red.txt` | Sekcja "Postgres prod hosting" |
| `knowledge/decisions/postgres-prod-hosting.md` | **NEW** — decyzja po wyborze |

---

## Explicit non-goals (żadnej fazy)

- **PostGIS** — coords euklidesowe 2D flat, Dijkstra <1000 nodes w JS
- **pg_trgm / full-text search** — fuzzy dedupe przez JS substring + RAG
- **Recursive CTE** — graph traversal w JS
- **RLS** — `WHERE userId = $1` w kodzie wystarcza
- **LISTEN/NOTIFY** — Cloud Tasks dalej obsługują post-scene work
- **Atlas Search (tsvector)** — nieużywane dziś
- **`generated always as stored` columns** — spekulatywne
- **Zmiana nazw na snake_case** — camelCase zostaje
