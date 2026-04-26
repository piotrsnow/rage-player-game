# Idea — Living World cross-user visibility

> **Status (2026-04):** Minimal-viable shipped. `WorldEvent.visibility='global'`
> is written by `processCampaignComplete` and `processWorldImpactEvent`
> (gated on named-NPC kill / main-quest / liberation / deadly / dungeon
> or a nano audit for side quests). `worldEventLog.forLocation` fetches
> global events cross-campaign — current payloads are meta-only
> (title/summary/locationName/gate/reason) so no character-private data
> leaks without an anonymizer.
>
> Rate-limit (e.g. 3 major/tydzień/kampania) and the full spoiler filter
> described below are still deferred. Feed usage observability before
> deciding if/when we need them.
>
> Canonical docs: [../concepts/living-world.md](../concepts/living-world.md).

## What it is

Phase 3 of the Living World plan defined `WorldEvent.visibility` with three tiers:
`campaign` (default, only own campaign sees it), `deferred` (Phase 2 companion
outbox, flushed to `campaign` on leave), and `global` (cross-user — anonymized
events injected into other users' scene context).

The cross-user tier adds three parts:

- **Upgrade rules per event-type** — unprovoked kills of "good" NPCs get
  `visibility: 'global'`; justified kills stay `campaign`; quest completions
  with `requiresUniqueCompletion` become `global` on completion.
- **`spoilerFilter.js`** — strip `userId` / `campaignId` / exact player names
  from the event payload; anonymize actor ("podróżnik", "ktoś"); time-jitter
  (`3 dni temu` → `kilka dni temu`) so foreign scenes don't leak identities.
- **Cross-user `WorldEvent` fetch** — `aiContextTools.buildLivingWorldContext`
  does a second query for `visibility: 'global'` events at the location
  (excluding the current user's own events to avoid self-echo), runs them
  through `spoilerFilter`, and folds them into `recentEvents`.

Also: **per-user opt-out** — Settings toggle `livingWorldConsumeCrossUser`
defaulting to `true`. Users who opt out still *contribute* global events (so
their deeds reach others' worlds), but their own scenes don't see foreign
events.

## Why it's not adopted now

- **No multiplayer users yet.** Project is pre-prod solo-playtest. Cross-user
  visibility only matters once >1 account is running Living World campaigns
  concurrently on the same server.
- **Spoiler-filter correctness is hard to validate solo.** Each rule ("strip
  names", "jitter times", "anonymize factions") needs to hold under hostile
  prompts or it leaks. Without real cross-user traffic the tests would be
  mostly contrived.
- **Conflict resolution (irreversible events) is deferred along with it.**
  `alive: false` first-write-wins, `quest.requiresUniqueCompletion` first-claim
  wins — both need atomic `findOneAndUpdate` plumbing we haven't needed yet.

Phase 3 core (reputation) ships without any cross-user behaviour. All
attributions currently write `visibility: 'campaign'` so the ledger is complete
for future upgrade — no data migration when we flip the switch.

## When it becomes relevant

Adopt when any trigger fires:

1. **First public-signup cohort** — when there's a ≥5-user group that can
   opt into Living World on shared server instances.
2. **Feature request from playtesters** — "I want to see consequences other
   players created" signals demand.
3. **Admin dashboard (Phase 6) ships + surfaces cross-campaign events** —
   admin view would immediately want unified visibility tier logic.

Do **not** adopt piecemeal. Cross-user is a coherent story: upgrade rules +
spoiler filter + opt-out + conflict resolution. Shipping one without the others
leaks identity or skips consent.

## Sketch

### Visibility upgrade per event-type

```js
// In reputationHook.js / post-scene attribution writer:
const visibility = actionType === 'killed' && victimAlignment === 'good' && !justified
  ? 'global'
  : 'campaign';
```

### Spoiler filter

```js
// backend/src/services/livingWorld/spoilerFilter.js
export function anonymizeEvent(event, { ownUserId, ownCampaignId }) {
  if (event.userId === ownUserId) return null; // skip self-echo

  // F1 Postgres migration: WorldEvent.payload is native JSONB (Prisma `Json`),
  // round-trips as a JS object — no `JSON.parse` needed.
  const anon = { ...event.payload };
  delete anon.actorCharacterName;
  delete anon.actorCampaignId;
  delete anon.actorUserId;

  const ageDays = Math.floor((Date.now() - new Date(event.createdAt).getTime()) / 86400000);
  anon.whenHint = ageDays < 3 ? 'niedawno' : ageDays < 14 ? 'kilka dni temu' : 'jakiś czas temu';
  return {
    eventType: event.eventType,
    blurb: buildAnonBlurb(event.eventType, anon),
    at: null, // intentionally drop exact timestamp
  };
}
```

### Cross-user fetch

```js
// In buildLivingWorldContext:
const crossUserEvents = await prisma.worldEvent.findMany({
  where: {
    worldLocationId: location.id,
    visibility: 'global',
    userId: { not: currentUserId }, // skip own events
    createdAt: { gte: sinceLast30Days },
  },
  orderBy: { createdAt: 'desc' },
  take: 8,
});
const filtered = crossUserEvents
  .map((e) => anonymizeEvent(e, { ownUserId: currentUserId, ownCampaignId: campaignId }))
  .filter(Boolean);
```

### Conflict resolution (first-write-wins for kills)

```js
// worldStateService.killWorldNpc — atomic conditional UPDATE via Prisma.
// F1 Postgres migration: `updateMany` returns affected row count; the
// `where: { alive: true }` clause acts as the CAS gate. No CAS-via-Mongo
// driver needed.
const result = await prisma.worldNPC.updateMany({
  where: { id: worldNpcId, alive: true },
  data: { alive: false, killedAt: new Date(), killedByCampaignId: campaignId },
});
return { killed: result.count > 0 };
```

## Related

- [knowledge/ideas/living-world-atonement-loop.md](living-world-atonement-loop.md) — vendetta escape hatch, also deferred
- [knowledge/concepts/persistence.md](../concepts/persistence.md) — idempotency patterns
- Plan: `plans/siemanko-chyba-znowu-nie-lucky-flask.md` — Phase 3 cross-user spec

## Source

Phase 3 of the Living World plan. Deferred alongside vector search in favor
of shipping reputation core for solo-playtest first (2026-04).
