import { z } from 'zod';

const AtmosphereSchema = z.object({
  weather: z.string().optional().default('clear'),
  particles: z.string().optional().default('none'),
  mood: z.string().optional().default('peaceful'),
  transition: z.string().optional().default('dissolve'),
}).passthrough().optional().default({});

const DialogueSegmentSchema = z.object({
  type: z.enum(['narration', 'dialogue']),
  text: z.string().optional().default(''),
  character: z.string().optional(),
  gender: z.string().optional(),
}).passthrough();

const DiceRollSchema = z.object({
  type: z.string().optional(),
  roll: z.number().optional(),
  target: z.number().optional(),
  sl: z.number().optional(),
  skill: z.string().optional(),
  success: z.boolean().optional(),
  criticalSuccess: z.boolean().optional().default(false),
  criticalFailure: z.boolean().optional().default(false),
  dispositionBonus: z.number().optional(),
}).passthrough().nullable().optional();

const NpcChangeSchema = z.object({
  action: z.string().optional().default('introduce'),
  name: z.string(),
  gender: z.string().optional(),
}).passthrough();

const TimeAdvanceSchema = z.object({
  hoursElapsed: z.number().optional().default(0.5),
  newDay: z.boolean().optional().default(false),
}).passthrough().nullable().optional();

const CodexFragmentSchema = z.object({
  content: z.string().min(1),
  source: z.string().min(1),
  aspect: z.enum(['history', 'description', 'location', 'weakness', 'rumor', 'technical', 'political']).default('description'),
}).passthrough();

const CodexUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['artifact', 'person', 'place', 'event', 'faction', 'creature', 'concept']).default('concept'),
  fragment: CodexFragmentSchema,
  tags: z.array(z.string()).default([]),
  relatedEntries: z.array(z.string()).default([]),
}).passthrough();

const StateChangesSchema = z.object({
  woundsChange: z.number().optional(),
  xp: z.number().optional(),
  fortuneChange: z.number().optional(),
  resolveChange: z.number().optional(),
  newItems: z.array(z.any()).optional().default([]),
  removeItems: z.array(z.any()).optional().default([]),
  newQuests: z.array(z.any()).optional().default([]),
  completedQuests: z.array(z.any()).optional().default([]),
  questUpdates: z.array(z.any()).optional().default([]),
  worldFacts: z.array(z.string()).optional().default([]),
  journalEntries: z.array(z.string()).optional().default([]),
  statuses: z.any().nullable().optional(),
  skillAdvances: z.any().nullable().optional(),
  newTalents: z.array(z.string()).nullable().optional(),
  careerAdvance: z.any().nullable().optional(),
  npcs: z.array(NpcChangeSchema).optional().default([]),
  mapChanges: z.array(z.any()).optional().default([]),
  timeAdvance: TimeAdvanceSchema,
  activeEffects: z.array(z.any()).optional().default([]),
  moneyChange: z.any().nullable().optional(),
  currentLocation: z.string().nullable().optional(),
  factionChanges: z.any().nullable().optional(),
  combatUpdate: z.any().nullable().optional(),
  needsChanges: z.any().nullable().optional(),
  knowledgeUpdates: z.any().nullable().optional(),
  codexUpdates: z.array(CodexUpdateSchema).optional().default([]),
  campaignEnd: z.any().nullable().optional(),
}).passthrough().optional().default({});

export const SceneResponseSchema = z.object({
  narrative: z.string().min(1),
  dialogueSegments: z.array(DialogueSegmentSchema).optional().default([]),
  soundEffect: z.string().nullable().optional(),
  musicPrompt: z.string().nullable().optional(),
  imagePrompt: z.string().nullable().optional(),
  atmosphere: AtmosphereSchema,
  suggestedActions: z.array(z.string()).min(1).max(8).default(['Look around', 'Talk to someone nearby', 'Move on', 'Investigate']),
  stateChanges: StateChangesSchema,
  diceRoll: DiceRollSchema,
}).passthrough();

