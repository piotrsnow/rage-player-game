# Fog of War — three-state per-location visibility

Tracks which locations + edges a player has seen, with a split between
**canonical** content (shared across all their campaigns) and
**non-canonical** AI-invented content (scoped to one playthrough).

## The three states

| State | Canonical source | Non-canonical source | Player UX |
|---|---|---|---|
| **Unknown** | no row in `UserDiscoveredLocation` | no row in `CampaignDiscoveredLocation` | invisible on map |
| **Heard-about** | `UserDiscoveredLocation` row, `state='heard_about'` | `CampaignDiscoveredLocation` row, `state='heard_about'` | visible on map with dashed outline, drill-down locked (Round C) |
| **Visited** | `UserDiscoveredLocation` row, `state='visited'` | `CampaignDiscoveredLocation` row, `state='visited'` | full colour, clickable, drill-down unlocked |

State promotion `heard_about → visited` is an UPDATE on the existing row
(unique on `(userId, locationId)` for canonical, `(campaignId, locationId)`
for non-canonical). A `visited` row never demotes back to `heard_about` —
once a player physically visits a location it stays known.

The loader in `userDiscoveryService.loadCampaignFog` still removes visited
ids from the heard-about set before returning, so even cross-source overlaps
(e.g. canon visited but campaign-row left at heard-about) render correctly.

Sublocations (rows where `WorldLocation.parentLocationId IS NOT NULL`) split
out of the main visited set into `discoveredSubLocationIds` for UI rendering
— the loader uses the parent FK to discriminate at read time, no schema
flag needed.

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

- `markLocationDiscovered({ userId, locationId, campaignId? })` — sets
  state=`visited`. Canonical writes land on `UserDiscoveredLocation`;
  non-canonical routes through `CampaignDiscoveredLocation`. `campaignId`
  is optional for canonical-only callers (e.g. `postSceneWork.js`).
- `markLocationHeardAbout({ userId, locationId, campaignId? })` — sets
  state=`heard_about` if no row exists; no-op when state is already
  `visited` (we never demote). Same canonical/campaign routing.
- `loadDiscovery(userId)` — account-level visited-only view; queries
  `UserDiscoveredLocation` for `state='visited'` plus every `WorldLocation`
  with `locationType='capital'` or `knownByDefault=true`. Existing callers
  (admin map, travel Dijkstra) keep working.
- `loadCampaignFog({ userId, campaignId })` — full three-state view merging
  account-level (canonical) + campaign-level (non-canonical) sources.
  Returns `{ visited, heardAbout, discoveredSubLocationIds, discoveredEdgeIds }`.
  Used by the Round C player map and any future fog-aware prompt helpers.
- `planLocationFogMutation(currentState, newState)` — pure helper exposed
  for testability. Returns `{ kind: 'noop' | 'insert' | 'update' }`. Encodes
  the state machine: never demote `visited→heard_about`, never re-write the
  same state.

Edge discovery splits the same way:
- `markEdgeDiscoveredByUser({ userId, fromLocationId, toLocationId })` —
  account-level, writes `UserDiscoveredEdge` (bidirectional, also flips both
  endpoint locations to visited).
- `markEdgeDiscovered({ fromLocationId, toLocationId, campaignId })` in
  [travelGraph.js](../../backend/src/services/livingWorld/travelGraph.js) —
  campaign-level, writes `CampaignEdgeDiscovery`.

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
