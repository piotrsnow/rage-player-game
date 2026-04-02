import { z } from 'zod';
import { CHARACTERISTIC_KEYS } from '../data/wfrp.js';
import { hasNamedSpeaker, isGenericSpeakerName } from './dialogueSegments.js';

const CharacteristicKeySchema = z.enum(CHARACTERISTIC_KEYS);

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
  suggestedSkills: z.array(z.string()).optional().default([]),
  characteristic: CharacteristicKeySchema.optional(),
  characteristicValue: z.number().optional(),
  skillAdvances: z.number().optional(),
  success: z.boolean().optional(),
  criticalSuccess: z.boolean().optional().default(false),
  criticalFailure: z.boolean().optional().default(false),
  difficultyModifier: z.number().min(-40).max(40).optional(),
  dispositionBonus: z.number().optional(),
  applicableTalent: z.string().nullable().optional(),
  talentBonus: z.number().optional().default(0),
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

const NarrativeSeedSchema = z.object({
  id: z.string(),
  description: z.string(),
  planted: z.number().optional(),
  payoffCondition: z.string().optional(),
  payoffHint: z.string().optional(),
  location: z.string().nullable().optional(),
  resolved: z.boolean().optional().default(false),
}).passthrough();

const CutsceneSchema = z.object({
  title: z.string().optional(),
  narrative: z.string(),
  location: z.string().optional(),
  characters: z.array(z.string()).optional().default([]),
}).passthrough().nullable().optional();

const DilemmaOptionSchema = z.object({
  label: z.string(),
  consequence: z.string().optional(),
  action: z.string(),
}).passthrough();

const DilemmaSchema = z.object({
  title: z.string(),
  stakes: z.string().optional(),
  options: z.array(DilemmaOptionSchema).min(2).max(4),
}).passthrough().nullable().optional();

const NpcAgendaSchema = z.object({
  npcName: z.string(),
  goal: z.string(),
  nextAction: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  plantedScene: z.number().optional(),
  triggerAfterScenes: z.number().optional().default(3),
}).passthrough();

const CallbackSchema = z.object({
  trigger: z.string(),
  event: z.string(),
  fired: z.boolean().optional().default(false),
}).passthrough();

const SceneGridEntitySchema = z.object({
  name: z.string().min(1),
  type: z.enum(['player', 'npc', 'enemy', 'ally', 'object']).optional().default('npc'),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  marker: z.string().optional(),
}).passthrough();

const SceneGridSchema = z.object({
  width: z.number().int().min(6).max(24).optional().default(12),
  height: z.number().int().min(6).max(24).optional().default(12),
  tiles: z.array(z.array(z.string())).optional().default([]),
  legend: z.record(z.string(), z.any()).optional().default({}),
  entities: z.array(SceneGridEntitySchema).optional().default([]),
}).passthrough().nullable().optional();

const QuestDeadlineSchema = z.object({
  day: z.number(),
  hour: z.number().optional().default(18),
  consequence: z.string(),
  warningThreshold: z.number().optional().default(0.75),
}).passthrough().nullable().optional();

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
  deadline: QuestDeadlineSchema,
}).passthrough();

const QuestItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  description: z.string().optional(),
  relatedObjectiveId: z.string().optional(),
  location: z.string().optional(),
}).passthrough();

const ItemImageUrlSchema = z.string()
  .trim()
  .max(2048)
  .refine((value) => !value.startsWith('data:'), { message: 'imageUrl must not use base64 data URLs' })
  .refine(
    (value) => value.startsWith('/media/') || value.startsWith('http://') || value.startsWith('https://'),
    { message: 'imageUrl must be a backend/media URL' },
  );

const InventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().optional(),
  description: z.string().optional(),
  rarity: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  imageUrl: ItemImageUrlSchema.optional(),
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

const MAP_MODES = ['trakt', 'pola', 'wnetrze', 'las'];
const ROAD_VARIANTS = ['pola', 'las', 'miasto'];

const StateChangesSchema = z.object({
  mapMode: z.enum(MAP_MODES).optional(),
  roadVariant: z.enum(ROAD_VARIANTS).optional(),
  woundsChange: z.number().optional(),
  xp: z.number().optional(),
  fortuneChange: z.number().optional(),
  resolveChange: z.number().optional(),
  newItems: z.array(InventoryItemSchema).optional().default([]),
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
  dialogueUpdate: z.object({
    active: z.boolean(),
    npcs: z.array(z.object({
      name: z.string(),
      attitude: z.string().optional(),
      goal: z.string().optional(),
    }).passthrough()).optional().default([]),
    reason: z.string().optional(),
  }).passthrough().nullable().optional(),
  needsChanges: z.any().nullable().optional(),
  knowledgeUpdates: z.any().nullable().optional(),
  codexUpdates: z.array(CodexUpdateSchema).optional().default([]),
  campaignEnd: z.any().nullable().optional(),
  narrativeSeeds: z.array(NarrativeSeedSchema).optional().default([]),
  resolvedSeeds: z.array(z.string()).optional().default([]),
  npcAgendas: z.array(NpcAgendaSchema).optional().default([]),
  pendingCallbacks: z.array(CallbackSchema).optional().default([]),
}).passthrough().optional().default({});

export { MAP_MODES, ROAD_VARIANTS };

export const SCENE_PACING_TYPES = [
  'combat', 'chase', 'stealth', 'exploration',
  'dialogue', 'travel_montage', 'celebration',
  'rest', 'dramatic',
  'dream', 'cutscene',
];

