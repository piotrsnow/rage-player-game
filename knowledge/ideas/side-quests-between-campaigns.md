# Side quests as a between-campaign feature

## When it becomes relevant

Adopt when a **campaign-to-campaign continuity** feature lands and the player wants activities that bridge arcs without polluting the main quest attention.

Triggers:

- Between-campaign "downtime" flow exists (no active main quest, character persists).
- Player reputation / faction standing mature enough to drive quest generation.
- We have a canonical-NPC linkage stable enough to reuse as quest givers.

## Current state (2026-05)

Side quest **visibility** in scene generation + UI is enabled (auto-detection of side-quest objective completion was broken: LLM never saw side quest objectives in the prompt, so it couldn't emit `questUpdates` for them — analogous to the incident-judge fix in `e703e1a`). Side quests rendered in a dedicated "--- Background Quests ---" sub-section with a directive to not divert the main arc:

- [backend/src/services/sceneGenerator/systemPrompt/worldBlock.js `buildActiveQuestsBlock`](../../backend/src/services/sceneGenerator/systemPrompt/worldBlock.js) — orchestrator splits main vs background, separate slice limits (5 / 3).
- [src/components/gameplay/world/QuestsTab.jsx](../../src/components/gameplay/world/QuestsTab.jsx) — renders all types, main first, then by id.
- [src/components/gameplay/QuestOffersPanel.jsx](../../src/components/gameplay/QuestOffersPanel.jsx) — no type filter, all offers visible.
- [staticRules.js](../../backend/src/services/sceneGenerator/systemPrompt/staticRules.js) — has BACKGROUND QUESTS hint near questUpdates rules.

What is **still TODO** (the actual between-campaign feature):

- Between-campaign "downtime" scene flow (similar to `finaleSceneGenerator`) that seeds side quests from `WorldReputation` + canonical-NPC pool.
- Persistence across campaigns for the same character (via `Character` library, not `CampaignQuest`).
- Reputation / faction unlock gating.

## Decision rationale (historic context)

Originally (pre-2026-05), side quests were filtered out of scene generation entirely. Observed problem: LLM generated fluff side quests mid-main-arc that competed with main-quest attention, bloated the Active Quests prompt block (~600-1500 znaków per scena with 3-4 side quests), and muddied the narrative arc.

The `Background Quests` sub-section + slice limit (3) + explicit "don't divert main arc" directive replaces the blanket filter. Trade-offs:

- Pro: side quests created via questOffers (graph mode) actually progress now; user sees them in UI; auto-detection works.
- Con: extra ~200-500 token per scene when side quests active; small risk of LLM still drifting onto side beats. Mitigated by sub-section header + directive.
- Cost note: side-quest auto-completion fans out to `auditQuestWorldImpact` (nano LLM call) per completed quest — fine for 1-2 in flight, watch if many concurrent side quests appear.

## Why between-campaigns (not mid-campaign)

A between-campaign side-quest hub would:

- Run during "downtime" between main arcs (no active main quest — `conditionalRules.js allMainDone=true`).
- Persist across campaigns for the same character (via `Character` library, not `CampaignQuest`).
- Use canonical `WorldNPC`s as quest givers (linked via `CampaignNPC.canonicalWorldNpcId`).
- Unlock from player reputation / faction standing (`WorldReputation` check).
- Not compete with main-arc pacing.

## Where to start (when the trigger hits)

- **Generator:** add a dedicated between-campaign scene flow (similar to `finaleSceneGenerator`) that seeds side quests from `WorldReputation` + canonical-NPC pool. Mid-main-arc emergent side quests through `processQuestOffers` already work — but the between-campaign hub is the bigger feature.
- **processStateChanges:** ensure side-quest completion does NOT auto-promote to `campaignComplete`. Only main-quest completion triggers global WorldEvent. (Already in place — `processStateChanges/index.js:617-639` distinguishes main vs side for global WorldEvent.)

## Blockers

- Between-campaign flow itself doesn't exist yet — that's the prereq for the larger feature.
- Mid-arc side quest visibility (this iteration) is intentionally limited (`slice(0, 3)` background quests, never overrides main arc). If the LLM starts derailing scenes onto side quests, tighten the directive in `worldBlock.js` Background Quests sub-section header or reduce the slice limit further.
