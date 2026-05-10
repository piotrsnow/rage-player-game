import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { callAIJson } from '../../services/aiJsonCall.js';

const log = childLogger({ module: 'selfQuest' });

const SELF_QUEST_PARAMS = {
  type: 'object',
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
  },
  required: ['campaignId'],
};

const SELF_QUEST_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['description'],
  properties: {
    description: { type: 'string', minLength: 10, maxLength: 500 },
  },
};

const SCENE_EXCERPT_LENGTH = 200;
const RECENT_SCENE_COUNT = 5;

function buildSystemPrompt(recentScenes, activeQuestNames, characterName, currentLocation) {
  const sceneSummaries = recentScenes
    .map((s, i) => `Scena ${i + 1}: ${(s.narrative || '').slice(0, SCENE_EXCERPT_LENGTH)}`)
    .join('\n');

  const activeQuestsList = activeQuestNames.length > 0
    ? activeQuestNames.join(', ')
    : '(brak aktywnych questów)';

  return `Jesteś sędzią w grze fabularnej RPGon. Gracz chce zaproponować własne wyzwanie/quest.

Kontekst:
- Postać: ${characterName || 'Nieznana'}
- Lokalizacja: ${currentLocation || 'Nieznana'}
- Aktywne questy: ${activeQuestsList}

Ostatnie sceny:
${sceneSummaries}

Oceń propozycję gracza i odpowiedz w formacie JSON:
{
  "approved": true/false,
  "reason": "krótkie uzasadnienie po polsku",
  "quest": {
    "name": "nazwa questa",
    "description": "opis questa",
    "completionCondition": "warunek ukończenia",
    "type": "personal" lub "side",
    "objectives": [{"description": "opis celu"}, ...]
  }
}

Pole "quest" dołączaj TYLKO jeśli approved=true.

Kryteria akceptacji:
1. Quest musi się łączyć z czymś z ostatnich 5 scen LUB mieć silne uzasadnienie fabularne/światowe
2. Nie może duplikować aktywnego questa
3. Nie może łamać czwartej ściany ani być metagamingiem
4. Musi być osiągalny w fikcji gry

Typ questa:
- "personal" — cel wynikający z motywacji postaci
- "side" — cel wynikający ze świata gry

Cele (objectives): wygeneruj 2-4 dla złożonych questów, 0 (pusta tablica) dla prostych.

Odpowiedź MUSI być poprawnym JSON-em, bez żadnego tekstu wokół.`;
}

export async function selfQuestRoutes(fastify) {
  fastify.post(
    '/campaigns/:campaignId/self-quest',
    {
      schema: { params: SELF_QUEST_PARAMS, body: SELF_QUEST_BODY },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const { campaignId } = request.params;
      const { description } = request.body;
      const userId = request.user.id;

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        select: {
          id: true,
          coreState: true,
          currentLocationName: true,
        },
      });
      if (!campaign) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      const recentScenes = await prisma.campaignScene.findMany({
        where: { campaignId },
        orderBy: { sceneIndex: 'desc' },
        take: RECENT_SCENE_COUNT,
        select: { narrative: true, chosenAction: true },
      });
      recentScenes.reverse();

      if (recentScenes.length === 0) {
        return reply.code(400).send({ error: 'No scenes to evaluate against' });
      }

      const activeQuests = await prisma.campaignQuest.findMany({
        where: { campaignId, status: 'active' },
        select: { name: true },
      });
      const activeQuestNames = activeQuests.map((q) => q.name);

      const characterName = campaign.coreState?.character?.name || null;
      const currentLocation = campaign.currentLocationName || campaign.coreState?.currentLocation || null;

      const systemPrompt = buildSystemPrompt(recentScenes, activeQuestNames, characterName, currentLocation);
      const userPrompt = `Propozycja gracza: "${description}"`;

      const userApiKeys = await loadUserApiKeys(prisma, userId);

      let aiResult;
      try {
        aiResult = await callAIJson({
          provider: 'openai',
          modelTier: 'nano',
          systemPrompt,
          userPrompt,
          maxTokens: 600,
          temperature: 0.4,
          userApiKeys,
          userId,
          taskType: 'self-quest-validation',
          taskLabel: 'Self-quest validation',
        });
      } catch (err) {
        const status = err.statusCode || 502;
        return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
      }

      let parsed;
      try {
        parsed = JSON.parse(aiResult.text);
      } catch {
        log.warn({ campaignId, rawText: aiResult.text }, 'Self-quest AI returned non-JSON');
        return reply.code(502).send({ error: 'AI returned invalid response', code: 'AI_PARSE_FAILED' });
      }

      if (!parsed.approved) {
        return { approved: false, reason: parsed.reason || 'Quest odrzucony przez AI' };
      }

      const questData = parsed.quest;
      if (!questData?.name || !questData?.description) {
        log.warn({ campaignId, parsed }, 'Self-quest AI approved but returned incomplete quest');
        return reply.code(502).send({ error: 'AI approved but returned incomplete quest data', code: 'AI_PARSE_FAILED' });
      }

      const objectives = Array.isArray(questData.objectives) ? questData.objectives : [];

      const questId = `self-quest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const quest = await prisma.campaignQuest.create({
        data: {
          campaignId,
          questId,
          name: questData.name,
          description: questData.description,
          completionCondition: questData.completionCondition || null,
          type: questData.type === 'personal' ? 'personal' : 'side',
          status: 'active',
          objectives: {
            create: objectives
              .filter((o) => o?.description)
              .map((o, i) => ({
                description: o.description,
                displayOrder: i,
              })),
          },
        },
        include: { objectives: { orderBy: { displayOrder: 'asc' } } },
      });

      log.info({ campaignId, questId: quest.id, questName: quest.name }, 'Self-quest created');

      return {
        approved: true,
        quest: {
          id: quest.questId,
          name: quest.name,
          description: quest.description,
          completionCondition: quest.completionCondition,
          type: quest.type,
          status: quest.status,
          objectives: quest.objectives.map((o) => ({
            description: o.description,
            completed: o.status === 'completed',
          })),
        },
      };
    },
  );
}