export const SceneResponseSchema = z.object({
  narrative: z.string().min(1),
  scenePacing: z.enum(SCENE_PACING_TYPES).optional().default('exploration'),
  dialogueSegments: z.array(DialogueSegmentSchema).optional().default([]),
  soundEffect: z.string().nullable().optional(),
  musicPrompt: z.string().nullable().optional(),
  imagePrompt: z.string().nullable().optional(),
  sceneGrid: SceneGridSchema,
  atmosphere: AtmosphereSchema,
  suggestedActions: z.array(z.string()).length(3),
  questOffers: z.array(QuestOfferSchema).optional().default([]),
  stateChanges: StateChangesSchema,
  diceRoll: DiceRollSchema,
  cutscene: CutsceneSchema,
  dilemma: DilemmaSchema,
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
  inventory: z.array(z.union([InventoryItemSchema, z.string()])).optional().default([]),
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
    sceneGrid: SceneGridSchema,
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

  const normalizedData = schema === SceneResponseSchema
    ? normalizeSceneResponseCandidate(jsonResult.data)
    : schema === CampaignResponseSchema
      ? normalizeCampaignResponseCandidate(jsonResult.data)
      : jsonResult.data;

  const parsed = schema.safeParse(normalizedData);
  if (parsed.success) {
    return { ok: true, data: parsed.data, error: null };
  }

  console.warn('[aiResponseValidator] Schema validation failed, using raw data with defaults:', parsed.error.issues?.slice(0, 5));

  // Second attempt: merge defaults under the data (data fields take priority)
  const withDefaults = { ...getSchemaDefaults(schema), ...normalizedData };
  const partial = schema.safeParse(withDefaults);
  if (partial.success) {
    return { ok: true, data: partial.data, error: null };
  }

  // Third attempt: fix specific fields that failed validation
  if (schema === SceneResponseSchema) {
    const defaults = getSchemaDefaults(schema);
    const patched = { ...withDefaults };
    for (const issue of (parsed.error?.issues || [])) {
      const topField = issue.path?.[0];
      if (topField && defaults[topField] !== undefined) {
        patched[topField] = defaults[topField];
      }
    }
    // Ensure suggestedActions has exactly 3 items
    if (!Array.isArray(patched.suggestedActions) || patched.suggestedActions.length !== 3) {
      patched.suggestedActions = defaults.suggestedActions;
    }
    // Ensure narrative is non-empty
    if (typeof patched.narrative !== 'string' || !patched.narrative.trim()) {
      patched.narrative = defaults.narrative;
    }
    const lastChance = schema.safeParse(patched);
    if (lastChance.success) {
      return { ok: true, data: lastChance.data, error: null };
    }
  }

  return {
    ok: false,
    data: normalizedData,
    error: `Schema validation failed — ${formatZodIssues(parsed.error?.issues) || 'raw JSON returned unvalidated'}`
  };
}

function formatZodIssues(issues = []) {
  if (!Array.isArray(issues) || issues.length === 0) return '';
  return issues
    .slice(0, 3)
    .map((issue) => {
      const path = Array.isArray(issue.path) && issue.path.length > 0
        ? issue.path.join('.')
        : 'root';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

function normalizeSceneResponseCandidate(rawData) {
  if (!rawData || typeof rawData !== 'object') return rawData;

  const data = { ...rawData };
  const normalizeAction = (action) => String(action || '')
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:()[\]{}"']/g, '')
    .replace(/\s+/g, ' ');

  if (data.dialogueSegments == null || !Array.isArray(data.dialogueSegments)) {
    data.dialogueSegments = [];
  } else {
    data.dialogueSegments = data.dialogueSegments
      .filter(Boolean)
      .map((segment) => {
        if (!segment || typeof segment !== 'object') {
          return { type: 'narration', text: String(segment ?? '') };
        }
        return {
          ...segment,
          type: segment.type === 'dialogue' ? 'dialogue' : 'narration',
          text: typeof segment.text === 'string' ? segment.text : String(segment.text ?? ''),
          ...(typeof segment.character === 'string' && hasNamedSpeaker(segment.character)
            ? { character: segment.character.trim() }
            : {}),
          ...(typeof segment.gender === 'string' ? { gender: segment.gender } : {}),
        };
      });
  }

  if (data.suggestedActions == null) {
    data.suggestedActions = extractFallbackActions(data) || undefined;
  } else if (Array.isArray(data.suggestedActions)) {
    const seen = new Set();
    const dedupedActions = data.suggestedActions
      .map((action) => (typeof action === 'string' ? action.trim() : String(action ?? '').trim()))
      .filter(Boolean)
      .filter((action) => {
        const key = normalizeAction(action);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    data.suggestedActions = contextualizeSuggestedActions(dedupedActions, data).slice(0, 3);
    if (data.suggestedActions.length === 0) {
      data.suggestedActions = extractFallbackActions(data) || undefined;
    }
  } else if (typeof data.suggestedActions === 'string') {
    const single = data.suggestedActions.trim();
    data.suggestedActions = single
      ? contextualizeSuggestedActions([single], data).slice(0, 3)
      : extractFallbackActions(data) || undefined;
  } else {
    data.suggestedActions = extractFallbackActions(data) || undefined;
  }

  // Ensure suggestedActions always has exactly 3 items.
  const lang = inferNarrativeLanguage(data.narrative || '');
  const defaultActions = lang === 'pl'
    ? ['Rozglądam się dookoła', 'Badam okolicę', 'Pytam najbliższą osobę o szczegóły']
    : ['I look around', 'I investigate the area', 'I ask the nearest person for details'];
  const fallbackPool = extractFallbackActions(data) || [];
  const normalizedSeen = new Set();
  const completedActions = [];
  const appendUnique = (action) => {
    const trimmed = typeof action === 'string' ? action.trim() : '';
    if (!trimmed) return;
    const key = normalizeAction(trimmed);
    if (!key || normalizedSeen.has(key)) return;
    normalizedSeen.add(key);
    completedActions.push(trimmed);
  };
  if (Array.isArray(data.suggestedActions)) {
    data.suggestedActions.forEach(appendUnique);
  }
  fallbackPool.forEach(appendUnique);
  defaultActions.forEach(appendUnique);
  data.suggestedActions = completedActions.slice(0, 3);

  if (data.atmosphere == null || typeof data.atmosphere !== 'object' || Array.isArray(data.atmosphere)) {
    data.atmosphere = {};
  }

  // Filter non-object items from top-level questOffers
  if (Array.isArray(data.questOffers)) {
    data.questOffers = data.questOffers.filter(
      (item) => item && typeof item === 'object' && !Array.isArray(item)
    );
  }

  // diceRoll is resolved by the game engine, not AI — strip if AI returns it
  if (data.diceRoll !== undefined) {
    delete data.diceRoll;
  }

  if (data.stateChanges == null || typeof data.stateChanges !== 'object' || Array.isArray(data.stateChanges)) {
    data.stateChanges = {};
  }

  // Filter out non-object items from stateChanges arrays (AI sometimes returns plain strings)
  const arrayFields = ['codexUpdates', 'narrativeSeeds', 'npcAgendas', 'npcs', 'questUpdates', 'pendingCallbacks', 'questOffers'];
  for (const field of arrayFields) {
    if (Array.isArray(data.stateChanges[field])) {
      data.stateChanges[field] = data.stateChanges[field].filter(
        (item) => item && typeof item === 'object' && !Array.isArray(item)
      );
    }
  }

  const rawTimeAdvance = data.stateChanges?.timeAdvance;
  if (typeof rawTimeAdvance === 'number' && Number.isFinite(rawTimeAdvance)) {
    data.stateChanges.timeAdvance = { hoursElapsed: rawTimeAdvance, newDay: false };
  } else if (typeof rawTimeAdvance === 'string') {
    const parsedHours = Number(rawTimeAdvance);
    if (Number.isFinite(parsedHours)) {
      data.stateChanges.timeAdvance = { hoursElapsed: parsedHours, newDay: false };
    } else {
      data.stateChanges.timeAdvance = undefined;
    }
  } else if (rawTimeAdvance != null && (typeof rawTimeAdvance !== 'object' || Array.isArray(rawTimeAdvance))) {
    data.stateChanges.timeAdvance = undefined;
  }

  if (data.narrative != null && typeof data.narrative !== 'string') {
    data.narrative = String(data.narrative);
  }

  return data;
}

function normalizeCampaignResponseCandidate(rawData) {
  if (!rawData || typeof rawData !== 'object') return rawData;

  const data = { ...rawData };

  if (data.firstScene && typeof data.firstScene === 'object') {
    const fs = { ...data.firstScene };
    const normalizeAction = (action) => String(action || '')
      .toLowerCase()
      .trim()
      .replace(/[.,!?;:()[\]{}"']/g, '')
      .replace(/\s+/g, ' ');

    if (fs.atmosphere == null || typeof fs.atmosphere !== 'object' || Array.isArray(fs.atmosphere)) {
      fs.atmosphere = {};
    }

    if (fs.dialogueSegments == null || !Array.isArray(fs.dialogueSegments)) {
      fs.dialogueSegments = [];
    } else {
      fs.dialogueSegments = fs.dialogueSegments
        .filter(Boolean)
        .map((segment) => {
          if (!segment || typeof segment !== 'object') {
            return { type: 'narration', text: String(segment ?? '') };
          }
          return {
            ...segment,
            type: segment.type === 'dialogue' ? 'dialogue' : 'narration',
            text: typeof segment.text === 'string' ? segment.text : String(segment.text ?? ''),
            ...(typeof segment.character === 'string' && hasNamedSpeaker(segment.character)
              ? { character: segment.character.trim() }
              : {}),
            ...(typeof segment.gender === 'string' ? { gender: segment.gender } : {}),
          };
        });
    }

    if (Array.isArray(fs.suggestedActions)) {
      const seen = new Set();
      fs.suggestedActions = fs.suggestedActions
        .map((a) => (typeof a === 'string' ? a.trim() : String(a ?? '').trim()))
        .filter(Boolean)
        .filter((action) => {
          const key = normalizeAction(action);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    data.firstScene = fs;
  }

  if (data.initialQuest && typeof data.initialQuest === 'object') {
    if (!data.initialQuest.id) {
      data.initialQuest = {
        ...data.initialQuest,
        id: `quest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      };
    }
    if (Array.isArray(data.initialQuest.objectives)) {
      data.initialQuest.objectives = data.initialQuest.objectives.map((obj, i) => {
        if (obj && typeof obj === 'object' && !obj.id) {
          return { ...obj, id: obj.id || `obj_${i + 1}` };
        }
        return obj;
      });
    }
    if (Array.isArray(data.initialQuest.questItems)) {
      data.initialQuest.questItems = data.initialQuest.questItems.map((item, i) => {
        if (item && typeof item === 'object' && !item.id) {
          return { ...item, id: item.id || `qitem_${i + 1}` };
        }
        return item;
      });
    }
  }

  if (Array.isArray(data.initialNPCs)) {
    data.initialNPCs = data.initialNPCs.filter(
      (npc) => npc && typeof npc === 'object' && typeof npc.name === 'string',
    );
  }

  return data;
}

const FALLBACK_ACTION_VARIANTS = {
  pl: {
    investigate: [
      'Przyglądam się uważnie temu miejscu',
      'Sprawdzam dokładnie, co tu się naprawdę dzieje',
      'Analizuję sytuację i szukam istotnych szczegółów',
      'Rozpoznaję teren, zanim podejmę kolejny krok',
    ],
    approach: [
      'Podchodzę ostrożnie bliżej źródła zamieszania',
      'Zbliżam się i próbuję zebrać więcej informacji',
      'Wchodzę bliżej, ale pozostaję czujny',
      'Przesuwam się naprzód, obserwując reakcje otoczenia',
    ],
    prepare: [
      'Szukam korzystniejszej pozycji, zanim ruszę dalej',
      'Przygotowuję się na możliwe kłopoty',
      'Sprawdzam drogę odwrotu i możliwe osłony',
      'Ustawiam się tak, by mieć przewagę, jeśli zrobi się gorąco',
    ],
    observe: [
      'Czekam chwilę i obserwuję rozwój wydarzeń',
      'Wstrzymuję się i nasłuchuję, co wydarzy się dalej',
      'Daję sytuacji moment i obserwuję reakcje ludzi',
      'Pozostaję w ukryciu i patrzę, kto wykona pierwszy ruch',
    ],
  },
  en: {
    investigate: [
      'I study the area carefully',
      'I examine what is really happening here',
      'I analyze the situation for useful details',
      'I scout the scene before making my next move',
    ],
    approach: [
      'I move closer with caution to gather more information',
      'I approach carefully and watch for reactions',
      'I step forward and try to understand the source of trouble',
      'I close the distance while staying alert',
    ],
    prepare: [
      'I look for a safer position before committing',
      'I get ready in case this turns dangerous',
      'I check my escape route and possible cover',
      'I position myself for an advantage if things escalate',
    ],
    observe: [
      'I wait a moment and observe how this unfolds',
      'I hold position and listen for what happens next',
      'I stay quiet and watch the people around me',
      'I keep to the side and see who acts first',
    ],
  },
};

function inferNarrativeLanguage(text = '') {
  if (!text || typeof text !== 'string') return 'en';
  const hasPolishDiacritics = /[ąćęłńóśźż]/i.test(text);
  if (hasPolishDiacritics) return 'pl';
  const polishSignals = /\b(i|oraz|się|jest|nie|czy|który|gdzie|teraz|wokół|ostrożnie|chwila)\b/i;
  return polishSignals.test(text) ? 'pl' : 'en';
}

const GENERIC_ACTION_PATTERNS = [
  // English
  /^(look around|keep going|move on|continue|wait|observe|investigate|explore|talk to (?:someone|npc)|ask around|check surroundings|search area)$/i,
  /^i (?:look around|keep going|move on|continue|wait|observe|investigate|explore|ask around|check surroundings|search the area)$/i,
  /^i talk to (?:someone|an npc|npc)$/i,
  // Polish
  /^(rozejrzyj się|idź dalej|kontynuuj|czekaj|obserwuj|zbadaj|eksploruj|porozmawiaj z kimś|popytaj|sprawdź okolicę)$/i,
  /^(rozglądam się|idę dalej|kontynuuję|czekam|obserwuję|badam|eksploruję|pytam (?:wokół|ludzi)|sprawdzam okolicę)$/i,
  /^mówię do kogoś$/i,
];

function summarizeNarrativeDetail(text = '', language = 'en') {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) {
    return language === 'pl' ? 'to, co właśnie się wydarzyło' : 'what just happened';
  }
  const quoteMatch = compact.match(/[„"«]([^"”»„«]{8,90})[”"»]/);
  if (quoteMatch?.[1]) return quoteMatch[1].trim();
  const sentence = compact.split(/[.!?]\s+/).find(Boolean) || compact;
  return sentence.slice(0, 90).trim();
}

function buildActionAnchors(data) {
  const narrative = typeof data?.narrative === 'string' ? data.narrative : '';
  const language = inferNarrativeLanguage(narrative);
  const npcs = (data?.stateChanges?.npcs || [])
    .map((npc) => (typeof npc?.name === 'string' ? npc.name.trim() : ''))
    .filter(Boolean);
  const currentLocation = typeof data?.stateChanges?.currentLocation === 'string'
    ? data.stateChanges.currentLocation.trim()
    : '';
  const detail = summarizeNarrativeDetail(narrative, language);
  return {
    language,
    npc: npcs[0] || '',
    location: currentLocation,
    detail,
  };
}

function isGenericAction(action = '') {
  const normalized = String(action || '').trim();
  if (!normalized) return true;
  if (normalized.length <= 12) return true;
  return GENERIC_ACTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function contextualizeGenericAction(action, anchors, index = 0) {
  const language = anchors?.language || 'en';
  const npc = anchors?.npc || '';
  const location = anchors?.location || '';
  const detail = anchors?.detail || (language === 'pl' ? 'to, co się stało' : 'what happened');

  const plTemplates = [
    npc
      ? `Podchodzę do ${npc} i wypytuję o szczegóły: "${detail}".`
      : `Sprawdzam dokładnie szczegóły tego, co właśnie zaszło: "${detail}".`,
    location
      ? `Idę w stronę ${location} i badam ślady związane z: "${detail}".`
      : `Szukam źródła zamieszania i badam ślady związane z: "${detail}".`,
    npc
      ? `Mówię do ${npc}: "Powiedz mi dokładnie, co oznacza: ${detail}?"`
      : `Mówię: "Kto mi wyjaśni, co dokładnie się tu wydarzyło?"`,
    location
      ? `Przeszukuję ${location}, żeby znaleźć konkretne dowody dotyczące: "${detail}".`
      : `Rozglądam się za konkretnym tropem związanym z: "${detail}".`,
  ];

  const enTemplates = [
    npc
      ? `I approach ${npc} and press for details about "${detail}".`
      : `I inspect the scene closely to clarify "${detail}".`,
    location
      ? `I head to ${location} and investigate traces tied to "${detail}".`
      : `I track down the source of trouble linked to "${detail}".`,
    npc
      ? `I tell ${npc}: "Explain exactly what happened with ${detail}."`
      : 'I say: "Who saw what happened here? Start from the beginning."',
    location
      ? `I search ${location} for concrete evidence about "${detail}".`
      : `I look for a concrete lead connected to "${detail}".`,
  ];

  const pool = language === 'pl' ? plTemplates : enTemplates;
  return pool[index % pool.length];
}

function contextualizeSuggestedActions(actions, data) {
  if (!Array.isArray(actions) || actions.length === 0) return [];
  const anchors = buildActionAnchors(data);
  const normalized = actions.map((action, index) => (
    isGenericAction(action)
      ? contextualizeGenericAction(action, anchors, index)
      : String(action).trim()
  ));
  const seen = new Set();
  return normalized.filter((action) => {
    const key = String(action || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickVariant(variants, seed, offset = 0) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  return variants[(seed + offset) % variants.length];
}

function extractFallbackActions(data) {
  if (!data?.narrative || typeof data.narrative !== 'string') return null;
  const text = data.narrative;
  const language = inferNarrativeLanguage(text);
  const npcs = (data.stateChanges?.npcs || []).map(n => n.name).filter(Boolean);
  const loc = data.stateChanges?.currentLocation;
  const firstQuestOffer = Array.isArray(data.questOffers) && data.questOffers.length > 0
    ? data.questOffers[0]
    : null;
  const questObjective = firstQuestOffer?.objectives?.[0]?.description || firstQuestOffer?.completionCondition || firstQuestOffer?.name || '';
  const detail = summarizeNarrativeDetail(text, language);
  const actions = [];
  const templates = FALLBACK_ACTION_VARIANTS[language] || FALLBACK_ACTION_VARIANTS.en;
  const seedBase = [...text].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) + (npcs[0]?.length || 0) + (loc?.length || 0);

  if (npcs.length > 0) {
    actions.push(language === 'pl'
      ? `Podchodzę do ${npcs[0]} i zaczynam rozmowę`
      : `I approach ${npcs[0]} and start a conversation`);
  }
  if (loc) {
    actions.push(language === 'pl'
      ? `Idę zbadać ${loc} i sprawdzam, co tam nie pasuje do sytuacji`
      : `I head over to investigate ${loc} and verify what does not add up`);
  }
  if (questObjective) {
    actions.push(language === 'pl'
      ? `Skupiam się na celu questu: ${questObjective}`
      : `I focus on the active objective: ${questObjective}`);
  }

  actions.push(language === 'pl'
    ? `Analizuję konkretny trop z tej sceny: "${detail}".`
    : `I focus on a concrete lead from this scene: "${detail}".`);
  actions.push(pickVariant(templates.investigate, seedBase, 0));
  actions.push(pickVariant(templates.approach, seedBase, 1));
  actions.push(pickVariant(templates.prepare, seedBase, 2));
  actions.push(pickVariant(templates.observe, seedBase, 3));
  actions.push(language === 'pl'
    ? (npcs[0] ? `Mówię do ${npcs[0]}: "Spokojnie, opowiedz mi po kolei, co tu zaszło."` : 'Mówię: "Spokojnie, opowiedzcie mi po kolei, co tu zaszło."')
    : (npcs[0] ? `I tell ${npcs[0]}: "Easy now. Start from the beginning and tell me exactly what happened."` : 'I say: "Easy now. Start from the beginning and tell me exactly what happened."'));
  actions.push(language === 'pl'
    ? (npcs[0] ? `Krzyczę do ${npcs[0]}: "Na Sigmara, bez gierek - chcę prawdy, teraz!"` : 'Krzyczę: "Na Sigmara, bez gierek - chcę prawdy, teraz!"')
    : (npcs[0] ? `I shout to ${npcs[0]}: "By Sigmar, no games - I want the truth, now!"` : 'I shout: "By Sigmar, no games - I want the truth, now!"'));

  const uniqueActions = actions
    .map((action) => (typeof action === 'string' ? action.trim() : ''))
    .filter(Boolean)
    .filter((action, index, arr) => arr.indexOf(action) === index);

  return uniqueActions.length >= 1 ? uniqueActions.slice(0, 3) : null;
}

function getSchemaDefaults(schema) {
  if (schema === SceneResponseSchema) {
    return {
      narrative: '...',
      dialogueSegments: [],
      suggestedActions: ['Rozglądam się dookoła', 'Badam okolicę', 'Pytam najbliższą osobę o szczegóły'],
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

const QUOTE_OPEN = '„\u201C«"';
const QUOTE_CLOSE = '\u201D"»\u201C';
const QUOTE_PATTERN = new RegExp(`[${QUOTE_OPEN}]([^${QUOTE_OPEN}${QUOTE_CLOSE}]+)[${QUOTE_CLOSE}]`, 'g');

const REFERENCE_TAIL = /(?:^|\s)(?:o|na|w|z|od|do|za|pod|nad|przed|po|przy|między|przez|dla|bez|jako|czyli|pt\.?|tzw\.?|zwan\w*|określ[ao]n\w*|nazwan\w*|zatytułowan\w*|podpisan\w*|oznaczon\w*|napis\w*|słow[aoy]|hasł[oaem]|about|of|on|in|with|from|to|as|titled|called|named|aka)[\s,:;]*$/i;
const SHORT_CONNECTOR = /^[\s,;]*(?:i|lub|albo|oraz|a|ani|czy|or|and)?\s*$/;

function isLikelyReference(textBetween, prevWasReference) {
  if (REFERENCE_TAIL.test(textBetween)) return true;
  if (prevWasReference && SHORT_CONNECTOR.test(textBetween)) return true;
  return false;
}

function fuzzyMatchPolishName(candidate, reference) {
  const cLower = candidate.toLowerCase();
  const rLower = reference.toLowerCase();
  if (cLower === rLower) return true;
  if (cLower.length < 3 || rLower.length < 3) return false;
  const shorter = cLower.length <= rLower.length ? cLower : rLower;
  const longer = cLower.length > rLower.length ? cLower : rLower;
  const minStem = Math.max(3, Math.ceil(shorter.length * 0.6));
  if (longer.startsWith(shorter.slice(0, minStem)) && Math.abs(cLower.length - rLower.length) <= 4) {
    return true;
  }
  return false;
}

function isExcludedName(raw, excludeNames) {
  return excludeNames.some(name =>
    name.toLowerCase().split(/\s+/).some(p =>
      p.toLowerCase() === raw.toLowerCase() || fuzzyMatchPolishName(raw, p)
    )
  );
}

function findSpeakerInText(textBefore, knownNames, excludeNames = []) {
  const words = textBefore.trim().split(/\s+/);

  for (let i = words.length - 1; i >= 0; i--) {
    const raw = words[i].replace(/[,:;.!?…\-—]+$/, '');
    if (raw.length < 2) continue;

    for (let j = 0; j < knownNames.length; j++) {
      const parts = knownNames[j].split(/\s+/);
      if (parts.some(p => p.toLowerCase() === raw.toLowerCase() || fuzzyMatchPolishName(raw, p))) {
        if (!isExcludedName(raw, excludeNames)) return knownNames[j];
        break;
      }
    }

    if (raw[0] === raw[0].toUpperCase() && raw[0] !== raw[0].toLowerCase()) {
      const isFirstWord = i === 0 || /[.!?…]$/.test(words[i - 1] || '');
      if (!isFirstWord) {
        if (!isExcludedName(raw, excludeNames)) return raw;
      }
    }
  }
  return null;
}

function lookupGender(name, knownNpcs, existingDialogueSegments) {
  if (!name) return undefined;

  for (const npc of knownNpcs) {
    if (!npc.name) continue;
    const npcParts = npc.name.split(/\s+/);
    if (fuzzyMatchPolishName(name, npc.name) || npcParts.some(p => fuzzyMatchPolishName(name, p))) {
      return npc.gender || undefined;
    }
  }

  for (const seg of existingDialogueSegments) {
    if (!hasNamedSpeaker(seg.character)) continue;
    const segParts = seg.character.split(/\s+/);
    if (fuzzyMatchPolishName(name, seg.character) || segParts.some(p => fuzzyMatchPolishName(name, p))) {
      return seg.gender || undefined;
    }
  }
  return undefined;
}

function normalizeTextForDedup(text) {
  return (text || '').trim().toLowerCase().replace(/[""„"«»'']/g, '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupNarrationAfterDialogueStrip(text) {
  return String(text || '')
    .replace(/\s+([,.;:!?…])/g, '$1')
    .replace(/([,.;:!?…])\s*([,.;:!?…])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.;:!?…\s-]+/, '')
    .replace(/\s+[-–—]\s+/g, ' ')
    .trim();
}

function stripDialogueRepeatsFromNarration(narrationText, dialogueTexts) {
  let remaining = String(narrationText || '').trim();
  if (!remaining || !Array.isArray(dialogueTexts) || dialogueTexts.length === 0) return remaining;

  const sortedDialogues = [...dialogueTexts]
    .map((text) => String(text || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const dialogueText of sortedDialogues) {
    const escaped = escapeRegex(dialogueText);
    const quotedPattern = new RegExp(`[„“"«]\\s*${escaped}\\s*[”"»](?:\\s*[.!?,:;…-]+)?`, 'gi');
    const barePattern = new RegExp(`(?:^|[\\s([{\\-–—])${escaped}(?=$|[\\s\\])}.,!?;:…\\-–—])`, 'gi');

    remaining = remaining.replace(quotedPattern, ' ');
    remaining = remaining.replace(barePattern, ' ');
    remaining = cleanupNarrationAfterDialogueStrip(remaining);
  }

  return cleanupNarrationAfterDialogueStrip(remaining);
}

function hardDedupeSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const deduped = [];
  const dialogueByText = new Map();
  const allDialogueTexts = segments
    .filter((seg) => seg?.type === 'dialogue' && typeof seg.text === 'string' && seg.text.trim())
    .map((seg) => seg.text.trim());

  for (const seg of segments) {
    if (!seg || typeof seg !== 'object') continue;
    const type = seg.type === 'dialogue' ? 'dialogue' : 'narration';
    const rawText = typeof seg.text === 'string' ? seg.text.trim() : '';
    const text = type === 'narration'
      ? stripDialogueRepeatsFromNarration(rawText, allDialogueTexts)
      : rawText;
    if (!text) continue;

    const normalizedText = normalizeTextForDedup(text);
    if (!normalizedText) continue;

    if (type === 'dialogue') {
      const existingIdx = dialogueByText.get(normalizedText);
      const normalizedCharacter = typeof seg.character === 'string' ? seg.character.trim() : '';
      const incomingNamed = hasNamedSpeaker(normalizedCharacter);

      if (existingIdx == null) {
        deduped.push({
          ...seg,
          text,
          ...(incomingNamed ? { character: normalizedCharacter } : {}),
        });
        dialogueByText.set(normalizedText, deduped.length - 1);
        continue;
      }

      const existing = deduped[existingIdx];
      const existingNamed = hasNamedSpeaker(existing?.character);

      // Prefer the named speaker version over a generic/anonymous duplicate.
      if (!existingNamed && incomingNamed) {
        deduped[existingIdx] = {
          ...existing,
          ...seg,
          text,
          character: normalizedCharacter,
          ...(seg.gender ? { gender: seg.gender } : {}),
        };
      }
      continue;
    }

    const previous = deduped[deduped.length - 1];
    if (previous?.type === 'narration' && normalizeTextForDedup(previous.text) === normalizedText) {
      continue;
    }

    deduped.push({ ...seg, text });
  }

  return deduped;
}

const DIRECT_SPEECH_PL = /(?:^|\W)(?:ty|ci|cię|ciebie|twój|twoja|twoje|twoim|twoją|tobie|chcesz|masz|musisz|możesz|widzisz|wiesz|znasz|słyszysz|jesteś|potrzebujesz|pomóż|powiedz|daj|weź|chodź|idź|patrz|słuchaj|posłuchaj|czekaj|spójrz|poczekaj|uważaj)(?:\W|$)/i;
const DIRECT_SPEECH_EN = /\b(?:you|your|yours|yourself|you're|you've)\b/i;
const FIRST_PERSON_SPEECH = /(?:^|\W)(?:mi|mnie|mną|mój|moja|moje|moim|moją|mojego|mojej|moich|ze mną|me|my|myself)(?:\W|$)/i;
const NARRATION_ADDRESS_EN = /\byou\s+(?:see|notice|feel|hear|smell|remember|watch|stand|walk|step|enter|approach|move|turn|look|find|spot|sense|are|have|can)\b/i;
const NARRATION_ADDRESS_PL = /(?:^|\W)(?:widzisz|czujesz|słyszysz|zauważasz|przypominasz sobie|stoisz|idziesz|wchodzisz|zbliżasz się|rozglądasz się)(?:\W|$)/i;
const SPEECH_VERB_HINT = /(?:^|\W)(?:mówi|powiedzia(?:ł|ła|łem|łam|łeś|łaś)|rzek(?:ł|ła)|mrukn(?:ął|ęła)|szepn(?:ął|ęła)|krzykn(?:ął|ęła)|spyta(?:ł|ła)|odpar(?:ł|ła)|odpow(?:iada|iedzia(?:ł|ła))|said|says|asked|asks|replied|replies|whispered|whispers|shouted|shouts|told|tells)(?:\W|$)/i;
const DIALOGUE_DASH_PREFIX = /^\s*[—-]\s*/;
const IMPERATIVE_SPEECH_PL = /(?:^|\W)(?:pomóż|powiedz|daj|weź|chodź|idź|patrz|słuchaj|posłuchaj|czekaj|spójrz|poczekaj|uważaj)(?:\W|$)/i;

function isLikelyNarrationAddress(text) {
  const t = (text || '').trim();
  if (!t) return false;
  const hasStrongSpeechPunctuation = /[!?]/.test(t);
  return (NARRATION_ADDRESS_EN.test(t) || NARRATION_ADDRESS_PL.test(t)) && !hasStrongSpeechPunctuation;
}

function looksLikeDirectSpeech(text) {
  if (!text || text.trim().length < 15) return false;
  const t = text.trim();
  if (isLikelyNarrationAddress(t)) return false;
  if (DIRECT_SPEECH_PL.test(t)) {
    // Polish second-person markers ("masz", "możesz") often appear in narration.
    // Require at least one stronger speech cue before reclassifying as dialogue.
    const hasStrongSpeechCue = SPEECH_VERB_HINT.test(t)
      || /[!?]/.test(t)
      || DIALOGUE_DASH_PREFIX.test(t)
      || IMPERATIVE_SPEECH_PL.test(t);
    return hasStrongSpeechCue;
  }
  if (DIRECT_SPEECH_EN.test(t)) return /[!?]/.test(t) || SPEECH_VERB_HINT.test(t);
  if (t.includes('?') && FIRST_PERSON_SPEECH.test(t) && SPEECH_VERB_HINT.test(t)) return true;
  return false;
}

function startsWithCharacterAction(text, allNames) {
  const firstWord = text.trim().split(/\s+/)[0].replace(/[,:;.!?…\-—]+$/, '');
  if (firstWord.length < 2) return false;
  return allNames.some(name =>
    name.split(/\s+/).some(part => fuzzyMatchPolishName(firstWord, part))
  );
}

function findSpeakerFromContext(segments, currentIndex, knownNames, knownNpcs, excludeNames) {
  for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 4); i--) {
    if (segments[i].type === 'dialogue' && hasNamedSpeaker(segments[i].character)) {
      if (!isExcludedName(segments[i].character, excludeNames)) return segments[i].character;
    }
  }
  for (let i = currentIndex - 1; i >= Math.max(0, currentIndex - 2); i--) {
    if (segments[i].type !== 'narration' || !segments[i].text) continue;
    const words = segments[i].text.trim().split(/\s+/);
    for (let w = words.length - 1; w >= 0; w--) {
      const raw = words[w].replace(/[,:;.!?…\-—]+$/, '');
      if (raw.length < 2) continue;
      for (const name of knownNames) {
        if (name.split(/\s+/).some(p => fuzzyMatchPolishName(raw, p))) {
          if (!isExcludedName(raw, excludeNames)) return name;
        }
      }
    }
  }
  return null;
}

function resolveFallbackSpeaker({
  preferredSpeaker = null,
  segments = [],
  currentIndex = -1,
  textBeforeQuote = '',
  knownNames = [],
  knownNpcs = [],
  excludeNames = [],
} = {}) {
  let speaker = preferredSpeaker;

  if (!speaker && textBeforeQuote) {
    speaker = findSpeakerInText(textBeforeQuote, knownNames, excludeNames);
  }

  if (!speaker && currentIndex >= 0) {
    speaker = findSpeakerFromContext(segments, currentIndex, knownNames, knownNpcs, excludeNames);
  }

  if (!speaker && knownNames.length === 1) {
    speaker = knownNames[0];
  }

  if (!speaker || isExcludedName(speaker, excludeNames)) return null;
  return speaker;
}

export function repairDialogueSegments(narrative, segments, knownNpcs = [], excludeNames = []) {
  if (!segments || segments.length === 0) {
    if (narrative && narrative.trim()) {
      segments = [{ type: 'narration', text: narrative }];
    } else {
      return [];
    }
  }

  const existingDialogueSegments = segments.filter(s => s.type === 'dialogue' && hasNamedSpeaker(s.character));
  const knownNames = [
    ...new Set([
      ...knownNpcs.map(n => n.name).filter(Boolean),
      ...existingDialogueSegments.map(s => s.character).filter(Boolean),
    ])
  ].filter(name => !isExcludedName(name, excludeNames));

  const existingDialogueTexts = new Set(
    existingDialogueSegments.map(s => (s.text || '').trim().toLowerCase()).filter(Boolean)
  );

  const repaired = [];
  for (let segIndex = 0; segIndex < segments.length; segIndex++) {
    const seg = segments[segIndex];
    if (seg.type !== 'narration' || !seg.text) {
      if (seg.type === 'dialogue' && !hasNamedSpeaker(seg.character)) {
        const spokenText = String(seg.text || '').trim();
        const genericLabelProvided = typeof seg.character === 'string' && isGenericSpeakerName(seg.character);
        if (spokenText && genericLabelProvided) {
          // Keep unknown/descriptor speakers as dialogue, but neutralize actor identity.
          repaired.push({
            type: 'dialogue',
            character: 'NPC',
            text: spokenText,
            ...(typeof seg.gender === 'string' ? { gender: seg.gender } : {}),
          });
          continue;
        }
        const fallbackSpeaker = resolveFallbackSpeaker({
          segments,
          currentIndex: segIndex,
          knownNames,
          knownNpcs,
          excludeNames,
        });
        if (fallbackSpeaker && spokenText) {
          const gender = lookupGender(fallbackSpeaker, knownNpcs, existingDialogueSegments);
          repaired.push({
            type: 'dialogue',
            character: fallbackSpeaker,
            text: spokenText,
            ...(gender ? { gender } : {}),
          });
        } else {
          // Safe mode: unknown speaker should not appear as anonymous dialogue.
          repaired.push({ type: 'narration', text: spokenText });
        }
      } else {
        repaired.push(seg);
      }
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
    let prevMatchEnd = 0;
    let prevWasReference = false;

    while ((match = QUOTE_PATTERN.exec(seg.text)) !== null) {
      const textBetween = seg.text.slice(prevMatchEnd, match.index);

      if (isLikelyReference(textBetween, prevWasReference)) {
        prevWasReference = true;
        prevMatchEnd = match.index + match[0].length;
        continue;
      }

      prevWasReference = false;
      prevMatchEnd = match.index + match[0].length;

      const before = seg.text.slice(lastIndex, match.index);
      if (before.trim()) {
        parts.push({ type: 'narration', text: before.trimEnd() });
      }

      const spokenText = match[1].trim();

      if (existingDialogueTexts.has(spokenText.toLowerCase())) {
        lastIndex = match.index + match[0].length;
        continue;
      }

      const speakerName = findSpeakerInText(
        seg.text.slice(0, match.index),
        knownNames,
        excludeNames
      );
      const resolvedSpeaker = resolveFallbackSpeaker({
        preferredSpeaker: speakerName,
        segments,
        currentIndex: segIndex,
        textBeforeQuote: seg.text.slice(0, match.index),
        knownNames,
        knownNpcs,
        excludeNames,
      });
      const gender = lookupGender(resolvedSpeaker, knownNpcs, existingDialogueSegments);

      if (resolvedSpeaker) {
        parts.push({
          type: 'dialogue',
          character: resolvedSpeaker,
          text: spokenText,
          ...(gender ? { gender } : {}),
        });
      } else {
        // Safe mode: keep speech as narration when we cannot identify actor confidently.
        parts.push({ type: 'narration', text: spokenText });
      }

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

  // Deduplicate: remove narration segments whose text duplicates a dialogue segment
  const dialogueTextSet = new Set();
  for (const seg of repaired) {
    if (seg.type === 'dialogue' && seg.text) {
      dialogueTextSet.add(normalizeTextForDedup(seg.text));
    }
  }
  const deduped = repaired.filter(seg => {
    if (seg.type !== 'narration' || !seg.text) return true;
    return !dialogueTextSet.has(normalizeTextForDedup(seg.text));
  });

  // Detect unquoted dialogue in narration segments
  const allNames = [...knownNames, ...excludeNames];
  const enhanced = [];
  for (let i = 0; i < deduped.length; i++) {
    const seg = deduped[i];
    if (seg.type !== 'narration' || !seg.text || seg.text.trim().length < 15) {
      enhanced.push(seg);
      continue;
    }
    if (isLikelyNarrationAddress(seg.text)) {
      enhanced.push(seg);
      continue;
    }
    if (startsWithCharacterAction(seg.text, allNames)) {
      enhanced.push(seg);
      continue;
    }
    if (!looksLikeDirectSpeech(seg.text)) {
      enhanced.push(seg);
      continue;
    }
    const speaker = findSpeakerFromContext(deduped, i, knownNames, knownNpcs, excludeNames);
    if (!speaker) {
      enhanced.push(seg);
      continue;
    }
    const gender = lookupGender(speaker, knownNpcs, existingDialogueSegments);
    enhanced.push({
      type: 'dialogue',
      character: speaker,
      text: seg.text.trim(),
      ...(gender ? { gender } : {}),
    });
  }

  // Second pass: re-attribute narration immediately before dialogue if it has first-person markers
  for (let i = enhanced.length - 2; i >= 0; i--) {
    const seg = enhanced[i];
    if (seg.type !== 'narration' || !seg.text || seg.text.trim().length < 15) continue;
    const next = enhanced[i + 1];
    if (next.type !== 'dialogue' || !next.character) continue;
    if (startsWithCharacterAction(seg.text, allNames)) continue;
    if (isLikelyNarrationAddress(seg.text)) continue;
    if (!FIRST_PERSON_SPEECH.test(seg.text)) continue;
    if (!looksLikeDirectSpeech(seg.text)) continue;
    const gender = lookupGender(next.character, knownNpcs, existingDialogueSegments);
    enhanced[i] = {
      type: 'dialogue',
      character: next.character,
      text: seg.text.trim(),
      ...(gender ? { gender } : {}),
    };
  }

  const hardened = hardDedupeSegments(enhanced);

  if (narrative && narrative.trim()) {
    const enhancedText = hardened.map(s => (s.text || '').trim()).join('');
    if (enhancedText.length < narrative.trim().length * 0.7) {
      const alreadySynthetic = segments.length === 1
        && segments[0].type === 'narration'
        && segments[0].text === narrative;
      if (!alreadySynthetic) {
        return repairDialogueSegments(narrative, [{ type: 'narration', text: narrative }], knownNpcs, excludeNames);
      }
    }
  }

  return hardened;
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
    s => s.type === 'dialogue' && hasNamedSpeaker(s.character) && s.character.toLowerCase() === charLower
  );
  if (hasPlayerDialogue) return segments;

  const result = [...(segments || [])];
  const quoteLookup = new Set(playerQuotes.map(q => q.toLowerCase()));
  const reattributed = new Set();

  for (let i = 0; i < result.length; i++) {
    const seg = result[i];
    if (seg.type === 'dialogue' && isGenericSpeakerName(seg.character) && quoteLookup.has((seg.text || '').trim().toLowerCase())) {
      result[i] = { ...seg, character: characterName, ...(characterGender ? { gender: characterGender } : {}) };
      reattributed.add(seg.text.trim().toLowerCase());
    }
  }

  const remainingQuotes = playerQuotes.filter(q => !reattributed.has(q.toLowerCase()));
  if (remainingQuotes.length === 0) return result;

  const playerSegments = remainingQuotes.map(text => ({
    type: 'dialogue',
    character: characterName,
    text,
    gender: characterGender || undefined,
  }));

  const firstNarrationIdx = result.findIndex(s => s.type === 'narration');
  if (firstNarrationIdx >= 0) {
    result.splice(firstNarrationIdx, 0, ...playerSegments);
    return result;
  }
  return [...playerSegments, ...result];
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
