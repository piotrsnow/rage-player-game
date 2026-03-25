import { z } from 'zod';

const AtmosphereSchema = z.object({
  weather: z.string().optional().default('clear'),
  particles: z.string().optional().default('none'),
  mood: z.string().optional().default('peaceful'),
  lighting: z.string().optional().default('natural'),
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
  characteristic: z.string().optional(),
  characteristicValue: z.number().optional(),
  skillAdvances: z.number().optional(),
  success: z.boolean().optional(),
  criticalSuccess: z.boolean().optional().default(false),
  criticalFailure: z.boolean().optional().default(false),
  dispositionBonus: z.number().optional(),
}).passthrough().nullable().optional();

const NpcRelationshipSchema = z.object({
  npcName: z.string(),
  type: z.enum(['ally', 'enemy', 'family', 'employer', 'rival', 'friend', 'mentor', 'subordinate']),
}).passthrough();

const NpcChangeSchema = z.object({
  action: z.string().optional().default('introduce'),
  name: z.string(),
  gender: z.string().optional(),
  factionId: z.string().nullable().optional(),
  relatedQuestIds: z.array(z.string()).optional().default([]),
  relationships: z.array(NpcRelationshipSchema).optional().default([]),
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

const QuestObjectiveSchema = z.object({
  id: z.string(),
  description: z.string(),
}).passthrough();

const QuestRewardSchema = z.object({
  xp: z.number().optional().default(0),
  money: z.object({
    gold: z.number().optional().default(0),
    silver: z.number().optional().default(0),
    copper: z.number().optional().default(0),
  }).passthrough().optional(),
  items: z.array(z.any()).optional().default([]),
  description: z.string().optional(),
}).passthrough().optional();

const QuestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  completionCondition: z.string().optional(),
  objectives: z.array(QuestObjectiveSchema).optional().default([]),
  questGiverId: z.string().nullable().optional(),
  turnInNpcId: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  prerequisiteQuestIds: z.array(z.string()).optional().default([]),
  reward: QuestRewardSchema,
  type: z.enum(['main', 'side', 'personal']).optional().default('side'),
}).passthrough();

const QuestItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  relatedObjectiveId: z.string().optional(),
  location: z.string().optional(),
}).passthrough();

const InitialQuestSchema = QuestSchema.extend({
  questItems: z.array(QuestItemSchema).optional().default([]),
}).passthrough();

const InitialNpcSchema = z.object({
  name: z.string(),
  gender: z.string().optional(),
  role: z.string().optional(),
  personality: z.string().optional(),
  location: z.string().optional(),
  attitude: z.string().optional(),
  relatedObjectiveIds: z.array(z.string()).optional().default([]),
  factionId: z.string().nullable().optional(),
  relationships: z.array(NpcRelationshipSchema).optional().default([]),
}).passthrough();

const QuestOfferSchema = QuestSchema.extend({
  offeredBy: z.string().optional(),
});

const QuestUpdateSchema = z.object({
  questId: z.string(),
  objectiveId: z.string(),
  completed: z.boolean(),
}).passthrough();

const CombatCrySchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1),
}).passthrough();

