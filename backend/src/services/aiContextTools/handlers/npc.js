import { prisma } from '../../../lib/prisma.js';
import { config } from '../../../config.js';
import { searchNPCs } from '../../vectorSearchService.js';
import { embedText } from '../../embeddingService.js';
import { searchBestiary } from '../../../data/equipment/index.js';
import { childLogger } from '../../../lib/logger.js';

const log = childLogger({ module: 'aiContextTools' });

export async function handleGetNPC(campaignId, npcName, { currentRef, campaignNpcId } = {}) {
  // 1. ID-based lookup (instant, exact — preferred when nano/heuristics supply UUID)
  if (campaignNpcId) {
    const byId = await prisma.npc.findUnique({
      where: { id: campaignNpcId },
      include: { relationships: true },
    });
    if (byId && byId.campaignId === campaignId) {
      return formatNPC(byId, { currentRef });
    }
  }

  // 2. Exact name match (case-insensitive)
  const exact = await prisma.npc.findFirst({
    where: { campaignId, name: { equals: npcName, mode: 'insensitive' } },
    include: { relationships: true },
  });
  if (exact) return formatNPC(exact, { currentRef });

  // 3. Substring fallback (legacy compat — catches partial matches)
  const fuzzy = await prisma.npc.findFirst({
    where: { campaignId, name: { contains: npcName, mode: 'insensitive' } },
    include: { relationships: true },
  });
  if (fuzzy) return formatNPC(fuzzy, { currentRef });

  // 4. Vector search (graceful — skip if embedding API unavailable/quota exceeded)
  if (config.apiKeys.openai) {
    try {
      const queryEmbedding = await embedText(npcName);
      if (queryEmbedding) {
        const results = await searchNPCs(campaignId, queryEmbedding, { limit: 1, minScore: 0.6 });
        if (results.length > 0) {
          return formatNPC(results[0], { currentRef });
        }
      }
    } catch (err) {
      log.warn({ err, campaignId, npcName }, 'NPC vector search skipped');
    }
  }

  return `No NPC found matching "${npcName}".`;
}

export function formatNPC(npc, { currentRef } = {}) {
  const relationships = Array.isArray(npc.relationships) ? npc.relationships : [];

  // Location check — is this NPC at the player's current location?
  let awayWarning = null;
  if (currentRef && npc.lastLocationKind && npc.lastLocationId) {
    const sameLocation =
      npc.lastLocationKind === currentRef.kind && npc.lastLocationId === currentRef.id;
    if (!sameLocation) {
      const loc = npc.lastLocation || `${npc.lastLocationKind}:${npc.lastLocationId}`;
      awayWarning = `[AWAY — this NPC is NOT at the player's current location (last seen: ${loc}). They cannot speak in this scene unless contacted via letter/messenger/magic.]`;
    }
  }

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
      ? `Relationships: ${relationships
          .map((r) => `${r.type ?? r.relation}: ${r.npcName ?? r.targetRef}`)
          .join(', ')}`
      : null,
  ];

  // Try to find bestiary match for combat-relevant NPCs
  const bestiaryMatch = searchBestiary(npc.name) || searchBestiary(npc.role || '');
  if (bestiaryMatch) {
    lines.push(`\nCombat stats (bestiary match):\n${bestiaryMatch}`);
  } else {
    lines.push('\nNo bestiary match — if combat starts, improvise a stat block from the enemy template rules.');
  }

  const formatted = lines.filter(Boolean).join('\n');
  return awayWarning ? `${awayWarning}\n${formatted}` : formatted;
}
