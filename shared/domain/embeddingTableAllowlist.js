// Table names permitted for pgvector writes via backend embeddingWrite.js.
// Dependency-free so Vitest never loads Prisma when testing the allowlist.

export const EMBEDDING_TABLE_ALLOWLIST = new Set([
  'CampaignScene',
  'CampaignKnowledge',
  'CampaignCodex',
  'Npc',
  'WorldEntityEmbedding',
]);

export function assertEmbeddingTableAllowed(table) {
  if (!EMBEDDING_TABLE_ALLOWLIST.has(table)) {
    throw new Error(`writeEmbedding: table "${table}" not in allowlist`);
  }
}
