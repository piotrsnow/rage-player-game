// pgvector write path. Prisma can't bind `Unsupported("vector(1536)")` columns
// through the typed client, so embeddings go through `$executeRawUnsafe` with
// an allowlist of tables. Vector is serialized as the text form `[v1,v2,...]`
// which Postgres parses into the native vector type.

import { prisma } from '../lib/prisma.js';

const ALLOWED = new Set([
  'CampaignScene',
  'CampaignKnowledge',
  'CampaignNPC',
  'CampaignCodex',
  'WorldLocation',
  'WorldNPC',
  'WorldEntityEmbedding',
]);

function vectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('embeddingWrite: embedding must be a non-empty number array');
  }
  return `[${embedding.join(',')}]`;
}

export async function writeEmbedding(table, id, embedding, embeddingText) {
  if (!ALLOWED.has(table)) {
    throw new Error(`writeEmbedding: table "${table}" not in allowlist`);
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "embedding" = $1::vector, "embeddingText" = $2 WHERE "id" = $3::uuid`,
    vectorLiteral(embedding),
    embeddingText ?? null,
    id,
  );
}
