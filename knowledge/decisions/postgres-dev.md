# Decision — Postgres 16 + pgvector everywhere (local + prod)

Replaces [atlas-only-no-local-mongo.md](atlas-only-no-local-mongo.md).

## Context

Migrating off MongoDB to Postgres in F1 unlocked a different shape: Postgres has native transactions on a single node (no replica-set ceremony), JSONB instead of JSON-as-string, FK cascade, enums, and pgvector for embeddings. The local-vs-prod config drift that drove us to Atlas-only no longer exists — both environments run the same `pgvector/pgvector:pg16` image / Cloud SQL flavor with the `vector` extension enabled.

## What changed

- **`docker-compose.yml`** ships a `db` service (`pgvector/pgvector:pg16`) with a healthcheck. `backend` `depends_on: db` so compose blocks startup until the DB is reachable. Default `DATABASE_URL=postgresql://rpgon:rpgon@db:5432/rpgon` works out of the box — no `.env` editing required for offline dev.
- **`backend/.env.example`** points at `postgresql://rpgon:rpgon@localhost:5432/rpgon` so `node src/server.js` from the host machine just works against the compose-managed DB.
- **`backend/src/config.js`** default also flipped to the same Postgres URL (no Mongo string anywhere).
- **Prisma migrations** are now the source of truth (`prisma migrate dev` / `migrate deploy`). `db:push` still works as an escape hatch for prototyping.
- **Vector indexes** are HNSW partial indexes baked into the init migration (`0000_init_postgres/migration.sql`) — no separate `createVectorIndexes.js` script.
- **RefreshToken cleanup** was Atlas's TTL index; Postgres has no equivalent reaper, so [refreshTokenService.js](../../backend/src/services/refreshTokenService.js) exposes `startPeriodicCleanup()` (10-min `setInterval`) wired from `server.js`.

## Why

- ✓ Offline dev works (no Atlas account, no internet) — the friction that made Atlas-only painful for new contributors is gone.
- ✓ Same DB engine in dev and prod (Cloud SQL for Postgres or any managed Postgres with `vector`).
- ✓ Prisma transactions just work on a single Postgres node — no replica-set init, no keyfile.
- ✓ pgvector beats Atlas Vector Search on dev ergonomics (single migration vs admin-API call) and on cost (no separate vector index tier).
- ✗ pgvector HNSW recall tuning is hand-rolled (`ef_search` GUC, `lists` for IVF) where Atlas hides it. Acceptable tradeoff at our scale.

## Gotchas

- **`prisma migrate dev` is destructive on schema drift.** In dev, accept the prompt; in prod, only `prisma migrate deploy` runs.
- **`vector` extension must exist before any migration referencing it.** The init migration runs `CREATE EXTENSION IF NOT EXISTS vector` first; if you point at a fresh Postgres without pgvector pre-installed, that line will fail.
- **HNSW indexes are partial (`WHERE embedding IS NOT NULL`).** Rows without embeddings still go in but are skipped by the index — which is what we want for lazy embedding generation.

## Don't

- **Don't reintroduce Mongo.** All Mongo-specific Prisma APIs (`$runCommandRaw`, `@db.ObjectId`, `mongoNative.js`) were removed in F1. Re-adding them would mean maintaining two storage engines.
- **Don't run a separate `db:push` in CI against a shared DB.** Use `prisma migrate deploy` so the migration history is authoritative.

## Related

- [embeddings-pgvector.md](embeddings-pgvector.md) — vector storage + query shape
- [concepts/persistence.md](../concepts/persistence.md) — Prisma + JSONB + relations
