import { apiClient } from './apiClient';

let runtimeCatalog = [];
let runtimeCatalogById = new Map(runtimeCatalog.map((entry) => [entry.id, entry]));
let catalogVersion = 0;
let catalogLoaded = false;
let catalogLoadPromise = null;
const catalogSubscribers = new Set();

const EXACT_CHARACTER_MODELS = {
  human_male_warrior: 'characters:human_warrior_male',
  human_female_warrior: 'characters:human_warrior_female',
  human_male_mage: 'characters:human_mage_male',
  human_female_mage: 'characters:human_mage_female',
  human_male_rogue: 'characters:human_rogue_male',
  human_female_rogue: 'characters:human_rogue_female',
  human_male_noble: 'characters:noble_male',
  human_female_noble: 'characters:noble_female',
  human_male_merchant: 'characters:merchant',
  human_male_priest: 'characters:priest_sigmar',
  dwarf_male_warrior: 'characters:dwarf_warrior',
  dwarf_female: 'characters:dwarf_female',
  elf_male: 'characters:elf_ranger',
  elf_male_rogue: 'characters:elf_ranger',
  elf_female_mage: 'characters:elf_mage_female',
  halfling_male: 'characters:halfling_male',
  halfling_female: 'characters:halfling_female',
  ogre: 'creatures:ogre',
  troll: 'creatures:troll',
  goblin: 'creatures:goblin',
  orc: 'creatures:orc',
  skeleton: 'creatures:skeleton_warrior',
  zombie: 'creatures:zombie',
  wolf: 'creatures:wolf',
  horse: 'creatures:horse',
  rat_giant: 'creatures:giant_rat',
};

const EXACT_OBJECT_MODELS = {
  table: 'furniture:table_tavern',
  table_round: 'furniture:table_round',
  chair: 'furniture:bench',
  bench: 'furniture:bench',
  stool: 'furniture:stool',
  bed: 'furniture:bed',
  chest: 'items:crate',
  barrel: 'items:crate',
  crate: 'items:crate',
  bookshelf: 'furniture:bookshelf',
  fireplace: 'furniture:fireplace',
  cauldron: 'props:cauldron_fire',
  anvil: 'architecture:anvil',
  altar: 'architecture:altar',
  pillar: 'architecture:pillar_stone',
  statue: 'architecture:statue_knight',
  well: 'architecture:well',
  fountain: 'architecture:fountain',
  signpost: 'architecture:signpost',
  cart: 'props:cart',
  campfire: 'props:campfire',
  torch: 'props:torch_wall',
  door: 'architecture:door_wooden',
  gate: 'architecture:gate_portcullis',
  ladder: 'items:ladder',
  rock_small: 'nature:rocks_small',
  rock_large: 'nature:boulder_mossy',
  tree: 'nature:oak_tree_dark',
  bush: 'nature:bush',
  mushroom: 'nature:mushrooms_forest',
  fence: 'props:barricade',
  banner: 'items:banner',
  rug: 'furniture:rug_ornate',
  weapon_sword: 'items:sword',
  weapon_axe: 'items:axe',
  weapon_staff: 'characters:human_mage_male',
  weapon_bow: 'items:bow_and_quiver',
  shield: 'items:shield',
  potion: 'items:potion',
  scroll: 'items:scroll',
  coin_pile: 'items:coin_pile',
  gem: 'items:gem',
  key: 'items:key_iron',
  lantern: 'items:lantern',
  bag: 'items:satchel',
  skull: 'items:skull',
};

