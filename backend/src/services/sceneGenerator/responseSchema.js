/**
 * JSON Schema for OpenAI structured outputs (non-strict mode).
 *
 * Derived from SceneResponseSchema in src/services/aiResponse/schemas.js.
 * Uses strict: false because the Zod schemas use .passthrough() extensively
 * and fields are heavily optional. Non-strict still guarantees valid JSON
 * and validates top-level structure, while allowing extra keys.
 *
 * Models that support structured outputs:
 * gpt-4o-2024-08-06+, gpt-4o-mini-2024-07-18+, gpt-5.4, gpt-5.4-mini, gpt-5.4-nano
 */

const SCENE_RESPONSE_SCHEMA = {
  name: 'scene_response',
  strict: false,
  schema: {
    type: 'object',
    properties: {
      creativityBonus: { type: 'integer' },
      diceRolls: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            skill: { type: 'string' },
            difficulty: { type: 'string' },
            modifiers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  reason: { type: 'string' },
                  value: { type: 'integer' },
                },
              },
            },
            success: { type: 'boolean' },
          },
        },
      },
      npcsIntroduced: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            gender: { type: 'string' },
            speechStyle: { type: 'string' },
          },
        },
      },
      dialogueSegments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['narration', 'dialogue'] },
            text: { type: 'string' },
            character: { type: 'string' },
            gender: { type: 'string' },
          },
          required: ['type', 'text'],
        },
      },
      scenePacing: { type: 'string' },
      suggestedActions: {
        type: 'array',
        items: { type: 'string' },
      },
      atmosphere: {
        type: 'object',
        properties: {
          weather: { type: 'string' },
          particles: { type: 'string' },
          mood: { type: 'string' },
          lighting: { type: 'string' },
          transition: { type: 'string' },
        },
      },
      imagePrompt: { type: 'string' },
      soundEffect: { type: ['string', 'null'] },
      musicPrompt: { type: ['string', 'null'] },
      questOffers: { type: 'array' },
      cutscene: {},
      dilemma: {},
      stateChanges: {
        type: 'object',
        properties: {
          timeAdvance: {
            type: 'object',
            properties: {
              hoursElapsed: { type: 'number' },
            },
          },
          questUpdates: { type: 'array' },
          objectiveReveals: { type: 'array' },
          branchGroupReveals: { type: 'array' },
          questMutations: { type: 'array' },
          completedQuests: { type: 'array' },
          npcs: { type: 'array' },
          npcMemoryUpdates: { type: 'array' },
          locationMentioned: { type: 'array' },
          currentLocation: { type: ['string', 'null'] },
          currentLocationRef: { type: ['string', 'null'] },
          currentX: { type: ['number', 'null'] },
          currentY: { type: ['number', 'null'] },
          newItems: { type: 'array' },
          removeItems: { type: 'array' },
          removeItemsByName: { type: 'array' },
          rewards: { type: 'array' },
          moneyChange: {},
          woundsChange: { type: ['number', 'null'] },
          manaChange: { type: ['number', 'null'] },
          spellUsage: {},
          skillsUsed: { type: 'array', items: { type: 'string' } },
          actionDifficulty: { type: 'string' },
        },
      },
      dialogueIfQuestTargetCompleted: {},
    },
    required: ['dialogueSegments', 'stateChanges'],
  },
};

const STRUCTURED_OUTPUT_MODELS = new Set([
  'gpt-4o-2024-08-06',
  'gpt-4o-2024-11-20',
  'gpt-4o-mini-2024-07-18',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
  'o3',
  'o3-mini',
  'o4-mini',
]);

export function supportsStructuredOutputs(model) {
  if (!model) return false;
  if (STRUCTURED_OUTPUT_MODELS.has(model)) return true;
  for (const prefix of ['gpt-4o', 'gpt-4.1', 'gpt-5', 'o3', 'o4']) {
    if (model.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Build the `response_format` payload for the OpenAI API call.
 * Returns json_schema for supported models, plain json_object for older ones.
 */
export function buildResponseFormat(model) {
  if (supportsStructuredOutputs(model)) {
    return { type: 'json_schema', json_schema: SCENE_RESPONSE_SCHEMA };
  }
  return { type: 'json_object' };
}

export { SCENE_RESPONSE_SCHEMA };
