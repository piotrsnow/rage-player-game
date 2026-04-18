# Idea — Living World atonement loop

## What it is

Escape hatch from vendetta state. When a character has `vendettaActive=true`
on their global reputation row, the scene-gen pipeline should be able to
auto-generate a `redemption_arc` quest that, when completed, resets reputation
partially and clears the vendetta flag.

Key parts:

- **Quest auto-generation trigger** — when a scene-gen request runs in
  vendetta mode AND the player interacts with any high-rep NPC (respected/hero
  label), offer an atonement quest in the scene suggestions. The nano context
  selector marks it as `expand_quests: ['redemption_arc']`.
- **Quest type `redemption_arc`** — new `CampaignQuest.type` enum value with
  special completion handling: on complete, call
  `reputationService.clearVendetta(characterId)` + apply +200 global reputation
  delta + mark outstanding bounty as paid.
- **"Less harsh" toggle** — DM setting `vendettaOptOut: true` disables
  automatic vendetta activation entirely (for players who just want the
  reputation numbers without the narrative pressure). Trade-off: applies -20%
  XP multiplier on quest completions.

## Why it's not adopted now

- **Vendetta is never reached in solo-playtest yet.** Hitting global score ≤ -500
  requires ~25 unjustified good-NPC kills. No playtester has gone there.
  Building the escape hatch before anyone needs it is premature.
- **Quest auto-generation is a pipeline change.** scene-gen currently doesn't
  inject synthetic quest offers — it surfaces existing `CampaignQuest` rows. A
  redemption arc would need either (a) scripted quest templates with
  parameterized victim names, or (b) nano-generated quest objectives. Either
  way, it's a new code path that should wait for a real use case.
- **"Less harsh" toggle needs user-settings plumbing** that we'd rather write
  once, bundled with other Living World toggles (tier opt-in, cross-user
  consumption, ratio override).

Phase 3 core still writes `vendettaActive` via `shouldActivateVendetta` +
clears after 2 game-weeks of inactivity via `shouldClearVendetta`
(lazy-invoked from `aiContextTools.buildLivingWorldContext` → `maybeClearVendetta`).
So the escape exists — you just have to wait it out.

## When it becomes relevant

Adopt when any trigger fires:

1. **First playtester hits vendetta mode** and complains the only way out is
   to stop playing for 2 weeks. That's the signal that a quest loop is needed.
2. **DM requests narrative-driven redemption** in DM Settings — not just score
   mechanics.
3. **Cross-user visibility ships** ([living-world-cross-user-visibility.md](living-world-cross-user-visibility.md))
   — at that point, vendetta affects multi-user narrative and an escape
   valve becomes important for UX.

## Sketch

### Auto-trigger in scene-gen

```js
// In aiContextTools.assembleContext, after building reputation profile:
if (encounter?.vendettaActive && !hasOpenRedemptionArc(campaignId)) {
  const hasHighRepNpcInScene = contextBlocks.livingWorld?.npcs?.some(
    (n) => n.reputationLabel === 'respected' || n.reputationLabel === 'hero',
  );
  if (hasHighRepNpcInScene) {
    selectionResult.expand_quests = [...(selectionResult.expand_quests || []), 'redemption_arc_offer'];
  }
}
```

### Scripted quest template

```js
// backend/src/data/livingWorld/redemptionArcTemplate.js
export function buildRedemptionArc({ actorCharacterId, vendettaSource, offeringNpc }) {
  return {
    questId: `redemption_${Date.now()}`,
    type: 'redemption_arc',
    name: `Odkupienie: ${offeringNpc.name}`,
    description: `${offeringNpc.name} oferuje ci szansę naprawy win. Zadanie zakończy vendettę ${vendettaSource}.`,
    objectives: [
      { id: 'accept', description: `Przyjmij zadanie od ${offeringNpc.name}`, completed: false },
      { id: 'penance', description: 'Wykonaj zlecenie (szczegóły zależą od NPC)', completed: false },
      { id: 'return', description: `Wróć do ${offeringNpc.name} z dowodem ukończenia`, completed: false },
    ],
    rewards: { reputationGlobal: 200, clearVendetta: true, xpMultiplier: 1.5 },
  };
}
```

### Completion hook

```js
// backend/src/services/sceneGenerator/processStateChanges.js — extend
// processQuestStatusChange:
if (status === 'completed') {
  const quest = await prisma.campaignQuest.findFirst({ where: { campaignId, questId } });
  if (quest?.type === 'redemption_arc') {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    const actorId = campaign?.characterIds?.[0];
    if (actorId) {
      await applyAttribution({
        actorCharacterId: actorId,
        actorCampaignId: campaignId,
        worldNpcId: null, // synthetic — ritual atonement, not vs an NPC
        actionType: 'redeemed',
        scopeContext: { /* scope comes from vendettaSource */ },
        justified: true,
        gameTime: new Date(),
      });
      await prisma.worldReputation.update({
        where: { characterId_scope_scopeKey: { characterId: actorId, scope: 'global', scopeKey: '' } },
        data: { vendettaActive: false, score: { increment: 200 }, bountyAmount: 0 },
      });
    }
  }
}
```

(`redeemed` would be a new actionType that `computeReputationDeltas` also
needs to handle — positive global delta.)

## Related

- [knowledge/ideas/living-world-cross-user-visibility.md](living-world-cross-user-visibility.md) — sibling deferred feature
- `backend/src/services/livingWorld/reputationService.js` — where vendetta state lives today
- Plan: `plans/siemanko-chyba-znowu-nie-lucky-flask.md` — Phase 3 atonement spec

## Source

Phase 3 of the Living World plan. Deferred pending a real playtest need (2026-04).
