import { prisma } from '../../../lib/prisma.js';
import { config } from '../../../config.js';
import { searchCampaignMemory } from '../../vectorSearchService.js';
import { childLogger } from '../../../lib/logger.js';

const log = childLogger({ module: 'aiContextTools' });

export async function handleGetLocation(campaignId, locationName) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true },
  });

  if (!campaign) return 'Campaign not found.';

  const coreState = JSON.parse(campaign.coreState);
  const locations = coreState.world?.locations || [];

  const query = locationName.toLowerCase();
  const match = locations.find((l) => l.name?.toLowerCase().includes(query));

  if (!match) return `No location found matching "${locationName}".`;

  const lines = [
    `Location: ${match.name}`,
    match.description ? `Description: ${match.description}` : null,
    `Visit count: ${match.visitCount || 0}`,
    match.npcsHere?.length ? `NPCs here: ${match.npcsHere.join(', ')}` : null,
  ];

  // Search for scenes that mention this location (graceful — skip if embedding API unavailable)
  if (config.apiKeys.openai) {
    let memories = [];
    try {
      memories = await searchCampaignMemory(campaignId, `events at ${match.name}`, { limit: 3 });
    } catch (err) {
      log.warn({ err, campaignId, location: match.name }, 'Location memory search skipped');
    }
    if (memories.length > 0) {
      lines.push('\nRecent events at this location:');
      for (const m of memories) {
        lines.push(`- ${m.content.slice(0, 200)}`);
      }
    }
  }

  return lines.filter(Boolean).join('\n');
}
