# Idea — Living World admin dashboard extras

## What it is

Scoped Phase 6 (shipped 2026-04) delivered a four-tab admin dashboard
(NPCs / Locations / Events / Reputation) at `/admin/living-world`, with
drill-down detail modals + basic moderation (tick, force-unpause,
release-lock). The "extras" deferred here are the richer views the full
plan called for:

- **Global 2D map view** — WorldLocation nodes + edges derived from
  `WorldEvent.moved` traversals. Force-directed layout (d3-force), pan/zoom
  (react-zoom-pan-pinch), click-to-drill. Node color per category, size
  per recent-event count.
- **Audit trail UI** — WorldNpcAttribution browser with murderhobo filters:
  "show characters with ≥3 unjustified kills in past 30 days", confidence
  histograms, drill to source scene.
- **Reputation dashboard** — character search → per-scope score chart +
  bounty/vendetta timeline + rep-history graph. Admin mutation: manual
  reputation reset.
- **Bulk moderation** — mass-release stale locks, purge `moderation_removed`
  events, migrate NPCs between locations.
- **Cost / analytics panel** — NPC-tick cost per campaign, nano call
  volume, Cloud Tasks success rate, Atlas query p95.
- **Semantic NPC search** — `GET /v1/admin/livingWorld/npcs/search?q=...`
  using `searchNPCs()` vector search. Depends on
  [living-world-vector-search.md](living-world-vector-search.md) being
  enabled.

## Why it's not adopted now

- **Scoped dashboard already answers the "what's happening in my world?"
  question.** The tabular NPC / Location / Event views + detail modals
  cover 90% of debug workflows. Map graph is aesthetic, not operational.
- **Bulk moderation needs audit logging + confirm-before-doing UX that
  we don't have patterns for.** Easier to start with per-NPC actions from
  the detail modal.
- **Reputation history graph needs a new `WorldReputationHistory` table**
  (currently we only store the current score, not deltas over time). That's
  a schema addition + migration. Ship it when someone asks.
- **Map view's force-directed layout burns frames on re-render.** Not
  worth building until there are enough locations (~50+) to make it prettier
  than a flat list.

## When it becomes relevant

Adopt per-feature when triggered:

| Feature | Trigger |
|---|---|
| 2D map view | Locations count ≥ 30 across all campaigns **and** admin reports "I want to see region clusters" |
| Audit trail UI | First murderhobo-abuse complaint OR Phase 3 cross-user ships (then moderator workflow matters) |
| Reputation dashboard | Second character on any account hits vendetta — need comparative view |
| Bulk moderation | Lock-zombification complaints OR stale-event backlog > 10k rows |
| Cost panel | NPC ticks go live ([living-world-npc-auto-dispatch.md](living-world-npc-auto-dispatch.md)) — monitor spend |
| Semantic NPC search | Admin manually searches for NPC by name ≥5 times and complains |

## Sketch

### Map view

```jsx
// src/components/admin/LivingWorldMapView.jsx
import { useEffect, useRef } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

export default function LivingWorldMapView({ locations, edges }) {
  const svgRef = useRef();
  useEffect(() => {
    const nodes = locations.map((l) => ({ id: l.id, ...l }));
    const links = edges.map((e) => ({ source: e.from, target: e.to, weight: e.count }));
    const sim = forceSimulation(nodes)
      .force('link', forceLink(links).id((n) => n.id).distance(120))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(0, 0));
    sim.on('tick', () => { /* redraw */ });
    return () => sim.stop();
  }, [locations, edges]);
  return (
    <TransformWrapper>
      <TransformComponent>
        <svg ref={svgRef} width="1200" height="800">...</svg>
      </TransformComponent>
    </TransformWrapper>
  );
}
```

Edge derivation (backend):

```js
// GET /v1/admin/livingWorld/map
const moves = await prisma.worldEvent.findMany({
  where: { eventType: 'moved' },
  select: { payload: true, worldLocationId: true },
  take: 5000,
});
// Parse payload for { fromLocationId, toLocationId } — group by pair → count.
```

### Reputation dashboard

Requires new table:

```prisma
model WorldReputationHistory {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  reputationId String  @db.ObjectId
  scoreBefore Int
  scoreAfter  Int
  delta       Int
  triggerType String   // attribution_id or "atonement" or "admin_reset"
  triggerRef  String?  @db.ObjectId
  createdAt   DateTime @default(now())
  @@index([reputationId, createdAt])
}
```

Hook in `reputationService.applyScopeDelta` to write a history row each time.

### Bulk moderation endpoint

```js
fastify.post('/bulk/release-stale-locks', { preHandler: [authenticate, requireAdmin] }, async (request) => {
  const threshold = new Date(Date.now() - 30 * 86400_000);
  const targets = await prisma.worldNPC.findMany({
    where: { lockedByCampaignId: { not: null }, lockedAt: { lt: threshold } },
    select: { id: true, lockedByCampaignId: true },
  });
  for (const t of targets) {
    await leaveParty({ worldNpcId: t.id, campaignId: t.lockedByCampaignId, reason: 'admin_bulk_sweep' });
  }
  return { released: targets.length };
});
```

### Admin panel: semantic NPC search

```jsx
const [q, setQ] = useState('');
const [results, setResults] = useState([]);
useEffect(() => {
  if (q.length < 3) return;
  const t = setTimeout(() => {
    apiClient.get(`/v1/admin/livingWorld/npcs/search?q=${encodeURIComponent(q)}`).then((r) => setResults(r.rows));
  }, 300);
  return () => clearTimeout(t);
}, [q]);
```

## Related

- [knowledge/ideas/living-world-vector-search.md](living-world-vector-search.md) — semantic search needs this
- [knowledge/ideas/living-world-npc-auto-dispatch.md](living-world-npc-auto-dispatch.md) — cost panel needs this live first
- `backend/src/routes/adminLivingWorld.js` — scoped Phase 6, the hook point for new endpoints
- `src/components/admin/AdminLivingWorldPage.jsx` — scoped Phase 6 FE, the hook point for new tabs

## Source

Phase 6 of the Living World plan. Deferred 2026-04 — scoped tabular views
already answer current questions; richer visualization waits for scale +
demand.
