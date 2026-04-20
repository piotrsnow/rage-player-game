# Idea — Living World vector search (semantic NPC/location dedupe)

## What it is

Atlas Vector Search indexes on `WorldNPC.embedding` and `WorldLocation.embedding`,
with cosine-similarity dedupe at write time. When a scene introduces "Bjorn the
Hunter", embed the NPC once and find canonical matches ≥ 0.85 similarity instead
of exact name+role. Catches variants like "Bjorn łowca" vs "Bjorn the Hunter",
typos, translations, rewordings.

Key parts:

- **`world_npc_vector_idx`** — 1536-dim cosine, filter on `alive` + `currentLocationId`
- **`world_location_vector_idx`** — 1536-dim cosine, filter on `region`
- **Embedding at create time** — `embedText(buildNPCEmbeddingText(npcData))`
  → `writeEmbedding('WorldNPC', id, emb, text)` via native driver (BSON array)
- **`findSimilarWorldNPC`** — `$vectorSearch` aggregation with `numCandidates = 5 × limit`,
  `filter: { alive: true }`, threshold 0.85. Returns top match or null.
- **Fallback on failure** — if the index isn't deployed yet or the search fails,
  caller creates a new canonical row (no blocking, no retry storm).

## Why it's not adopted now

- **Atlas tier cap on search indexes.** Free/shared tier allows ~3 FTS indexes
  total. We already use `scene_vector_idx`, `knowledge_vector_idx`,
  `npc_vector_idx`, `codex_vector_idx` — adding two Living World indexes
  exceeds the cap. Upgrading the tier for dedupe-quality before we have
  scale is wasteful.
- **Name-based dedupe is good enough at current scale.** With ~dozens of NPCs
  per user, `findFirst({ name, role, factionId, alive })` catches the
  99% case. Semantic variants are rare when NPCs are introduced through
  a single premium call per scene — naming is already consistent.
- **Embedding cost.** ~1536-dim embedding per NPC/location creation. Not huge
  per-call, but compounds once Phase 5 NPC ticks start spawning entities in
  the background.

Code falls back gracefully: `worldStateService.findOrCreateWorldNPC` uses
name-based dedupe today, and still populates `embeddingText` so a future
backfill script can compute + index embeddings in one pass.

## When it becomes relevant

Adopt when any of these trigger:

1. **Dedupe misses reported** — a playtester/admin notices the same canonical
   NPC stored twice under name variants (e.g. "Bjorn" vs "Björn" vs "Bjorn Hunter").
   Threshold: 3+ such cases observed.
2. **World scale hits ~1000 NPCs** — linear scans of `findFirst` start to
   slow down NPC-heavy scenes, or the canonical roster is large enough that
   semantic dedupe saves measurable inference cost downstream.
3. **Cross-user Living World (Phase 3) ships with `visibility="global"`**
   events — global-scope NPCs have a much larger introduction surface across
   unrelated campaigns, so semantic dedupe becomes the primary defense
   against proliferation.
4. **Atlas tier already upgraded** for another reason (e.g. scene-history
   semantic search over longer campaigns) — then the marginal cost is zero.

## Sketch

### Re-enable in `backend/src/scripts/createVectorIndexes.js`

```js
// Living World (Phase 1+)
{
  collection: 'WorldNPC',
  name: 'world_npc_vector_idx',
  definition: {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
      { type: 'filter', path: 'alive' },
      { type: 'filter', path: 'currentLocationId' },
    ],
  },
},
{
  collection: 'WorldLocation',
  name: 'world_location_vector_idx',
  definition: {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions: 1536, similarity: 'cosine' },
      { type: 'filter', path: 'region' },
    ],
  },
},
```

### Re-introduce in `worldStateService.js`

```js
import { embedText } from '../embeddingService.js';
import { writeEmbedding } from '../vectorSearchService.js';
import { getCollection } from '../mongoNative.js';

const NPC_DEDUPE_THRESHOLD = 0.85;

async function findSimilarWorldNPC(queryEmbedding, { limit = 3, minScore = NPC_DEDUPE_THRESHOLD } = {}) {
  if (!queryEmbedding) return null;
  try {
    const collection = await getCollection('WorldNPC');
    const results = await collection.aggregate([
      {
        $vectorSearch: {
          index: 'world_npc_vector_idx',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 5,
          limit,
          filter: { alive: true },
        },
      },
      { $project: { _id: 1, name: 1, role: 1, score: { $meta: 'vectorSearchScore' } } },
    ]).toArray();
    const top = results.find((r) => r.score >= minScore);
    if (!top) return null;
    return prisma.worldNPC.findUnique({ where: { id: top._id.toString() } });
  } catch (err) {
    // Index not yet deployed — fall back to name dedupe.
    return null;
  }
}
```

Wire `findSimilarWorldNPC` into `findOrCreateWorldNPC` as a pre-check before
the `findFirst` call. Keep the name-based fallback for cold-start (pre-embed)
and failure cases.

### One-shot backfill

Walk every `WorldNPC` and `WorldLocation` with `embeddingText` but no
`embedding`, compute the embedding, and `writeEmbedding`. Run once after
the indexes are created.

## Related

- [knowledge/concepts/persistence.md](../concepts/persistence.md) — vector search for scene/NPC/codex
- [knowledge/decisions/embeddings-native-driver.md](../decisions/embeddings-native-driver.md) — BSON array write via native driver
- [knowledge/patterns/backend-proxy.md](../patterns/backend-proxy.md) — embedding calls go through the backend

## Source

Original design: Phase 1 of the Living World plan. Deferred in favor of
name-based dedupe after an Atlas tier cap hit during one-time index setup
(2026-04, pre-prod).
