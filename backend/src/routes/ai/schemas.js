// Shared JSON schemas for `/ai/*` route bodies. Atoms first, then composite
// bodies per endpoint. Fastify uses `ajv` on these; keep everything JSON
// Schema draft-07 — no Zod here.

export const PROVIDER_SCHEMA = { type: 'string', maxLength: 40 };
export const MODEL_SCHEMA = { type: ['string', 'null'], maxLength: 200 };
export const LANGUAGE_SCHEMA = { type: 'string', maxLength: 10 };

export const STORY_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    genre: { type: 'string', maxLength: 100 },
    tone: { type: 'string', maxLength: 100 },
    style: { type: 'string', maxLength: 100 },
    seedText: { type: 'string', maxLength: 2000 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
};

export const CHARACTER_LEGEND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    character: {
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string', maxLength: 200 },
        species: { type: 'string', maxLength: 100 },
        gender: { type: 'string', maxLength: 40 },
        characterLevel: { type: ['number', 'null'] },
        level: { type: ['number', 'null'] },
        characterXp: { type: ['number', 'null'] },
        attributes: { type: ['object', 'null'], additionalProperties: true },
        career: { type: ['object', 'null'], additionalProperties: true },
        backstory: { type: ['string', 'null'], maxLength: 4000 },
      },
    },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
  required: ['character'],
};

export const ENHANCE_IMAGE_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keywords: { type: 'string', maxLength: 1000 },
    imageStyle: { type: 'string', maxLength: 50 },
    darkPalette: { type: 'boolean' },
    seriousness: { type: ['number', 'null'] },
    genre: { type: 'string', maxLength: 100 },
    tone: { type: 'string', maxLength: 100 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
  required: ['keywords'],
};

export const GENERATE_IMAGE_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    imagePromptTags: { type: 'string', maxLength: 1000 },
    narrative: { type: 'string', maxLength: 1000 },
    imageProvider: { type: 'string', maxLength: 40 },
    imageStyle: { type: 'string', maxLength: 50 },
    darkPalette: { type: 'boolean' },
    seriousness: { type: ['number', 'null'] },
    genre: { type: 'string', maxLength: 100 },
    tone: { type: 'string', maxLength: 100 },
    characterAge: { type: ['number', 'string', 'null'] },
    characterGender: { type: ['string', 'null'], maxLength: 20 },
    customStyleEnabled: { type: 'boolean' },
    customStyle: { type: 'string', maxLength: 1200 },
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
  required: ['imagePromptTags'],
};

export const TRANSLATE_IMAGE_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string', maxLength: 1000 },
    /** general = scenes/portraits (keep people/place names); item|spell = translate object names fully */
    kind: { type: 'string', enum: ['general', 'item', 'spell'] },
  },
  required: ['text'],
};

export const NPC_PORTRAIT_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    npc: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string', maxLength: 200 },
        name: { type: 'string', maxLength: 200 },
        gender: { type: ['string', 'null'], maxLength: 40 },
        race: { type: ['string', 'null'], maxLength: 100 },
        creatureKind: { type: ['string', 'null'], maxLength: 200 },
        role: { type: ['string', 'null'], maxLength: 500 },
        personality: { type: ['string', 'null'], maxLength: 1000 },
        age: { type: ['number', 'string', 'null'] },
        level: { type: ['number', 'null'] },
      },
      required: ['name'],
    },
    force: { type: 'boolean' },
  },
  required: ['npc'],
};

export const NPC_MISSING_FIELDS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    worldNpcId: { type: ['string', 'null'], maxLength: 64 },
    campaignNpcId: { type: ['string', 'null'], maxLength: 64 },
    fields: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: { type: 'string', enum: ['appearance', 'dialect'] },
    },
    provider: PROVIDER_SCHEMA,
  },
  required: ['fields'],
};

export const GENERATE_CAMPAIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    settings: { type: 'object' },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
};

export const COMBAT_COMMENTARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    gameState: { type: 'object' },
    combatSnapshot: { type: 'object' },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    modelTier: { type: 'string', maxLength: 20 },
  },
  required: ['combatSnapshot'],
};

