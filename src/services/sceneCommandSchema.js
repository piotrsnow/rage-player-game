import { z } from 'zod';

export const ENVIRONMENT_TYPES = [
  'tavern', 'forest', 'dungeon', 'road', 'castle', 'market',
  'camp', 'cave', 'village', 'city_street', 'temple', 'swamp',
  'mountain', 'river', 'ruins', 'battlefield', 'ship', 'generic',
];

export const TIME_OF_DAY = ['dawn', 'morning', 'afternoon', 'evening', 'night'];
export const WEATHER_TYPES = ['clear', 'cloudy', 'rain', 'snow', 'fog', 'storm'];
export const MOOD_TYPES = ['calm', 'tense', 'mysterious', 'jovial', 'grim', 'eerie', 'solemn'];
export const ANIMATION_STATES = ['idle', 'walk', 'talk', 'sit', 'interact', 'combat_idle', 'attack', 'defend', 'cast'];
export const CAMERA_MODES = ['exploration', 'dialogue', 'action_focus'];
export const FACING_DIRECTIONS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'];

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

const EnvironmentSchema = z.object({
  type: z.string().default('generic'),
  variant: z.string().optional(),
  timeOfDay: z.string().default('afternoon'),
  weather: z.string().default('clear'),
  mood: z.string().default('calm'),
});

const CharacterCommandSchema = z.object({
  id: z.string(),
  name: z.string().default('Unknown'),
  archetype: z.string().default('human_male'),
  assetHint: z.string().optional(),
  modelId: z.string().optional(),
  modelCategory: z.string().optional(),
  modelFile: z.string().optional(),
  modelUrl: z.string().optional(),
  modelMatchScore: z.number().optional(),
  alreadyExists: z.boolean().default(false),
  needsModelReview: z.boolean().default(false),
  anchor: z.string().optional(),
  position: Vec3Schema.optional(),
  animation: z.string().default('idle'),
  facing: z.string().optional(),
  facingTarget: z.string().optional(),
  moveTo: z.object({
    anchor: z.string().optional(),
    position: Vec3Schema.optional(),
  }).optional(),
  scale: z.number().default(1),
  highlighted: z.boolean().default(false),
});

const ObjectCommandSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  modelId: z.string().optional(),
  modelCategory: z.string().optional(),
  modelFile: z.string().optional(),
  modelUrl: z.string().optional(),
  modelMatchScore: z.number().optional(),
  alreadyExists: z.boolean().default(false),
  needsModelReview: z.boolean().default(false),
  anchor: z.string().optional(),
  position: Vec3Schema.optional(),
  rotation: Vec3Schema.optional(),
  scale: z.number().default(1),
});

const CameraCommandSchema = z.object({
  mode: z.string().default('exploration'),
  focusTargets: z.array(z.string()).default([]),
  position: Vec3Schema.optional(),
  lookAt: Vec3Schema.optional(),
  fov: z.number().optional(),
});

const TransitionSchema = z.object({
  type: z.enum(['fade_in', 'fade_out', 'cut', 'crossfade']).default('fade_in'),
  duration: z.number().default(800),
});

export const SceneCommandSchema = z.object({
  sceneId: z.string(),
  environment: EnvironmentSchema,
  characters: z.array(CharacterCommandSchema).default([]),
  objects: z.array(ObjectCommandSchema).default([]),
  camera: CameraCommandSchema.default({ mode: 'exploration', focusTargets: [] }),
  transitions: z.array(TransitionSchema).default([]),
});

/**
 * @typedef {z.infer<typeof SceneCommandSchema>} SceneCommand
 * @typedef {z.infer<typeof CharacterCommandSchema>} CharacterCommand
 * @typedef {z.infer<typeof ObjectCommandSchema>} ObjectCommand
 * @typedef {z.infer<typeof CameraCommandSchema>} CameraCommand
 * @typedef {z.infer<typeof EnvironmentSchema>} EnvironmentCommand
 */

/**
 * Parse and validate a raw scene command object, returning defaults for missing fields.
 * @param {unknown} raw
 * @returns {SceneCommand}
 */
export function parseSceneCommand(raw) {
  const result = SceneCommandSchema.safeParse(raw);
  if (result.success) return result.data;
  console.warn('[SceneCommand] Validation failed, using defaults for invalid fields:', result.error.issues);
  return SceneCommandSchema.parse({
    sceneId: raw?.sceneId ?? 'unknown',
    environment: raw?.environment ?? {},
    characters: Array.isArray(raw?.characters) ? raw.characters : [],
    objects: Array.isArray(raw?.objects) ? raw.objects : [],
    camera: raw?.camera ?? {},
    transitions: Array.isArray(raw?.transitions) ? raw.transitions : [],
  });
}
