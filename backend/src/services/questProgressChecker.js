import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';
import { callNano } from './memoryCompressor.js';
import { wrapPlayerInput } from '../../../shared/domain/playerInputSanitizer.js';

const log = childLogger({ module: 'questProgressChecker' });

const PROGRESS_LOG_CAP = 10;

const SYSTEM_PROMPT = `Analizujesz transkrypt sceny RPG i szukasz powiązań z celami aktywnych questów.
Dla każdego trafienia zwróć krótkie 1-2 zdaniowe podsumowanie po polsku opisujące CO gracz zrobił w kontekście tego celu.

Zwróć JSON:
{
  "matches": [
    { "questId": "uuid", "nodeKey": "snake_case_key", "summary": "Krótki opis postępu po polsku" }
  ]
}

Zasady:
- Trafienie = gracz podjął KONKRETNĄ akcję, rozmawiał z kimś, zdobył informację lub przedmiot BEZPOŚREDNIO powiązane z opisem celu.
- NIE zgłaszaj trafienia jeśli scena tylko WSPOMINA temat celu bez postępu.
- NIE zgłaszaj celów oznaczonych jako done.
- Summary ≤ 150 znaków, po polsku.
- Max 10 matches. Pusty array jeśli brak trafień.`;

/**
 * Nano-driven quest progress checker. Runs every 2 scenes (post-scene async).
 * Appends matched entries to CampaignQuestObjective.metadata.progressLog[].
 */
export async function checkQuestProgress({ campaignId, sceneTranscript, playerAction, sceneIndex, provider, timeoutMs }) {
  if (!sceneTranscript || sceneTranscript.length < 50) return;

  const quests = await prisma.campaignQuest.findMany({
    where: { campaignId, status: 'active' },
    include: {
      objectives: {
        where: { status: { in: ['pending', 'locked'] } },
        orderBy: { displayOrder: 'asc' },
      },
    },
  });

  const allObjectives = quests.flatMap((q) =>
    q.objectives.map((obj) => ({
      questId: q.id,
      questName: q.name,
      nodeKey: obj.nodeKey,
      objectiveId: obj.id,
      description: obj.description,
      status: obj.status,
    })),
  );

  if (allObjectives.length === 0) {
    log.debug({ campaignId, sceneIndex }, 'No active objectives — skipping quest progress check');
    return;
  }

  const objectiveList = allObjectives
    .map((o) => `- questId=${o.questId} nodeKey=${o.nodeKey || 'n/a'} status=${o.status} | [${o.questName}] ${o.description}`)
    .join('\n');

  const userPrompt = `Akcja gracza: ${wrapPlayerInput(playerAction || 'N/A')}

Transkrypt sceny:
${sceneTranscript.slice(0, 2000)}

Aktywne cele questów:
${objectiveList}`;

  const result = await callNano(SYSTEM_PROMPT, userPrompt, provider, {
    timeoutMs,
    maxTokens: 600,
    reasoning: false,
    taskType: 'quest-progress-check',
    taskLabel: 'Quest progress check',
  });

  if (!result?.matches?.length) {
    log.debug({ campaignId, sceneIndex }, 'Quest progress check: no matches');
    return;
  }

  const objectiveIndex = new Map();
  for (const q of quests) {
    for (const obj of q.objectives) {
      if (obj.nodeKey) objectiveIndex.set(`${q.id}:${obj.nodeKey}`, obj);
    }
  }

  let written = 0;
  for (const match of result.matches) {
    if (!match.questId || !match.nodeKey || !match.summary) continue;

    const obj = objectiveIndex.get(`${match.questId}:${match.nodeKey}`);
    if (!obj) continue;

    const meta = (obj.metadata && typeof obj.metadata === 'object') ? { ...obj.metadata } : {};
    const progressLog = Array.isArray(meta.progressLog) ? [...meta.progressLog] : [];

    progressLog.push({
      sceneIndex,
      text: String(match.summary).slice(0, 200),
      ts: new Date().toISOString(),
    });

    if (progressLog.length > PROGRESS_LOG_CAP) {
      progressLog.splice(0, progressLog.length - PROGRESS_LOG_CAP);
    }

    meta.progressLog = progressLog;

    await prisma.campaignQuestObjective.update({
      where: { id: obj.id },
      data: { metadata: meta },
    });
    written++;
  }

  log.info(
    { campaignId, sceneIndex, matches: result.matches.length, written },
    'Quest progress check done',
  );
}
