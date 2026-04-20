# Idea — Living World NPC auto-dispatch (background ticks on schedule)

## What it is

Scoped Phase 5 (shipped 2026-04) added `runNpcTick(npcId)` + `runTickBatch()`
as **on-demand** entrypoints — admin clicks a button, a batch of NPCs ticks.
This idea is the **automated** version: a Cloud Tasks repeatable dispatcher
that fires every ~30 min and calls `runTickBatch()` so NPCs live even when
nobody's pressing buttons.

Key parts:

- **Cloud Tasks repeatable** — `/v1/internal/npc-tick-dispatch` OIDC-auth
  endpoint, scheduled every 30 min. Body signals the batch size + scope.
- **Per-NPC `tickIntervalHours` auto-tune** — urgent goal ('high' priority
  seed) ticks every 6h; idle goal ticks every 48h. Dispatcher picks from
  the eligible set ordered by `lastTickAt`.
- **Player-adjacent skip** — if the NPC's `currentLocationId` matches any
  currently-active player's location, skip the tick (player will see them
  in a scene, no need to fabricate offscreen activity).
- **Budget guards**:
  - Skip tick if `> 50 ticks/hour` campaign-wide (burn cap).
  - Free-tier accounts: interval forced to 72h.
  - Cost monitor: alert at `> $5/day/campaign`.
- **Full ASYNC_TOOL_COMPLETIONS** — instead of the scoped "pick one action
  and commit", NPC tick becomes a multi-step agent loop: tool call returns
  `{status:"pending"}`, loop writes WorldEvent, next iteration reads the
  resolved event in context. Enables NPC↔NPC interactions.
- **NPC↔NPC bus** — one NPC's `interact_with(otherNpc, intent)` enqueues
  a response tick on the other NPC. Bounded fanout (max 3 hops per origin).

## Why it's not adopted now

- **Ticks cost money with no upside until players play.** 20 NPCs × tick
  every 5 min = ~$1.15/day/campaign
  ([autonomous-npcs.md](autonomous-npcs.md)). Solo pre-prod → nobody is
  reading the output.
- **ASYNC_TOOL loop is a code path we don't want to maintain blind.**
  Gradient-bang's `task_agent.py:790-801` pattern requires careful state
  machine: tool pending → event write → subscribe → next inference. Cheap
  to get wrong, expensive in log noise.
- **Cloud Tasks repeatable schedules need monitoring + alerting we don't
  have.** Silent dispatcher failure = dead world. Wait until there's a
  player who'd notice.

Scoped Phase 5 gives us:
- The data shape (`activeGoal`, `goalProgress`, `lastTickAt`,
  `tickIntervalHours`)
- A working single-tick function with sanitized action schema + WorldEvent
  writes
- A batch runner that can be invoked manually from an admin endpoint
- Pure-function tests for eligibility + action normalization + progress
  accumulation

So flipping on auto-dispatch is ~40 lines of plumbing (Cloud Tasks
repeatable wire + OIDC-protected handler + player-adjacent filter), not
a new subsystem.

## When it becomes relevant

Adopt when all of:

1. **First playtester leaves a campaign for 2+ days and returns** — check
   if the world feels stale (NPCs frozen in place) vs alive (NPC has moved,
   goal-progressed). Scoped Phase 5 manual trigger is the A/B control.
2. **Budget monitoring in place** — Cloud Run metrics alarm on
   `sum(nano_call_cost / campaign / day)`. Can't deploy without it.
3. **Admin dashboard (Phase 6) can filter "NPCs ticked in last 24h" so
   we can spot-check quality post-hoc.

## Sketch

### Dispatcher endpoint

```js
// backend/src/routes/internal.js — add route
fastify.post('/v1/internal/npc-tick-dispatch', { preHandler: oidcVerify }, async (req, reply) => {
  const { batchSize = 20, campaignScope = null } = req.body || {};
  const summary = await runTickBatch({ limit: batchSize, campaignId: campaignScope });
  return reply.send(summary);
});
```

### Cloud Tasks repeatable

```js
// backend/src/services/cloudTasks.js — new helper
export async function scheduleNpcTickDispatcher() {
  if (process.env.NODE_ENV !== 'production') return;
  const client = new CloudTasksClient();
  const parent = client.queuePath(projectId, region, 'npc-tick-dispatch');
  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url: `${serviceUrl}/v1/internal/npc-tick-dispatch`,
      oidcToken: { serviceAccountEmail },
      body: Buffer.from(JSON.stringify({ batchSize: 30 })).toString('base64'),
      headers: { 'Content-Type': 'application/json' },
    },
    scheduleTime: { seconds: Math.floor(Date.now() / 1000) + 1800 },
  };
  await client.createTask({ parent, task });
  // Handler re-schedules itself on completion (repeatable pattern).
}
```

### Player-adjacent filter in selectEligibleNpcs

```js
// Add a pre-filter fetching { currentLocationId } of every active player:
const activeLocations = new Set(
  (await prisma.campaign.findMany({
    where: { updatedAt: { gte: new Date(Date.now() - 3600_000) } },
    select: { coreState: true },
  })).flatMap(parsePlayerLocations),
);
return eligible.filter((npc) => !activeLocations.has(npc.currentLocationId));
```

### Goal drift guard (expanded)

Already in scoped Phase 5 prompt:
> "DO NOT kill major NPCs. DO NOT complete main quests without DM oversight."

Full version adds a `proposed_action` event: if NPC wants a DM-moderated
action, write it as a pending proposal. Next time player enters that
location, scene-gen sees the proposal and resolves it dramatically.

## Related

- [knowledge/ideas/async-tool-pattern.md](async-tool-pattern.md) — sibling idea, same `pending` return shape
- [knowledge/ideas/autonomous-npcs.md](autonomous-npcs.md) — parent concept
- [knowledge/decisions/cloud-run-no-redis.md](../decisions/cloud-run-no-redis.md) — constraint (use Cloud Tasks not BullMQ)
- `backend/src/services/livingWorld/npcAgentLoop.js` — scoped Phase 5, the hook point

## Source

Phase 5 of the Living World plan. Deferred 2026-04 to avoid burning tokens
on NPCs with no audience.
