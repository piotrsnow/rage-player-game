# Campaign Sandbox — CampaignNPC shadows alongside canonical WorldNPC

Round B principle: **WorldNPC and CampaignNPC are independent.** Each
carries its own goal / progress state. The canonical WorldNPC lives its
own world life (ticked by `npcAgentLoop`), while per-campaign
`CampaignNPC` shadows represent the NPC's role in that specific
playthrough (quest giver, ally, enemy). Neither syncs into the other.

This is the anti-corruption barrier — no action inside a campaign can
mutate the canonical world, and no world tick leaks into campaign
narration.

## Who owns what

| Field | WorldNPC (canonical) | CampaignNPC (shadow) |
|---|---|---|
| `name`, `role`, `personality`, `alignment` | author-of-record / seed canon | cloned on first encounter, editable per-campaign |
| `alive` | canonical truth; mutated only by Phase 2 kill flow (still operating on canon) | shadow flag authoritative during play |
| `currentLocationId` | canonical default ("where the NPC normally is") | shadow `lastLocationId` authoritative for this playthrough |
| `activeGoal` | **world-level goal** — what the NPC is doing in the background (ticked by `npcAgentLoop`) | **campaign-level goal** — role in this quest (set by `assignGoalsForCampaign`) |
| `goalProgress` | world-tick progress | campaign-goal progress |
| `lastTickAt`, `lastTickSceneIndex`, `tickIntervalScenes` | **canonical only** — tick scheduler runs on the world-level goal | — |
| `pausedAt`, `pauseSnapshot` | **canonical only** — Phase 2 lifecycle pause on location leave | — |
| `goalDeadlineAt`, `lastLocationPingAt` | **canonical only** — tick scheduler infra | — |
| `knownLocationIds` | **canonical only** (seeded scope doesn't vary per campaign) | — |
| `keyNpc`, `homeLocationId` | **canonical only** | — |
| `pendingIntroHint` | — | shadow owns (one-shot per campaign, set by quest trigger) |
| `category` | canonical default | shadow override |

`activeGoal` / `goalProgress` exist on BOTH — deliberately — because the
two live separate lives. The scene assembler renders the shadow value
(campaign context) and ignores the canonical value. `npcAgentLoop`
reads the canonical value and ignores the shadow.

The merged view for scene-gen lives in
[`campaignSandbox.listNpcsAtLocation`](../../backend/src/services/livingWorld/campaignSandbox.js):
returns an "enriched shape" where shadow values win for campaign-scoped
fields (activeGoal, goalProgress, lastLocationId, pendingIntroHint,
category) and canonical values fill in for canonical-only fields (keyNpc,
homeLocationId, knownLocationIds, tick infra).

## Clone triggers

| Trigger | Entry point |
|---|---|
| Player enters the NPC's location | `listNpcsAtLocation(locationId, { campaignId })` auto-clones any canonical WorldNPC here without a shadow |
| Quest trigger `onComplete.moveNpcToPlayer` | `fireMoveNpcToPlayerTrigger` in [processStateChanges.js](../../backend/src/services/sceneGenerator/processStateChanges.js) calls `getOrCloneCampaignNpc` then `setCampaignNpcLocation` + `setCampaignNpcIntroHint` |
| Campaign creation (starter bind) | [`crud.js`](../../backend/src/routes/campaigns/crud.js) calls `getOrCloneCampaignNpc` for `startSpawn.npcCanonicalId` |

Note: fresh shadows start with `activeGoal: null` / `goalProgress: null`.
They're NOT seeded from canonical `activeGoal` — that would leak the
world-level goal into campaign narration. `assignGoalsForCampaign` fills
them in when the NPC takes on a quest role.

## Writers

| Writer | Target |
|---|---|
| `assignGoalsForCampaign` | CampaignNPC only — sets the shadow's campaign-level `activeGoal` and `goalProgress`. **Never mirrors to WorldNPC.** |
| `setCampaignNpcLocation` / `setCampaignNpcIntroHint` / `clearCampaignNpcIntroHint` | CampaignNPC only. |
| `npcAgentLoop.runNpcTick` | WorldNPC only — mutates the canonical `activeGoal`, `goalProgress`, `lastTickAt`, etc. Independent of any campaign. |
| `globalNpcTriggers.onLocationEntry` / `onDeadlinePass` / `onCrossCampaignMajor` | Queries WorldNPC, triggers `runNpcTick` on the canonical row. |
| `npcTickDispatcher` | WorldNPC. Round B dropped the `goalTargetCampaignId` filter (dead hack from the pre-shadow era). |
| `killWorldNpc`, `companionService`, `npcLifecycle` (pause/resume) | Canonical — these mutate world state intentionally (NPC actually dies / actually joins party / actually pauses life). |

## Hearsay knowledge resolver

[`campaignSandbox.resolveNpcKnownLocations`](../../backend/src/services/livingWorld/campaignSandbox.js)
returns the set of location ids an NPC is ALLOWED to reveal in dialog:

1. The NPC's anchor location (shadow `lastLocationId` OR canonical
   `currentLocationId`).
2. Every 1-hop neighbour via `WorldLocationEdge`.
3. Every id in canonical `WorldNPC.knownLocationIds` (seed-authored —
   Kapitan Gerent knows dungeons, Eleya knows wilderness, etc.).

Used by the `[NPC_KNOWLEDGE]` prompt block (scene-gen) and the
`locationMentioned` policy handler in `processStateChanges` (rejects
out-of-scope leaks).

## Dropped in Round B cleanup

These are gone entirely — DO NOT reintroduce:

- `WorldNPC.goalTargetCampaignId` / `goalTargetCharacterId` — old hack
  tagging a canonical goal with "which player's campaign it's aimed at".
  Shadow split replaces this — each campaign's quest-giver goal lives
  on its own shadow.
- `resolveTargetPlayerLocation` in `npcAgentLoop.js` — used the
  `goalTargetCampaignId` hack to inject "player is at X" into the nano
  prompt. World tick is world-level; it doesn't know about campaigns.
- Mirror write in `assignGoalsForCampaign` — no longer writes shadow
  changes back to WorldNPC. The two are independent. Round E Phase 12b
  Slice B also dropped the `worldNpcId: { not: null }` filter — the
  assigner now operates on the full CampaignNPC shadow pool (canonical
  home-derivation is opt-in per-row).
- `npcTickDispatcher` campaign filter — dispatcher ticks whichever
  WorldNPCs have world-level activeGoals, regardless of who's playing.
- `maybePromote` + inline `findOrCreateWorldNPC` during play (Round E
  Phase 12b Slice B) — canonical `WorldNPC` rows are NEVER created
  mid-campaign anymore. All promotion goes through
  [`postCampaignPromotion.js`](../../backend/src/services/livingWorld/postCampaignPromotion.js)
  post-campaign, then admin approval (Phase 13a) commits the row.
  Ephemeral `CampaignNPC` rows (`worldNpcId=null`) are the norm during
  a campaign.

## Open follow-ups

- `npcLifecycle` (Phase 2 pause-on-leave) still operates on canonical
  `pausedAt`/`pauseSnapshot`. If we want per-campaign pause semantics
  (each playthrough pauses independently) that'd be a future migration.
  For now, pause is world-level.
- `CampaignNPC.lastLocation` (flavor string) stays as-is; authoritative
  resolution is `lastLocationId` FK.
