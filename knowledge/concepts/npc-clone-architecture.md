# NPC Clone Architecture

How the Living World keeps per-scene AI cost flat at scale: separate a
canonical global NPC (one per world) from its per-campaign clones, and
tick each one on a different cadence.

## The problem

100 `WorldNPC`s × 1 nano call per player scene × N concurrent campaigns
hits provider cost and latency quickly. Naive per-scene batch ticks
(Phase 5 initial) worked for one player but didn't scale.

## The split

### Global — `WorldNPC`

- Lives in a single `currentLocationId`.
- Stores its own world-level `activeGoal`, `goalProgress`,
  `homeLocationId`, `schedule`, `goalDeadlineAt`, `alive`, etc.
  (campaign side does not write these — see "Background goals — archived" below).
- Tick fires only when an EVENT demands it (see triggers below). No
  per-scene polling of the full roster.

### Campaign clone — `CampaignNPC` with `worldNpcId`

- Created on clone-on-first-encounter via
  [campaignSandbox.getOrCloneCampaignNpc](../../backend/src/services/livingWorld/campaignSandbox.js)
  — the shadow snapshot takes a subset of canonical fields and then
  evolves independently. The reverse direction — CampaignNPC →
  WorldNPC — is the **post-campaign admin-approval path** via
  [postCampaignPromotion.js](../../backend/src/services/livingWorld/postCampaignPromotion.js)
  (Round E Phase 12b). Inline `maybePromote` was deleted in Slice B —
  canonical `WorldNPC` rows are never created mid-play anymore.
- Premium AI drives the clone inside scenes: dialogue, movement between
  campaign locations, dispositions, acknowledgments. No dedicated nano
  call per clone — the premium pass already handles it.
- Clone state is allowed to diverge from the global. The clone can move
  anywhere the campaign goes; the global keeps living at its own
  location for other campaigns.

## Tick triggers — admin-only

Auto-triggers were removed 2026-04-28 pending a redesign of the whole
campaign-side NPC-action mechanic (see
[knowledge/ideas/npc-action-assignment.md](../ideas/npc-action-assignment.md)).
Today `runNpcTick` fires only when an admin clicks **Manual Tick** on the
admin NPC list:

- `POST /v1/admin/livingWorld/npcs/:id/tick` ([adminLivingWorld.js](../../backend/src/routes/adminLivingWorld.js)) — single NPC, force-bypasses cadence guards (paused / too_soon).
- `POST /v1/admin/livingWorld/tick-batch` — batch via [`runTickBatch`](../../backend/src/services/livingWorld/npcTickDispatcher.js), respects cadence.

Deleted along with this change:
- `globalNpcTriggers.js` (`onLocationEntry`, `onDeadlinePass`, `onCrossCampaignMajor` — first two were per-scene auto, third was always dead code).
- The `postSceneWork.js` tick-batch fallback (limit=5 per scene).

When auto-triggers return they should be redesigned, not restored —
the original event model assumed the BE-driven `assignGoalsForCampaign`
mechanic, which is itself archived.

## Reconciliation ([cloneReconciliation.js](../../backend/src/services/livingWorld/cloneReconciliation.js))

Before each scene, `reconcileCloneBatch({campaignId})` walks every
CampaignNPC with a `worldNpcId`:

| Clone alive | Global alive | Verdict | Effect |
|---|---|---|---|
| yes | yes | `none` | no-op |
| yes | no | `announce_death` | mirror `CampaignNPC.alive = false`, caller may emit a scene reveal |
| no | yes | `none` | "clone killed independently" — multiverse OK |
| — | global missing | `detach_clone` | clear `worldNpcId` so future scenes drop the linkage |

Failures are swallowed — the scene pipeline continues with stale clone
state rather than blocking.

## Background goals — archived

The BE-driven mechanic that wrote per-shadow `activeGoal` /
`goalProgress` and surfaced radiant quest offers (Phase G3) was removed.
Schema columns on `CampaignNPC` remain in place but unused. The concept
+ post-mortem of why it was wrong (BE mapping role → questTemplate is an
AI-judgment call, not a BE-rule call) live in
[knowledge/ideas/npc-action-assignment.md](../ideas/npc-action-assignment.md).

## Cost shape after the change

| Scenario | Naive (scene cadence=1) | **Clone arch** |
|---|---|---|
| 1 player × 100 NPCs in a location | ~$0.01 + 20s | $0–0.0003 (only triggered NPCs) |
| 100 concurrent players | ~$1.00 / min | ~$0.03 / min |

The factor comes from two things: (1) ticks are event-driven, not
player-scene-driven; (2) clones ride on the premium pass for free.
