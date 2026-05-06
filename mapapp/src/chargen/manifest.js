// Loads mapapp/public/chargen/INDEX.json — the single bundled manifest
// produced by scripts/build-chargen-manifest.mjs. Cached per-session.
//
// Returns the shape documented in build-chargen-manifest.mjs (races,
// categories[slot].items, anim, colormaps).

const CACHE_KEY = 'rpgon:chargen:manifest:v1';

let inFlight = null;

export async function loadManifest({ signal } = {}) {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore corrupt cache */
    }
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const res = await fetch('/chargen/INDEX.json', { signal, cache: 'force-cache' });
    if (!res.ok) throw new Error(`chargen manifest: HTTP ${res.status}`);
    const json = await res.json();
    try {
      sessionStorage?.setItem(CACHE_KEY, JSON.stringify(json));
    } catch {
      /* storage quota, oh well */
    }
    return json;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// Resolve a relative LPC texture path ("textures/character/body/humanoid_m1.png")
// against the public base.
export function resolveTextureUrl(relPath, manifest) {
  if (!relPath || relPath === 'none') return null;
  const base = manifest?.assetBase || '/chargen';
  return `${base}/${relPath}`;
}

// Look up the category/item record for an appearance entry.
export function getItem(manifest, slot, itemKey) {
  const cat = manifest?.categories?.[slot];
  if (!cat) return null;
  return cat.items[itemKey] || null;
}

// Items under character.hair live in subdirs keyed by race group.
// Prefix with race group when needed so lookups work.
export function itemKeyFor(raceGroup, id) {
  if (raceGroup) return `${raceGroup}/${id}`;
  return id;
}

// For a given slot + item, find the texture entry that matches the body or
// head type (e.g. "hm1", "hf1"). Falls back to the first available entry.
export function pickTexture(item, bodyType, headType) {
  if (!item || !Array.isArray(item.textures)) return null;
  for (const tex of item.textures) {
    if (tex.body === bodyType) return tex;
    if (tex.head === headType) return tex;
  }
  // fallback: first with front or back
  for (const tex of item.textures) {
    if (tex.front && tex.front !== 'none') return tex;
    if (tex.back && tex.back !== 'none') return tex;
  }
  return item.textures[0] || null;
}

// Build a lookup used by UI: all race groups → which `race`/config pairs
// can wear that group (useful when filtering hair choices per race config).
export function resolveConfig(manifest, raceId, configId) {
  const race = manifest?.races?.[raceId];
  if (!race) return null;
  const cfg = race.configs.find((c) => c.id === configId);
  return cfg || null;
}
