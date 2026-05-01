// Builds mapapp/public/chargen/INDEX.json — a single manifest that bundles
// all LPC CharGen definitions (races, bodies, heads, hair, gear items) into
// one fetchable JSON file. This avoids 300+ individual requests at startup.
//
// Output shape:
//   {
//     generatedAt: "2026-...",
//     assetBase: "/chargen",
//     anim: { <animationId>: [[x,y,w,h,ax,ay,ms], ...] },
//     colormaps: { <name>: { url: "/chargen/data/colormaps/<name>.cm" } },
//     races: { <raceId>: RaceJson },
//     categories: {
//       body:   { items: { <id>: BodyJson }, races: {} },
//       head:   { ... },
//       hair:   { ... },
//       eyes:   { ... },
//       ears:   { ... },
//       nose:   { ... },
//       facial: { ... },
//       shadow: { ... },
//       tail:   { ... },
//       wings:  { ... },
//       add1:   { ... },
//       add2:   { ... },
//       add3:   { ... },
//       // gear slots:
//       shirt:  { ... },
//       pants:  { ... },
//       shoes:  { ... },
//       hat:    { ... },
//       mask:   { ... },
//       glasses:{ ... },
//       mainhand:{ ... },
//       offhand:{ ... },
//       ammo:   { ... },
//       belt:   { ... },
//       back:   { ... },
//       gloves: { ... },
//       jacket: { ... },
//       suit:   { ... },
//     }
//   }
//
// Items inside hair / some character categories are organised in per-race
// subdirectories (e.g. data/character/hair/human/braid.hair). We flatten them
// into one dict keyed by `<subdir>/<id>` so we can still resolve which race
// an item belongs to (stored on each item as `_raceGroup`).

import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const chargenRoot = path.join(root, 'mapapp', 'public', 'chargen');

const CHARACTER_CATEGORIES = [
  { slot: 'body',   dir: 'data/character/body',   ext: '.body' },
  { slot: 'head',   dir: 'data/character/head',   ext: '.head' },
  { slot: 'hair',   dir: 'data/character/hair',   ext: '.hair' },
  { slot: 'eyes',   dir: 'data/character/eyes',   ext: '.eyes' },
  { slot: 'ears',   dir: 'data/character/ears',   ext: '.ears' },
  { slot: 'nose',   dir: 'data/character/nose',   ext: '.nose' },
  { slot: 'facial', dir: 'data/character/facial', ext: '.facial' },
  { slot: 'shadow', dir: 'data/character/shadow', ext: '.shadow' },
  { slot: 'tail',   dir: 'data/character/tail',   ext: '.tail' },
  { slot: 'wings',  dir: 'data/character/wings',  ext: '.wings' },
  { slot: 'add1',   dir: 'data/character/add1',   ext: '.add1' },
  { slot: 'add2',   dir: 'data/character/add2',   ext: '.add2' },
  { slot: 'add3',   dir: 'data/character/add3',   ext: '.add3' },
];

const GEAR_CATEGORIES = [
  { slot: 'shirt',    dir: 'data/gear/shirt',    ext: '.shirt' },
  { slot: 'pants',    dir: 'data/gear/pants',    ext: '.pants' },
  { slot: 'shoes',    dir: 'data/gear/shoes',    ext: '.shoes' },
  { slot: 'hat',      dir: 'data/gear/hat',      ext: '.hat' },
  { slot: 'mask',     dir: 'data/gear/mask',     ext: '.mask' },
  { slot: 'glasses',  dir: 'data/gear/glasses',  ext: '.glasses' },
  { slot: 'mainhand', dir: 'data/gear/mainhand', ext: '.mainhand' },
  { slot: 'offhand',  dir: 'data/gear/offhand',  ext: '.offhand' },
  { slot: 'ammo',     dir: 'data/gear/ammo',     ext: '.ammo' },
  { slot: 'belt',     dir: 'data/gear/belt',     ext: '.belt' },
  { slot: 'back',     dir: 'data/gear/back',     ext: '.back' },
  { slot: 'gloves',   dir: 'data/gear/gloves',   ext: '.gloves' },
  { slot: 'jacket',   dir: 'data/gear/jacket',   ext: '.jacket' },
  { slot: 'suit',     dir: 'data/gear/suit',     ext: '.suit' },
];

