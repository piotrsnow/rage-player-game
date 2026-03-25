import { parseSceneCommand } from './sceneCommandSchema';
import { getAnchor, getLocationAnchors, isKnownLocation, LOCATION_ANCHORS, getEnvironmentProps } from '../data/sceneAnchors';
import { resolveCharacterArchetype, matchObjectType } from '../data/prefabs';
import { scene3dDebug } from './scene3dDebug';

const LOCATION_KEYWORDS = {
  tavern:       ['tavern', 'inn', 'pub', 'bar', 'taproom', 'alehouse', 'common room', 'karczma', 'gospoda'],
  forest:       ['forest', 'wood', 'grove', 'thicket', 'glade', 'clearing', 'las', 'gaj', 'polana'],
  dungeon:      ['dungeon', 'crypt', 'catacomb', 'cellar', 'vault', 'underground', 'loch', 'krypta', 'podziemie'],
  road:         ['road', 'path', 'trail', 'highway', 'track', 'route', 'droga', 'trakt', 'ścieżka'],
  castle:       ['castle', 'keep', 'fortress', 'palace', 'manor', 'throne', 'hall', 'zamek', 'pałac', 'twierdza'],
  market:       ['market', 'bazaar', 'square', 'marketplace', 'fair', 'stall', 'targ', 'rynek', 'jarmark'],
  camp:         ['camp', 'campsite', 'bivouac', 'campfire', 'tent', 'obóz', 'obozowisko', 'ognisko'],
  cave:         ['cave', 'cavern', 'grotto', 'tunnel', 'jaskinia', 'grota', 'pieczara'],
  village:      ['village', 'hamlet', 'settlement', 'farmstead', 'wioska', 'osada', 'wieś'],
  city_street:  ['city', 'street', 'alley', 'avenue', 'district', 'quarter', 'ulica', 'dzielnica', 'miasto'],
  temple:       ['temple', 'church', 'chapel', 'shrine', 'sanctuary', 'cathedral', 'świątynia', 'kościół', 'kaplica'],
  swamp:        ['swamp', 'marsh', 'bog', 'wetland', 'fen', 'mire', 'bagno', 'moczary', 'trzęsawisko'],
  mountain:     ['mountain', 'peak', 'cliff', 'ledge', 'summit', 'pass', 'góra', 'szczyt', 'przełęcz'],
  river:        ['river', 'stream', 'creek', 'ford', 'bridge', 'bank', 'rzeka', 'strumień', 'bród', 'most'],
  ruins:        ['ruin', 'ruins', 'rubble', 'remnant', 'abandoned', 'ruiny', 'zgliszcza'],
  battlefield:  ['battlefield', 'battle', 'warzone', 'frontline', 'pole bitwy', 'bitwa', 'front'],
  ship:         ['ship', 'boat', 'vessel', 'deck', 'galley', 'statek', 'okręt', 'łódź', 'pokład'],
};

const TIME_MAPPING = {
  dawn:      'dawn',
  morning:   'morning',
  afternoon: 'afternoon',
  evening:   'evening',
  night:     'night',
  midnight:  'night',
  dusk:      'evening',
  sunrise:   'dawn',
  sunset:    'evening',
  noon:      'afternoon',
};

const WEATHER_MAPPING = {
  clear:     'clear',
  sunny:     'clear',
  cloudy:    'cloudy',
  overcast:  'cloudy',
  rain:      'rain',
  raining:   'rain',
  drizzle:   'rain',
  snow:      'snow',
  snowing:   'snow',
  blizzard:  'storm',
  fog:       'fog',
  foggy:     'fog',
  mist:      'fog',
  misty:     'fog',
  storm:     'storm',
  stormy:    'storm',
  thunder:   'storm',
  hail:      'storm',
};

const MOOD_MAPPING = {
  calm:        'calm',
  peaceful:    'calm',
  serene:      'calm',
  relaxed:     'calm',
  tense:       'tense',
  anxious:     'tense',
  nervous:     'tense',
  danger:      'tense',
  dangerous:   'tense',
  mysterious:  'mysterious',
  eerie:       'eerie',
  creepy:      'eerie',
  haunted:     'eerie',
  dark:        'grim',
  grim:        'grim',
  somber:      'grim',
  solemn:      'solemn',
  jovial:      'jovial',
  festive:     'jovial',
  cheerful:    'jovial',
  merry:       'jovial',
  lively:      'jovial',
};

/**
 * Detect location type from a free-form location string.
 * @param {string} locationStr
 * @returns {string}
 */
function detectLocationType(locationStr) {
  if (!locationStr) return 'generic';
  const lower = locationStr.toLowerCase();

  for (const [type, keywords] of Object.entries(LOCATION_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return type;
    }
  }

  return 'generic';
}

/**
 * Map a raw time string to a known timeOfDay.
 * @param {object} timeState
 * @returns {string}
 */
