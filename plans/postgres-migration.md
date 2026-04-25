# Migracja MongoDB Atlas → PostgreSQL (kompletna)

## Context

Obecnie projekt stoi na **MongoDB Atlas + Prisma (MongoDB provider)**. Przechodzimy na **PostgreSQL + pgvector**. Pre-prod, znajomi testują ale poczekają do końca migracji. Pusty start (zero migracji danych). Pełen zakres — dopóki nie skończymy, nie wracamy na prod.

**Bolączki MongoDB które usuwamy:**
- Prisma na Mongo nie ma `Json` type → **~50 pól `String` z ręcznym `JSON.parse`/`JSON.stringify`** (persistence.md:62-73).
- Atlas Vector Search wymaga native BSON arrays → `mongoNative.js` workaround + `writeEmbedding()` poza Prisma.
- Atlas-only dev (nie ma lokalnego Mongo), SRV string obowiązkowy.
- Brak FK → `@db.ObjectId` references bez integrity constraints. Possible to save id wskazujące na nieistniejący rekord.
- `String[] @db.ObjectId` arrays bez natywnego indexowania.
- Prisma transakcje wymagają replica setu — w praktyce **kod nie ma ANI JEDNEGO `prisma.$transaction`** (zweryfikowane grepem).
- Brak FIFO triggerów → trimming w JS (`while list.length > 50 list.shift()`) z pełnym rewrite całego JSON arraya.
- Brak TTL lepszego niż `expireAfterSeconds` (Mongo-specific).

---

## Success criteria

Migracja skończona, gdy:

1. `docker compose up` stawia lokalny Postgres + backend **offline** (bez internetu / bez Atlas).
2. `npx prisma migrate dev` czysto generuje schemat + ręczne SQL bloczki (CREATE EXTENSION vector, HNSW indexes, triggery FIFO, enum types).
3. Cały kod po grepie `import.*mongodb`, `ObjectId`, `JSON.parse(...)` na pola bazodanowe, `writeEmbedding via native driver` — **zero wyników** poza `node_modules` i plikami które świadomie usuwamy.
4. E2E: rejestracja → postać → kampania → scena → embedding → vector search → tick Living World → NPC się ruszy → WorldEvent zapisany. `npm test` i `npm run test:e2e` przechodzą.
5. Produkcyjny Cloud Run deployable na Postgres (hosting do zdecydowania osobno — ale **kod gotowy**, niezależnie od hostingu).
6. Docs zaktualizowane: `atlas-only-no-local-mongo.md` + `embeddings-native-driver.md` → SUPERSEDED, nowe `postgres-dev.md` + `embeddings-pgvector.md`. `AGENTS.md` Stack section.

---

## Decyzje podjęte (potwierdzone)

| Pytanie | Decyzja |
|---|---|
| ID | **UUIDv7** (`@default(uuid(7))` w Prisma 6) |
| `withRetry` | Zostaje, tylko zamiana kodów błędów (P2028 mongo-only → 40001 postgres serialization) |
| Migracje Prisma | **Jedna migracja** — cały initial schema + extensions + triggery w jednym `npx prisma migrate dev --name init_postgres` |
| JSON handling | **Natywny JSONB** — `Json` type. Zero `JSON.parse`/`JSON.stringify` na polach DB w kodzie |
| Pusty start | Znajomi zaczynają świeże konta/kampanie — brak migracji danych |
| Równoległa produkcja | Wyłączamy — znajomi czekają do końca migracji |
| Vector index | HNSW, cosine, 1536-dim |

---

## Mongo-isms które wyrzucamy (vs Postgres-native replacement)

Zasada: zamiast kopiować Mongo patterns do Postgres, bierzemy Postgres-native alternatywę TYLKO gdy adresuje realny kod który już jest problematyczny. Nie dodajemy "elastyczności" na wszelki wypadek.

| Mongo-ism | Gdzie w kodzie | Postgres-native | Uzasadnienie |
|---|---|---|---|
| `String` z JSON.parse/stringify | ~50 pól w `schema.prisma`, parse/stringify w `campaignSync.js`, `processStateChanges/handlers/*`, `livingWorld/*`, `campaignLoader.js`, `storage.js` | **`Json` typ + JSONB storage** | Prisma 6 serializuje/deserializuje automatycznie. Zero linii JSON.parse/stringify. |
| `String[] @db.ObjectId` (arrays IDs) | `Campaign.characterIds`, `MultiplayerSession.characterIds` | **Join table z FK + cascade** | `CampaignParticipant`, `MultiplayerSessionPlayer` — eliminuje ręczne lookup, dostajemy natywny "którą kampanię używa postać X" przez relation, cascade delete działa |
| JSON array of foreign IDs in a string field | `Campaign.discoveredLocationIds`, `heardAboutLocationIds`, `discoveredSubLocationIds`, `UserWorldKnowledge.discoveredLocationIds/EdgeIds/heardAbout`, `WorldLocationEdge.discoveredByCampaigns`, `CampaignQuest.prerequisiteQuestIds`, `Character.clearedDungeonIds`, `WorldNPC.knownLocationIds` | **Join tables** | Mongo pattern ("trzymaj IDs w arrayu w polu") jest wymuszony brakiem FK. Postgres: join table z FK, unique, cascade, natywne indeksy. Łatwe queries "czy X widzi Y". |
| JSON obiektów bez search ale z partial updates | `Character.skills` (xp per skill, hot path), `Character.inventory` (add/remove item), `Character.materialBag` (stack), `CampaignQuest.objectives` (progress per objective), `CampaignNPC.relationships`, `CampaignNPC.experienceLog`, `WorldNPC.knowledgeBase`, `WorldNPC.dialogHistory` (cap 50 per campaign), `WorldLocation.knowledgeBase`, `CampaignDmAgent.dmMemory/pendingHooks` | **Dedykowane tabele 1-to-many** | Partial update w JSONB = full rewrite. Dedykowana tabela = precyzyjny INSERT/UPDATE jednego rekordu. Plus trigger FIFO trim tam gdzie jest cap. |
| JSON skalarów | `Character.attributes` (6 INT), `Character.mana` ({current,max}), `Character.money` ({gold,silver,copper}), `Character.needs` (5 INT), `Character.equipped` (3 FK), `Campaign.worldBounds` (4 FLOAT), `WorldLocation.roomMetadata` (fixed struct) | **Kolumny skalarne + FK** | Atomic `UPDATE … SET col = col - 5` zamiast full JSON rewrite. Uneventfully typowane. |
| `lastLocation: String` + `lastLocationId: @db.ObjectId` duplikacja | `CampaignNPC` | **Tylko `lastLocationId` FK**, displayName pobierany przez JOIN lub `include` | Brak FK w Mongo wymuszał trzymanie flavor stringa na wszelki wypadek. W Postgres FK gwarantuje że join znajdzie nazwę. |
| Brak `$transaction` | Save flow (PUT campaign + syncs), scene save + state changes, promotion batch | **`prisma.$transaction([...])` wrap** | Mongo wymagał replica setu; w Postgres transakcje są standardem. Multi-write teraz atomowe. |
| Loop `findUnique` + `upsert` per-entity | `syncNPCsToNormalized` (40+ queries dla 20 NPC), `syncKnowledgeToNormalized`, `syncQuestsToNormalized`, `processNpcChanges` | **Bulk `INSERT … ON CONFLICT DO UPDATE`** | Postgres ma ON CONFLICT natywnie. 1 query zamiast N. |
| `@db.ObjectId` referencje bez cascade | Większość cross-model references poza explicit `@relation(onDelete: Cascade)` | **FK z `ON DELETE CASCADE`** w Prisma `@relation` | Kaskadowe usunięcie kampanii znika wszystko; dziś trzeba ręcznie kasować normalized collections. |
| String enum + CHECK w comment | `Campaign.difficultyTier`, `WorldLocation.dangerLevel`, `WorldLocationEdge.difficulty`, `WorldLocation.locationType`, `UserDiscoveredLocation.state` (hypothetic), `PendingWorldStateChange.status`, `CampaignNPC.attitude` | **Postgres `CREATE TYPE … AS ENUM`** via Prisma `enum` block | Typed, wymusza wartości, kompiluje się bez wartości-literałów w kodzie. |
| `MongoClient.createSearchIndex` + `$vectorSearch` | `vectorSearchService.js`, `createVectorIndexes.js` | **pgvector + HNSW** przez `CREATE INDEX USING hnsw` i `ORDER BY embedding <=> query_vec` | Jedna biblioteka, jedna ścieżka zapisu przez Prisma `$executeRaw`, brak osobnego klienta. |
| In-process cosine (ragService) | `ragService.query()` — `findMany` + loop cosine w JS | **`$queryRaw` + pgvector operator** | Skalowalne, indeksowane, <5ms na 10k rows. |
| TTL index `expireAfterSeconds` | `RefreshToken.expiresAt` | **Boot-time `setInterval` cleanup** (Faza 1) + `@@index([expiresAt])`. Alternatywa: pg_cron gdy prod Cloud SQL (osobna decyzja). | Lazy cleanup w `refreshTokenService.js:50-71` już odrzuca ekspirowane — setInterval tylko sweep co 10 min |
| FIFO trim w JS `while len > cap` | `WorldNPC.dialogHistory` cap 50, `knowledgeBase` cap 50, `CampaignDmAgent.dmMemory` cap 20, `pendingHooks` cap 12, `goalProgress.milestones` cap 20 (npcAgentLoop) | **Trigger AFTER INSERT** który DELETE oldest rows gdy count > cap | Per-row insert bez pełnego rewrite całej historii. Trigger centralizuje politykę. |
| `new ObjectId(val)` wrapping w ~10 plikach | `hashService.toObjectId`, `worldStateService.toObjectIdString`, `companionService`, `routes/auth.js` (direct native query!), `routes/media.js`, `routes/wanted3d.js`, `routes/proxy/{stability,openai}.js` | **Drop całkowicie** — Prisma przyjmuje UUID string | 10+ plików uproszczonych |
| `Campaign.coreState` monolit 15-25KB | `campaignSync.js` rewrite przy każdym save | **Kolumny skalarne dla hot-path + `transientState JSONB` dla reszty** | Partial updates `UPDATE … SET current_location = $1` zamiast pełnego JSON |

