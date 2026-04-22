import { prisma } from '../../../lib/prisma.js';
import { config } from '../../../config.js';
import { searchNPCs } from '../../vectorSearchService.js';
import { embedText } from '../../embeddingService.js';
import { searchBestiary } from '../../../data/equipment/index.js';
import { childLogger } from '../../../lib/logger.js';

const log = childLogger({ module: 'aiContextTools' });

export async function handleGetNPC(campaignId, npcName) {
  // Try exact match first
  const npc = await prisma.campaignNPC.findFirst({
    where: {
      campaignId,
      name: { contains: npcName, mode: 'insensitive' },
    },
  });

  if (npc) {
    return formatNPC(npc);
  }

  // Fallback to vector search (graceful — skip if embedding API unavailable/quota exceeded)
  if (config.apiKeys.openai) {
    try {
      const queryEmbedding = await embedText(npcName);
      if (queryEmbedding) {
        const results = await searchNPCs(campaignId, queryEmbedding, { limit: 1, minScore: 0.6 });
        if (results.length > 0) {
          return formatNPC(results[0]);
        }
      }
    } catch (err) {
      log.warn({ err, campaignId, npcName }, 'NPC vector search skipped');
    }
  }

  return `No NPC found matching "${npcName}".`;
}

export function formatNPC(npc) {
  const relationships =
    typeof npc.relationships === 'string' ? JSON.parse(npc.relationships) : npc.relationships || [];

  const lines = [
    `Name: ${npc.name}`,
    npc.gender !== 'unknown' ? `Gender: ${npc.gender}` : null,
    npc.role ? `Role: ${npc.role}` : null,
    npc.personality ? `Personality: ${npc.personality}` : null,
    `Attitude: ${npc.attitude}`,
    `Disposition: ${npc.disposition}`,
    `Alive: ${npc.alive}`,
    npc.lastLocation ? `Last seen: ${npc.lastLocation}` : null,
    npc.notes ? `Notes: ${npc.notes}` : null,
    relationships.length > 0
      ? `Relationships: ${relationships.map((r) => `${r.type}: ${r.npcName}`).join(', ')}`
      : null,
  ];

  // Try to find bestiary match for combat-relevant NPCs
  const bestiaryMatch = searchBestiary(npc.name) || searchBestiary(npc.role || '');
  if (bestiaryMatch) {
    lines.push(`\nCombat stats (bestiary match):\n${bestiaryMatch}`);
  } else {
    lines.push('\nNo bestiary match — if combat starts, improvise a stat block from the enemy template rules.');
  }

  return lines.filter(Boolean).join('\n');
}
