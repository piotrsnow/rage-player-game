import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';
import { ActorAppearanceSchema } from '../../../shared/mapSchemas/mapActor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHARGEN_PATH = process.env.CHARGEN_ASSETS_PATH ||
  path.resolve(__dirname, '../../../mapapp/public/chargen');

let manifestCache = null;
let compactCache = null;
async function loadManifest(chargenPath = DEFAULT_CHARGEN_PATH) {
  if (manifestCache) return manifestCache;
  manifestCache = JSON.parse(await readFile(path.join(chargenPath, 'INDEX.json'), 'utf8'));
  return manifestCache;
}

// --- Color helpers ---

const COLOR_PREFIX_RE = /^(?:cloth|leather|metal|human_hair|human_skin|human_eyes|elf_skin|orc_skin|orc_eyes|lizard_skin|beast_fur|beast_eyes|reptile_eyes|drake_(?:skin|horn)|demon_skin|boar_skin|skeleton_(?:bone|skin|eyes)|zombie_skin|wolf_(?:skin|fur)|dragon_skin|minotaur_skin|body_shadow|skin)_?/;

function simplifyColor(id) {
  return id.replace(COLOR_PREFIX_RE, '').replace(/\d+$/, '').replace(/_$/, '') || id;
}

function slotColorFamilies(manifest, slot) {
  const items = Object.values(manifest.categories?.[slot]?.items || {});
  const set = new Set();
  for (const it of items) {
    if (it.chargen !== false) (it.primarycolors || []).forEach(c => set.add(simplifyColor(c)));
  }
  return [...set].sort();
}

function resolveColor(hint, colors) {
  if (!colors?.length) return 'none';
  if (colors.includes(hint)) return hint;
  const h = hint.toLowerCase();
  return colors.find(c => simplifyColor(c) === h) || colors.find(c => c.includes(h)) || colors[0];
}

// --- Item-key resolution (ported from mapapp/src/chargen/randomize.js) ---

function resolveItemKey(manifest, slot, id, bodyType, headType, raceId, { allowHidden = false } = {}) {
  const cat = manifest.categories?.[slot];
  if (!cat) return null;
  const hints = [raceId, 'human', 'human_alt', 'zombie', 'lizard', 'drake'];
  const candidates = [];
  if (cat.items[id]) candidates.push(id);
  for (const h of hints) {
    const key = `${h}/${id}`;
    if (cat.items[key]) candidates.push(key);
  }
  for (const key of candidates) {
    const item = cat.items[key];
    if (!item) continue;
    if (!allowHidden && item.chargen === false) continue;
    if (item.textures?.some(t => t.body === bodyType || t.head === headType)) return key;
    if (item.textures?.some(t => !t.body && !t.head)) return key;
    if (id === 'none' || item.id === 'none') return key;
  }
  return null;
}

// --- Compact options builder (cached — call once, reuse) ---

const BOUND_SLOTS = ['hair', 'facial', 'eyes', 'ears', 'nose'];
const GEAR_SLOTS = [
  'shirt', 'pants', 'shoes', 'hat', 'jacket', 'gloves',
  'belt', 'mainhand', 'offhand', 'back', 'mask', 'glasses', 'ammo',
];

export async function buildCompactOptions(chargenPath = DEFAULT_CHARGEN_PATH) {
  if (compactCache) return compactCache;
  const manifest = await loadManifest(chargenPath);

  const races = {};
  for (const [raceId, race] of Object.entries(manifest.races)) {
    const configs = race.configs.map(c => ({
      id: c.id, gender: c.gender, name: c.name, bodyType: c['body-type'],
    }));
    const slots = {};
    for (const slot of BOUND_SLOTS) {
      const items = new Set();
      for (const cfg of race.configs) {
        if (Array.isArray(cfg[slot])) {
          cfg[slot].forEach(i => { if (i !== 'none') items.add(i); });
        }
      }
      if (items.size) {
        slots[slot] = { items: [...items], colors: slotColorFamilies(manifest, slot) };
      }
    }
    races[raceId] = { configs, slots };
  }

  const gearSlots = {};
  for (const slot of GEAR_SLOTS) {
    const cat = manifest.categories?.[slot];
    if (!cat) continue;
    const items = [...new Set(
      Object.entries(cat.items)
        .filter(([, it]) => it.chargen !== false)
        .map(([k]) => { const s = k.indexOf('/'); return s >= 0 ? k.slice(s + 1) : k; })
        .filter(id => id !== 'none'),
    )];
    if (items.length) {
      gearSlots[slot] = { items, colors: slotColorFamilies(manifest, slot) };
    }
  }

  compactCache = { races, gearSlots };
  return compactCache;
}