export const COMBAT_TURN_RESOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    combatSnapshot: { type: 'object' },
    playerAction: { type: 'string', maxLength: 2000 },
    diceRoll: { type: ['integer', 'null'], minimum: 1, maximum: 50 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    modelTier: { type: 'string', maxLength: 20 },
  },
  required: ['combatSnapshot', 'playerAction'],
};

export const VERIFY_OBJECTIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    storyContext: { type: 'string', maxLength: 60000 },
    questName: { type: 'string', maxLength: 500 },
    questDescription: { type: 'string', maxLength: 4000 },
    objectiveDescription: { type: 'string', maxLength: 2000 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    modelTier: { type: 'string', maxLength: 20 },
  },
  required: ['questName', 'objectiveDescription'],
};

export const RECAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scenes: { type: 'array', maxItems: 500 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    modelTier: { type: 'string', maxLength: 20 },
    sentencesPerScene: { type: 'number' },
    summaryStyle: { type: ['object', 'null'] },
  },
  required: ['scenes'],
};

export const GENERATE_SCENE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    playerAction: { type: ['string', 'null'], maxLength: 4000 },
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
    language: LANGUAGE_SCHEMA,
    dmSettings: {
      type: 'object',
      additionalProperties: true,
      properties: {
        // LLM timeouts — validated here so garbage from older clients falls
        // back to generateSceneStream defaults instead of passing through as
        // strings. Wide bounds: UI slider narrows to a sane range, schema only
        // guards against obvious misuse.
        llmPremiumTimeoutMs: { type: 'integer', minimum: 5000, maximum: 300000 },
        llmNanoTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
      },
    },
    resolvedMechanics: { type: ['object', 'null'] },
    needsSystemEnabled: { type: 'boolean' },
    characterNeeds: { type: ['object', 'null'] },
    isFirstScene: { type: 'boolean' },
    sceneCount: { type: 'number' },
    isCustomAction: { type: 'boolean' },
    fromAutoPlayer: { type: 'boolean' },
    combatResult: { type: ['object', 'null'] },
    forceRoll: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        enabled: { type: 'boolean' },
        modifier: { type: 'integer', enum: [-30, 0, 30] },
      },
    },
    achievementState: { type: ['object', 'null'] },
    entityTags: {
      type: ['array', 'null'],
      maxItems: 5,
      items: {
        type: 'object',
        required: ['kind', 'id', 'name'],
        properties: {
          kind: { type: 'string', enum: ['spell', 'item', 'npc', 'location'] },
          id:   { type: 'string', maxLength: 200 },
          name: { type: 'string', maxLength: 200 },
          meta: { type: 'object', additionalProperties: true },
        },
      },
    },
    travelFailureReason: { type: ['string', 'null'], maxLength: 500 },
  },
};

export const NEEDS_COMMENTARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    characterNeeds: {
      type: 'object',
      additionalProperties: true,
      properties: {
        hunger: { type: 'number' },
        thirst: { type: 'number' },
        bladder: { type: 'number' },
        rest: { type: 'number' },
      },
    },
    characterName: { type: ['string', 'null'], maxLength: 200 },
    provider: PROVIDER_SCHEMA,
    language: LANGUAGE_SCHEMA,
    characterId: { type: ['string', 'null'], maxLength: 64 },
    sceneIndex: { type: ['integer', 'null'] },
    dmSettings: {
      type: 'object',
      additionalProperties: true,
      properties: {
        llmNanoTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
      },
    },
  },
  required: ['characterNeeds'],
};

