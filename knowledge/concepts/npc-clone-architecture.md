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
- Stores its own `activeGoal`, `goalProgress`, `homeLocationId`,
  `schedule`, `goalDeadlineAt`, `alive`, etc.
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

## Event-driven triggers ([globalNpcTriggers.js](../../backend/src/services/livingWorld/globalNpcTriggers.js))

Three entry points, each fire-and-forget with budget caps:

- **`onLocationEntry`** — player just entered a `WorldLocation` different
  from the previous scene's. Picks up to 3 NPCs at that location,
  ordered `keyNpc=true` first then `lastTickAt ASC`, stamps
  `lastLocationPingAt` immediately to prevent double-fire from
  concurrent scenes, and runs `runNpcTick(id, { force: true })` on each.
- **`onDeadlinePass`** — any NPC with `goalDeadlineAt <= sceneGameTime`
  gets a catch-up tick (max 5 per scene default). The deadline is
  cleared BEFORE the tick runs so a failed tick doesn't retrigger.
- **`onCrossCampaignMajor`** — when another campaign writes a
  `visibility='global'` event in this location, up to 2 local NPCs
  tick once so the rumour settles into their state.

All three bypass the normal `tickIntervalScenes` cadence via
`force: true`. Legacy `runTickBatch` remains as a belt-and-suspenders
fallback at `limit=5` for NPCs not caught by any trigger.

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

## Background goals

For globals without a quest role, `questGoalAssigner.generateBackgroundGoal`
picks a role-appropriate sideways agenda from a deterministic pool.
Some entries are tagged `offerable + template` — when surfaced in
`aiContextTools.buildLivingWorldContext`, premium AI may offer them as a
radiant quest (`stateChanges.newQuests[].source = 'npc_radiant'`). See
knowledge/concepts/living-world.md and the G3 flow.

## Cost shape after the change

| Scenario | Naive (scene cadence=1) | **Clone arch** |
|---|---|---|
| 1 player × 100 NPCs in a location | ~$0.01 + 20s | $0–0.0003 (only triggered NPCs) |
| 100 concurrent players | ~$1.00 / min | ~$0.03 / min |

The factor comes from two things: (1) ticks are event-driven, not
player-scene-driven; (2) clones ride on the premium pass for free.
