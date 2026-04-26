# World Lore — admin-editable canon injected into every scene

Round A (Phase 0a) introduces `WorldLoreSection`, a small admin-edited
document that gets concatenated and prepended to every scene-gen prompt.
This is where DM-authored canon lives: pantheon details, faction rumours,
regional history — anything the LLM must always know, regardless of the
per-scene context.

## Data model

`WorldLoreSection` rows in [schema.prisma](../../backend/prisma/schema.prisma):

| Field | Notes |
|---|---|
| `slug` | `@unique`, `[a-z0-9_-]+`; route keys use this |
| `title` | rendered as `## {title}` markdown heading |
| `content` | markdown body |
| `order` | integer; sections render ascending (tie-break by `createdAt`) |
| `updatedBy` | email/id of the admin who last edited (optional) |

Seed upserts one starter row: `{slug:"main", title:"Świat Yeralden", content:""}`.
The user fills `content` from the admin UI.

## Admin routes (`/v1/admin/livingWorld/lore`)

Defined in [adminLivingWorld.js](../../backend/src/routes/adminLivingWorld.js):

- `GET /lore` — list sections ordered by `order, createdAt`
- `PUT /lore/:slug` — upsert (title + content + order). Slug validated to
  `[a-z0-9_-]+`
- `DELETE /lore/:slug` — remove one
- `POST /lore/reorder` — body `{ order: [{slug, order}] }`; updates each row's
  `order` in a sequential loop. Missing slugs ignored; duplicate `order` values
  accepted (rendering ties-break by `createdAt`). Could be wrapped in
  `prisma.$transaction` later if partial-failure rollback becomes a real concern

All gated by `fastify.authenticate + fastify.requireAdmin`.

## Scene-gen injection

`buildWorldLorePreamble({ maxChars = 10000 })` in
[aiContextTools.js](../../backend/src/services/aiContextTools.js)
concatenates sections in order, renders each as `## {title}\n{content}\n\n`,
truncates to `maxChars` (~2500 tokens default) with a `…[truncated]` marker.

Cached in-memory at module scope, keyed by
`${max(updatedAt).toISOString()}|${count}`. Admin edits bump `updatedAt`,
deletes drop `count`, additions bump either — any of the three invalidates
on the next read.

`assembleContext` always pushes a `worldLore` fetch into its
`Promise.all(fetches)` (cheap — cache hit after first scene). The result
lands in `contextBlocks.worldLore`, which
[`contextSection.js`](../../backend/src/services/sceneGenerator/contextSection.js)
renders as

    [WORLD LORE]
    ## Section title
    Section body…
    [/WORLD LORE]

at the **top** of the dynamic suffix — above NPC/quest/location blocks.

## Admin UI

`src/components/admin/AdminWorldLoreTab.jsx` — section list on the left
(add / delete / reorder via ▲▼ buttons), edit form on the right with
Edit/Preview toggle. No external markdown library; preview renders the raw
string in a `<pre>` tag. Sufficient for now; swap in a real renderer if a
second use-case surfaces.

## Decision-review trigger

Revisit when:
- lore concat exceeds ~5000 tokens → move to chunked RAG retrieval (Round D
  is a deferred optional pass; the supersession path is biome-tiles + lore
  RAG, see [knowledge/ideas/biome-tiles.md](../ideas/biome-tiles.md));
- multiple NPCs want filtered lore views (farmer shouldn't see royal
  secrets) → add `audienceCategories: []` to `WorldLoreSection` and filter
  per NPC in the preamble builder.
