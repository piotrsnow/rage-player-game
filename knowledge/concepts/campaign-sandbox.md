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
| `activeGoal` | **world-level goal** — what the NPC is doing in the background (ticked by `npcAgentLoop`) | column exists but **vestigial** — BE-driven assigner removed; see [knowledge/ideas/npc-action-assignment.md](../ideas/npc-action-assignment.md) |
| `goalProgress` | world-tick progress | column exists but **vestigial** (same idea archive) |
| `lastTickAt`, `lastTickSceneIndex`, `tickIntervalScenes` | **canonical only** — tick scheduler runs on the world-level goal | — |
| `pausedAt`, `pauseSnapshot` | **canonical only** — Phase 2 lifecycle pause on location leave | — |
| `goalDeadlineAt`, `lastLocationPingAt` | **canonical only** — tick scheduler infra | — |
| known-location grants (`WorldNpcKnownLocation`) | **canonical only** (seeded scope doesn't vary per campaign) | — |
| `keyNpc`, `homeLocationId` | **canonical only** | — |
| `pendingIntroHint` | — | shadow owns (one-shot per campaign, set by quest trigger) |
| `category` | canonical default | shadow override |

`activeGoal` / `goalProgress` exist on both rows for historical reasons.
Today only the canonical (WorldNPC) side is read — `npcAgentLoop` writes
and reads it for world simulation. The shadow columns sit dormant pending
a redesign of the campaign-scope NPC-action mechanic; see
[knowledge/ideas/npc-action-assignment.md](../ideas/npc-action-assignment.md).

The merged view for scene-gen lives in
[`campaignSandbox.listNpcsAtLocation`](../../backend/src/services/livingWorld/campaignSandbox.js):
returns an "enriched shape" where shadow values win for campaign-scoped
fields (lastLocationKind/Id, pendingIntroHint, category) and canonical
values fill in for canonical-only fields (keyNpc, homeLocationId,
`WorldNpcKnownLocation` grants, tick infra).

## Clone triggers

| Trigger | Entry point |
|---|---|
| Player enters the NPC's location | `listNpcsAtLocation(locationId, { campaignId })` auto-clones any canonical WorldNPC here without a shadow |
| Quest trigger `onComplete.moveNpcToPlayer` | `fireMoveNpcToPlayerTrigger` in [processStateChanges.js](../../backend/src/services/sceneGenerator/processStateChanges.js) calls `getOrCloneCampaignNpc` then `setCampaignNpcLocation` + `setCampaignNpcIntroHint` |
| Campaign creation (starter bind) | [`crud.js`](../../backend/src/routes/campaigns/crud.js) calls `getOrCloneCampaignNpc` for `startSpawn.npcCanonicalId` |

Note: fresh shadows start with `activeGoal: null` / `goalProgress: null`.
They're NOT seeded from canonical `activeGoal` — that would leak the
world-level goal into campaign narration. Today nothing writes them on
the shadow side (the BE assigner was removed); they remain at null for
the campaign's lifetime.

## Writers

| Writer | Target |
|---|---|
| `setCampaignNpcLocation` / `setCampaignNpcIntroHint` / `clearCampaignNpcIntroHint` | CampaignNPC only. F5b: `setCampaignNpcLocation` accepts a polymorphic `{ kind, id }` ref (or back-compat bare string treated as `kind='world'`); writes both `lastLocationKind` and `lastLocationId`. |
| `npcAgentLoop.runNpcTick` | WorldNPC only — mutates the canonical `activeGoal`, `goalProgress`, `lastTickAt`, etc. Independent of any campaign. |
| `npcTickDispatcher.runTickBatch` | WorldNPC, admin-only (`POST /v1/admin/livingWorld/tick-batch`). Round B dropped the `goalTargetCampaignId` filter (dead hack from the pre-shadow era). |
| Admin Manual Tick (`POST /v1/admin/livingWorld/npcs/:id/tick`) | Single WorldNPC, force-bypasses cadence guards. Auto-triggers (`globalNpcTriggers.*`) were deleted 2026-04-28. |
| `killWorldNpc`, `companionService`, `npcLifecycle` (pause/resume) | Canonical — these mutate world state intentionally (NPC actually dies / actually joins party / actually pauses life). |

## Hearsay knowledge resolver

[`campaignSandbox.resolveNpcKnownLocations`](../../backend/src/services/livingWorld/campaignSandbox.js)
returns the set of location ids an NPC is ALLOWED to reveal in dialog:

1. The NPC's anchor location (shadow `lastLocationId` if `lastLocationKind='world'`,
   else canonical `currentLocationId`).
2. Every 1-hop canonical neighbour via `Road` (renamed from `WorldLocationEdge` in F5b).
3. Every grant row in `WorldNpcKnownLocation` for this NPC (seed-authored, formerly
   the `WorldNPC.knownLocationIds` JSON array — F3 normalized to a join table).

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
- `assignGoalsForCampaign` orchestrator entirely — the BE-driven mechanic
  (quest-role goals + "wracam do domu" + radiant offer hooks via
  `generateBackgroundGoal`) was archived to
  [knowledge/ideas/npc-action-assignment.md](../ideas/npc-action-assignment.md).
  Schema columns `CampaignNPC.activeGoal` and `goalProgress` remain in
  place but unused on the shadow side, awaiting a redesign.
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
- `CampaignNPC.lastLocation` (flavor string display cache) stays as-is;
  authoritative resolution is the polymorphic `lastLocationKind` +
  `lastLocationId` pair (F5b — kind ∈ `{'world','campaign'}`).