const StateChangesSchema = z.object({
  woundsChange: z.number().optional(),
  xp: z.number().optional(),
  fortuneChange: z.number().optional(),
  resolveChange: z.number().optional(),
  newItems: z.array(z.any()).optional().default([]),
  removeItems: z.array(z.any()).optional().default([]),
  newQuests: z.array(QuestSchema).optional().default([]),
  completedQuests: z.array(z.string()).optional().default([]),
  questUpdates: z.array(QuestUpdateSchema).optional().default([]),
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
  combatUpdate: z.object({
    active: z.boolean(),
    enemies: z.array(z.object({
      name: z.string(),
      characteristics: z.object({}).passthrough(),
      wounds: z.number().optional(),
      maxWounds: z.number().optional(),
      skills: z.object({}).passthrough().optional().default({}),
      traits: z.array(z.string()).optional().default([]),
      armour: z.any().optional().default({}),
      weapons: z.array(z.string()).optional().default(['Hand Weapon']),
    }).passthrough()).optional().default([]),
    reason: z.string().optional(),
  }).passthrough().nullable().optional(),
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
  questOffers: z.array(QuestOfferSchema).optional().default([]),
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
  initialQuest: InitialQuestSchema.optional(),
  initialNPCs: z.array(InitialNpcSchema).optional().default([]),
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

export const CombatCommentaryResponseSchema = z.object({
  narration: z.string().min(1),
  battleCries: z.array(CombatCrySchema).optional().default([]),
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
      questOffers: [],
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

const QUOTE_OPEN = '„"«"';
const QUOTE_CLOSE = '""»"';
const QUOTE_PATTERN = new RegExp(`[${QUOTE_OPEN}]([^${QUOTE_OPEN}${QUOTE_CLOSE}]+)[${QUOTE_CLOSE}]`, 'g');

function findSpeakerInText(textBefore, knownNames) {
  const nameLower = knownNames.map(n => n.toLowerCase());
  const words = textBefore.trim().split(/\s+/);

  for (let i = words.length - 1; i >= 0; i--) {
    const raw = words[i].replace(/[,:;.!?…\-—]+$/, '');
    if (raw.length < 2) continue;

    for (let j = 0; j < knownNames.length; j++) {
      const parts = knownNames[j].split(/\s+/);
      if (parts.some(p => p.toLowerCase() === raw.toLowerCase())) {
        return knownNames[j];
      }
    }

    if (raw[0] === raw[0].toUpperCase() && raw[0] !== raw[0].toLowerCase()) {
      const isFirstWord = i === 0 || /[.!?…]$/.test(words[i - 1] || '');
      if (!isFirstWord) return raw;
    }
  }
  return null;
}

function lookupGender(name, knownNpcs, existingDialogueSegments) {
  if (!name) return undefined;
  const lower = name.toLowerCase();

  for (const npc of knownNpcs) {
    if (!npc.name) continue;
    const npcParts = npc.name.toLowerCase().split(/\s+/);
    if (npc.name.toLowerCase() === lower || npcParts.includes(lower)) {
      return npc.gender || undefined;
    }
  }

  for (const seg of existingDialogueSegments) {
    if (!seg.character) continue;
    const segParts = seg.character.toLowerCase().split(/\s+/);
    if (seg.character.toLowerCase() === lower || segParts.includes(lower)) {
      return seg.gender || undefined;
    }
  }
  return undefined;
}

export function repairDialogueSegments(narrative, segments, knownNpcs = []) {
  if (!segments || segments.length === 0) {
    if (narrative && narrative.trim()) {
      segments = [{ type: 'narration', text: narrative }];
    } else {
      return [];
    }
  }

  const existingDialogueSegments = segments.filter(s => s.type === 'dialogue' && s.character);
  const knownNames = [
    ...new Set([
      ...knownNpcs.map(n => n.name).filter(Boolean),
      ...existingDialogueSegments.map(s => s.character).filter(Boolean),
    ])
  ];

  const repaired = [];
  for (const seg of segments) {
    if (seg.type !== 'narration' || !seg.text) {
      repaired.push(seg);
      continue;
    }

    QUOTE_PATTERN.lastIndex = 0;
    if (!QUOTE_PATTERN.test(seg.text)) {
      repaired.push(seg);
      continue;
    }

    QUOTE_PATTERN.lastIndex = 0;
    let lastIndex = 0;
    let match;
    const parts = [];

    while ((match = QUOTE_PATTERN.exec(seg.text)) !== null) {
      const before = seg.text.slice(lastIndex, match.index);
      if (before.trim()) {
        parts.push({ type: 'narration', text: before.trimEnd() });
      }

      const spokenText = match[1].trim();
      const speakerName = findSpeakerInText(
        seg.text.slice(0, match.index),
        knownNames
      );
      const gender = lookupGender(speakerName, knownNpcs, existingDialogueSegments);

      parts.push({
        type: 'dialogue',
        character: speakerName || 'NPC',
        text: spokenText,
        ...(gender ? { gender } : {}),
      });

      lastIndex = match.index + match[0].length;
    }

    const trailing = seg.text.slice(lastIndex);
    if (trailing.trim()) {
      parts.push({ type: 'narration', text: trailing.trimStart() });
    }

    if (parts.length > 0) {
      repaired.push(...parts);
    } else {
      repaired.push(seg);
    }
  }

  if (narrative && narrative.trim()) {
    const repairedText = repaired.map(s => (s.text || '').trim()).join('');
    if (repairedText.length < narrative.trim().length * 0.7) {
      const alreadySynthetic = segments.length === 1
        && segments[0].type === 'narration'
        && segments[0].text === narrative;
      if (!alreadySynthetic) {
        return repairDialogueSegments(narrative, [{ type: 'narration', text: narrative }], knownNpcs);
      }
    }
  }

  return repaired;
}

export function ensurePlayerDialogue(segments, playerAction, characterName, characterGender) {
  if (!playerAction || !characterName) return segments;

  QUOTE_PATTERN.lastIndex = 0;
  const playerQuotes = [];
  let match;
  while ((match = QUOTE_PATTERN.exec(playerAction)) !== null) {
    const text = match[1].trim();
    if (text) playerQuotes.push(text);
  }
  if (playerQuotes.length === 0) return segments;

  const charLower = characterName.toLowerCase();
  const hasPlayerDialogue = (segments || []).some(
    s => s.type === 'dialogue' && s.character && s.character.toLowerCase() === charLower
  );
  if (hasPlayerDialogue) return segments;

  const playerSegments = playerQuotes.map(text => ({
    type: 'dialogue',
    character: characterName,
    text,
    gender: characterGender || undefined,
  }));

  return [...playerSegments, ...(segments || [])];
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
