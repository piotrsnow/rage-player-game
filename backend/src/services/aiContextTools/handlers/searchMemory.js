import { searchCampaignMemory } from '../../vectorSearchService.js';
import { childLogger } from '../../../lib/logger.js';

const log = childLogger({ module: 'aiContextTools' });

export async function handleSearchMemory(campaignId, query) {
  let results;
  try {
    results = await searchCampaignMemory(campaignId, query, { limit: 8 });
  } catch (err) {
    log.warn({ err, campaignId }, 'Memory search skipped');
    return 'Memory search unavailable.';
  }

  if (!results || results.length === 0) {
    return 'No relevant memories found for this query.';
  }

  return results
    .map((r) => {
      const prefix = r.type === 'scene'
        ? `[Scene ${r.sceneIndex}]`
        : `[${r.type}${r.importance ? ` (${r.importance})` : ''}]`;
      return `${prefix} ${r.content}`;
    })
    .join('\n\n');
}
