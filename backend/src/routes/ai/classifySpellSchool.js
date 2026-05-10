import { callAIJson } from '../../services/aiJsonCall.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'classifySpellSchool' });

const VALID_SCHOOLS = [
  'ogien', 'blyskawice', 'ochrona', 'niewidzialnosc',
  'lod', 'leczenie', 'przestrzen', 'umysl', 'wiatr_percepcja', 'ogolna',
];

const SCHOOL_LABELS = {
  ogien: 'Ogień — zaklęcia ofensywne związane z ogniem, ciepłem, spalaniem',
  blyskawice: 'Błyskawice — zaklęcia elektryczne, pioruny, wyładowania',
  ochrona: 'Ochrona — tarcze, bariery, osłony magiczne',
  niewidzialnosc: 'Niewidzialność — ukrywanie, maskowanie, iluzje cielesne',
  lod: 'Lód — mróz, zamrażanie, spowolnienie',
  leczenie: 'Leczenie — uzdrawianie ran, regeneracja, wskrzeszanie',
  przestrzen: 'Przestrzeń — telekineza, teleportacja, manipulacja przestrzenią',
  umysl: 'Umysł — strach, sen, iluzje mentalne, kontrola umysłu',
  wiatr_percepcja: 'Wiatr i percepcja — wykrywanie magii, ochrona wiatrem, rozpraszanie czarów',
  ogolna: 'Ogólna — zaklęcia nie pasujące do żadnej konkretnej szkoły',
};

const BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['spellNames'],
  properties: {
    spellNames: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 100 },
      minItems: 1,
      maxItems: 20,
    },
  },
};

export async function classifySpellSchoolRoutes(fastify) {
  fastify.post(
    '/classify-spell-school',
    {
      schema: { body: BODY_SCHEMA },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { spellNames } = request.body;
      const userId = request.user.id;
      const userApiKeys = await loadUserApiKeys(prisma, userId);

      const schoolList = VALID_SCHOOLS.map((key) => `- ${key}: ${SCHOOL_LABELS[key]}`).join('\n');

      const systemPrompt = `Klasyfikujesz zaklęcia do jednej z 10 szkół magii w systemie RPGon.

Szkoły:
${schoolList}

Dla każdego zaklęcia wybierz JEDNĄ szkołę (klucz). Jeśli zaklęcie nie pasuje do żadnej — użyj "ogolna".
Zwróć WYŁĄCZNIE poprawny JSON bez dodatkowego tekstu, w kształcie:
{ "results": { "<nazwa zaklęcia>": "<klucz szkoły>", ... } }`;

      const userPrompt = `Zaklęcia do sklasyfikowania:\n${spellNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;

      let parsed = null;
      try {
        const { text } = await callAIJson({
          modelTier: 'nano',
          systemPrompt,
          userPrompt,
          maxTokens: 400,
          temperature: 0.1,
          userApiKeys,
          userId,
          taskType: 'spell-school-classify',
          taskLabel: 'Spell school classification',
        });
        parsed = JSON.parse(text);
      } catch (err) {
        log.warn({ err: err?.message }, 'Spell school classification failed');
      }

      const results = {};
      for (const name of spellNames) {
        const raw = parsed?.results?.[name];
        results[name] = (typeof raw === 'string' && VALID_SCHOOLS.includes(raw)) ? raw : 'ogolna';
      }

      return { results };
    },
  );
}