// --- AI picker ---

const SYSTEM_PROMPT = [
  'You pick 2D sprite appearances for medieval fantasy RPG characters (LPC spritesheets).',
  'Return JSON: { "race":"…", "config":"…", "slots":{ "<slot>":{ "id":"…", "color":"…" }, … } }',
  'Rules:',
  '- race: match species (default "human"). Humanoid fantasy races → closest available.',
  '- config: match gender (m1/f1=regular, m2/f2=muscular/pregnant, m3/f3=child).',
  '- Body slots (hair/facial/eyes/ears/nose): pick from that race\'s items.',
  '- Gear slots (shirt/pants/shoes/hat/jacket/gloves/belt/mainhand/offhand/back): pick from gearSlots.',
  '- color: use a family name from the listed colors (e.g. "brown","blue","iron").',
  '- Only relevant slots. Warriors: armor+weapon. Mages: robes+staff+hat. Rogues: leather+dagger.',
  '- Always include hair and eyes if the race has them.',
].join('\n');

export async function pickAppearanceWithAI(entity, {
  chargenAssetsPath = DEFAULT_CHARGEN_PATH,
  userApiKeys = null,
  userId = null,
} = {}) {
  const manifest = await loadManifest(chargenAssetsPath);
  const options = await buildCompactOptions(chargenAssetsPath);

  const desc = Object.entries({
    Character: entity.name || 'Unknown', Race: entity.race, Species: entity.species,
    Gender: entity.gender, Appearance: entity.appearance, Role: entity.role,
    Category: entity.category, Equipment: entity.equipped && JSON.stringify(entity.equipped),
  }).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
  const userPromptText = `${desc}\n\nOptions:\n${JSON.stringify(options)}`;

  try {
    const { text } = await callAIJson({
      provider: 'openai',
      modelTier: 'nano',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPromptText,
      maxTokens: 500,
      temperature: 0.4,
      userApiKeys,
      userId,
      taskType: 'chargen-ai-pick',
    });
    const raw = parseJsonOrNull(text);
    if (!raw) throw new Error('AI returned unparseable JSON');
    return resolveAppearance(manifest, raw);
  } catch {
    return pickRandomAppearance(manifest, {
      race: guessRace(entity, manifest),
      gender: guessGender(entity),
    });
  }
}

// --- Post-processing: validate & resolve AI output into a real appearance ---

function resolveAppearance(manifest, raw) {
  const raceId = manifest.races[raw.race] ? raw.race : 'human';
  const race = manifest.races[raceId];
  const cfg = race.configs.find(c => c.id === raw.config)
    || race.configs.find(c => c.gender === raw.config)
    || race.configs[0];
  const bodyType = cfg['body-type'];
  const headType = cfg['head-type'];

  const slots = {};
  for (const [slot, pick] of Object.entries(raw.slots || {})) {
    if (!pick?.id) continue;
    const itemKey = resolveItemKey(manifest, slot, pick.id, bodyType, headType, raceId, { allowHidden: true });
    if (!itemKey) continue;
    const item = manifest.categories[slot]?.items[itemKey];
    slots[slot] = { id: itemKey, color: resolveColor(pick.color || 'none', item?.primarycolors) };
  }

  ensureRequiredSlots(manifest, cfg, bodyType, headType, raceId, slots);
  fillMissingSlots(manifest, cfg, bodyType, headType, raceId, slots);

  return ActorAppearanceSchema.parse({ race: raceId, config: cfg.id, bodyType, headType, slots });
}

