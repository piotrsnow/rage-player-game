export const CAMPAIGN_WRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 200 },
    genre: { type: 'string', maxLength: 100 },
    tone: { type: 'string', maxLength: 100 },
    coreState: { type: ['object', 'string'] },
    characterIds: {
      type: 'array',
      maxItems: 20,
      items: { type: 'string', maxLength: 100 },
    },
    // Living World (Phase 1) — experimental per-campaign flag
    livingWorldEnabled: { type: 'boolean' },
    worldTimeRatio: { type: 'number', minimum: 1, maximum: 240 },
    worldTimeMaxGapDays: { type: 'integer', minimum: 1, maximum: 90 },
  },
};

export const RECAP_SAVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string', maxLength: 500 },
    recap: { type: 'string', maxLength: 40000 },
    meta: { type: 'object' },
  },
  required: ['key', 'recap'],
};
