# Side quests as a between-campaign feature

## When it becomes relevant

Adopt when a **campaign-to-campaign continuity** feature lands and the player wants activities that bridge arcs without polluting the main quest attention.

Triggers:

- Between-campaign "downtime" flow exists (no active main quest, character persists).
- Player reputation / faction standing mature enough to drive quest generation.
- We have a canonical-NPC linkage stable enough to reuse as quest givers.

## Current state (2026-04)

Side quest infrastructure exists — Prisma schema, `processStateChanges`, FE renderers all support `type: 'side' | 'personal' | 'faction'` — but **disabled for scene generation**:

- [backend/src/services/sceneGenerator/systemPrompt/worldBlock.js `buildActiveQuestsBlock`](../../backend/src/services/sceneGenerator/systemPrompt/worldBlock.js) filters `q.type === 'main'`.
- [src/components/gameplay/world/QuestsTab.jsx](../../src/components/gameplay/world/QuestsTab.jsx) filters active + completed to main only.
- [src/components/gameplay/QuestOffersPanel.jsx](../../src/components/gameplay/QuestOffersPanel.jsx) filters offers to main only.
- [staticRules.js `playerInputPolicyBlock`](../../backend/src/services/sceneGenerator/systemPrompt/staticRules.js) tells the LLM *"Quest offers emitted this way MUST tie into the main quest line — side/faction/personal quest creation is disabled in this build."*
- [conditionalRules.js "MAIN QUEST COMPLETED" block](../../backend/src/services/sceneGenerator/systemPrompt/conditionalRules.js) no longer mentions side quests as a fallback.

## Decision rationale

Observed: LLM was generating fluff side quests mid-main-arc that competed with main-quest attention, bloated the Active Quests prompt block (~600-1500 znaków per scena with 3-4 side quests), and muddied the narrative arc. `type: 'main'` filter is a cheap feature-gate.

## Why between-campaigns (not mid-campaign)

A between-campaign side-quest hub would:

- Run during "downtime" between main arcs (no active main quest — `conditionalRules.js allMainDone=true`).
- Persist across campaigns for the same character (via `Character` library, not `CampaignQuest`).
- Use canonical `WorldNPC`s as quest givers (linked via `CampaignNPC.canonicalWorldNpcId`).
- Unlock from player reputation / faction standing (`WorldReputation` check).
- Not compete with main-arc pacing.

## Where to start (when the trigger hits)

- **Prompt:** re-enable filter — allow `q.type === 'main' || q.type === 'side'` in `buildActiveQuestsBlock`, but add context hint `"side quest count: N — these are background activities, don't divert main arc"`.
- **FE:** un-hide side filters in `QuestsTab` and `QuestOffersPanel`. Re-expose `TYPE_COLORS.side`/`TYPE_ICONS.side`.
- **Generator:** add a dedicated between-campaign scene flow (similar to `finaleSceneGenerator`) that seeds side quests from `WorldReputation` + canonical-NPC pool. Do NOT let mid-main-arc scene generation emit `type: 'side'`.
- **processStateChanges:** ensure side-quest completion does NOT auto-promote to `campaignComplete`. Only main-quest completion triggers global WorldEvent.

## Blockers

- Between-campaign flow itself doesn't exist yet — that's the prereq.
- Side quests as mid-campaign fluff should stay **disabled** until the between-campaign hub is designed and built. Partial adoption (e.g. re-enabling just the prompt filter) would regress the original problem.
