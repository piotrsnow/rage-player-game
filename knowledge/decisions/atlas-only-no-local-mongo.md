# Decision — MongoDB Atlas only, no local mongo container

**Date:** 2026-04-15 (landed in commit `281a826`)

## Decision

Both [docker-compose.yml](../../docker-compose.yml) and [docker-compose.prod.yml](../../docker-compose.prod.yml) have NO local `mongo` service. Every environment — dev, prod, CI — points at MongoDB Atlas via `DATABASE_URL` SRV string. Missing `DATABASE_URL` is a boot-time error:

```yaml
DATABASE_URL: "${DATABASE_URL:?Set DATABASE_URL in .env to your Atlas SRV connection string}"
```

## Why

Prisma transactions against MongoDB require a **real replica set**. Atlas is a replica set out of the box. Running a single-node replica set inside docker just to mimic Atlas locally meant:

- `docker-entrypoint-initdb.d` scripts to run `rs.initiate({ _id: "rs0", members: [...] })` on first boot.
- Keyfile auth for the RS, mounted as a volume with 600 perms — cross-platform permission pain on Windows hosts.
- `directConnection=true` URL tweaks for Prisma that then don't match prod's SRV format.
- Vector search indexes are Atlas-exclusive anyway — local mongo can't run the embedding queries `backend/src/services/vectorSearchService.js` makes, so dev was already partially broken against local mongo.

For a solo dev who already had an Atlas cluster, the operational weight of a local RS mirror wasn't worth the offline-dev benefit. Atlas has a free tier that covers pre-prod scale.

## Consequences

- **Dev requires internet** — boot fails without Atlas reachable. Acceptable tradeoff given solo dev works online.
- **`.env` must have a real `DATABASE_URL`** — the `${VAR:?}` syntax in docker-compose hard-fails boot when it's missing, which is better than hitting a 500 at first DB call.
- **Prod overlay is simpler** — no need to swap mongo services; [docker-compose.prod.yml](../../docker-compose.prod.yml) only overrides `NODE_ENV`, `MEDIA_BACKEND`, and the Valkey bind address. The backend service's `DATABASE_URL` flows through unchanged.
- **`npm run dev` docker compose still watches and auto-restarts backend** — the watch config is unchanged. Only mongo moved; valkey stayed in-compose.
- **Tests** — backend unit tests mock `@prisma/client` at the module level, so they never talked to real mongo anyway. No test suite impact.

## Gotchas

- **Users cloning the repo need an Atlas account.** Document this in README on the next update (currently the README assumes `DATABASE_URL` "just works").
- **CI** — GitHub Actions or whatever runs `npm test` must inject `DATABASE_URL` as a secret for any integration test that boots the server. Unit tests don't need it because of Prisma mocking.
- **Vector search indexes** — `cd backend && node src/scripts/createVectorIndexes.js` is a one-time setup against each Atlas cluster. See [[embeddings-native-driver]].

## Do not

- **Do not reintroduce a local mongo service in docker-compose.yml** without a concrete need. The prior setup was flaky and caused repeated boot errors. If a future offline-dev scenario really demands it, isolate it in a separate overlay (e.g. `docker-compose.offline.yml`) and keep the default stack Atlas-only.