async function readJsonSafe(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    // LPC files may have trailing commas or C-style comments in rare cases —
    // we've spot-checked and they look like strict JSON, so plain parse is OK.
    return JSON.parse(text);
  } catch (err) {
    console.warn(`skip ${path.relative(chargenRoot, file)}: ${err.message}`);
    return null;
  }
}

async function walkCategory({ slot, dir, ext }) {
  const abs = path.join(chargenRoot, dir);
  let entries;
  try { entries = await fs.readdir(abs, { withFileTypes: true }); }
  catch { return { items: {}, races: [] }; }

  const items = {};
  const raceGroups = new Set();

  for (const ent of entries) {
    if (ent.isDirectory()) {
      const sub = ent.name;
      raceGroups.add(sub);
      const subPath = path.join(abs, sub);
      let subEntries;
      try { subEntries = await fs.readdir(subPath); } catch { continue; }
      for (const f of subEntries) {
        if (!f.endsWith(ext)) continue;
        const data = await readJsonSafe(path.join(subPath, f));
        if (!data) continue;
        const key = `${sub}/${path.basename(f, ext)}`;
        items[key] = { ...data, _raceGroup: sub, _itemKey: key };
      }
      continue;
    }
    if (!ent.name.endsWith(ext)) continue;
    const data = await readJsonSafe(path.join(abs, ent.name));
    if (!data) continue;
    const key = path.basename(ent.name, ext);
    items[key] = { ...data, _raceGroup: null, _itemKey: key };
  }

  return { items, races: [...raceGroups].sort() };
}

async function walkRaces() {
  const abs = path.join(chargenRoot, 'data/character/race');
  let entries;
  try { entries = await fs.readdir(abs); } catch { return {}; }
  const out = {};
  for (const f of entries) {
    if (!f.endsWith('.race')) continue;
    const data = await readJsonSafe(path.join(abs, f));
    if (!data) continue;
    const id = path.basename(f, '.race');
    out[id] = data;
  }
  return out;
}

async function loadAnim() {
  const abs = path.join(chargenRoot, 'data/character.anim');
  const data = await readJsonSafe(abs);
  if (!data || !Array.isArray(data.animations)) return {};
  const out = {};
  for (const a of data.animations) {
    out[a.id] = {
      loop: Boolean(a.loop),
      frames: a.frames, // [[sx,sy,w,h,anchorX,anchorY,durationMs], ...]
      action_frame: a.action_frame,
      emiter: a.emiter,
    };
  }
  return out;
}

async function listColormaps() {
  const abs = path.join(chargenRoot, 'data/colormaps');
  const entries = await fs.readdir(abs);
  const out = {};
  for (const f of entries) {
    if (!f.endsWith('.cm')) continue;
    const id = path.basename(f, '.cm');
    out[id] = { url: `/chargen/data/colormaps/${f}` };
  }
  return out;
}

async function main() {
  const [anim, colormaps, races] = await Promise.all([
    loadAnim(),
    listColormaps(),
    walkRaces(),
  ]);

  const categories = {};
  for (const cat of CHARACTER_CATEGORIES) {
    categories[cat.slot] = await walkCategory(cat);
  }
  for (const cat of GEAR_CATEGORIES) {
    categories[cat.slot] = await walkCategory(cat);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    assetBase: '/chargen',
    anim,
    colormaps,
    races,
    categories,
  };

  const outPath = path.join(chargenRoot, 'INDEX.json');
  await fs.writeFile(outPath, JSON.stringify(manifest), 'utf8');

  const itemCount = Object.values(categories).reduce(
    (s, c) => s + Object.keys(c.items).length,
    0,
  );
  console.log(
    `wrote ${path.relative(root, outPath)} — ${Object.keys(races).length} races, ` +
    `${itemCount} items across ${Object.keys(categories).length} categories, ` +
    `${Object.keys(anim).length} animations, ${Object.keys(colormaps).length} colormaps`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