const OBJECT_CATEGORY_HINTS = {
  table: ['furniture'],
  table_round: ['furniture'],
  chair: ['furniture'],
  bench: ['furniture'],
  stool: ['furniture'],
  bed: ['furniture'],
  bookshelf: ['furniture'],
  fireplace: ['furniture', 'props'],
  rug: ['furniture'],
  weapon_sword: ['items'],
  weapon_axe: ['items'],
  weapon_staff: ['items', 'characters'],
  weapon_bow: ['items'],
  shield: ['items'],
  potion: ['items'],
  scroll: ['items'],
  coin_pile: ['items'],
  gem: ['items'],
  key: ['items'],
  lantern: ['items', 'props'],
  bag: ['items'],
  skull: ['items', 'props'],
  door: ['architecture'],
  gate: ['architecture'],
  altar: ['architecture'],
  pillar: ['architecture'],
  statue: ['architecture'],
  signpost: ['architecture'],
  well: ['architecture'],
  fountain: ['architecture'],
  ladder: ['architecture', 'items'],
  tree: ['nature'],
  bush: ['nature'],
  mushroom: ['nature'],
  rock_small: ['nature'],
  rock_large: ['nature'],
  campfire: ['props'],
  torch: ['props'],
  cart: ['props', 'architecture'],
  cauldron: ['props', 'items'],
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeCatalogEntry(entry) {
  if (!entry) return null;

  const category = String(entry.category || '').trim();
  const file = String(entry.file || '').trim();
  if (!category || !file) return null;

  return {
    ...entry,
    id: String(entry.id || `${category}:${file}`).trim().toLowerCase(),
    category,
    file,
    title: entry.title || file.replace(/\.glb$/i, '').replace(/_/g, ' '),
    prompt: entry.prompt || '',
    aliases: Array.isArray(entry.aliases) ? unique(entry.aliases.map(String)) : [],
    storagePath: entry.storagePath || `prefabs/${category}/${file}`,
  };
}

function setRuntimeCatalog(entries) {
  const normalized = entries
    .map(normalizeCatalogEntry)
    .filter(Boolean);

  if (!normalized.length) return;

  runtimeCatalog = normalized;
  runtimeCatalogById = new Map(normalized.map((entry) => [entry.id, entry]));
  catalogVersion += 1;
  catalogLoaded = true;

  for (const notify of catalogSubscribers) {
    try {
      notify(catalogVersion);
    } catch {
      // Ignore subscriber failures.
    }
  }
}

export function getRuntimeModelCatalog() {
  return runtimeCatalog;
}

export function getModelCatalogVersion() {
  return catalogVersion;
}

export function subscribeModelCatalogVersion(listener) {
  catalogSubscribers.add(listener);
  return () => catalogSubscribers.delete(listener);
}

export async function refreshModelCatalog(force = false) {
  if (!apiClient.isConnected()) {
    return runtimeCatalog;
  }

  if (!force && catalogLoaded) {
    return runtimeCatalog;
  }

  if (!force && catalogLoadPromise) {
    return catalogLoadPromise;
  }

  catalogLoadPromise = apiClient.get('/proxy/meshy/prefabs/catalog')
    .then((response) => {
      setRuntimeCatalog(Array.isArray(response?.items) ? response.items : []);
      return runtimeCatalog;
    })
    .catch((error) => {
      console.warn('[modelResolver3d] Failed to load prefab catalog:', error.message);
      return runtimeCatalog;
    })
    .finally(() => {
      catalogLoadPromise = null;
    });

  return catalogLoadPromise;
}

function buildCatalogUrl(entry) {
  if (!entry) return null;
  if (entry.storagePath) {
    return `/proxy/meshy/prefabs?path=${encodeURIComponent(entry.storagePath)}`;
  }
  return `/proxy/meshy/prefabs/${encodeURIComponent(entry.category)}/${encodeURIComponent(entry.file)}`;
}

function categoryBonus(entryCategory, preferredCategories) {
  if (!preferredCategories?.length) return 0;
  if (preferredCategories[0] === entryCategory) return 40;
  if (preferredCategories.includes(entryCategory)) return 22;
  return 0;
}

function scoreEntry(entry, preferredCategories, tokens) {
  const haystack = unique([
    entry.title,
    entry.prompt,
    entry.category,
    ...(entry.aliases || []),
  ]).join(' ');
  const hayTokens = new Set(tokenize(haystack));

  let score = categoryBonus(entry.category, preferredCategories);
  let matchedTokens = 0;
  for (const token of tokens) {
    if (hayTokens.has(token)) {
      matchedTokens++;
      score += token.length >= 6 ? 14 : 10;
    } else if ((entry.aliases || []).some((alias) => normalizeText(alias).includes(token))) {
      matchedTokens++;
      score += 8;
    }
  }

  return { score, matchedTokens };
}

function rankEntries({ entries, preferredCategories, tokens, excludeModelIds = [] }) {
  const excluded = new Set(excludeModelIds.filter(Boolean));
  const ranked = [];

  for (const entry of entries) {
    if (excluded.has(entry.id)) continue;
    const { score, matchedTokens } = scoreEntry(entry, preferredCategories, tokens);
    ranked.push({ entry, score, matchedTokens });
  }

  ranked.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.matchedTokens !== left.matchedTokens) return right.matchedTokens - left.matchedTokens;
    return left.entry.id.localeCompare(right.entry.id);
  });

  return ranked;
}

