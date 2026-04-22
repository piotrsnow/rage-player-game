# Fog of War — three-state per-location visibility

Tracks which locations + edges a player has seen, with a split between
**canonical** content (shared across all their campaigns) and
**non-canonical** AI-invented content (scoped to one playthrough).

## The three states

| State | Canonical source | Non-canonical source | Player UX |
|---|---|---|---|
| **Unknown** | absent from both sets | absent from campaign sets | invisible on map |
| **Heard-about** | `UserWorldKnowledge.heardAboutLocationIds` | `Campaign.heardAboutLocationIds` | visible on map with dashed outline, drill-down locked (Round C) |
| **Visited** | `UserWorldKnowledge.discoveredLocationIds` | `Campaign.discoveredLocationIds` | full colour, clickable, drill-down unlocked |

A visited entry outranks heard-about even across sources — the loader in
`userDiscoveryService.loadCampaignFog` removes visited ids from the
heard-about set before returning.

## Where canonicality comes from

- **`WorldLocation.isCanonical`** — set to `true` for every row upserted by
  [seedWorld.js](../../backend/src/scripts/seedWorld.js) (hand-authored
  canon). Defaults to `false` for AI-generated rows written at runtime.
- **`WorldLocation.knownByDefault`** — `true` only for the capital. Every
  user sees Yeralden from turn zero without having to visit it. Other
  canonical locations start hidden and must be discovered.
- **`WorldLocation.createdByCampaignId`** — non-null for AI-generated rows;
  preserved even after a Round E promotion so the audit trail stays.

## Helpers (`backend/src/services/livingWorld/userDiscoveryService.js`)

- `markLocationDiscovered({ userId, locationId, campaignId? })` — promotes
  heard→visited. Canonical writes land on `UserWorldKnowledge`; non-canonical
  routes through `Campaign.discoveredLocationIds` (or
  `discoveredSubLocationIds` if the location has a `parentLocationId`).
  `campaignId` is optional for backward compatibility with canonical-only
  callers (e.g. `postSceneWork.js`).
- `markLocationHeardAbout({ userId, locationId, campaignId? })` — adds to
  the heard-about list, skipping silently if the location is already
  visited (we never demote).
- `loadDiscovery(userId)` — canonical visited-only view; auto-includes any
  `knownByDefault=true` row plus every `locationType=capital`. Existing
  callers (admin map, travel Dijkstra) keep working.
- `loadCampaignFog({ userId, campaignId })` — full three-state view merging
  canonical + campaign sources. Returns
  `{ visited, heardAbout, discoveredSubLocationIds, discoveredEdgeIds }`.
  Used by the Round C player map and any future fog-aware prompt helpers.

Edge discovery stays in [travelGraph.js](../../backend/src/services/livingWorld/travelGraph.js)
(`markEdgeDiscovered({ fromLocationId, toLocationId, campaignId })`).

## Call sites

- **postSceneWork.js** — walks both location and edge helpers when a scene
  moves the player between two locations. Passes `campaignId` so the
  canonical/non-canonical routing works.
- **Phase 4b (Round B, not yet shipped)** — scene-gen will add a
  `locationMentioned: [{locationId, byNpcId}]` state-change bucket that
  dispatches to `markLocationHeardAbout`.

## Open edges

- **`markEdgeDiscoveredByUser` is canonical-only.** Non-canonical edges are
  campaign-scoped via `WorldLocationEdge.discoveredByCampaigns` already. If
  we ever want per-user heard-about edges (rumour of a secret path), the
  symmetric helper will need the same canonical/non-canonical split.
- **Heard→heard doesn't update `updatedAt` on UserWorldKnowledge.** Prisma
  auto-updates it on every write, so repeated hearsay still bumps the
  timestamp. Fine for now; revisit if fog queries get cache-keyed by
  updatedAt.