---

## Postgres-native cechy które wykorzystujemy

- **pgvector HNSW** — vector search bez osobnego klienta
- **JSONB** — `?`, `@>`, `->>` operators, GIN indexes tam gdzie filtrujemy
- **Native UUIDv7** — time-ordered ID, lepszy B-tree locality
- **FK + ON DELETE CASCADE** — auto-cleanup przy delete parent
- **`CREATE TYPE … AS ENUM`** — typed enumy
- **`prisma.$transaction`** — multi-write atomicity
- **`INSERT … ON CONFLICT DO UPDATE`** — bulk upsert (Prisma `createMany` + `updateMany` / `$executeRaw`)
- **Partial indexes** `CREATE INDEX … WHERE …` — np. embedding IS NOT NULL
- **Triggery** — FIFO trim, audit ledger
- **Composite indexes** — już używamy `@@index([...])`, Postgres je honoruje tak samo
- **`generated always as ... stored`** — dla derived columns (ale nie używamy spekulatywnie — tylko jeśli pojawi się konkretny slow query)

**Nie używamy:**
- PostGIS — coords + Dijkstra w JS (euklidesowe, Dijkstra <1000 nodes), vanilla btree na (regionX, regionY) wystarczy
- pg_trgm / full-text search — fuzzy NPC dedupe robi JS substring + RAG embeddingi
- Recursive CTE — brak graph traversal w SQL, Dijkstra w JS
- LISTEN/NOTIFY — nie zastępujemy Cloud Tasks
- Materialized views — brak slow aggregate queries (profile po implementacji, dodaj jeśli trzeba)
- Partycjonowanie — WorldEvent rośnie, ale przy <1M wierszy nie potrzebujemy
- Read replicas — 50 DAU
- RLS — multi-tenant przez `WHERE userId = $1` w kodzie, review pokrywa

---

## Pełen schemat Postgres (z dekompozycjami)

Konwencja: Prisma `model` w camelCase/PascalCase, SQL `@@map`/`@map` opcjonalnie snake_case (robię dopiero gdy user potwierdzi — dziś zostawiam camelCase jak w obecnej schemie).

### Enumy (nowe, Postgres-native)

```prisma
enum DangerLevel { safe moderate dangerous deadly }
enum LocationType { generic hamlet village town city capital dungeon forest wilderness interior dungeon_room }
enum DiscoveryState { visited heard_about sublocation_visited }
enum ReviewStatus { pending approved rejected }
enum NpcAttitude { hostile unfriendly neutral friendly ally }   // opcjonalnie, sprawdzić używanie
enum CampaignVisibility { campaign private deferred global }   // dla WorldEvent
```

Używane w: `Campaign.difficultyTier` (DangerLevel), `WorldLocation.dangerLevel` (DangerLevel), `WorldLocation.locationType` (LocationType), `WorldLocationEdge.difficulty` (DangerLevel), `PendingWorldStateChange/NPCPromotionCandidate/LocationPromotionCandidate.status` (ReviewStatus), `CampaignNPC.attitude` (NpcAttitude), `WorldEvent.visibility` (CampaignVisibility), `UserDiscoveredLocation.state` (DiscoveryState).

### User / Auth

```prisma
model User {
  id              String   @id @default(uuid(7)) @db.Uuid
  email           String   @unique
  passwordHash    String
  apiKeys         Json     @default("{}")     // encrypted blob
  settings        Json     @default("{}")
  isAdmin         Boolean  @default(false)
  contentLanguage String   @default("pl")     // TEXT (pl|en) — nie enum (potential future langs)
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
  @@index([expiresAt])      // dla setInterval sweep
}
```

### Character (pełna dekompozycja)

