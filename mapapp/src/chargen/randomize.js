// Random actor generator. Produces a full `appearance` JSON that satisfies
// a race's config (dress codes, allowed gear tags, etc).
//
// Strategy:
//   1. Pick a race (or respect forced raceId).
//   2. Pick one of race.configs (gender/variant).
//   3. For each slot defined in the config, look at its allowed-items list.
//      For each allowed id, look up the matching item in manifest.categories
//      (respecting the item's _raceGroup when present). Skip items where
//      chargen !== true or that lack a matching texture for the body type.
//   4. For each chosen item, pick a random `primarycolors[]` (or keep
//      `fixedcolors[0]` / 'none').

import { getItem, itemKeyFor, pickTexture, resolveConfig } from './manifest.js';
import { ALL_SLOTS } from './zOrder.js';

function randChoice(arr, rng = Math.random) {
  if (!arr?.length) return null;
  return arr[Math.floor(rng() * arr.length)];
}

// Find the concrete item key to use for a config's allowed-id list and body type.
// Items may be flat (id) or prefixed (raceGroup/id) — we try both.
function findItemKey(manifest, slot, allowedId, bodyType, headType, raceGroupHints) {
  const cat = manifest.categories[slot];
  if (!cat) return null;
  const candidates = [];
  // Try exact id first (flat items).
  if (cat.items[allowedId]) candidates.push(allowedId);
  // Try each race-group hint (human, lizard, drake, zombie, human_alt).
  for (const hint of raceGroupHints) {
    const key = itemKeyFor(hint, allowedId);
    if (cat.items[key]) candidates.push(key);
  }
  for (const key of candidates) {
    const item = cat.items[key];
    if (!item || item.chargen === false) continue;
    const tex = pickTexture(item, bodyType, headType);
    if (tex && (tex.front !== 'none' || tex.back !== 'none' || tex.front || tex.back)) {
      return key;
    }
    // Allow items without textures only when they exist as "none" (placeholder).
    if (allowedId === 'none' || item.id === 'none') return key;
  }
  return null;
}

function pickColor(item, rng) {
  if (Array.isArray(item?.primarycolors) && item.primarycolors.length) {
    return randChoice(item.primarycolors, rng);
  }
  if (Array.isArray(item?.fixedcolors) && item.fixedcolors.length) {
    return item.fixedcolors[0];
  }
  return 'none';
}

export function randomAppearance(manifest, {
  raceId = null, configId = null, rng = Math.random,
} = {}) {
  const raceIds = Object.keys(manifest.races || {});
  const chosenRace = raceId && manifest.races[raceId] ? raceId : randChoice(raceIds, rng);
  const race = manifest.races[chosenRace];
  if (!race) throw new Error('no races in manifest');
  const cfg = configId
    ? race.configs.find((c) => c.id === configId) || randChoice(race.configs, rng)
    : randChoice(race.configs, rng);
  const bodyType = cfg['body-type'];
  const headType = cfg['head-type'];

  // Race-group hints: items under hair/ are bucketed by race group (human,
  // zombie, …). When generating an orc we still want to try hair under
  // "human" first as a fallback because many hair styles are modelled there.
  const raceGroupHints = Array.from(new Set([
    chosenRace, 'human', 'human_alt', 'zombie', 'lizard', 'drake',
  ]));

  const slots = {};
  for (const slot of ALL_SLOTS) {
    const allowed = cfg[slot];
    if (!Array.isArray(allowed) || allowed.length === 0) continue;
    const id = randChoice(allowed, rng);
    if (!id) continue;
    const itemKey = findItemKey(manifest, slot, id, bodyType, headType, raceGroupHints);
    if (!itemKey) continue;
    const item = getItem(manifest, slot, itemKey);
    slots[slot] = { id: itemKey, color: pickColor(item, rng) };
  }

  // Always force shadow if the config has one and we somehow skipped it.
  if (!slots.shadow && Array.isArray(cfg.shadow) && cfg.shadow.length) {
    const id = cfg.shadow[0];
    const itemKey = findItemKey(manifest, 'shadow', id, bodyType, headType, raceGroupHints);
    if (itemKey) slots.shadow = { id: itemKey, color: 'body_shadow' };
  }

  return {
    race: chosenRace,
    config: cfg.id,
    bodyType,
    headType,
    slots,
  };
}

// Roll a single slot for an existing appearance. Reuses the race/config's
// allowed-items list and the same per-slot gear/character rules as a full
// randomize. Gear slots without a config-defined allowed list fall back to
// picking from all chargen-enabled items in the category. Returns a new
// `{ id, color }` entry or `null` when the slot cannot produce anything
// (no allowed items + no textures).
export function randomSlot(manifest, appearance, slot, { rng = Math.random } = {}) {
  if (!manifest || !appearance) return null;
  const race = manifest.races?.[appearance.race];
  if (!race) return null;
  const cfg = race.configs.find((c) => c.id === appearance.config) || race.configs[0];
  if (!cfg) return null;
  const bodyType = appearance.bodyType || cfg['body-type'];
  const headType = appearance.headType || cfg['head-type'];
  const raceGroupHints = Array.from(new Set([
    appearance.race, 'human', 'human_alt', 'zombie', 'lizard', 'drake',
  ]));
  const allowed = cfg[slot];

  // Config-scoped slot (body/head/hair/...): stick to the race's whitelist.
  if (Array.isArray(allowed) && allowed.length) {
    // Try each allowed id in a random order so we don't keep failing on a
    // missing-texture entry.
    const shuffled = [...allowed].sort(() => rng() - 0.5);
    for (const id of shuffled) {
      const itemKey = findItemKey(manifest, slot, id, bodyType, headType, raceGroupHints);
      if (!itemKey) continue;
      const item = getItem(manifest, slot, itemKey);
      return { id: itemKey, color: pickColor(item, rng) };
    }
    return null;
  }

  // Free gear slot (hat/jacket/...): sample any chargen-enabled item from
  // the category.
  const cat = manifest.categories?.[slot];
  if (!cat) return null;
  const ids = Object.keys(cat.items || {}).filter((k) => {
    const it = cat.items[k];
    if (!it || it.chargen === false) return false;
    const tex = pickTexture(it, bodyType, headType);
    return tex && (tex.front || tex.back);
  });
  if (!ids.length) return null;
  const itemKey = randChoice(ids, rng);
  const item = getItem(manifest, slot, itemKey);
  return { id: itemKey, color: pickColor(item, rng) };
}

// Starting appearance for the CharGen page — a plain human male with body,
// basic hair, shirt + pants + shoes. Used when opening the generator fresh.
export function defaultAppearance(manifest) {
  const human = manifest.races?.human;
  if (!human) return randomAppearance(manifest);
  const cfg = human.configs.find((c) => c.id === 'm1') || human.configs[0];
  return randomAppearance(manifest, { raceId: 'human', configId: cfg.id });
}
