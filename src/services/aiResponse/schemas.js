import { z } from 'zod';
import { ATTRIBUTE_KEYS } from '../../data/rpgSystem.js';

const AttributeKeySchema = z.enum(ATTRIBUTE_KEYS);

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
  roll: z.number().optional(),         // d50 roll
  total: z.number().optional(),        // roll + attribute + skill + momentum + creativity
  threshold: z.number().optional(),    // difficulty threshold
  margin: z.number().optional(),       // total - threshold (positive = success)
  skill: z.string().optional(),
  suggestedSkills: z.array(z.string()).optional().default([]),
  attribute: AttributeKeySchema.optional(),
  attributeValue: z.number().optional(),
  skillLevel: z.number().optional(),
  success: z.boolean().optional(),
  luckySuccess: z.boolean().optional().default(false), // auto-success from Szczescie
  momentum: z.number().optional(),
  creativityBonus: z.number().optional(),
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
  canTrain: z.array(z.string()).optional(),
  // G4 — set true when this NPC has just commented on the player's renown.
  // Prevents the same acknowledgment from firing again in future scenes.
  acknowledgedFame: z.boolean().optional(),
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
  baseType: z.string().optional(),
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
  addProgress: z.string().optional(),
}).passthrough();

const CombatCrySchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1),
}).passthrough();

export const MAP_MODES = ['trakt', 'pola', 'wnetrze', 'las'];
export const ROAD_VARIANTS = ['pola', 'las', 'miasto'];

const StateChangesSchema = z.object({
  mapMode: z.enum(MAP_MODES).optional(),
  roadVariant: z.enum(ROAD_VARIANTS).optional(),
  woundsChange: z.number().optional(),
  xp: z.number().optional(),
  manaChange: z.number().optional(),
  manaMaxChange: z.number().optional(),
  attributeChanges: z.record(AttributeKeySchema, z.number()).nullable().optional(),
  skillProgress: z.record(z.string(), z.number()).nullable().optional(),
  spellUsage: z.record(z.string(), z.number()).nullable().optional(),
  learnSpell: z.string().nullable().optional(),
  consumeScroll: z.string().nullable().optional(),
  addScroll: z.string().nullable().optional(),
  newItems: z.array(InventoryItemSchema).optional().default([]),
  removeItems: z.array(z.any()).optional().default([]),
  // Living World Phase 7 — per-room dungeon state flags. Written by premium
  // when the player trips a trap / clears the encounter / takes the loot in
  // a dungeon_room. All flags are optional — ignored if the current location
  // is not a dungeon room.
  dungeonRoom: z.object({
    entryCleared: z.boolean().optional(),
    trapSprung: z.boolean().optional(),
    lootTaken: z.boolean().optional(),
  }).passthrough().nullable().optional(),
  // Living World Phase 7 — materialize new locations.
  //   • Sublocation (inside a known parent settlement): parentLocationName=set.
  //   • Top-level settlement/wilderness: parentLocationName=null +
  //     directionFromCurrent + travelDistance relative to the scene's starting
  //     location. BE resolves position via positionCalculator and auto-creates
  //     the edge current→new.
  newLocations: z.array(z.object({
    name: z.string().min(1),
    parentLocationName: z.string().nullable().optional(),
    locationType: z.string().optional().default('interior'),
    slotType: z.string().nullable().optional(),
    description: z.string().optional().default(''),
    directionFromCurrent: z.enum(['N','NE','E','SE','S','SW','W','NW']).nullable().optional(),
    travelDistance: z.enum(['short','half_day','day','two_days','multi_day']).nullable().optional(),
    connectsTo: z.array(z.string()).optional().default([]),
    difficulty: z.enum(['safe','moderate','dangerous','deadly']).nullable().optional(),
    terrainType: z.enum(['road','path','wilderness','river','mountain']).nullable().optional(),
  }).passthrough()).optional().default([]),
  newQuests: z.array(QuestSchema).optional().default([]),
  completedQuests: z.array(z.string()).optional().default([]),
  questUpdates: z.array(QuestUpdateSchema).optional().default([]),
  worldFacts: z.array(z.string()).optional().default([]),
  journalEntries: z.array(z.string()).optional().default([]),
  statuses: z.any().nullable().optional(),
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
      characteristics: z.object({}).passthrough().optional().default({}),
      attributes: z.object({}).passthrough().optional(),
      wounds: z.number().optional(),
      maxWounds: z.number().optional(),
      skills: z.object({}).passthrough().optional().default({}),
      traits: z.array(z.string()).optional().default([]),
      armour: z.any().optional().default({}),
      armourDR: z.number().optional(),
      weapons: z.array(z.string()).optional().default(['Hand Weapon']),
    }).passthrough()).optional().default([]),
    enemyHints: z.object({
      location: z.string().optional(),
      budget: z.number().optional(),
      maxDifficulty: z.string().optional(),
      count: z.number().optional(),
      race: z.string().optional(),
    }).nullable().optional(),
    reason: z.string().optional(),
  }).passthrough().nullable().optional(),
  pendingThreat: z.object({
    race: z.string().optional(),
    budget: z.number().optional(),
    maxDifficulty: z.string().optional(),
    count: z.number().optional(),
    description: z.string().optional(),
  }).nullable().optional(),
  startTrade: z.object({
    npcName: z.string(),
  }).nullable().optional(),
  needsChanges: z.any().nullable().optional(),
  knowledgeUpdates: z.any().nullable().optional(),
  codexUpdates: z.array(CodexUpdateSchema).optional().default([]),
  campaignEnd: z.any().nullable().optional(),
  // Living World — emitted when the player resolves the campaign's main
  // conflict. Fires a GLOBAL WorldEvent visible to other campaigns in the
  // same location. Minor victories and side quests MUST NOT use this.
  campaignComplete: z.object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(800),
    majorAchievements: z.array(z.string().max(200)).min(1).max(3),
  }).passthrough().nullable().optional(),
  // Major-event gate (Commit 3 / Zakres C). Premium flags scenes worth
  // retelling across unrelated campaigns. Backend gates the promotion on
  // objective evidence (named kill / main quest / deadly / dungeon / liberation).
  worldImpact: z.enum(['minor', 'major']).nullable().optional(),
  worldImpactReason: z.string().max(300).nullable().optional(),
  locationLiberated: z.boolean().nullable().optional(),
  defeatedDeadlyEncounter: z.boolean().nullable().optional(),
  dungeonComplete: z.object({
    name: z.string().min(1),
    summary: z.string().max(400),
  }).passthrough().nullable().optional(),
  // Round B (Phase 4b) — hearsay mentions. BE's `processLocationMentions`
  // enforces policy (NPC must already know the location) + caps at 20 to
  // bound per-scene DB work. Same cap here so FE validator rejects oversized
  // arrays before dispatch.
  locationMentioned: z.array(z.object({
    locationId: z.string().min(1),
    byNpcId: z.string().min(1).optional(),
    npcId: z.string().min(1).optional(),
    byNpc: z.string().min(1).optional(),
  }).passthrough()).max(20).optional().default([]),
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