function ensureRequiredSlots(manifest, cfg, bodyType, headType, raceId, slots) {
  const ALLOW_HIDDEN = { allowHidden: true };
  if (!slots.body && Array.isArray(cfg.body) && cfg.body.length) {
    const key = resolveItemKey(manifest, 'body', cfg.body[0], bodyType, headType, raceId, ALLOW_HIDDEN);
    if (key) {
      const item = manifest.categories.body?.items[key];
      slots.body = { id: key, color: item?.primarycolors?.[0] || 'none' };
    }
  }
  if (!slots.head && Array.isArray(cfg.head) && cfg.head.length) {
    const key = resolveItemKey(manifest, 'head', cfg.head[0], bodyType, headType, raceId, ALLOW_HIDDEN);
    if (key) {
      const item = manifest.categories.head?.items[key];
      slots.head = { id: key, color: item?.primarycolors?.[0] || 'none' };
    }
  }
  if (!slots.shadow && Array.isArray(cfg.shadow) && cfg.shadow.length) {
    const key = resolveItemKey(manifest, 'shadow', cfg.shadow[0], bodyType, headType, raceId, ALLOW_HIDDEN);
    if (key) slots.shadow = { id: key, color: 'body_shadow' };
  }
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const MINIMUM_GEAR = ['shirt', 'pants', 'shoes'];

function fillMissingSlots(manifest, cfg, bodyType, headType, raceId, slots) {
  for (const slot of BOUND_SLOTS) {
    if (slots[slot]) continue;
    const allowed = cfg[slot];
    if (!Array.isArray(allowed) || !allowed.length) continue;
    const visible = allowed.filter(id => id !== 'none');
    const pool = visible.length ? visible : allowed;
    const id = pickRandom(pool);
    const itemKey = resolveItemKey(manifest, slot, id, bodyType, headType, raceId, { allowHidden: true });
    if (!itemKey) continue;
    const item = manifest.categories[slot]?.items[itemKey];
    const colors = item?.primarycolors;
    slots[slot] = { id: itemKey, color: colors?.length ? pickRandom(colors) : 'none' };
  }

  for (const slot of MINIMUM_GEAR) {
    if (slots[slot]) continue;
    const cat = manifest.categories?.[slot];
    if (!cat) continue;
    const eligible = Object.entries(cat.items)
      .filter(([, it]) => it.chargen !== false && it.textures?.some(t => t.body === bodyType || (!t.body && !t.head)));
    if (!eligible.length) continue;
    const [itemKey, item] = pickRandom(eligible);
    const colors = item.primarycolors;
    slots[slot] = { id: itemKey, color: colors?.length ? pickRandom(colors) : 'none' };
  }
}

// --- Random fallback (server-side port of randomize.js randomAppearance) ---

const ALL_BOUND = ['shadow', 'body', 'head', ...BOUND_SLOTS];

export async function pickRandomAppearanceAsync(entity = {}, { chargenAssetsPath = DEFAULT_CHARGEN_PATH } = {}) {
  const manifest = await loadManifest(chargenAssetsPath);
  return pickRandomAppearance(manifest, {
    race: guessRace(entity, manifest),
    gender: guessGender(entity),
  });
}

export function pickRandomAppearance(manifest, { race: raceHint, gender } = {}) {
  const raceIds = Object.keys(manifest.races);
  const raceId = raceHint && manifest.races[raceHint] ? raceHint : raceIds[Math.floor(Math.random() * raceIds.length)];
  const race = manifest.races[raceId];

  const pool = gender ? race.configs.filter(c => c.gender === gender) : race.configs;
  const cfg = pool.length ? pool[Math.floor(Math.random() * pool.length)] : race.configs[0];
  const bodyType = cfg['body-type'];
  const headType = cfg['head-type'];

  const slots = {};
  for (const slot of ALL_BOUND) {
    const allowed = cfg[slot];
    if (!Array.isArray(allowed) || !allowed.length) continue;
    const id = allowed[Math.floor(Math.random() * allowed.length)];
    const itemKey = resolveItemKey(manifest, slot, id, bodyType, headType, raceId);
    if (!itemKey) continue;
    const item = manifest.categories[slot]?.items[itemKey];
    const colors = item?.primarycolors;
    slots[slot] = { id: itemKey, color: colors?.length ? colors[Math.floor(Math.random() * colors.length)] : 'none' };
  }

  ensureRequiredSlots(manifest, cfg, bodyType, headType, raceId, slots);
  fillMissingSlots(manifest, cfg, bodyType, headType, raceId, slots);

  return ActorAppearanceSchema.parse({ race: raceId, config: cfg.id, bodyType, headType, slots });
}

// --- Heuristic guessers for fallback ---
function guessGender(e) {
  const g = (e.gender || '').toLowerCase();
  if (/female|kobieta|^f$/.test(g)) return 'female';
  if (/male|mężczyzna|^m$/.test(g)) return 'male';
  return null;
}
function guessRace(e, manifest) {
  const t = `${e.race || ''} ${e.species || ''}`.toLowerCase();
  return Object.keys(manifest.races).find(r => t.includes(r)) || 'human';
}