```prisma
model Character {
  id              String @id @default(uuid(7)) @db.Uuid
  userId          String @db.Uuid
  name            String
  age             Int    @default(23)
  gender          String @default("")
  species         String

  // Atrybuty RPGon — 6 skalarów (zamiast JSON)
  attrSila         Int @default(1)
  attrInteligencja Int @default(1)
  attrCharyzma     Int @default(1)
  attrZrecznosc    Int @default(1)
  attrWytrzymalosc Int @default(1)
  attrSzczescie    Int @default(0)

  wounds           Int @default(0)
  maxWounds        Int @default(0)
  movement         Int @default(4)
  characterLevel   Int @default(1)
  characterXp      Int @default(0)
  attributePoints  Int @default(0)

  manaCurrent      Int @default(0)
  manaMax          Int @default(0)

  moneyGold        Int @default(0)
  moneySilver      Int @default(0)
  moneyCopper      Int @default(0)

  needHunger       Int @default(100)
  needThirst       Int @default(100)
  needBladder      Int @default(100)
  needHygiene      Int @default(100)
  needRest         Int @default(100)

  // Equipped — 3 optional FK
  equippedMainHandId String? @db.Uuid
  equippedOffHandId  String? @db.Uuid
  equippedArmourId   String? @db.Uuid
  equippedMainHand   CharacterInventoryItem? @relation("equipMain", fields: [equippedMainHandId], references: [id])
  equippedOffHand    CharacterInventoryItem? @relation("equipOff",  fields: [equippedOffHandId],  references: [id])
  equippedArmour     CharacterInventoryItem? @relation("equipArm",  fields: [equippedArmourId],   references: [id])

  // Spells — małe, rzadkie partial updates, strukturowane — JSONB OK
  spells           Json @default("{\"known\":[],\"usageCounts\":{},\"scrolls\":[]}")

  // Status
  status             String?    // alive|dead|unconscious — string bo UI/LLM operują free form
  lockedCampaignId   String?    @db.Uuid
  lockedCampaignName String?
  lockedLocation     String?

  activeDungeonState Json?      // transient per-run

  statuses            Json @default("[]")
  customAttackPresets Json @default("[]")
  knownTitles         Json @default("[]")

  backstory   String @default("")
  portraitUrl String @default("")
  voiceId     String @default("")
  voiceName   String @default("")
  campaignCount Int  @default(0)
  fame        Int @default(0)
  infamy      Int @default(0)

  // USUWAMY legacy WFRP (careerData, characteristics, advances, xp, xpSpent).
  // Migrować FE fallback `char.attributes || char.characteristics` → tylko `char.attributes`.
  // BE routes/characters.js drop WFRP write path.

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)

  skills          CharacterSkill[]
  inventoryItems  CharacterInventoryItem[] @relation("charInvItems")
  materials       CharacterMaterial[]
  clearedDungeons CharacterClearedDungeon[]
  participants    CampaignParticipant[]
  mpPlayers       MultiplayerSessionPlayer[]
  npcAttributions WorldNpcAttribution[]
  reputations     WorldReputation[]

  @@index([userId])
  @@index([lockedCampaignId])
}

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
  id          String @id @default(uuid(7)) @db.Uuid
  characterId String @db.Uuid
  itemId      String          // stable ID z src/data/
  baseType    String?
  name        String
  quantity    Int    @default(1)
  props       Json   @default("{}")
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

model CharacterClearedDungeon {
  characterId String @db.Uuid
  dungeonId   String @db.Uuid
  clearedAt   DateTime @default(now()) @db.Timestamptz
  character   Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  dungeon     WorldLocation @relation(fields: [dungeonId], references: [id])
  @@id([characterId, dungeonId])
}
```

### Campaign (dekompozycja coreState)

```prisma
model Campaign {
  id                       String @id @default(uuid(7)) @db.Uuid
  userId                   String @db.Uuid
  name                     String @default("")
  genre                    String @default("")
  tone                     String @default("")

  // Hot path z coreState — kolumny skalarne
  currentLocation          String?              // flavor name
  currentLocationId        String? @db.Uuid
  gameTime                 DateTime? @db.Timestamptz
  weather                  String?
  sessionTitle             String?

  // Pozostałe transient (combat state, chat buffer, temp world facts) → JSONB
  transientState           Json    @default("{}")

  totalCost                Float   @default(0)
  isPublic                 Boolean @default(false)
  shareToken               String? @unique
  rating                   Float   @default(0)
  playCount                Int     @default(0)
  lastSaved                DateTime @default(now()) @db.Timestamptz

  livingWorldEnabled       Boolean @default(false)
  worldTimeRatio           Float   @default(24.0)
  worldTimeMaxGapDays      Int     @default(7)
  difficultyTier           DangerLevel @default(safe)
  settlementCaps           Json?                       // małe, rzadko mod — JSONB

  // worldBounds → 4 FLOAT
  boundsMinX               Float?
  boundsMaxX               Float?
  boundsMinY               Float?
  boundsMaxY               Float?

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  participants            CampaignParticipant[]
  scenes                  CampaignScene[]
  npcs                    CampaignNPC[]
  knowledge               CampaignKnowledge[]
  codex                   CampaignCodex[]
  quests                  CampaignQuest[]
  locationSummaries       CampaignLocationSummary[]
  dmAgent                 CampaignDmAgent?
  discoveredLocations     CampaignDiscoveredLocation[]
  edgeDiscoveries         WorldEdgeDiscovery[]
  npcDialogTurns          WorldNpcDialogTurn[]
  npcAttributions         WorldNpcAttribution[]
  pendingWorldStateChanges PendingWorldStateChange[]
  npcPromotionCandidates  NPCPromotionCandidate[]
  locationPromotionCandidates LocationPromotionCandidate[]

  @@index([userId])
  @@index([isPublic])
}

model CampaignParticipant {
  campaignId   String @db.Uuid
  characterId  String @db.Uuid
  role         String @default("player")   // player|host|guest
  joinedAt     DateTime @default(now()) @db.Timestamptz
  campaign     Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  character    Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  @@id([campaignId, characterId])
  @@index([characterId])
}

model CampaignDiscoveredLocation {
  campaignId     String @db.Uuid
  locationId     String @db.Uuid
  state          DiscoveryState
  discoveredAt   DateTime @default(now()) @db.Timestamptz
  campaign       Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  location       WorldLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)
  @@id([campaignId, locationId])
  @@index([locationId])
}
```

### CampaignScene (z pgvector)

```prisma
model CampaignScene {
  id                String @id @default(uuid(7)) @db.Uuid
  campaignId        String @db.Uuid
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
```

### CampaignNPC (rozbicie relationships + experienceLog)

```prisma
model CampaignNPC {
  id                        String @id @default(uuid(7)) @db.Uuid
  campaignId                String @db.Uuid
  npcId                     String
  name                      String
  gender                    String @default("unknown")
  role                      String?
  personality               String?
  attitude                  NpcAttitude @default(neutral)
  disposition               Int    @default(0)
  alive                     Boolean @default(true)
  factionId                 String?
  notes                     String?
  worldNpcId                String? @db.Uuid
  isAgent                   Boolean @default(false)
  category                  String  @default("commoner")
  lastLocationId            String? @db.Uuid            // ← jedyne pole lokalizacji; `lastLocation` string DROP
  pendingIntroHint          String?
  activeGoal                String?
  goalProgress              Json?
  hasAcknowledgedFame       Boolean @default(false)
  interactionCount          Int     @default(0)
  dialogCharCount           Int     @default(0)
  questInvolvementCount     Int     @default(0)
  lastInteractionAt         DateTime? @db.Timestamptz
  lastInteractionSceneIndex Int?
  embeddingText             String?
  embedding                 Unsupported("vector(1536)")?

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  campaign                  Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  worldNpc                  WorldNPC? @relation(fields: [worldNpcId], references: [id])
  lastLocation              WorldLocation? @relation(fields: [lastLocationId], references: [id])
  relationships             CampaignNpcRelationship[]
  experienceEntries         CampaignNpcExperience[]

  @@unique([campaignId, npcId])
  @@index([campaignId])
  @@index([worldNpcId])
  @@index([campaignId, worldNpcId])
}

model CampaignNpcRelationship {
  id            BigInt @id @default(autoincrement())
  campaignNpcId String @db.Uuid
  targetType    String           // "npc" | "character" | "faction"
  targetRef     String            // stringowy FK (npcId/characterId/factionId)
  relation      String
  strength      Int    @default(0)
  campaignNpc   CampaignNPC @relation(fields: [campaignNpcId], references: [id], onDelete: Cascade)
  @@index([campaignNpcId])
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
```

