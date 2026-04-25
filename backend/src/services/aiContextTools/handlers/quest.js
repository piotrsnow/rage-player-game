import { prisma } from '../../../lib/prisma.js';

export async function handleGetQuest(campaignId, questName) {
  const query = questName.toLowerCase();

  // Try normalized CampaignQuest first
  const dbQuests = await prisma.campaignQuest.findMany({
    where: { campaignId },
    include: { objectives: { orderBy: { displayOrder: 'asc' } } },
  });

  let match;
  if (dbQuests.length > 0) {
    match = dbQuests.find(
      (q) => q.name?.toLowerCase().includes(query) || q.description?.toLowerCase().includes(query),
    );
    if (match) {
      const objectives = match.objectives || [];
      const reward = match.reward ?? null;
      const lines = [
        `Quest: ${match.name}`,
        `Status: ${match.status}`,
        `Type: ${match.type || 'unknown'}`,
        `Description: ${match.description || 'N/A'}`,
        match.completionCondition ? `Completion: ${match.completionCondition}` : null,
        match.questGiverId ? `Quest Giver: ${match.questGiverId}` : null,
      ];
      if (objectives.length) {
        lines.push('Objectives:');
        for (const obj of objectives) {
          const done = obj.status === 'done' || obj.completed === true;
          lines.push(`  ${done ? '[X]' : '[ ]'} ${obj.description}`);
        }
      }
      if (reward) lines.push(`Reward: ${JSON.stringify(reward)}`);
      return lines.filter(Boolean).join('\n');
    }
  }

  // Fallback: read from coreState (pre-migration campaigns)
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { coreState: true },
  });
  if (!campaign) return 'Campaign not found.';

  const coreState = (campaign.coreState && typeof campaign.coreState === 'object')
    ? campaign.coreState : {};
  const allQuests = [...(coreState.quests?.active || []), ...(coreState.quests?.completed || [])];
  match = allQuests.find(
    (q) => q.name?.toLowerCase().includes(query) || q.description?.toLowerCase().includes(query),
  );
  if (!match) return `No quest found matching "${questName}".`;

  const lines = [
    `Quest: ${match.name}`,
    `Type: ${match.type || 'unknown'}`,
    `Description: ${match.description || 'N/A'}`,
    match.completionCondition ? `Completion: ${match.completionCondition}` : null,
    match.questGiverId ? `Quest Giver: ${match.questGiverId}` : null,
  ];
  if (match.objectives?.length) {
    lines.push('Objectives:');
    for (const obj of match.objectives) {
      lines.push(`  ${obj.completed ? '[X]' : '[ ]'} ${obj.description}`);
    }
  }
  if (match.reward) lines.push(`Reward: ${JSON.stringify(match.reward)}`);
  return lines.filter(Boolean).join('\n');
}
