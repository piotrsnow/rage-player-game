# Living World — cross-campaign persistent world

Per-campaign scope lives in `Campaign*` tables (scenes, NPCs, codex). The
Living World layer adds a shared, campaign-transcending state that feeds
back into each player's scene generation: canonical NPCs, locations,
world events, reputation, and dungeons.

## When it's on

`Campaign.livingWorldEnabled: Boolean` — opt-in per campaign, set in the
creator UI. All Phase 1-7 code paths gate on this flag before touching
Living World tables so legacy campaigns stay unaffected.

## Phases shipped

| Phase | What it adds | Primary services |
|---|---|---|
| 1 | `WorldLocation` + `WorldNPC` + `WorldEvent` ledger, basic context injection | `worldStateService`, `worldEventLog`, `aiContextTools.buildLivingWorldContext` |
| 2 | Companion mode, per-campaign lock, deferred outbox, promotion | `companionService`, `npcPromotion`, `deferredOutbox` |
| 3 (partial) | Reputation + attribution ledger schema; `visibility='global'` reads enabled; rate limit + anonymization deferred | `reputationService`, `worldEventLog.forLocation`, `reputationHook` |
| 4 | DM agent memory per campaign, item attribution hints | `dmMemoryService`, `dmMemoryUpdater`, `processStateChanges.processItemAttributions` |
| 5 | NPC agent loop (on-demand ticks), quest-driven goal assigner, background goals, event-driven global triggers | `npcAgentLoop`, `questGoalAssigner`, `globalNpcTriggers`, `npcTickDispatcher` |
| 6 | Admin dashboard (read-only) | [backend/src/routes/adminLivingWorld.js](../../backend/src/routes/adminLivingWorld.js), [src/components/admin/AdminLivingWorldPage.jsx](../../src/components/admin/AdminLivingWorldPage.jsx) |
| 7 | Travel graph + discovery, deterministic dungeon seeding, world time tuning | `travelGraph`, `userDiscoveryService`, `dungeonSeedGenerator`, `dungeonEntry`, `contentLocalizer` |

## Global visibility — what bubbles up

Events default to `visibility='campaign'`. Only a narrow set gets promoted:

- **`campaign_complete`** — player resolved the main conflict. Payload:
  `{title, summary, majorAchievements, locationName}`. Written by
  `processStateChanges.processCampaignComplete` (B).
- **`major_deed`** — AI flagged `worldImpact: 'major'` + code gate
  confirmed (named-NPC killed, main-quest done, `locationLiberated`,
  deadly encounter, dungeon complete). See
  `shouldPromoteToGlobal` in [processStateChanges.js](../../backend/src/services/sceneGenerator/processStateChanges.js) (C).
- **`dungeon_cleared`** / **`deadly_victory`** — self-gating, written by
  the same processor when the appropriate stateChanges flag fires.
- **Nano audit** — side quests that finish quietly get a cheap nano check
  (`auditQuestWorldImpact`) asking "is this gossip-worthy?" as a backup
  for premium forgetting to flag (C1).

Fame/infamy feed from these events into `Character.fame` / `.infamy`
thresholds (E). Renown crossings turn on the systemPrompt RENOWN suffix
for first-time NPC meetings (G4).

## NPC tick model (D — clone architecture)

Global NPCs (`WorldNPC`) live in ONE location and tick only when
triggered:

- **`onLocationEntry`** — player enters a WorldLocation: top-3 local
  NPCs tick once (throttled per-campaign via `lastLocationPingAt`).
- **`onDeadlinePass`** — any NPC whose `goalDeadlineAt` passed: tick
  once, batch capped (5 default).
- **`onCrossCampaignMajor`** — another campaign's global event fires in
  this location: nearby NPCs ripple once.

See [npc-clone-architecture.md](./npc-clone-architecture.md) for the
clone vs global split and reconciliation rules.

## Critical files

| Purpose | File |
|---|---|
| Schema | [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma) (WorldLocation, WorldNPC, WorldEvent, WorldReputation, WorldNpcAttribution) |
| Event log | [worldEventLog.js](../../backend/src/services/livingWorld/worldEventLog.js) |
| Context assembly | [aiContextTools.js](../../backend/src/services/aiContextTools.js) `buildLivingWorldContext` |
| Promotion / lifecycle | [npcPromotion.js](../../backend/src/services/livingWorld/npcPromotion.js), [npcLifecycle.js](../../backend/src/services/livingWorld/npcLifecycle.js) |
| Goals (quest + background) | [questGoalAssigner.js](../../backend/src/services/livingWorld/questGoalAssigner.js) |
| Global tick triggers | [globalNpcTriggers.js](../../backend/src/services/livingWorld/globalNpcTriggers.js) |
| Clone reconciliation | [cloneReconciliation.js](../../backend/src/services/livingWorld/cloneReconciliation.js) |
| Fame service | [fameService.js](../../backend/src/services/livingWorld/fameService.js) |
| Quest audit | [questAudit.js](../../backend/src/services/livingWorld/questAudit.js) |
| Dungeons (Phase 7) | [dungeonSeedGenerator.js](../../backend/src/services/livingWorld/dungeonSeedGenerator.js), [dungeonEntry.js](../../backend/src/services/livingWorld/dungeonEntry.js), [contentLocalizer.js](../../backend/src/services/livingWorld/contentLocalizer.js), [backend/src/data/dungeonTemplates.js](../../backend/src/data/dungeonTemplates.js) |

## Deferred

- **Phase 3 full** — rate limit per campaign, spoiler filter for active
  quest overlap, anonymization of payload identifiers. Current payloads
  are meta-only (title/summary/locationName), so minimal-viable cross-
  campaign reads ship without these.
- **Phase 5 auto-dispatch** — Cloud Tasks scheduled worker to tick NPCs
  without player scenes. See [knowledge/ideas/living-world-npc-auto-dispatch.md](../ideas/living-world-npc-auto-dispatch.md).
- **Scene orchestration round** — parallel agent reactions post-narration.
  See [knowledge/ideas/living-world-scene-orchestration.md](../ideas/living-world-scene-orchestration.md).
