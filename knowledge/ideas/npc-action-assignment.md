# NPC action assignment — archived mechanic

A campaign-side mechanic that wrote per-`CampaignNPC` `activeGoal` (a Polish-language micro-goal string) and `goalProgress` JSON metadata, surfaced to premium scene-gen as flavor + radiant-quest hooks. Removed 2026-04-28 because the practical job it tried to do — "tell the player what an NPC is up to / what they should do next" — is now solved by a small post-quest scene without persistent NPC-state machinery.

The schema columns (`CampaignNPC.activeGoal: String?`, `CampaignNPC.goalProgress: Json?`) remain in place but are unused on the shadow side. Reusing them is fine when this mechanic returns; redesigning around them is fine too.

## What it was

Orchestrator `assignGoalsForCampaign(campaignId)` in `backend/src/services/livingWorld/questGoalAssigner/index.js`. Ran 2× per scene (once from `processStateChanges` when quest/NPC state changed, once unconditionally from `postSceneWork`). For every `CampaignNPC` shadow:

1. **Quest role** — `classifyQuestRole(npcId, quests)` → `'giver' | 'turnIn' | null`. Templated goal via `buildGoalString(role, {characterName, coLocated})`:
   - giver + co-located → `Czekam na rozmowę z {char}`
   - giver + not co-located → `Szukam {char} żeby przekazać zadanie`
   - turnIn analogous
2. **"Wracam do domu"** — fallback when no quest role: if shadow had `worldNpcId`, canonical had `homeLocationId`, and shadow was not currently at home → `Wracam do swojego miejsca: {homeName}`. (F5b made this fire spuriously: shadow `lastLocationId` is polymorphic — `world` vs `campaign` kind — but the comparison was kind-blind, so a shadow at a `CampaignLocation` was always "not at home" even when canonically settled.)
3. **Background goal** — `generateBackgroundGoal({role, personality})` picked a deterministic flavor goal from a hardcoded role-keyed pool (e.g. `karczmarz` → "Doglądam stałych klientów").

Idempotent: if `cn.activeGoal === nextGoal`, no write fired.

Reads on the prompt side:
- `aiContextTools/contextBuilders/npcGoalMapping.js` mapped shadows to scene-context entries with `activeGoal`, `radiantOffer`, `recentMilestones`, `recentlyArrived` flags.
- `sceneGenerator/contextSection.js` rendered them as `goal: "..."`, `JUST ARRIVED at this location`, `recent activity: a → b → c`, and the radiant offer hint.

## The radiant-quest variant (Phase G3)

Some background-goal templates were tagged `offerable: true` + `questTemplate: <string>` in the BE pool. When `assignGoalsForCampaign` picked one of those, it also wrote `goalProgress` JSON `{ offerableAsQuest: true, questTemplate, source: 'background' }`. `npcGoalMapping` parsed this into a `radiantOffer = { template }` field, and `contextSection` rendered:

> radiant quest available: template="..." — MAY be offered to the player if interaction is natural; on offer emit stateChanges.newQuests entry with source:"npc_radiant"

Premium then decided whether to actually weave the offer into dialog, and on offer emitted `stateChanges.newQuests[]` with `source: 'npc_radiant'`.

## Why it was wrong

The two failure modes are independent — both worth recording.

### 1. Practical: no longer needed

The whole point of `assignGoalsForCampaign` was to give premium a per-NPC sticky note saying "this NPC is currently waiting for the player / shopping for X / heading home". That information is now delivered better by:

- A dedicated post-quest mini-scene that tells the player directly what to do next.
- The NPC's own dialog when the player interacts (premium has memory + hearsay + party state — it does not need a 1-line goal hint to behave coherently).

Running the assigner 2× per scene cost ~60 wasted Prisma queries per scene at 10 NPCs (the original P0.1 entry in `plans/scaling-and-debt.md` — also gone), produced visible noise like spurious "wracam do swojego miejsca" goals, and added cognitive load to scene-gen reads.

### 2. Design: BE deciding "this can be a radiant quest" was AI's job

The radiant-quest variant hardcoded `role → questTemplate` mappings in `backgroundGoals.js`: karczmarz → drunk-in-cellar, kowal → iron-collection, etc. That's a narrative judgment. Whether *this* karczmarz on *this* day in *this* situation could plausibly offer *that* quest depends on context the BE never had:

- Has the player already done that quest type recently?
- Is the NPC's mood / disposition / setting consistent with offering work right now?
- Does the questTemplate fit the campaign's genre and the current arc?

A pre-baked role→template pool can only ever be a stochastic-grade filler. The actual decision belongs to the AI in-scene, looking at the full state.

## When it becomes relevant again

Re-introduce a campaign-side NPC-action mechanic when one of these starts hurting:

- Players need to feel that NPCs have **persistent agency between scenes** — the NPC was doing X on the last scene, X has now progressed, the NPC is somewhere different doing something different. Today this lives in player imagination + premium's per-scene improvisation, which is fine until it isn't.
- Cross-NPC choreography: NPC A and NPC B should converge on the same plan / location based on their respective goals, without the player having to watch every scene.
- Open-world freeroam (see `freeroam-mode.md`): no main quest spine → NPCs need to be visibly busy or the world feels static.

## How to redo this if/when it returns

Notes to self for the redesign — none of these are commitments, just direction:

- **AI judges radiant-ness, not BE.** No hardcoded role→questTemplate pool. The "could this NPC plausibly offer a quest right now?" decision belongs in the scene prompt with full context. BE can offer the *machinery* (here is the NPC's goal/state, here is space in `stateChanges.newQuests[]`) — not the *answer*.
- **One write path, one read path.** The old design had ambiguity: the writer was BE-driven, but premium also wrote `stateChanges` with `source: 'npc_radiant'`. Pick one source of truth.
- **Don't run on every scene.** The 2× cadence was a brute force. If goals exist, refresh them on quest-state change events only, or batch via Cloud Tasks.
- **Schema reuse vs redesign.** `activeGoal` (string) + `goalProgress` (json) are generic enough to reuse — but if the new mechanic needs structured goal types (e.g. `{type: 'travel_to', targetLocationId, deadlineAt}`) it might be cleaner to introduce dedicated columns and let the old strings die.
- **Don't double-write.** `WorldNPC.activeGoal` is the canonical world-tick goal, written by `npcAgentLoop`. The shadow side, when it returns, must stay independent — no mirror, no fallback. The Round B principle was right.

## Code that disappeared

- Function `assignGoalsForCampaign` in `questGoalAssigner/index.js`
- File `questGoalAssigner/questRole.js` (`classifyQuestRole`, `buildGoalString`)
- File `questGoalAssigner/backgroundGoals.js` (`generateBackgroundGoal` + the offerable templates)
- File `questGoalAssigner.test.js` (top-level)
- Call sites in `processStateChanges/index.js` and `postSceneWork.js`
- The `goalProgress` parsing + `radiantOffer` mapping in `aiContextTools/contextBuilders/npcGoalMapping.js`
- The `goal:`, `recent activity:`, `radiant quest available:`, "JUST ARRIVED at this location" rendering in `sceneGenerator/contextSection.js`
- F5b debt entry "go home check kind+id mismatch" in `plans/scaling-and-debt.md` (problem dissolved with the orchestrator)
- Scaling-and-debt P0.1 (~60 queries/scene) entry — same

## What stayed

- `pickQuestGiver` (Phase D) in `questGoalAssigner/npcGiverPicker.js` — independent mechanic, fires only when nano flags `quest_offer_likely`.
- `categorize` / `NPC_CATEGORIES` in `questGoalAssigner/categories.js` — used by `campaignSandbox` for clone categorization.
- `roleAffinity.js` — internal helper for `pickQuestGiver`.
- `pendingIntroHint` flow (set by quest trigger `onComplete.moveNpcToPlayer`, surfaced once per scene then cleared) — separate live mechanic, was always orthogonal to action-assignment.
- `WorldNPC.activeGoal` + `goalProgress` (canonical, world-level) — `npcAgentLoop` continues to read/write them for background world simulation.

## Related

- [autonomous-npcs](autonomous-npcs.md) — full agent-loop concept; the BE assigner was a much smaller cousin
- [living-world-npc-auto-dispatch](living-world-npc-auto-dispatch.md) — Cloud Tasks NPC ticking; would be the dispatch layer if action assignment returns
- `knowledge/concepts/campaign-sandbox.md` — describes the (now-vestigial) `activeGoal`/`goalProgress` columns on `CampaignNPC`
