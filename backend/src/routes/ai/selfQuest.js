import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { callAIJson } from '../../services/aiJsonCall.js';
import { OBJECTIVE_TYPES, rollObjectiveTypes } from '../../../../shared/domain/questObjectiveTypes.js';

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
    requiredTypes: {
      type: 'array',
      items: { type: 'string', enum: OBJECTIVE_TYPES },
      maxItems: 4,
    },
  },
};

const SCENE_EXCERPT_LENGTH = 200;
const RECENT_SCENE_COUNT = 5;

function buildSystemPrompt(recentScenes, activeQuestNames, characterName, currentLocation, objectiveTypes) {
  const sceneSummaries = recentScenes
    .map((s, i) => `Scena ${i + 1}: ${(s.narrative || '').slice(0, SCENE_EXCERPT_LENGTH)}`)
    .join('\n');

  const activeQuestsList = activeQuestNames.length > 0
    ? activeQuestNames.join(', ')
    : '(brak aktywnych questów)';

  const objectivesTemplate = objectiveTypes
    .map((type, i) => `{"objectiveType": "${type}", "description": "opis celu pasujący do typu ${type}"}`)
    .join(', ');

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
    "objectives": [${objectivesTemplate}]
  }
}

Pole "quest" dołączaj TYLKO jeśli approved=true.

Każdy cel ma pre-assigned objectiveType. Napisz opis pasujący do typu (kill = walka/eliminacja, escort = ochrona w podróży, fetch = znalezienie/odzyskanie, deliver = dostarczenie, craft = stworzenie/złożenie, explore = zbadanie miejsca, interact = rozmowa/negocjacja, survive = przetrwanie niebezpieczeństwa, gather = zebranie wielu przedmiotów). NIE zmieniaj wartości objectiveType.

Kryteria akceptacji:
1. Quest musi się łączyć z czymś z ostatnich 5 scen LUB mieć silne uzasadnienie fabularne/światowe
2. Nie może duplikować aktywnego questa
3. Nie może łamać czwartej ściany ani być metagamingiem
4. Musi być osiągalny w fikcji gry

Typ questa:
- "personal" — cel wynikający z motywacji postaci
- "side" — cel wynikający ze świata gry

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
      const { description, requiredTypes = [] } = request.body;
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

      const OBJECTIVE_COUNT = 3;
      const filledTypes = [
        ...requiredTypes.slice(0, OBJECTIVE_COUNT),
        ...rollObjectiveTypes(Math.max(0, OBJECTIVE_COUNT - requiredTypes.length)),
      ].slice(0, OBJECTIVE_COUNT);

      const systemPrompt = buildSystemPrompt(recentScenes, activeQuestNames, characterName, currentLocation, filledTypes);
      const userPrompt = `Propozycja gracza: "${description}"`;

      const userApiKeys = await loadUserApiKeys(prisma, userId);

      let aiResult;
      try {
        aiResult = await callAIJson({
          provider: 'openai',
          modelTier: 'nano',
          taskCategory: 'selfQuest',
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

      const objectiveCount = objectives.filter((o) => o?.description).length || filledTypes.length;
      const xpPerObjective = 15;
      const totalXp = objectiveCount * xpPerObjective * 2;

      const quest = await prisma.campaignQuest.create({
        data: {
          campaignId,
          questId,
          name: questData.name,
          description: questData.description,
          completionCondition: questData.completionCondition || null,
          type: questData.type === 'personal' ? 'personal' : 'side',
          status: 'active',
          reward: { xp: totalXp },
          objectives: {
            create: objectives
              .filter((o) => o?.description)
              .map((o, i) => ({
                description: o.description,
                displayOrder: i,
                objectiveType: o.objectiveType || filledTypes[i] || null,
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
          reward: quest.reward,
          objectives: quest.objectives.map((o) => ({
            description: o.description,
            completed: o.status === 'completed',
            objectiveType: o.objectiveType || null,
          })),
        },
      };
    },
  );
}
