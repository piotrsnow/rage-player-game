# Cloud Run without Redis — decision record

**Date:** 2026-04-16
**Status:** Adopted

## Context

RPGON was running on docker compose (backend + Valkey + BullMQ worker). Deploying to Cloud Run required either paying for Memorystore ($45/mo for tier Basic) or removing the Redis dependency entirely. At 50 DAU / 15-25 concurrent peak, Redis was solving problems we don't have yet.

## Decision

Full delete of Redis, BullMQ, Valkey, and all fallback/dead-code paths. Cloud-Run-native architecture:

1. **Refresh tokens → MongoDB** with TTL index (was the only hard Redis blocker).
2. **Post-scene async work → Cloud Tasks** queue with OIDC-authenticated HTTP push handler. Inline fire-and-forget fallback for local dev.
3. **Embedding cache → in-memory L1 LRU only** (L2 Redis cache removed). At 50 DAU the hit rate improvement from L2 was negligible.
4. **Idempotency → in-memory Map with 5min TTL** (was Redis-backed). Single-instance Cloud Run doesn't need cross-instance dedup.
5. **Rate limiting → in-memory** (@fastify/rate-limit built-in fallback). Same reasoning.

## Alternatives considered

- **Memorystore** ($45/mo): solves a problem we don't have at this scale.
- **BullMQ as dead code behind `isRedisEnabled()`**: cognitive load on every PR, code that never runs but must be maintained.
- **Pub/Sub instead of Cloud Tasks**: fan-out 1:N overkill for our 1:1 producer/consumer pattern.
- **JWT-only auth (no refresh token storage)**: loses revocation capability, unacceptable for prod with paying users.

## Consequences

- **Positive**: $45/mo savings, simpler architecture, fewer moving parts in docker-compose, no Redis ops burden.
- **Negative**: one real regression — no automatic retry on instance death mid-SSE (FE retry button covers this, <0.5% of requests). Rate limiting is per-instance (acceptable at single-instance scale, add token bucket if 429s spike at 500 DAU).
- **Migration**: one-time `node backend/src/scripts/createRefreshTokenTtlIndex.js` to create TTL index on Atlas.

## Related

- Cloud Tasks queue setup: `gcloud tasks queues create post-scene-work --location=europe-central2`
- Service account: `rage-player-game-runtime` with `roles/cloudtasks.enqueuer`
- Full migration plan: `.claude/plans/fizzy-imagining-flute.md`