export const NpcIntroducedSchema = z.object({
  name: z.string().min(1),
  gender: z.enum(['male', 'female', 'unknown']).optional().default('unknown'),
  speechStyle: z.string().optional().default(''),
}).passthrough();

// Wrap-up dialogue emitted when a quest objective (or the entire quest) resolves
// this scene. Plays AFTER the main dialogueSegments as a short epilogue.
// Accepts a plain string for robustness (coerced to narrator) OR a structured object.
export const QuestWrapupSchema = z.preprocess(
  (val) => {
    if (val == null) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed ? { text: trimmed, speakerType: 'narrator', speakerName: null } : null;
    }
    return val;
  },
  z.object({
    text: z.string().min(1).max(600),
    speakerType: z.enum(['narrator', 'npc', 'companion']).default('narrator'),
    speakerName: z.string().max(80).nullable().optional(),
  }).passthrough().nullable(),
).nullable().optional();

export const SceneResponseSchema = z.object({
  narrative: z.string().min(1),
  scenePacing: z.enum(SCENE_PACING_TYPES).optional().default('exploration'),
  npcsIntroduced: z.array(NpcIntroducedSchema).optional().default([]),
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
  dialogueIfQuestTargetCompleted: QuestWrapupSchema,
}).passthrough();

const CharacterSuggestionSchema = z.object({
  name: z.string(),
  species: z.string().optional().default('Human'),
  attributes: z.any().optional(),
  skills: z.any().optional().default({}),
  mana: z.object({ current: z.number(), max: z.number() }).optional(),
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

export const SkillCheckInferenceSchema = z.union([
  z.object({
    attribute: z.enum(ATTRIBUTE_KEYS),
    skill: z.string().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard', 'veryHard', 'extreme']).optional().default('medium'),
  }).passthrough(),
  z.object({ skip: z.literal(true) }).passthrough(),
]);