export const QUICK_BEAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    playerAction: { type: 'string', minLength: 1, maxLength: 400 },
    provider: PROVIDER_SCHEMA,
    language: LANGUAGE_SCHEMA,
    characterId: { type: ['string', 'null'], maxLength: 64 },
    entityTags: {
      type: ['array', 'null'],
      maxItems: 5,
      items: {
        type: 'object',
        required: ['kind', 'id', 'name'],
        properties: {
          kind: { type: 'string', enum: ['spell', 'item', 'npc', 'location'] },
          id:   { type: 'string', maxLength: 200 },
          name: { type: 'string', maxLength: 200 },
          meta: { type: 'object', additionalProperties: true },
        },
      },
    },
    boardContext: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        objectType: { type: 'string', maxLength: 40 },
        objectName: { type: 'string', maxLength: 120 },
        objectState: { type: ['string', 'null'], maxLength: 20 },
        playerX: { type: 'integer' },
        playerY: { type: 'integer' },
        objectX: { type: 'integer' },
        objectY: { type: 'integer' },
      },
    },
    dmSettings: {
      type: 'object',
      additionalProperties: true,
      properties: {
        llmNanoTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
      },
    },
  },
  required: ['playerAction'],
};

export const SCENE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string', maxLength: 200 },
    sceneIndex: { type: 'number' },
    narrative: { type: 'string', maxLength: 20000 },
    chosenAction: { type: ['string', 'null'], maxLength: 4000 },
    suggestedActions: { type: 'array', maxItems: 20 },
    actions: { type: 'array', maxItems: 20 },
    dialogueSegments: { type: 'array', maxItems: 200 },
    imagePrompt: { type: ['string', 'null'], maxLength: 4000 },
    fullImagePrompt: { type: ['string', 'null'], maxLength: 8000 },
    imageUrl: { type: ['string', 'null'], maxLength: 4000 },
    image: { type: ['string', 'null'], maxLength: 4000 },
    soundEffect: { type: ['string', 'null'], maxLength: 200 },
    diceRoll: { type: ['object', 'null'] },
    stateChanges: { type: ['object', 'null'] },
    scenePacing: { type: 'string', maxLength: 50 },
  },
};

export const SCENE_BULK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    scenes: {
      type: 'array',
      maxItems: 200,
      items: SCENE_BODY_SCHEMA,
    },
  },
  required: ['scenes'],
};

export const CREATURE_ENCOUNTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: PROVIDER_SCHEMA,
    language: LANGUAGE_SCHEMA,
    encounterKind: { type: 'string', enum: ['magical', 'animal'] },
    dmSettings: {
      type: 'object',
      additionalProperties: true,
      properties: {
        llmNanoTimeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
      },
    },
  },
};

export const REGENERATE_ACTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    campaignId: { type: 'string', maxLength: 64 },
    tone: { type: 'string', maxLength: 30 },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
  required: ['campaignId', 'tone'],
};

export const REPUTATION_NARRATIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    character: {
      type: 'object',
      additionalProperties: true,
      properties: {
        name: { type: 'string', maxLength: 200 },
        species: { type: 'string', maxLength: 100 },
        gender: { type: 'string', maxLength: 40 },
        level: { type: ['number', 'null'] },
        attributes: { type: ['object', 'null'], additionalProperties: true },
        topSkills: { type: ['array', 'null'], maxItems: 10 },
        factions: { type: ['object', 'null'], additionalProperties: true },
        backstory: { type: ['string', 'null'], maxLength: 2000 },
        titles: { type: ['array', 'null'], maxItems: 20 },
      },
    },
    campaignDigest: {
      type: 'object',
      additionalProperties: true,
      properties: {
        sceneCount: { type: ['number', 'null'] },
        quests: { type: ['array', 'null'], maxItems: 30 },
        recentActions: { type: ['array', 'null'], maxItems: 20 },
        factionChanges: { type: ['array', 'null'], maxItems: 20 },
      },
    },
    language: LANGUAGE_SCHEMA,
    provider: PROVIDER_SCHEMA,
    model: MODEL_SCHEMA,
  },
  required: ['character', 'campaignDigest'],
};

export const FIELD_MAP_SCHEMA = {
  type: 'object',
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
    sceneIndex: { type: 'string', pattern: '^\\d+$' },
  },
  required: ['campaignId', 'sceneIndex'],
};

export const SCENE_IMAGE_PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    imageUrl: { type: ['string', 'null'], maxLength: 4000 },
    fullImagePrompt: { type: ['string', 'null'], maxLength: 8000 },
  },
};

