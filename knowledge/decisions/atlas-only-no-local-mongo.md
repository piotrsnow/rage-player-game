# Decision — MongoDB Atlas only, no local mongo container

## Context

Prisma transactions against MongoDB require a **real replica set**. Atlas is a replica set out of the box; a local docker mongo is single-node by default. The project also relies on Atlas Vector Search for embeddings, which local mongo can't run at all.

Docker-compose originally shipped with a local mongo service to enable offline dev. The compromises to make Prisma transactions work on single-node local mongo (replica set init, keyfile auth, `directConnection=true` URL tweaks) piled up into a flaky setup that still couldn't run vector search.

## Options considered

### A) Keep local mongo for offline dev, Atlas for prod

- ✓ Offline dev works
- ✗ `docker-entrypoint-initdb.d` script to run `rs.initiate({ _id: "rs0", members: [...] })` on first boot
- ✗ Keyfile auth for the RS, mounted as volume with 600 perms — cross-platform permission pain on Windows hosts
- ✗ `directConnection=true` URL tweaks for Prisma that don't match prod's SRV format (dev and prod configs drift)
- ✗ Vector search can't run locally at all — dev was already partially broken against local mongo
- ✗ Two different DB configurations to maintain

### B) Atlas SRV everywhere — CHOSEN

Both `docker-compose.yml` and `docker-compose.prod.yml` point at the same Atlas cluster via `DATABASE_URL` SRV string. Missing `DATABASE_URL` is a hard boot-time error:

```yaml
DATABASE_URL: "${DATABASE_URL:?Set DATABASE_URL in .env to your Atlas SRV connection string}"
```

- ✓ One config shape across all environments
- ✓ Prisma transactions work because Atlas is a real replica set
- ✓ Vector search works locally
- ✓ No replica set setup scripts, no keyfile cross-platform pain
- ✗ Dev requires internet (Atlas must be reachable)
- ✗ Everyone cloning the repo needs an Atlas account (free tier is enough)

## Consequences

- **Dev requires internet** — boot fails without Atlas. Acceptable tradeoff for a solo dev who's always online anyway.
- **`.env` must have a real `DATABASE_URL`.** The `${VAR:?}` syntax hard-fails compose boot when missing, which beats hitting a 500 on the first DB call.
- **Prod overlay is simpler.** No mongo service to swap; `docker-compose.prod.yml` only overrides `NODE_ENV`, `MEDIA_BACKEND`, and the Valkey bind address. Backend's `DATABASE_URL` flows through unchanged.
- **Tests unaffected.** Backend unit tests mock `@prisma/client` at the module level, so they never talked to real mongo anyway.

## Gotchas

- **New contributors need an Atlas account.** Document in README.
- **CI** — whatever runs `npm test` must inject `DATABASE_URL` as a secret for any integration test that boots the server. Unit tests don't need it (mocked Prisma).
- **Vector search indexes** — `cd backend && node src/scripts/createVectorIndexes.js` is a one-time setup against each Atlas cluster. See [embeddings-native-driver.md](embeddings-native-driver.md).

## Don't

- **Don't reintroduce a local mongo service in `docker-compose.yml`** without a concrete need. If a future offline-dev scenario really demands it, isolate in a separate overlay (`docker-compose.offline.yml`) and keep the default stack Atlas-only.

## Related

- [embeddings-native-driver.md](embeddings-native-driver.md) — why vector search needs Atlas specifically
- [concepts/persistence.md](../concepts/persistence.md) — the Prisma + Atlas + native driver split
