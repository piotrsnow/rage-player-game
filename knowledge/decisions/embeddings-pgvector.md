# Decision — Embeddings via pgvector

Replaces [embeddings-native-driver.md](embeddings-native-driver.md).

Embedding vectors live in dedicated `vector(1536)` columns on the relevant tables, written and queried through Prisma `$executeRawUnsafe` / `$queryRaw` with explicit cast to `::vector`.

## Why

- Postgres + pgvector handles dense vector storage and ANN search natively — no parallel storage backend (the native-driver indirection from the Mongo era was needed because Prisma serialized arrays as JSON strings).
- HNSW indexes (`USING hnsw (embedding vector_cosine_ops)`) give sub-linear recall in-process. Cosine distance via the `<=>` operator returns ordering directly.
- Single connection pool (Prisma) — fewer moving parts than the Mongo-era split (Prisma + native MongoClient).

## Schema shape

Embedding columns are declared `Unsupported("vector(1536)")?` in `schema.prisma`. Prisma can't read or write them through the typed client (Unsupported types are opaque), so:

- **Writes** go through [`backend/src/services/embeddingWrite.js`](../../backend/src/services/embeddingWrite.js) — `writeEmbedding(table, id, embedding, embeddingText)` with an allowlist guarding the table name against SQL injection.
- **Vector queries** live in [`vectorSearchService.js`](../../backend/src/services/vectorSearchService.js) and [`livingWorld/ragService.js`](../../backend/src/services/livingWorld/ragService.js) — both use `$queryRaw` with `<=>` cosine distance.

## Index setup

HNSW partial indexes are created in the init migration (`0000_init_postgres/migration.sql`):

```sql
CREATE INDEX "idx_scene_embedding"
  ON "CampaignScene" USING hnsw ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;
```

The `WHERE embedding IS NOT NULL` predicate keeps the index lean while embedding generation is lazy/async. No separate index-creation script — migrations are authoritative.

## Tables with embeddings

- `CampaignScene`, `CampaignKnowledge`, `CampaignNPC`, `CampaignCodex` — campaign-scope vector search
- `WorldLocation`, `WorldNPC` — canonical world-scope (Living World)
- `WorldEntityEmbedding` — generic entity-type indirection layer for Round E RAG (Phase 9)

## Don't

- **Don't `SELECT embedding` through the Prisma typed client.** It returns `null` for Unsupported types. Use `$queryRaw` with a raw `embedding::text` cast if you need to inspect.
- **Don't bypass the `embeddingWrite.js` allowlist.** It's the single chokepoint that prevents an injection through dynamic table names.
- **Don't add new embedding tables without also adding the matching HNSW index in a follow-up migration.** Linear scans against a `vector(1536)` column at scale are slow.

## Related

- [postgres-dev.md](postgres-dev.md) — Postgres-everywhere decision
- [concepts/ai-context-assembly.md](../concepts/ai-context-assembly.md) — where vector search is consumed
