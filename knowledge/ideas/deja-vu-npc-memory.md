# Deja vu — canonical NPC fragments from past campaigns

## Idea

When a canonical `WorldNPC` participated in a now-completed campaign, surface fragments of their per-campaign memory (`CampaignNpcExperience` + per-campaign location knowledge) in *future* campaigns as **dream-like, location-less fragments** — not actionable canonical knowledge, just flavor.

> Player asks Alice: *"Have you ever heard of the Bandit Camp?"*
>
> Alice (canonical, never visited Bandit Camp in this campaign): *"The name… haunts me, like a half-remembered dream. I see torches and a man with a scar, but I don't know why."*

## Motivation

Two architectural realities in tension:

1. **Per-campaign isolation** ([CampaignNPC shadow](../concepts/campaign-sandbox.md)) prevents cross-campaign leak — canonical Alice has a fresh shadow per campaign, so "Bandit Camp" knowledge from campaign X doesn't pollute campaign Y. ✅ working as designed.

2. **Player intuition that NPCs have lived lives** — a totally amnesiac canonical NPC feels off when the player knows that NPC has had encounters in past campaigns the world remembers (via `WorldEvent` log + Stage 2b `WorldNPC.knowledgeBase` promoted experiences).

The current Stage 2b memory promotion ([postCampaignMemoryPromotion.js](../../backend/src/services/livingWorld/postCampaignMemoryPromotion.js)) already lifts *major* `CampaignNpcExperience` entries up to `WorldNPC.knowledgeBase` with `source: 'campaign:<id>'`. Deja vu is the **flavor wrapper** for those promoted entries when they reference a `CampaignLocation` that was never promoted to canonical.

## Sketch

### Trigger
- Stage 2b promotion runs after campaign ends
- For each promoted `CampaignNpcExperience` entry, scan for `CampaignLocation` references (by name OR FK once F5b lands)
- If the referenced CampaignLocation was NOT promoted to a canonical WorldLocation in the same writeback batch:
  - Tag the resulting `WorldNPC.knowledgeBase` entry with `kind: 'fragment'` (vs `kind: 'memory'`)
  - Strip the location name from the content; replace with sensory anchors (smells, sounds, faces)

### Prompt rendering
- `[NPC_MEMORY]` block in scene prompt distinguishes:
  - `(zawsze)` — canonical baseline knowledge
  - `(ta kampania)` — current campaign experience
  - `(poprzednia kampania)` — Stage 2b promoted from past campaign
  - `(deja vu)` — fragment kind from past campaign, dream-like phrasing required

### What changes in code
- [postCampaignMemoryPromotion.js](../../backend/src/services/livingWorld/postCampaignMemoryPromotion.js) — when promoting, detect un-promoted CampaignLocation refs, strip them, tag entry as `kind: 'fragment'`
- [npcBaseline.js buildNpcMemory](../../backend/src/services/aiContextTools/contextBuilders/npcBaseline.js) — render `(deja vu)` tag for fragment entries
- [systemPrompt/staticRules.js](../../backend/src/services/sceneGenerator/systemPrompt/staticRules.js) — add a rule: when NPC references a `(deja vu)` fragment, the dialogue MUST frame it as dream/half-memory/intuition; never as concrete fact

## When it becomes relevant

- After F5b lands and `CampaignLocation` is the canonical home for AI-invented locations
- Once Stage 2b memory promotion is observably populating cross-campaign canonical knowledge — easy to spot fragments that reference defunct CampaignLocations
- Player feedback: "this NPC feels too forgetful, I expected them to recognize me from last time" — but balanced against the cross-campaign-leak prevention

## Open questions

- How long does a fragment last? Forever, or fade after N campaigns / N months?
- Should the deja-vu tag be visible to the player in any UI (NPC sheet?), or strictly prompt-internal flavor?
- Does the fragment ever become "real memory" again if a CampaignLocation with the same name is created in a subsequent campaign? (probably no — would create weird false-confirmation effects)
- Promotion approval: should admin promote-to-canonical of a CampaignLocation retroactively upgrade related fragments back to full memories? (probably yes — the place existed all along, NPCs really did know about it)

## Adjacent

- [side-quests-between-campaigns](side-quests-between-campaigns.md) — same energy; cross-campaign continuity for the player's relationship with the world
- [living-world-cross-user-visibility](living-world-cross-user-visibility.md) — same architectural problem (cross-scope memory) from the cross-USER angle rather than cross-CAMPAIGN
