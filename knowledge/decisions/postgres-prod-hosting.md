# Decision — Neon Launch as production Postgres host (CSQL on hold)

## Context

After the F1-F5b Postgres migration ([plans/postgres-migration.md](../../plans/postgres-migration.md)), F6 was the open hosting decision: Cloud SQL vs Neon. Both finalists ship Postgres 16 + pgvector and reach Cloud Run from `europe-west1` (or near-region equivalents). Decision date: 2026-04-27.

## Decision

**Start on Neon Launch (~$19-30/mc realistic).** Migration to Cloud SQL stays as a defined, ready-to-execute path — triggered at user discretion (no auto-metric trigger). The expectation is "we will need to migrate if the game gains traction" — the playbook below makes the move ~30min downtime instead of an emergency rewrite.

## Why Neon first

- **Pre-prod, friends-only playtest.** Realistic load <5k scenes/day for the foreseeable runway. CSQL's $50/mc always-on baseline is paid even at zero ruchu; Neon's scale-to-zero collapses to $0 in idle stretches.
- **Built-in PgBouncer (`-pooler` endpoint, free).** Removes the F6 P0.2 connection-pool work that CSQL would have required up front (sidecar PgBouncer in Cloud Run, transaction mode). At our query fanout (`assembleContext` peaks ~22-27 parallel queries × concurrent scene gens), the default `max_connections=100` is borderline by 5k scen/dzień; Neon's pooler kicks the breakpoint significantly out.
- **DB branching free.** PR previews / staging / experimental schema changes get a `git checkout`-style isolated branch instead of dump/restore ceremony.
- **pgvector first-class.** Neon's pgvector lifecycle is upstream-current; CSQL has it but tied to the Cloud SQL release train.
- **Schema portability gwarantowana.** No vendor-specific features in use (no LISTEN/NOTIFY, no PostGIS, no Atlas-style search). Migration to CSQL is `pg_dump` + `pg_restore` + DATABASE_URL flip.

## Trade-offs accepted

- **Cold start 0.5-2s after idle.** At ≥1 user/h non-issue. For a fresh demo to a single visitor after a quiet night, the first click feels laggy. Acceptable for pre-prod; would matter if we did a synchronous "click this link" pitch to investors.
- **CU-hour billing burst-cost unpredictable.** A traffic spike costs more on Neon than a same-spike on CSQL's flat tier (`$0.16/CU-hour` overage on Launch). In return we get the floor at $0.
- **IP allowlisting only on Scale tier ($69/mc).** Launch tier exposes the DB by URL+credentials only. Acceptable since Cloud Run egress is the sole client; no on-prem or office IP whitelist needed.
- **Less observability surface than CSQL.** No deep query profiler dashboard; we get pg_stat_statements + Neon's UI. Sufficient until we need pg_top-class introspection.

## Why NOT Cloud SQL right now

- $50/mc baseline is paid in dead idle stretches — money set on fire while pre-prod.
- Connection pool work is meaningful (PgBouncer sidecar in Cloud Run, transaction mode, pool size ~25 per instance) and we'd be doing it before the load justifies it.
- DB branching is manual (snapshot/restore per PR preview) — friction for fast iteration.
- HA = 2x cost (~$100/mc). Only meaningful at real prod scale.

What CSQL gives that Neon doesn't (and that we'll want eventually): predictable bill at high traffic, more scaling levers (replica tier, instance dial), zero vendor lock-in (standard Postgres semantics + Cloud SQL Connector unix socket = zero networking config), free egress same-region.

## Local-vs-Neon dev switch

Both modes are supported simultaneously in the repo. See [`.env.example`](../../.env.example) for the toggle:

- **Local mode (default):** `COMPOSE_PROFILES=local-db` enables the bundled `db` service in [`docker-compose.yml`](../../docker-compose.yml). `DATABASE_URL` stays unset in root `.env` (compose defaults backend to `db:5432`). `backend/.env` points at `localhost:5432` for host-side `prisma migrate`.
- **Neon mode:** comment out (or empty) `COMPOSE_PROFILES`; set `DATABASE_URL=postgresql://...-pooler.<region>.aws.neon.tech/...?sslmode=require` in BOTH root `.env` (passes through to the backend container via compose env override) and `backend/.env` (host-side prisma migrate).

The `db` service uses a docker compose `profiles: ["local-db"]` gate, and backend's `depends_on: db` carries `required: false` so it doesn't fail when the profile is inactive.

## Migration playbook — Neon → Cloud SQL

Triggered at user discretion. The path below is sized for ~30min downtime if rehearsed once on a non-prod Neon branch beforehand.

### 1. Provision Cloud SQL instance (one-time, before flip)

- **Tier:** start at `db-custom-1-3840` ($50/mc baseline). Bump to `db-custom-2-7680` if Neon's `Active Time` reports indicate >1 vCPU sustained.
- **Region:** match Cloud Run region (default `europe-west1`).
- **Postgres version:** 16+. Same major as Neon to avoid pg_restore surprises.
- **pgvector:** enable via `cloudsql.enable_extensions=on` flag + `CREATE EXTENSION IF NOT EXISTS vector` after first connect. **Verify pgvector version parity with Neon** before dump (Neon often runs newer; if CSQL lags, recreate vector columns from base data and rebuild HNSW).
- **HA:** off initially ($50→$100/mc). Enable later if read replica + failover is needed.
- **Cloud SQL Auth Proxy / Cloud Run Connector:** prefer **private IP + Cloud Run direct VPC egress** (or the Cloud SQL Auth Proxy sidecar) — unix socket form `postgresql:///<db>?host=/cloudsql/<instance>` is simplest for Cloud Run.
- **Connection pooling:** add a PgBouncer sidecar in transaction mode if traffic justifies (pool size ≈ `max_connections / Cloud Run instance count`). Without it, hot bursts of `assembleContext` parallel queries can exhaust `max_connections=100`.