### CampaignQuest (rozbicie objectives + prerequisites)

```prisma
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
  reward                Json?
  status                String @default("active")      // zostawiam string (active|completed|failed|…)
  completedAt           DateTime? @db.Timestamptz
  forcedGiver           Boolean @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  campaign              Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  objectives            CampaignQuestObjective[]
  prerequisites         CampaignQuestPrerequisite[] @relation("questSide")
  blockedBy             CampaignQuestPrerequisite[] @relation("prereqSide")

  @@unique([campaignId, questId])
  @@index([campaignId, status])
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

model CampaignQuestPrerequisite {
  questId        String @db.Uuid
  prerequisiteId String @db.Uuid
  quest        CampaignQuest @relation("questSide",  fields: [questId],        references: [id], onDelete: Cascade)
  prerequisite CampaignQuest @relation("prereqSide", fields: [prerequisiteId], references: [id], onDelete: Cascade)
  @@id([questId, prerequisiteId])
}
```

### CampaignKnowledge / Codex / LocationSummary

```prisma
model CampaignKnowledge {
  id            String @id @default(uuid(7)) @db.Uuid
  campaignId    String @db.Uuid
  entryType     String   // event|decision|plotThread|character|location
  summary       String
  content       Json                   // struct — JSONB
  tags          Json   @default("[]")  // array stringów
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
  tags           Json  @default("[]")
  fragments      Json                    // append-only array fragmentów
  relatedEntries Json  @default("[]")
  embeddingText  String?
  embedding      Unsupported("vector(1536)")?
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz
  campaign       Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, codexKey])
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
```

### CampaignDmAgent (rozbicie dmMemory + pendingHooks)

```prisma
model CampaignDmAgent {
  campaignId    String @id @db.Uuid
  lastUpdatedAt DateTime @default(now()) @db.Timestamptz
  campaign      Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  memoryEntries CampaignDmMemoryEntry[]
  pendingHooks  CampaignDmPendingHook[]
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

FIFO trigger:
```sql
-- cap 20 memory entries per campaign
CREATE OR REPLACE FUNCTION trim_campaign_dm_memory() RETURNS trigger AS $$
BEGIN
  DELETE FROM "CampaignDmMemoryEntry"
  WHERE "campaignId" = NEW."campaignId"
    AND id IN (
      SELECT id FROM "CampaignDmMemoryEntry"
      WHERE "campaignId" = NEW."campaignId"
      ORDER BY at DESC OFFSET 20
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trim_campaign_dm_memory_tr
AFTER INSERT ON "CampaignDmMemoryEntry"
FOR EACH ROW EXECUTE FUNCTION trim_campaign_dm_memory();

-- Analogicznie cap 12 na CampaignDmPendingHook (po priority asc offset 12).
```

### WorldLocation / Edge / UserWorldKnowledge

```prisma
model WorldLocation {
  id                    String @id @default(uuid(7)) @db.Uuid
  canonicalName         String @unique
  displayName           String?
  description           String @default("")
  category              String @default("generic")
  region                String?
  parentLocationId      String? @db.Uuid
  locationType          LocationType @default(generic)
  slotType              String?
  slotKind              String @default("custom")
  maxKeyNpcs            Int    @default(10)
  maxSubLocations       Int    @default(5)
  regionX               Float  @default(0)
  regionY               Float  @default(0)
  positionConfidence    Float  @default(0.5)
  subGridX              Int?
  subGridY              Int?
  isCanonical           Boolean @default(false)
  knownByDefault        Boolean @default(false)
  dangerLevel           DangerLevel @default(safe)
  createdByCampaignId   String? @db.Uuid

  aliases               Json    @default("[]")
  roomMetadata          Json?

  embeddingText         String?
  embedding             Unsupported("vector(1536)")?

  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  parent                WorldLocation? @relation("subloc", fields: [parentLocationId], references: [id])
  sublocations          WorldLocation[] @relation("subloc")
  outgoingEdges         WorldLocationEdge[] @relation("fromLoc")
  incomingEdges         WorldLocationEdge[] @relation("toLoc")
  knowledgeEntries      WorldLocationKnowledge[]
  clearedByCharacters   CharacterClearedDungeon[]
  npcsHere              WorldNPC[] @relation("npcCurrentLoc")
  npcsHome              WorldNPC[] @relation("npcHomeLoc")
  npcsKnowing           WorldNpcKnownLocation[]
  campaignNpcsLastHere  CampaignNPC[]
  discoveredByCampaigns CampaignDiscoveredLocation[]
  discoveredByUsers     UserDiscoveredLocation[]
  locationPromotionCandidates LocationPromotionCandidate[]

  @@index([region])
  @@index([parentLocationId])
  @@index([locationType])
  @@index([isCanonical, createdByCampaignId])
  @@index([regionX, regionY])
}

model WorldLocationKnowledge {
  id         BigInt @id @default(autoincrement())
  locationId String @db.Uuid
  content    String
  source     String
  kind       String
  confidence Float?
  similarity Float?
  addedAt    DateTime @default(now()) @db.Timestamptz
  location   WorldLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)
  @@index([locationId, addedAt])
}
```

FIFO trigger: cap 50 per location — analogicznie do `trim_campaign_dm_memory`.

```prisma
model WorldLocationEdge {
  id             String @id @default(uuid(7)) @db.Uuid
  fromLocationId String @db.Uuid
  toLocationId   String @db.Uuid
  distance       Float
  difficulty     DangerLevel @default(safe)
  terrainType    String @default("road")
  direction      String?
  gated          Boolean @default(false)
  gateHint       String?
  createdAt      DateTime @default(now()) @db.Timestamptz

  from           WorldLocation @relation("fromLoc", fields: [fromLocationId], references: [id], onDelete: Cascade)
  to             WorldLocation @relation("toLoc",   fields: [toLocationId],   references: [id], onDelete: Cascade)
  discoveredByCampaigns WorldEdgeDiscovery[]
  discoveredByUsers     UserDiscoveredEdge[]

  @@unique([fromLocationId, toLocationId])
  @@index([fromLocationId])
  @@index([toLocationId])
}

model WorldEdgeDiscovery {
  edgeId       String @db.Uuid
  campaignId   String @db.Uuid
  discoveredAt DateTime @default(now()) @db.Timestamptz
  edge         WorldLocationEdge @relation(fields: [edgeId], references: [id], onDelete: Cascade)
  campaign     Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@id([edgeId, campaignId])
  @@index([campaignId])
}

model UserWorldKnowledge {
  userId     String @id @db.Uuid
  updatedAt  DateTime @updatedAt @db.Timestamptz
  user       User @relation(fields: [userId], references: [id], onDelete: Cascade)
  locations  UserDiscoveredLocation[]
  edges      UserDiscoveredEdge[]
}

model UserDiscoveredLocation {
  userId       String @db.Uuid
  locationId   String @db.Uuid
  state        DiscoveryState
  discoveredAt DateTime @default(now()) @db.Timestamptz
  userKnowledge UserWorldKnowledge @relation(fields: [userId], references: [userId], onDelete: Cascade)
  location      WorldLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)
  @@id([userId, locationId])
  @@index([locationId])
}

