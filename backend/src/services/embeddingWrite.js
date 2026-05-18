// pgvector write path. Prisma can't bind `Unsupported("vector(1536)")` columns
// through the typed client, so embeddings go through `$executeRawUnsafe` with
// an allowlist guarding the table name against SQL injection.

import { prisma } from '../lib/prisma.js';
import { assertEmbeddingTableAllowed } from '../../../shared/domain/embeddingTableAllowlist.js';

function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('embeddingWrite: embedding must be a non-empty number array');
  }
  return `[${embedding.join(',')}]`;
}

export async function writeEmbedding(table, id, embedding, embeddingText) {
  assertEmbeddingTableAllowed(table);
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "embedding" = $1::vector, "embeddingText" = $2 WHERE "id" = $3::uuid`,
    vectorLiteral(embedding),
    embeddingText ?? null,
    id,
  );
}