const CharacterSuggestionSchema = z.object({
  name: z.string(),
  species: z.string().optional().default('Human'),
  career: z.any().optional(),
  characteristics: z.any().optional(),
  skills: z.any().optional().default({}),
  talents: z.array(z.string()).optional().default([]),
  fate: z.number().optional().default(2),
  resilience: z.number().optional().default(1),
  backstory: z.string().optional().default(''),
  inventory: z.array(z.any()).optional().default([]),
  money: z.any().optional(),
}).passthrough();

export const CampaignResponseSchema = z.object({
  name: z.string().min(1),
  worldDescription: z.string().min(1),
  hook: z.string().min(1),
  characterSuggestion: CharacterSuggestionSchema.optional(),
  firstScene: z.object({
    narrative: z.string().min(1),
    dialogueSegments: z.array(DialogueSegmentSchema).optional().default([]),
    suggestedActions: z.array(z.string()).optional().default([]),
    soundEffect: z.string().nullable().optional(),
    musicPrompt: z.string().nullable().optional(),
    imagePrompt: z.string().nullable().optional(),
    atmosphere: AtmosphereSchema,
    journalEntries: z.array(z.string()).optional().default([]),
  }).passthrough(),
  initialQuest: z.any().optional(),
  initialWorldFacts: z.array(z.string()).optional().default([]),
  campaignStructure: z.any().nullable().optional(),
}).passthrough();

export const CompressionResponseSchema = z.object({
  summary: z.string().min(1),
}).passthrough();

export const RecapResponseSchema = z.object({
  recap: z.string().min(1),
}).passthrough();

export const StoryPromptResponseSchema = z.object({
  prompt: z.string().min(1),
}).passthrough();

export const ObjectiveVerificationSchema = z.object({
  fulfilled: z.boolean(),
  reasoning: z.string().optional().default(''),
}).passthrough();

export function safeParseJSON(raw) {
  if (typeof raw === 'object' && raw !== null) return { ok: true, data: raw };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return { ok: true, data: JSON.parse(jsonMatch[0]) };
      } catch {
        return { ok: false, error: 'Failed to extract JSON from response' };
      }
    }
    return { ok: false, error: 'Response is not valid JSON' };
  }
}

export function safeParseAIResponse(raw, schema) {
  const jsonResult = safeParseJSON(raw);
  if (!jsonResult.ok) {
    return { ok: false, error: jsonResult.error, data: null };
  }

  const parsed = schema.safeParse(jsonResult.data);
  if (parsed.success) {
    return { ok: true, data: parsed.data, error: null };
  }

  console.warn('[aiResponseValidator] Schema validation failed, using raw data with defaults:', parsed.error.issues?.slice(0, 3));
  const partial = schema.safeParse({ ...getSchemaDefaults(schema), ...jsonResult.data });
  if (partial.success) {
    return { ok: true, data: partial.data, error: null };
  }

  return { ok: false, data: jsonResult.data, error: 'Schema validation failed — raw JSON returned unvalidated' };
}

function getSchemaDefaults(schema) {
  if (schema === SceneResponseSchema) {
    return {
      narrative: '',
      dialogueSegments: [],
      suggestedActions: ['Look around', 'Talk to someone nearby', 'Move on', 'Investigate'],
      stateChanges: {},
      atmosphere: {},
    };
  }
  if (schema === CampaignResponseSchema) {
    return {
      name: 'Unnamed Campaign',
      worldDescription: 'A mysterious world.',
      hook: 'An adventure begins...',
      firstScene: { narrative: 'The adventure starts...', suggestedActions: [], dialogueSegments: [] },
      initialWorldFacts: [],
    };
  }
  return {};
}

const RETRY_DELAYS = [1000, 3000];

export async function withRetry(fn, { retries = 2, onRetry } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 3000;
        if (onRetry) onRetry(attempt, err, delay);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