model UserDiscoveredEdge {
  userId       String @db.Uuid
  edgeId       String @db.Uuid
  discoveredAt DateTime @default(now()) @db.Timestamptz
  userKnowledge UserWorldKnowledge @relation(fields: [userId], references: [userId], onDelete: Cascade)
  edge          WorldLocationEdge @relation(fields: [edgeId], references: [id], onDelete: Cascade)
  @@id([userId, edgeId])
}
```

### WorldNPC (rozbicie knowledgeBase + dialogHistory + knownLocationIds)

```prisma
model WorldNPC {
  id                     String @id @default(uuid(7)) @db.Uuid
  canonicalId            String @unique
  name                   String
  role                   String?
  personality            String?
  alignment              String  @default("neutral")
  alive                  Boolean @default(true)
  currentLocationId      String? @db.Uuid
  homeLocationId         String? @db.Uuid
  pausedAt               DateTime? @db.Timestamptz
  pauseSnapshot          Json?
  companionOfCampaignId  String? @db.Uuid
  companionJoinedAt      DateTime? @db.Timestamptz
  companionLoyalty       Int     @default(50)
  lockedByCampaignId     String? @db.Uuid
  lockedAt               DateTime? @db.Timestamptz
  lockedSnapshot         Json?

  activeGoal             String?
  goalProgress           Json?
  schedule               Json?
  lastTickAt             DateTime? @db.Timestamptz
  tickIntervalHours      Int     @default(24)
  lastTickSceneIndex     Int?
  tickIntervalScenes     Int     @default(2)
  goalDeadlineAt         DateTime? @db.Timestamptz
  lastLocationPingAt     DateTime? @db.Timestamptz
  category               String  @default("commoner")
  keyNpc                 Boolean @default(true)

  embeddingText          String?
  embedding              Unsupported("vector(1536)")?
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz

  currentLocation  WorldLocation? @relation("npcCurrentLoc", fields: [currentLocationId], references: [id])
  homeLocation     WorldLocation? @relation("npcHomeLoc",    fields: [homeLocationId],    references: [id])
  campaignShadows  CampaignNPC[]
  knowledgeEntries WorldNpcKnowledge[]
  dialogTurns      WorldNpcDialogTurn[]
  knownLocations   WorldNpcKnownLocation[]
  attributions     WorldNpcAttribution[]

  @@index([currentLocationId])
  @@index([alive])
  @@index([companionOfCampaignId])
  @@index([lockedByCampaignId])
}

model WorldNpcKnowledge {
  id          BigInt @id @default(autoincrement())
  npcId       String @db.Uuid
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
  id          BigInt @id @default(autoincrement())
  npcId       String @db.Uuid
  campaignId  String @db.Uuid
  playerMsg   String
  npcResponse String
  gameTime    DateTime @db.Timestamptz
  createdAt   DateTime @default(now()) @db.Timestamptz
  npc         WorldNPC @relation(fields: [npcId], references: [id], onDelete: Cascade)
  campaign    Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@index([npcId, campaignId, createdAt])
}

model WorldNpcKnownLocation {
  npcId      String @db.Uuid
  locationId String @db.Uuid
  grantedBy  String                    // "seed" | "promotion" | "dialog"
  grantedAt  DateTime @default(now()) @db.Timestamptz
  npc        WorldNPC @relation(fields: [npcId], references: [id], onDelete: Cascade)
  location   WorldLocation @relation(fields: [locationId], references: [id], onDelete: Cascade)
  @@id([npcId, locationId])
  @@index([locationId])
}
```

FIFO triggery:
- `WorldNpcKnowledge` cap 50 per npcId
- `WorldNpcDialogTurn` cap 50 per (npcId, campaignId)

### WorldEvent / Reputation / Attribution / LoreSection / Embedding / Pending*

```prisma
model WorldEvent {
  id              BigInt @id @default(autoincrement())
  worldNpcId      String? @db.Uuid
  worldLocationId String? @db.Uuid
  campaignId      String? @db.Uuid
  userId          String? @db.Uuid
  eventType       String
  payload         Json    @default("{}")
  visibility      CampaignVisibility @default(campaign)
  gameTime        DateTime @db.Timestamptz
  createdAt       DateTime @default(now()) @db.Timestamptz

  @@index([worldNpcId, createdAt])
  @@index([worldLocationId, createdAt])
  @@index([campaignId, createdAt])
  @@index([eventType])
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
  id               BigInt @id @default(autoincrement())
  worldNpcId       String @db.Uuid
  actorCharacterId String @db.Uuid
  actorCampaignId  String @db.Uuid
  actionType       String
  justified        Boolean @default(false)
  judgeConfidence  Float   @default(0)
  judgeReason      String?
  alignmentImpact  String
  visibility       String  @default("campaign")
  gameTime         DateTime @db.Timestamptz
  createdAt        DateTime @default(now()) @db.Timestamptz
  npc       WorldNPC  @relation(fields: [worldNpcId], references: [id], onDelete: Cascade)
  actor     Character @relation(fields: [actorCharacterId], references: [id])
  campaign  Campaign  @relation(fields: [actorCampaignId], references: [id], onDelete: Cascade)
  @@index([actorCharacterId, createdAt])
  @@index([worldNpcId])
}

model WorldLoreSection {
  id        String @id @default(uuid(7)) @db.Uuid
  slug      String @unique
  title     String
  content   String @default("")
  order     Int    @default(0)
  updatedBy String?
  createdAt DateTime @default(now()) @db.Timestamptz
  updatedAt DateTime @updatedAt      @db.Timestamptz
  @@index([order])
}

model WorldEntityEmbedding {
  id         BigInt @id @default(autoincrement())
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
  id               BigInt @id @default(autoincrement())
  campaignId       String @db.Uuid
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
  reviewedBy       String?   @db.Uuid
  reviewedAt       DateTime? @db.Timestamptz
  reviewNotes      String?
  createdAt        DateTime @default(now()) @db.Timestamptz
  updatedAt        DateTime @updatedAt      @db.Timestamptz
  campaign         Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, idempotencyKey])
  @@index([status, createdAt])
  @@index([campaignId, status])
}

model NPCPromotionCandidate {
  id               BigInt @id @default(autoincrement())
  campaignId       String @db.Uuid
  campaignNpcId    String @db.Uuid
  name             String
  role             String?
  personality      String?
  stats            Json    @default("{}")
  dialogSample     String?
  smallModelVerdict String?
  status           ReviewStatus @default(pending)
  reviewedBy       String?   @db.Uuid
  reviewedAt       DateTime? @db.Timestamptz
  reviewNotes      String?
  createdAt        DateTime @default(now()) @db.Timestamptz
  updatedAt        DateTime @updatedAt      @db.Timestamptz
  campaign         Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, campaignNpcId])
  @@index([status, createdAt])
}

model LocationPromotionCandidate {
  id                BigInt @id @default(autoincrement())
  campaignId        String @db.Uuid
  worldLocationId   String @db.Uuid
  canonicalName     String
  displayName       String?
  locationType      String?
  region            String?
  description       String?
  stats             Json    @default("{}")
  smallModelVerdict String?
  status            ReviewStatus @default(pending)
  reviewedBy        String?   @db.Uuid
  reviewedAt        DateTime? @db.Timestamptz
  reviewNotes       String?
  createdAt         DateTime @default(now()) @db.Timestamptz
  updatedAt         DateTime @updatedAt      @db.Timestamptz
  campaign          Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  location          WorldLocation @relation(fields: [worldLocationId], references: [id], onDelete: Cascade)
  @@unique([campaignId, worldLocationId])
  @@index([status, createdAt])
}
```

### MultiplayerSession (rozbicie players[])

```prisma
model MultiplayerSession {
  id        String @id @default(uuid(7)) @db.Uuid
  roomCode  String @unique
  hostId    String @db.Uuid
  phase     String
  gameState Json                       // world/scenes/combat transient
  settings  Json
  updatedAt DateTime @updatedAt @db.Timestamptz
  createdAt DateTime @default(now()) @db.Timestamptz
  host      User @relation(fields: [hostId], references: [id])
  players   MultiplayerSessionPlayer[]
}