function resolveTimeOfDay(timeState) {
  if (!timeState) return 'afternoon';
  const tod = (timeState.timeOfDay || '').toLowerCase();
  if (TIME_MAPPING[tod]) return TIME_MAPPING[tod];

  const hour = timeState.hour;
  if (typeof hour === 'number') {
    if (hour >= 5 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  return 'afternoon';
}

/**
 * Map weather state to a known weather type.
 * @param {object|string} weatherData
 * @returns {string}
 */
function resolveWeather(weatherData) {
  if (!weatherData) return 'clear';
  const str = typeof weatherData === 'string' ? weatherData : (weatherData.type || weatherData.condition || '');
  const lower = str.toLowerCase();

  for (const [key, val] of Object.entries(WEATHER_MAPPING)) {
    if (lower.includes(key)) return val;
  }
  return 'clear';
}

/**
 * Map mood/atmosphere to a known mood type.
 * @param {object} atmosphere
 * @returns {string}
 */
function resolveMood(atmosphere) {
  if (!atmosphere) return 'calm';
  const moodStr = (atmosphere.mood || atmosphere.lighting || '').toLowerCase();

  for (const [key, val] of Object.entries(MOOD_MAPPING)) {
    if (moodStr.includes(key)) return val;
  }
  return 'calm';
}

/**
 * Assign anchors to a list of entity IDs within a location.
 * Speaker-roles get prominent positions, others fill remaining.
 * @param {string} locationType
 * @param {string[]} entityIds
 * @param {Set<string>} speakerEntityIds - Entity IDs (npc_xxx format) of speakers
 * @returns {Map<string, string>}
 */
function assignAnchors(locationType, entityIds, speakerEntityIds) {
  const available = getLocationAnchors(locationType).filter(a => a !== 'room_center');
  const assignments = new Map();
  let anchorIdx = 0;

  const speakers = entityIds.filter(id => speakerEntityIds.has(id));
  const others = entityIds.filter(id => !speakerEntityIds.has(id));

  for (const id of [...speakers, ...others]) {
    if (anchorIdx < available.length) {
      assignments.set(id, available[anchorIdx]);
      anchorIdx++;
    } else {
      assignments.set(id, 'room_center');
    }
  }

  return assignments;
}

/**
 * Extract NPC IDs mentioned in dialogue segments.
 * @param {Array} dialogueSegments
 * @returns {Set<string>}
 */
function extractSpeakerNames(dialogueSegments) {
  const names = new Set();
  if (!Array.isArray(dialogueSegments)) return names;
  for (const seg of dialogueSegments) {
    if (seg.speaker && seg.type === 'dialogue') {
      names.add(seg.speaker.toLowerCase());
    }
  }
  return names;
}

/**
 * Build NPC entries from state.
 * @param {object} state
 * @returns {Array<{id: string, name: string, species: string, career: string, gender: string}>}
 */
function gatherNPCs(state) {
  const npcs = [];
  const world = state.world || {};
  if (Array.isArray(world.npcs)) {
    for (const npc of world.npcs) {
      if (!npc.name) continue;
      npcs.push({
        id: `npc_${npc.name.toLowerCase().replace(/\s+/g, '_')}`,
        name: npc.name,
        species: npc.species || npc.race || 'human',
        career: npc.career || npc.occupation || '',
        gender: npc.gender || 'male',
      });
    }
  }
  return npcs;
}

/**
 * Determine camera mode from scene context.
 * @param {object} scene
 * @param {object} state
 * @returns {{ mode: string, focusTargets: string[] }}
 */
function determineCamera(scene, state) {
  if (state.combat?.active) {
    return { mode: 'action_focus', focusTargets: ['player'] };
  }
  if (scene.dialogueSegments && scene.dialogueSegments.length > 0) {
    const speakers = extractSpeakerNames(scene.dialogueSegments);
    return { mode: 'dialogue', focusTargets: ['player', ...Array.from(speakers).slice(0, 1).map(n => `npc_${n.replace(/\s+/g, '_')}`)] };
  }
  return { mode: 'exploration', focusTargets: [] };
}

/**
 * Extract object hints from scene stateChanges.
 * @param {object} scene
 * @returns {Array<{id: string, type: string, name: string}>}
 */
function extractSceneObjects(scene) {
  const objects = [];
  const sc = scene.stateChanges || {};

  if (Array.isArray(sc.addItems)) {
    for (const item of sc.addItems) {
      const name = typeof item === 'string' ? item : (item.name || item);
      objects.push({
        id: `obj_${String(name).toLowerCase().replace(/\s+/g, '_')}`,
        type: matchObjectType(String(name)),
        name: String(name),
      });
    }
  }

  return objects;
}

/**
 * Main scene planning function.
 * Converts (scene, gameState) into a structured SceneCommand.
 * @param {object} scene
 * @param {object} state
 * @param {object} [options]
 * @param {string|null} [options.prevLocationType] - Previous scene's location type for transition selection
 * @returns {import('./sceneCommandSchema').SceneCommand}
 */
export function planScene(scene, state, options = {}) {
  const { prevLocationType = null } = options;
  if (!scene) {
    return parseSceneCommand({ sceneId: 'empty', environment: {}, characters: [], objects: [], camera: {}, transitions: [] });
  }

  const world = state.world || {};
  const locationType = detectLocationType(world.currentLocation);
  const timeOfDay = resolveTimeOfDay(world.timeState);
  const weather = resolveWeather(world.weather);
  const mood = resolveMood(scene.atmosphere);

  const speakerNames = extractSpeakerNames(scene.dialogueSegments);

  const player = state.character;
  const allCharacters = [];
  const entityIds = [];

  if (player) {
    const pid = 'player';
    entityIds.push(pid);
    allCharacters.push({
      id: pid,
      name: player.name || 'Player',
      species: player.species || 'human',
      career: player.career?.name || '',
      gender: player.gender || 'male',
      isPlayer: true,
    });
  }

  const npcs = gatherNPCs(state);
  const recentNpcNames = new Set();
  if (scene.stateChanges?.npcs) {
    for (const npc of scene.stateChanges.npcs) {
      if (npc.name) recentNpcNames.add(npc.name.toLowerCase());
    }
  }
  for (const name of speakerNames) {
    recentNpcNames.add(name);
  }

  const visibleNpcs = npcs.filter(npc =>
    recentNpcNames.has(npc.name.toLowerCase()) || speakerNames.has(npc.name.toLowerCase())
  ).slice(0, 8);

  for (const npc of visibleNpcs) {
    entityIds.push(npc.id);
    allCharacters.push(npc);
  }

  if (Array.isArray(state.party)) {
    for (const companion of state.party) {
      if (!companion || companion.name === player?.name) continue;
      const cid = `companion_${companion.name.toLowerCase().replace(/\s+/g, '_')}`;
      entityIds.push(cid);
      allCharacters.push({
        id: cid,
        name: companion.name,
        species: companion.species || 'human',
        career: companion.career?.name || '',
        gender: companion.gender || 'male',
      });
    }
  }

  const speakerEntityIds = new Set();
  for (const name of speakerNames) {
    speakerEntityIds.add(`npc_${name.replace(/\s+/g, '_')}`);
  }
  speakerEntityIds.add('player');

  const anchorAssignments = assignAnchors(locationType, entityIds, speakerEntityIds);

  const firstSpeakerId = speakerNames.size > 0
    ? `npc_${Array.from(speakerNames)[0].replace(/\s+/g, '_')}`
    : null;
  const hasDialogue = speakerNames.size > 0;
  const isInCombat = state.combat?.active;
  const isRelaxed = ['tavern', 'camp'].includes(locationType) && !isInCombat && !hasDialogue;

  const characters = allCharacters.map(c => {
    const anchor = anchorAssignments.get(c.id) || 'room_center';
    const isSpeaker = speakerNames.has((c.name || '').toLowerCase());

    let animation = 'idle';
    if (isInCombat) animation = 'combat_idle';
    else if (isSpeaker) animation = 'talk';
    else if (isRelaxed && !c.isPlayer) animation = 'sit';

    let facingTarget;
    if (hasDialogue) {
      if (c.isPlayer && firstSpeakerId) {
        facingTarget = firstSpeakerId;
      } else if (isSpeaker) {
        facingTarget = 'player';
      }
    }

    const archetype = resolveCharacterArchetype(c.species, c.career, c.gender);
    const nameSlug = (c.name || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    const assetHint = `${nameSlug}_${archetype}`;

    return {
      id: c.id,
      name: c.name,
      archetype,
      assetHint,
      anchor,
      animation,
      facingTarget,
      highlighted: c.isPlayer || false,
    };
  });

  const sceneObjects = extractSceneObjects(scene);
  const usedAnchors = new Set(anchorAssignments.values());

  const envProps = getEnvironmentProps(locationType);
  const envObjects = envProps
    .filter(p => !usedAnchors.has(p.anchor))
    .map((p, i) => ({
      id: `env_${p.type}_${i}`,
      type: p.type,
      name: p.type.replace(/_/g, ' '),
      anchor: p.anchor,
    }));

  const availableObjAnchors = getLocationAnchors(locationType).filter(
    a => !usedAnchors.has(a) && !envProps.some(p => p.anchor === a)
  );
  let objAnchorIdx = 0;

  const sceneSpecificObjects = sceneObjects.map(o => ({
    id: o.id,
    type: o.type,
    name: o.name,
    anchor: objAnchorIdx < availableObjAnchors.length ? availableObjAnchors[objAnchorIdx++] : undefined,
  }));

  const objects = [...envObjects, ...sceneSpecificObjects];

  const camera = determineCamera(scene, state);

  let transitionType = 'fade_in';
  let transitionDuration = 800;
  if (isInCombat) {
    transitionType = 'cut';
    transitionDuration = 200;
  } else if (prevLocationType && prevLocationType !== locationType) {
    transitionType = 'crossfade';
    transitionDuration = 1200;
  } else if (hasDialogue) {
    transitionType = 'fade_in';
    transitionDuration = 600;
  }

  const cmd = parseSceneCommand({
    sceneId: scene.id || `scene_${Date.now()}`,
    environment: {
      type: locationType,
      timeOfDay,
      weather,
      mood,
    },
    characters,
    objects,
    camera,
    transitions: [{ type: transitionType, duration: transitionDuration }],
  });

  scene3dDebug.sceneCommand(cmd);
  return cmd;
}
