import { z } from 'zod';
import { CHARACTERISTIC_KEYS } from '../data/wfrp.js';

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
  atmosphere: AtmosphereSchema,
  suggestedActions: z.array(z.string()).min(1).max(8),
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

  const normalizedData = schema === SceneResponseSchema
    ? normalizeSceneResponseCandidate(jsonResult.data)
    : schema === CampaignResponseSchema
      ? normalizeCampaignResponseCandidate(jsonResult.data)
      : jsonResult.data;

  const parsed = schema.safeParse(normalizedData);
  if (parsed.success) {
    return { ok: true, data: parsed.data, error: null };
  }

  console.warn('[aiResponseValidator] Schema validation failed, using raw data with defaults:', parsed.error.issues?.slice(0, 3));
  const partial = schema.safeParse({ ...getSchemaDefaults(schema), ...normalizedData });
  if (partial.success) {
    return { ok: true, data: partial.data, error: null };
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
          ...(typeof segment.character === 'string' ? { character: segment.character } : {}),
          ...(typeof segment.gender === 'string' ? { gender: segment.gender } : {}),
        };
      });
  }

  if (data.suggestedActions == null) {
    data.suggestedActions = extractFallbackActions(data) || undefined;
  } else if (Array.isArray(data.suggestedActions)) {
    data.suggestedActions = data.suggestedActions
      .map((action) => (typeof action === 'string' ? action.trim() : String(action ?? '').trim()))
      .filter(Boolean)
      .slice(0, 8);
    if (data.suggestedActions.length === 0) {
      data.suggestedActions = extractFallbackActions(data) || undefined;
    }
  } else if (typeof data.suggestedActions === 'string') {
    const single = data.suggestedActions.trim();
    data.suggestedActions = single ? [single] : extractFallbackActions(data) || undefined;
  } else {
    data.suggestedActions = extractFallbackActions(data) || undefined;
  }

  if (data.atmosphere == null || typeof data.atmosphere !== 'object' || Array.isArray(data.atmosphere)) {
    data.atmosphere = {};
  }

  if (data.stateChanges == null || typeof data.stateChanges !== 'object' || Array.isArray(data.stateChanges)) {
    data.stateChanges = {};
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
          };
        });
    }

    if (Array.isArray(fs.suggestedActions)) {
      fs.suggestedActions = fs.suggestedActions
        .map((a) => (typeof a === 'string' ? a.trim() : String(a ?? '').trim()))
        .filter(Boolean);
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

function extractFallbackActions(data) {
  if (!data?.narrative || typeof data.narrative !== 'string') return null;
  const text = data.narrative;
  const npcs = (data.stateChanges?.npcs || []).map(n => n.name).filter(Boolean);
  const loc = data.stateChanges?.currentLocation;
  const actions = [];
  if (npcs.length > 0) actions.push(`Talk to ${npcs[0]}`);
  if (loc) actions.push(`Explore ${loc}`);
  if (text.length > 50) actions.push('Investigate the situation');
  actions.push('Wait and observe');
  return actions.length >= 2 ? actions.slice(0, 4) : null;
}

function getSchemaDefaults(schema) {
  if (schema === SceneResponseSchema) {
    return {
      narrative: '',
      dialogueSegments: [],
      suggestedActions: ['Investigate the situation', 'Wait and observe', 'Look for another way', 'Press forward'],
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
    if (!seg.character) continue;
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

const DIRECT_SPEECH_PL = /(?:^|\W)(?:ty|ci|cię|ciebie|twój|twoja|twoje|twoim|twoją|tobie|chcesz|masz|musisz|możesz|widzisz|wiesz|znasz|słyszysz|jesteś|potrzebujesz|pomóż|powiedz|daj|weź|chodź|idź|patrz|słuchaj|posłuchaj|czekaj|spójrz|poczekaj|uważaj)(?:\W|$)/i;
const DIRECT_SPEECH_EN = /\b(?:you|your|yours|yourself|you're|you've)\b/i;
const FIRST_PERSON_SPEECH = /(?:^|\W)(?:mi|mnie|mną|mój|moja|moje|moim|moją|mojego|mojej|moich|ze mną|me|my|myself)(?:\W|$)/i;

function looksLikeDirectSpeech(text) {
  if (!text || text.trim().length < 15) return false;
  const t = text.trim();
  if (DIRECT_SPEECH_PL.test(t) || DIRECT_SPEECH_EN.test(t)) return true;
  if (t.includes('?') && FIRST_PERSON_SPEECH.test(t)) return true;
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
    if (segments[i].type === 'dialogue' && segments[i].character) {
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

export function repairDialogueSegments(narrative, segments, knownNpcs = [], excludeNames = []) {
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
  ].filter(name => !isExcludedName(name, excludeNames));

  const existingDialogueTexts = new Set(
    existingDialogueSegments.map(s => (s.text || '').trim().toLowerCase()).filter(Boolean)
  );

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
    if (!FIRST_PERSON_SPEECH.test(seg.text)) continue;
    const gender = lookupGender(next.character, knownNpcs, existingDialogueSegments);
    enhanced[i] = {
      type: 'dialogue',
      character: next.character,
      text: seg.text.trim(),
      ...(gender ? { gender } : {}),
    };
  }

  if (narrative && narrative.trim()) {
    const enhancedText = enhanced.map(s => (s.text || '').trim()).join('');
    if (enhancedText.length < narrative.trim().length * 0.7) {
      const alreadySynthetic = segments.length === 1
        && segments[0].type === 'narration'
        && segments[0].text === narrative;
      if (!alreadySynthetic) {
        return repairDialogueSegments(narrative, [{ type: 'narration', text: narrative }], knownNpcs, excludeNames);
      }
    }
  }

  return enhanced;
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

  const result = [...(segments || [])];
  const quoteLookup = new Set(playerQuotes.map(q => q.toLowerCase()));
  const reattributed = new Set();

  for (let i = 0; i < result.length; i++) {
    const seg = result[i];
    if (seg.type === 'dialogue' && seg.character === 'NPC' && quoteLookup.has((seg.text || '').trim().toLowerCase())) {
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