model MultiplayerSessionPlayer {
  sessionId   String @db.Uuid
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

### MediaAsset / PrefabAsset / Wanted3D / Achievement

Bez dekompozycji — małe, flat, stringowe enumy kategoryzujące (`type`, `status`, `backend`) zostają TEXT. Tylko konwersja na Postgres-native types:

```prisma
model MediaAsset { /* jak dziś, String→Json dla metadata, @db.ObjectId→@db.Uuid, FK User onDelete Cascade */ }
model PrefabAsset { /* jak dziś */ }
model Wanted3D { /* jak dziś */ }
model Achievement { /* jak dziś, metadata → Json */ }
```

---

## Vector search implementation

### Zapis

```js
// backend/src/services/embeddingWrite.js (nowy, zastępuje mongoNative.writeEmbedding)
import { prisma } from '../lib/prisma.js';

// Table allowlist (bo używamy $executeRawUnsafe z dynamic table name)
const ALLOWED = new Set([
  'CampaignScene', 'CampaignKnowledge', 'CampaignNPC', 'CampaignCodex',
  'WorldLocation', 'WorldNPC',
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
    WHERE "campaignId" = ${campaignId}::uuid
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${queryEmbedding}::vector
    LIMIT ${limit}
  `;
  return rows.filter(r => r.score >= minScore);
}
// Analogicznie: searchKnowledge (filtr entryType), searchNPCs, searchCodex.
```

`ragService.query` analogicznie — `findMany + JS cosine` → `$queryRaw + <=>`. Filtry: `entity_type = ANY($1)` + optional `entity_id = ANY($2)`.

### HNSW SQL indexy w migracji

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX idx_scene_embedding     ON "CampaignScene"       USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX idx_knowledge_embedding ON "CampaignKnowledge"   USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX idx_npc_embedding       ON "CampaignNPC"         USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX idx_codex_embedding     ON "CampaignCodex"       USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX idx_worldent_embedding  ON "WorldEntityEmbedding" USING hnsw (embedding vector_cosine_ops);
-- WorldLocation/WorldNPC embedding indexes odroczone (dziś createVectorIndexes.js też ich nie ma)
```

---

## Transakcje + bulk upsert

### Gdzie wrap `prisma.$transaction`

1. **PUT /v1/campaigns/:id** (crud.js) — `campaign.update` + `syncNPCsToNormalized` + `syncKnowledgeToNormalized` + `syncQuestsToNormalized` + `character.updateMany(lock)` w jednej transakcji. Jeden fail → rollback, nie pół zapisane.

2. **POST /v1/ai/campaigns/:id/scenes** (`sceneStream.js`/`generateSceneStream.js`) — `campaignScene.create` + `character.update(stateChanges)` w transakcji. **Cloud Task enqueue PO commicie** (nie wewnątrz — fire-and-forget byłby poisoned jeśli txn rollback).

3. **processStateChanges/index.js** — cały batch mutacji (processNpcChanges + processKnowledgeUpdates + processCodexUpdates + processQuestStatusChange) w jednej transakcji per scena.

4. **postCampaignPromotion batch** — bulk insert NPCPromotionCandidate/LocationPromotionCandidate w transakcji.

5. **admin approve/reject** (PendingWorldStateChange, NPCPromotionCandidate, LocationPromotionCandidate) — status change + side effects (flipCanonical, promote) w transakcji.

### Bulk upsert zamiast loop

```js
// zamiast pętli findUnique+upsert:
await prisma.$executeRaw`
  INSERT INTO "CampaignNPC" (id, "campaignId", "npcId", name, attitude, disposition, …)
  SELECT * FROM UNNEST(
    ${ids}::uuid[], ${cids}::uuid[], ${npcIds}::text[], ${names}::text[],
    ${attitudes}::"NpcAttitude"[], ${dispositions}::int[], …
  )
  ON CONFLICT ("campaignId","npcId") DO UPDATE SET
    attitude = EXCLUDED.attitude,
    disposition = EXCLUDED.disposition,
    …
`;
```

Aplikujemy do: `syncNPCsToNormalized`, `syncKnowledgeToNormalized`, `syncQuestsToNormalized`, `processNpcChanges`. Z 40+ queries → 1 per batch.

Prisma alternative: `createMany({ data: [...], skipDuplicates: true })` + osobny `updateMany` dla zmienionych. Gorsze dla naszego use case (chcemy upsert). Direct raw SQL preferowany.

---

## Pliki do zmiany

### Schema & migracja

| Plik | Zmiana |
|---|---|
| `backend/prisma/schema.prisma` | **Pełny rewrite** per sekcje powyżej |
| `backend/prisma/migrations/0000_init_postgres/migration.sql` | **Auto-generated** przez Prisma + **dodajemy ręcznie na końcu**: CREATE EXTENSION vector, HNSW indexes, FIFO triggery |
| `backend/prisma/seed.js` | Sprawdzić/dostosować (mapa nowych enumów) |
| `backend/src/scripts/seedWorld.js` | Adaptacja — w miejscach gdzie tworzy rows używających enumów (DangerLevel, LocationType), gdzie tworzy relacje przez array-of-IDs (teraz join tables); `new ObjectId` drop |

### Embedding layer

| Plik | Zmiana |
|---|---|
| `backend/src/services/mongoNative.js` | **DELETE** |
| `backend/src/services/embeddingWrite.js` | **NEW** — `writeEmbedding(table, id, vec, text)` przez Prisma `$executeRawUnsafe` |
| `backend/src/services/vectorSearchService.js` | $vectorSearch → `$queryRaw` + `<=>`. Drop `mongodb` import. `writeEmbedding` eksport przeniesiony do `embeddingWrite.js` |
| `backend/src/services/livingWorld/ragService.js` | `findMany + JS cosine` → `$queryRaw + <=>`. Drop in-process loop |
| `backend/src/services/embeddingService.js` | Bez zmian (embedText + LRU cache zostają) |
| `backend/src/scripts/createVectorIndexes.js` | **DELETE** (indeksy w migracji Prisma) |

### MongoDB native driver callsites (drop ObjectId)

| Plik | Zmiana |
|---|---|
| `backend/src/services/hashService.js:27` | `toObjectId` → no-op passthrough. Preferowane: DELETE funkcji + update wszystkich callsites na passthrough bezpośredni |
| `backend/src/routes/auth.js:2,101` | **Direct MongoClient query** (`{ _id: new ObjectId(userId) }`) → `prisma.user.findUnique/update` |
| `backend/src/services/livingWorld/worldStateService.js:14,309-314` | Drop `import { ObjectId }`, `toObjectIdString` passthrough |
| `backend/src/services/livingWorld/companionService.js:13,41-42` | Drop `new ObjectId(worldNpcId)`, `new ObjectId(campaignId)` |
| `backend/src/routes/media.js:104`, `routes/wanted3d.js:63`, `routes/proxy/stability.js:91`, `routes/proxy/openai.js:204,402` | Drop `toObjectId(campaignId)` wrapowania |

### JSON.parse/stringify cleanup

Grep-driven cleanup — wszystkie miejsca gdzie backend parsował/serializował JSON-as-string:

