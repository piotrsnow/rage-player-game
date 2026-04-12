# Decision — Embeddings via Native MongoDB Driver

Embedding vectors are written using the native `mongodb` driver instead of Prisma.

## Why
- Prisma serializes arrays as JSON strings for MongoDB
- Atlas Vector Search requires **native BSON arrays of doubles**
- Going through Prisma would double storage and break the index

## Implementation
- `backend/src/services/mongoNative.js` — raw driver connection
- `backend/src/services/embeddingService.js` — generate embeddings (OpenAI)
- `backend/src/services/vectorSearchService.js` — query

## Index setup
Atlas vector indexes are created via `backend/src/scripts/createVectorIndexes.js`.

## Related
- [[mongodb-prisma]]
- [[../concepts/vector-search]]
