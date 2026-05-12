import { callAIJson } from '../../services/aiJsonCall.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger({ module: 'classifySpellSchool' });

const VALID_SCHOOLS = [
  'ogien', 'blyskawice', 'ochrona', 'niewidzialnosc',
  'lod', 'leczenie', 'przestrzen', 'umysl', 'wiatr_percepcja', 'magia_zakazana',
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
  magia_zakazana: 'Magia zakazana — zaklęcia niepasujące do bezpiecznych, standardowych szkół albo wyraźnie mroczne/nielegalne',
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

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

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

Dla każdego zaklęcia:
- wybierz JEDNĄ szkołę (klucz). Najpierw spróbuj dopasować zaklęcie do istniejącej standardowej szkoły. Jeśli naprawdę nie pasuje do żadnej standardowej szkoły — użyj "magia_zakazana".
- nadaj poziom 1-5 zgodny z potęgą i złożonością efektu,
- nadaj koszt many 1-5 zgodny z poziomem,
- napisz krótki, konkretny opis efektu w języku polskim.
Zwróć WYŁĄCZNIE poprawny JSON bez dodatkowego tekstu, w kształcie:
{ "results": { "<nazwa zaklęcia>": { "school": "<klucz szkoły>", "level": 1, "manaCost": 1, "description": "..." }, ... } }`;

      const userPrompt = `Zaklęcia do sklasyfikowania:\n${spellNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;

      let parsed = null;
      try {
        const { text } = await callAIJson({
          modelTier: 'nano',
          taskCategory: 'spellClassification',
          systemPrompt,
          userPrompt,
          maxTokens: 900,
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
      const details = {};
      for (const name of spellNames) {
        const raw = parsed?.results?.[name];
        const rawSchool = typeof raw === 'string' ? raw : raw?.school;
        const school = (typeof rawSchool === 'string' && VALID_SCHOOLS.includes(rawSchool)) ? rawSchool : 'magia_zakazana';
        const level = clampInt(raw?.level, 1, 5, 1);
        const manaCost = clampInt(raw?.manaCost, 1, 5, Math.max(1, level));
        const description = typeof raw?.description === 'string' && raw.description.trim()
          ? raw.description.trim().slice(0, 280)
          : 'Zaklęcie wymyślone podczas gry; jego dokładny efekt ustala narracja sceny.';
        results[name] = school;
        details[name] = { school, level, manaCost, description };
      }

      return { results, details };
    },
  );
}