| Plik | Zakres zmian |
|---|---|
| `backend/src/services/campaignSync.js` | Drop `JSON.parse/stringify` (relationships, tags, objectives, reward, …). Teraz bulk upsert zamiast loop. `withRetry` — zamiana P2028 na 40001 |
| `backend/src/services/campaignLoader.js` | Drop ręczne JSON.parse dla relationships/tags |
| `backend/src/services/sceneGenerator/processStateChanges/handlers/*.js` | Drop JSON.parse/stringify w każdym handlerze (npcs, knowledgeCodex, quests, locations, npcMemoryUpdates, …) |
| `backend/src/services/livingWorld/*.js` | Wszystkie: npcDialog, npcMemoryUpdates, dmMemoryService, campaignSandbox, npcAgentLoop, postCampaignMemoryPromotion, postCampaignLocationPromotion, worldStateService — drop JSON.parse dla knowledgeBase/dialogHistory/goalProgress/schedule/milestones/etc., używaj natywnych relations |
| `backend/src/services/postSceneWork.js` | Wrap transaction — już omówione |
| `backend/src/services/campaignSerialize.js` | Uproszczenie — `stripNormalizedFromCoreState` może być znacznie prostszy po dekompozycji coreState |
| `src/services/storage.js`, `src/services/storage/characters.js`, `src/services/storage/migrations.js` | FE: drop JSON.parse po stronie klienta tam gdzie backend zwraca natywne obiekty. `_parseBackendCampaign` uproszczenie |
| `src/components/character/CharacterCreationModal.jsx:127` | Drop fallback `char.characteristics` (WFRP legacy) → tylko `char.attributes` |
| `backend/src/routes/characters.js:56-58,91,129-131` | Drop WFRP write path (careerData, characteristics, advances) |
| `backend/src/services/characterMutations.js:317,371-373` | Drop WFRP fields z WRITABLE_SCALARS + serialize |

### Routes/services które teraz dostają transakcje

| Plik | Zmiana |
|---|---|
| `backend/src/routes/campaigns/crud.js` (PUT) | `prisma.$transaction` wrap campaign.update + syncs + character lock |
| `backend/src/routes/ai/sceneStream.js` lub `backend/src/services/sceneGenerator/generateSceneStream.js` | `prisma.$transaction` wrap scene.create + character.update; enqueue Cloud Task PO commicie |
| `backend/src/services/sceneGenerator/processStateChanges/index.js` | Wrap w transakcję cały batch handlers |
| `backend/src/services/postSceneWork.js` | Promise.allSettled już jest — wewnątrz każdego task dodać transakcje tam gdzie multi-write |
| `backend/src/routes/adminLivingWorld.js` (approve/reject handlers) | `prisma.$transaction` wrap status change + side-effect |
| `backend/src/services/livingWorld/postCampaignPromotion.js` | Transakcja batch insert |

### TTL / lazy cleanup

| Plik | Zmiana |
|---|---|
| `backend/src/scripts/createRefreshTokenTtlIndex.js` | **DELETE** |
| `backend/src/services/refreshTokenService.js` | Dodać `startPeriodicCleanup()` eksport — wywoływane z `server.js` po `fastify.listen`. `setInterval(() => prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() }}}), 10 * 60_000).unref()` |
| `backend/src/server.js` | Wywołanie `startPeriodicCleanup()` po listen |

### Config / infra

| Plik | Zmiana |
|---|---|
| `backend/src/config.js:17` | Default URL → `postgresql://rpgon:rpgon@localhost:5432/rpgon` |
| `docker-compose.yml` | Dodać service `db: image: pgvector/pgvector:pg16`, volume, healthcheck, update backend DATABASE_URL + depends_on |
| `.env.example` | `DATABASE_URL=postgresql://rpgon:rpgon@db:5432/rpgon`, `POSTGRES_PASSWORD=rpgon_local` |
| `.env` | jak wyżej (lokalna kopia) |
| `backend/package.json` | Remove `mongodb` dep. Script `db:migrate` już jest. Dodać `db:reset` jeśli wygodne |
| `backend/src/lib/prisma.js` (jeśli istnieje) | Bez zmian — Prisma client to Prisma client |
| `cloudbuild.yaml` | **ODROCZONE** — prod hosting decyzja osobno. Kod gotowy, pipeline dopasujemy gdy wybierzemy hosting |

### One-off scripts

| Plik | Decyzja |
|---|---|
| `backend/src/scripts/migrateCoreState.js` | Review — jeśli Mongo-specific data fix, DELETE. Jeśli nadal użyteczny w nowym modelu, adapt |
| `backend/src/scripts/dropSharedConfigCollection.js` | **DELETE** (Mongo collection ops) |
| `backend/src/scripts/inspectMediaAssetDuplicates.js`, `pruneMediaAssetDuplicates.js` | Adapt na SQL — jeśli logika nadal potrzebna. Jeśli jednorazowa — DELETE |
| `backend/src/scripts/generatePrefabs.js`, `importPrefabsFromModels3d.js` | Review — prawdopodobnie używają Prisma + file system, bez Mongo-specifics. Zostaną |

### Dokumenty

| Plik | Zmiana |
|---|---|
| `AGENTS.md` | Stack section: MongoDB Atlas → PostgreSQL 16 + pgvector. Commands: `db:push` → `db:migrate`. Database section: drop "Atlas Vector Search" mentions. Decisions: dodać link do nowych decyzji. Known gaps: usunąć kilka zdezaktualizowanych (np. "Prisma compound indexes missing" — dodamy od razu) |
| `knowledge/decisions/atlas-only-no-local-mongo.md` | Banner "SUPERSEDED by postgres-dev.md" |
| `knowledge/decisions/embeddings-native-driver.md` | Banner "SUPERSEDED by embeddings-pgvector.md" |
| `knowledge/decisions/postgres-dev.md` | **NEW** — Postgres lokalnie (pgvector/pgvector:pg16), hosting prod TBD |
| `knowledge/decisions/embeddings-pgvector.md` | **NEW** — pgvector HNSW, `$queryRaw + <=>`, allowlist writeEmbedding |
| `knowledge/concepts/persistence.md` | Update "JSON fields stored as strings" → "JSONB native". Update "embeddings via mongoNative" → "embeddings via `$executeRawUnsafe` do `vector(1536)` column" |
| `knowledge/decisions/cloud-run-no-redis.md` | Bez zmian (ortogonalne) |
| `README.md` | Dev setup: `docker compose up` stawia Postgres+backend offline |
| `Deployment checklist — Cloud Run bez Red.txt` | Dodać sekcję "Postgres prod hosting" — placeholder pod decyzję |

---

## Docker compose

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
      # …reszta envów jak dziś
    depends_on:
      db: { condition: service_healthy }
    volumes: [media-data:/data/media]
    develop:
      watch:
        - action: sync+restart
          path: ./backend/src
          target: /app/backend/src
        - action: sync+restart
          path: ./shared
          target: /app/shared
        - action: rebuild
          path: ./backend/package.json
        - action: rebuild
          path: ./backend/prisma
        - action: rebuild
          path: ./src
        - action: rebuild
          path: ./package.json
volumes:
  media-data:
  pg-data:
```

---

## Produkcyjny hosting Postgres (do decyzji po Fazie 1)

Plan zostawia cloudbuild.yaml bez zmian. Kiedy wybierzemy hosting, osobna sesja: dobór instancji, `DATABASE_URL` format (Unix socket vs host), connection pool, IAM vs password, pg_cron (dla Cloud SQL trzeba włączyć flagą `cloudsql.enable_pg_cron=on`), backup retention.

Opcje do rozważenia (nie decyzja teraz):

- **Google Cloud SQL** — ten sam region co Cloud Run (`europe-west1`), wbudowany Cloud Run Connector (unix socket, zero hasła), pgvector dostępne, pg_cron włącza się flagą.
- **Neon** — serverless (skalowanie do zera), pgvector natywnie, branche DB dla PR preview. Connection pooling (PgBouncer) wbudowany. Możliwy issue: cold start latency, WebSocket z Prisma wymaga `pg-pool` settings.
- **Supabase** — overkill (auth/storage/realtime nieużywane), ale pgvector + pg_cron.
- **Self-hosted Postgres na VM GCE** — kontrola pełna, koszty niższe, ale ops burden (backupy, HA, upgrade).

Co wszystkie muszą spełnić: PostgreSQL 16+, pgvector 0.7+, możliwość connection przez Cloud Run (unix socket lub private IP).

---

## Weryfikacja

```bash
# 1. Local dev offline
docker compose down -v && docker compose up --build --watch
# ↳ db zdrowy, backend bez Atlas startuje, żadnego ENOTFOUND na *.mongodb.net

# 2. Migracja + extensions + indeksy
cd backend && npx prisma migrate dev --name init_postgres
docker compose exec db psql -U rpgon -d rpgon -c "\dx"   # pgvector obecny
docker compose exec db psql -U rpgon -d rpgon -c "\di *embedding*" # HNSW indexes

# 3. Seed
cd backend && npm run db:seed

# 4. Testy
npm test
npm run test:e2e

# 5. Grep sanity
grep -rn "import.*mongodb" backend/src src --include='*.js' | grep -v node_modules  # expect: 0
grep -rn "new ObjectId" backend/src --include='*.js' | grep -v node_modules          # expect: 0
grep -rn "JSON\.parse" backend/src/services/campaignSync.js backend/src/services/sceneGenerator backend/src/services/livingWorld | grep -v ".test.js" # expect: minimal (tylko faktycznie potrzebne miejsca, nie DB fields)

# 6. E2E smoke manual:
#   a) /register → nowy user
#   b) /character/new → tworzenie postaci (sprawdzić że FE nie wysyła careerData/characteristics/advances — drop w Fazie)
#   c) /campaigns/new → kampania
#   d) Scene-gen SSE działa, scene zapisany, embedding w DB
#   e) docker compose exec db psql … "SELECT id, left(embedding::text, 50) FROM \"CampaignScene\" LIMIT 1;" — widać numery, nie null
#   f) retrieval działa: `searchCampaignMemory` zwraca top-K (log w terminalu / admin endpoint)
#   g) Living World tick: `POST /admin/livingWorld/npcs/tick-batch`, NPC przemieszcza się, WorldEvent zapisany
#   h) Multiplayer: 2 browsery, create room, join, scene-gen (host), sprawdzić że players/characters w DB

# 7. Docker logs clean
docker compose logs backend --tail=200 | grep -i error   # expect: 0 substantial errors
```

---

## Ryzyka i mitigations

| Ryzyko | Wpływ | Mitigation |
|---|---|---|
| `Unsupported("vector")` w Prisma ogranicza Prisma CRUD dla embedding pól | Średni | Wszystkie embeddingi przez `$executeRawUnsafe`/`$queryRaw` (~6 plików razem). Już dziś Mongo wymagał osobnej ścieżki — zamieniamy jedną osobną ścieżkę na drugą. |
| HNSW cold start (pusty indeks) | Niski | HNSW builds incrementally — zero startup cost. |
| `prisma migrate dev` nie wygeneruje `CREATE EXTENSION` | Niski | Prisma dopisze `CREATE EXTENSION` dla rozszerzeń zadeklarowanych w `datasource db { extensions = [vector] }` (Prisma 6). Jeśli nie, dopisujemy ręcznie do migration.sql przed deploy. |
| FK cascade kaskaduje coś niechcąco (np. delete WorldLocation kasuje CampaignDiscoveredLocation) | Niski | Już przeanalizowane per-model. Cascade tam gdzie logika mówi "obiekt podrzędny nie ma sensu bez parenta". Delete WorldLocation w produkcji nie powinien się zdarzyć (canonical=true → chroniony kodem). |
| Dekompozycja Character na tabele → więcej JOINów przy load GET /characters/:id | Średni | Prisma `include: { skills, inventoryItems, materials, clearedDungeons }` — 1 query z 4 joinami vs dziś 1 query z parse 4 JSON-ów. Bench równoważne lub lepsze. |
| FIFO trigger niepoprawnie kasuje recent entries | Średni | Test na seeded data — insert 51 entries, verify count = 50 i oldest zniknął |
| JSON.parse cleanup przeoczy jakieś miejsce → silent regres | Średni | grep-driven list + testy E2E na każdą ścieżkę (`campaignSync`, `processStateChanges`, `livingWorld`) |
| Transakcje blokują zbyt długo (LLM call wewnątrz) | Wysoki | Transakcje **tylko wokół DB writes**. LLM calls przed transakcją, wynik → mutacja w transakcji. Scene-gen pipeline już tak działa. |
| Enumy w Prisma — zmiana wartości wymaga migracji SQL | Niski | Przed migracją zweryfikować że wszystkie dotychczasowe wartości są w enum definition. Grep po literałach string w kodzie (np. `attitude: 'hostile'`). |
| WFRP fields drop psuje Playwright mocks | Niski | `e2e/helpers/mock-responses.js` zawiera `careerData` — zaktualizować mock |

---

## Ryzykowna zmiana do potwierdzenia

**Rozbicie coreState na scalar columns** (`currentLocation`, `currentLocationId`, `gameTime`, `weather`, `sessionTitle`, `boundsMinX/MaxX/MinY/MaxY`) + reszta do `transientState JSONB` — wymusza zmianę w `storage.js` `_parseBackendCampaign` i `campaignSerialize.js`. Jeśli okaże się że hot-path bardziej komplikuje niż pomaga (np. scene-gen pipeline liczy na jeden obiekt), fallback: zostawić `coreState Json @default("{}")` jako monolit. Decyzja na stole — jeśli wolisz cofnąć do monolitu, powiedz. Rekomenduję rozbicie bo eliminuje write-amp, ale nie jest tak egzystencjalne jak reszta dekompozycji.

---

## Explicit non-goals (tego NIE robimy nawet w tej dużej migracji)

- **PostGIS** — coords są euklidesowe 2D flat, Dijkstra <1000 nodes w JS
- **pg_trgm / full-text search** — fuzzy dedupe przez JS substring + RAG
- **Recursive CTE** — graph traversal w JS
- **RLS** — `WHERE userId = $1` w kodzie wystarcza dla 50 DAU
- **Partycjonowanie `WorldEvent` / `CampaignScene`** — <1M wierszy → btree wystarczy
- **Read replicas** — 50 DAU
- **Materialized views** — brak slow aggregates, profile po implementacji, dodaj JEŚLI trzeba
- **LISTEN/NOTIFY** — Cloud Tasks dalej obsługują post-scene work
- **pg_cron** — lazy sweep `setInterval` dla RefreshToken wystarczy w Fazie 1; pg_cron gdy wybierzemy prod hosting
- **Atlas Search (tsvector)** — nieużywane dziś, nie dodajemy
- **`generated always as stored` columns** — spekulatywne, nie wiadomo co denormalizować; profile po użyciu
- **Production hosting decyzja** — osobna sesja
- **Zmiana nazw tabel/kolumn na snake_case** — zostawiamy camelCase jak dziś (mniej zmian w kodzie)
