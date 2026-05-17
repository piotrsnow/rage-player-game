# Unified Entity Tables Migration — Status

Branch: `feat/unified-entity-tables`
Worktree: `C:\workspace\RPGon-unified-tables`

## Completed

### Phase 1: Schema + Migration
- [x] New `schema.prisma` with unified `Npc` and `Location` models
- [x] Migration SQL (`20260518000000_unified_entity_tables`)
  - Creates new tables, copies data, relinks FKs, drops old tables

### Phase 2: Core Infrastructure
- [x] `npcRepository.js` + `locationRepository.js` (DAL query helpers)
- [x] Rewritten `locationRefs.js` (thin compat wrapper, no kind dispatch)
- [x] Rewritten `campaignSandbox.js` (clone = INSERT in same table)
- [x] Rewritten `worldStateService.js` (unified table queries)
- [x] Rewritten `userDiscoveryService.js` (no locationKind branching)
- [x] Rewritten `postCampaignPromotion.js` (UPDATE not cross-table copy)
- [x] Rewritten `postCampaignLocationPromotion.js` (UPDATE not copy+delete)
- [x] Updated `shared/domain/locationGraph.js` (`kind` is vestigial, `refsEqual` uses ID only)

### Phase 3: Mechanical Renames (batch)
- [x] All `prisma.worldNPC` → `prisma.npc` (72 files)
- [x] All `prisma.worldLocation` → `prisma.location`
- [x] All `prisma.campaignNPC` → `prisma.npc`
- [x] All `prisma.campaignLocation` → `prisma.location`
- [x] All child table renames (20 files):
  - `campaignDiscoveredLocation` → `discoveredLocation`
  - `campaignNpcExperience` → `npcExperience`
  - `campaignNpcRelationship` → `npcRelationship`
  - `worldNpcKnowledge` → `npcKnowledge`
  - `worldNpcDialogTurn` → `npcDialogTurn`
  - `worldNpcAttribution` → `npcAttribution`
  - `worldNpcKnownLocation` → `npcKnownLocation`
  - `worldLocationKnowledge` → `locationKnowledge`
  - `campaignNpcLocationMovement` → `npcLocationMovement`
- [x] `seedWorld.js` updated for unified tables

## In Progress (subagents)
- [ ] `graphService.js` + `aiResolver.js` — remove kind dispatch
- [ ] `processStateChanges/*` — update all handlers
- [ ] `contextBuilders/*` — update all context builders

## Remaining (semantic changes — ~35 files, ~300 occurrences)

These files still reference `lastLocationKind`, `fromKind`, `toKind`, `locationKind` 
columns that no longer exist. Each needs per-file contextual updates:

### High Priority (API/route layer)
- `routes/adminLivingWorld.js` (24 refs)
- `routes/livingWorld.js` (50 refs — partially done)
- `routes/campaigns/crud.js` (2 refs)
- `routes/adminCampaigns/npcs.js` (1 ref)
- `routes/adminCampaigns/edges.js` (4 refs)
- `routes/ai/locationBoard.js` (8 refs)
- `routes/ai/fieldMap.js` (6 refs)

### Medium Priority (services)
- `locationGraph/movementEngine.js` (20 refs)
- `locationGraph/graphValidator.js` (22 refs)
- `locationGraph/graphContextBuilder.js` (3 refs)
- `locationGraph/seedEdges.js` (16 refs)
- `locationGraph/migrateExistingCampaign.js` (8 refs)
- `livingWorld/travelGraph.js` (15 refs)
- `livingWorld/campaignNpcLocationMovement.js` (16 refs)
- `livingWorld/dungeonSeedGenerator.js` (6 refs)
- `livingWorld/postCampaignWriteback.js` (7 refs)
- `campaignSnapshot.js` (2 refs)
- `campaignSync.js` (2 refs)
- `adminConsistencyValidator.js` (7 refs)

### Lower Priority (scripts, tests)
- `scripts/seedWorldEdges.js` (8 refs)
- Test files (various)

## Key Mapping Reference

| Old Column/Pattern | New Pattern |
|---|---|
| `CampaignNPC.lastLocationKind` + `lastLocationId` | `Npc.currentLocationId` (plain FK) |
| `Campaign.currentLocationKind` + `currentLocationId` | `Campaign.currentLocationId` (plain FK) |
| `LocationEdge.fromKind` + `fromId` / `toKind` + `toId` | `LocationEdge.fromLocationId` / `toLocationId` |
| `CampaignEdge.fromKind` + `fromId` / `toKind` + `toId` | `CampaignEdge.fromLocationId` / `toLocationId` |
| `CampaignDiscoveredLocation.locationKind` | Removed — check `location.campaignId` instead |
| `CharacterClearedDungeon.dungeonKind` | Removed — `dungeonId` is plain FK to Location |
| `LocationPromotionCandidate.sourceLocationKind` | Removed — `sourceLocationId` is plain FK |
| `CampaignNPC.worldNpcId` | `Npc.canonicalNpcId` |
| `WorldNPC.canonicalId` | `Npc.canonicalId` (unchanged) |