function pickBestEntry(options) {
  const [best] = rankEntries(options);
  return best || null;
}

function buildSelection(entry, score, source, preferredCategories, exact = false) {
  return {
    modelId: entry?.id || null,
    modelCategory: entry?.category || null,
    modelFile: entry?.file || null,
    modelUrl: buildCatalogUrl(entry),
    matchScore: score || 0,
    matchSource: source,
    preferredCategories: preferredCategories || [],
    reviewNeeded: !exact && (score || 0) < 55,
  };
}

export function getCatalogModel(modelId) {
  return runtimeCatalogById.get(modelId) || null;
}

export function selectCharacterModel({
  name = '',
  species = '',
  career = '',
  gender = '',
  archetype = '',
  excludeModelIds = [],
}) {
  const excluded = new Set(excludeModelIds.filter(Boolean));
  const exactId = EXACT_CHARACTER_MODELS[archetype];
  if (exactId && !excluded.has(exactId)) {
    const exactEntry = getCatalogModel(exactId);
    if (exactEntry) {
      return buildSelection(exactEntry, 100, 'exact_archetype', [exactEntry.category], true);
    }
  }

  const normalizedSpecies = normalizeText(species).split(' ')[0];
  const preferredCategories = ['human', 'dwarf', 'elf', 'halfling', 'merchant', 'noble'].includes(normalizedSpecies)
    ? ['characters']
    : ['creatures', 'characters'];
  const tokens = unique([
    ...tokenize(name),
    ...tokenize(species),
    ...tokenize(career),
    ...tokenize(gender),
    ...tokenize(archetype.replace(/_/g, ' ')),
  ]);
  const best = pickBestEntry({
    entries: runtimeCatalog,
    preferredCategories,
    tokens,
    excludeModelIds,
  });
  if (!best) return null;
  return buildSelection(best.entry, best.score, 'token_match', preferredCategories);
}

export function selectObjectModel({
  name = '',
  type = '',
  environmentType = '',
  excludeModelIds = [],
}) {
  const excluded = new Set(excludeModelIds.filter(Boolean));
  const exactId = EXACT_OBJECT_MODELS[type];
  if (exactId && !excluded.has(exactId)) {
    const exactEntry = getCatalogModel(exactId);
    if (exactEntry) {
      return buildSelection(exactEntry, 100, 'exact_type', [exactEntry.category], true);
    }
  }

  const preferredCategories = OBJECT_CATEGORY_HINTS[type] || ['props', 'items', 'furniture', 'architecture', 'nature', 'buildings'];
  const tokens = unique([
    ...tokenize(name),
    ...tokenize(type.replace(/_/g, ' ')),
    ...tokenize(environmentType),
  ]);
  const best = pickBestEntry({
    entries: runtimeCatalog,
    preferredCategories,
    tokens,
    excludeModelIds,
  });
  if (!best) return null;
  return buildSelection(best.entry, best.score, 'token_match', preferredCategories);
}