### 2. Pre-migration rehearsal (recommended, ~1h)

- Create a Neon branch from prod (`git checkout`-style — free).
- Run dump+restore against a throwaway CSQL instance.
- Smoke-test backend against the throwaway CSQL. Verify: scene generation, RAG query (HNSW index works), refresh-token cleanup setInterval, fog discovery write paths.
- Record the actual dump file size + restore time so the real cutover has tight ETA.

### 3. Cutover (~30min)

1. **Enter maintenance mode.** Cloud Run env var `MAINTENANCE_MODE=true` (need to add a Fastify hook that 503s all writes if not present today; see "Pre-migration code prep" below). Allow read-only traffic to continue if business demands; otherwise return 503 site-wide.
2. **Final dump from Neon:**
   ```sh
   pg_dump --format=custom --no-owner --no-acl \
     "$NEON_DATABASE_URL" > rpgon-final.dump
   ```
   Use the **direct (non-pooler)** Neon endpoint for `pg_dump` — pooler doesn't support all session-mode operations dump needs.
3. **Restore to Cloud SQL:**
   ```sh
   pg_restore --no-owner --no-acl --jobs=4 \
     -d "$CSQL_DATABASE_URL" rpgon-final.dump
   ```
4. **Verify row counts.** Match top-N tables between Neon and CSQL: `User`, `Campaign`, `Character`, `CampaignScene`, `WorldNPC`, `WorldLocation`, `WorldEntityEmbedding` (HNSW data). Spot-check a recent campaign's scenes.
5. **Rebuild HNSW indexes if pgvector version skewed.** `REINDEX INDEX CONCURRENTLY` on each `*_embedding_hnsw_idx`.
6. **Flip `DATABASE_URL` env var on Cloud Run** to the Cloud SQL connection string (unix socket form). Trigger a new revision deploy (Cloud Run swaps revisions atomically).
7. **Smoke test in prod.** Login, create scene, RAG query, post-scene Cloud Tasks fire.
8. **Exit maintenance mode.** `MAINTENANCE_MODE=false`, redeploy.

### 4. Post-cutover (next 1-2 weeks)

- **Watch logs + metrics.** Cloud SQL surface is different — query slowness moves from Neon's auto-suspend artefacts to connection-pool exhaustion or HNSW rebuild fallout.
- **Decommission Neon project** after retention period (recommend 7 days). Keep the final dump file in cold storage indefinitely.
- **Update [`knowledge/decisions/postgres-prod-hosting.md`](postgres-prod-hosting.md)** with a "Migration completed YYYY-MM-DD, breakpoint reason: …" section so future-us knows what triggered it.

### 5. Pre-migration code prep (do before triggering migration, not during)

These are not blockers for *running* on Neon, but make the cutover surgical:

- **Maintenance mode hook.** Fastify pre-handler that 503s on `MAINTENANCE_MODE=true` (with read-only allowlist if desired). Doesn't exist today — would be a small PR.
- **PgBouncer sidecar config.** Cloud Run service config (`cloudbuild.yaml` or terraform) for the sidecar container. Reference: [scaling-and-debt.md P0.2](../../plans/scaling-and-debt.md).
- **Cloud SQL Auth Proxy / VPC connector setup.** GCP-side networking; not in this repo, document in `Deployment checklist`.

## Don't

- **Don't run pg_dump through Neon's `-pooler` endpoint.** The pooler runs in transaction-mode PgBouncer, which doesn't expose all session features `pg_dump` needs (advisory locks, prepared statements, etc.). Use the direct endpoint for dumps.
- **Don't skip pgvector version verification.** Neon and CSQL ship pgvector independently. If versions disagree on storage format (rare but happened in 0.5→0.6), pg_restore may fail or import corrupt vectors. Always verify on a throwaway instance first.
- **Don't enable Neon's autoscaling Scale tier for "just in case".** Stay on Launch until the bill genuinely warrants it. Going Scale early burns the cost advantage that motivated picking Neon.
- **Don't introduce vendor-specific features.** No LISTEN/NOTIFY, no Neon's branching SQL APIs, no CSQL's IAM-auth-only mode without a fallback. Schema portability is the migration's main insurance policy.

## Related

- [postgres-dev.md](postgres-dev.md) — local Postgres + pgvector setup (unchanged by this decision)
- [embeddings-pgvector.md](embeddings-pgvector.md) — vector column shape + HNSW indexes
- [cloud-run-no-redis.md](cloud-run-no-redis.md) — refresh-token cleanup setInterval, post-scene Cloud Tasks
- [plans/scaling-and-debt.md](../../plans/scaling-and-debt.md) — P0.2 connection pool work (deferred while on Neon's `-pooler`), P2 trigger-driven scaling moves
