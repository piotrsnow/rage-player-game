/**
 * Batch 3D model generator via Meshy API → GCP Cloud Storage.
 *
 * Usage:
 *   node --env-file=.env scripts/generatePrefabs.js [--dry-run] [--category creatures] [--concurrency 2]
 *
 * Requires: MESHY_API_KEY and GCP config in backend/.env
 */

import 'dotenv/config';
import { Storage } from '@google-cloud/storage';

// ── Config ──────────────────────────────────────────────────────────────────

const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v2';
const MESHY_API_KEY = process.env.MESHY_API_KEY;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const GCP_SERVICE_ACCOUNT_KEY = process.env.GCP_SERVICE_ACCOUNT_KEY;

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 180; // 30 min max per model
const GCS_PREFIX = 'prefabs';
const STYLE_SUFFIX = ', game-ready 3D model, stylized fantasy, centered, goofy whimsical exaggerated fantasy style, playful caricature look, silly proportions, toy-like, slightly absurd';
const CHARACTER_BODY_SUFFIX = ', grotesque chibi fantasy proportions, comically unnaturally dwarfish, extremely tiny body, stubby very short limbs, massively oversized head, caricature silhouette, keep full outfit and equipment readable';
const TARGET_FORMATS = ['glb'];

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const categoryFilter = args.includes('--category')
  ? args[args.indexOf('--category') + 1]
  : null;
const CONCURRENCY = args.includes('--concurrency')
  ? parseInt(args[args.indexOf('--concurrency') + 1], 10)
  : 2;

// ── GCP Storage ─────────────────────────────────────────────────────────────

function createGcpStorage() {
  const opts = {};
  if (GCP_SERVICE_ACCOUNT_KEY) {
    opts.credentials = JSON.parse(GCP_SERVICE_ACCOUNT_KEY);
  }
  const storage = new Storage(opts);
  return storage.bucket(GCS_BUCKET_NAME);
}

// ── Meshy helpers ───────────────────────────────────────────────────────────

async function meshyPost(endpoint, body) {
  const res = await fetch(`${MESHY_API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MESHY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Meshy ${endpoint} ${res.status}: ${err.message || JSON.stringify(err)}`);
  }
  return res.json();
}

async function meshyGet(endpoint) {
  const res = await fetch(`${MESHY_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${MESHY_API_KEY}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Meshy GET ${endpoint} ${res.status}: ${err.message || JSON.stringify(err)}`);
  }
  return res.json();
}

// ── Prompt catalog ──────────────────────────────────────────────────────────

const PROMPTS = [
  // ── CREATURES ─────────────────────────────────────────────────────────
  { category: 'creatures', file: 'Wolf.glb', prompt: 'A fierce grey wolf in an aggressive stance, stylized fantasy' },
  { category: 'creatures', file: 'Giant_Rat.glb', prompt: 'A giant rat, mangy and scarred, dark fantasy creature' },
  { category: 'creatures', file: 'Zombie.glb', prompt: 'A shambling zombie in tattered medieval clothing, dark fantasy' },
  { category: 'creatures', file: 'Skeleton_Warrior.glb', prompt: 'A skeletal warrior holding a rusted sword and shield, fantasy undead' },
  { category: 'creatures', file: 'Orc.glb', prompt: 'A muscular green orc with tusks wearing leather armor, Warhammer fantasy' },
  { category: 'creatures', file: 'Goblin.glb', prompt: 'A small goblin with a dagger and ragged clothes, dark fantasy' },
  { category: 'creatures', file: 'Ogre.glb', prompt: 'A massive ogre with a wooden club, scarred skin, fantasy brute' },
  { category: 'creatures', file: 'Troll.glb', prompt: 'A large cave troll with mossy skin and a stone club, dark fantasy' },
  { category: 'creatures', file: 'Giant_Spider.glb', prompt: 'A giant hairy spider, dark dungeon creature, fantasy' },
  { category: 'creatures', file: 'Bat_Swarm.glb', prompt: 'A bat swarm cluster, dark cave creatures, fantasy' },
  { category: 'creatures', file: 'Warhorse.glb', prompt: 'A brown saddled warhorse with barding, medieval fantasy' },
  { category: 'creatures', file: 'Horse.glb', prompt: 'A simple brown horse with saddle, medieval traveler horse' },
  { category: 'creatures', file: 'Swamp_Serpent.glb', prompt: 'A venomous swamp serpent, green scales, coiled and hissing' },
  { category: 'creatures', file: 'Chaos_Daemon.glb', prompt: 'A chaos daemon with horns and fiery skin, Warhammer dark fantasy' },
  { category: 'creatures', file: 'Werewolf.glb', prompt: 'A werewolf mid-transformation, dark fantasy horror' },
  { category: 'creatures', file: 'Griffon.glb', prompt: 'A griffon with eagle head and lion body, heraldic fantasy' },
  { category: 'creatures', file: 'Wyvern.glb', prompt: 'A wyvern perched on a rock, dark green scales, fantasy dragon-like' },
  { category: 'creatures', file: 'Rat_Swarm.glb', prompt: 'A swarm of rats on the ground, dozens of small rats clustered together' },

  // ── CHARACTERS ────────────────────────────────────────────────────────
  { category: 'characters', file: 'Human_Warrior_Male.glb', prompt: 'A medieval human male warrior in plate armor with a longsword, Warhammer fantasy' },
  { category: 'characters', file: 'Human_Warrior_Female.glb', prompt: 'A medieval human female warrior in chainmail with a shield, fantasy' },
  { category: 'characters', file: 'Human_Mage_Male.glb', prompt: 'A human male wizard in dark blue robes with a glowing staff, Warhammer fantasy' },
  { category: 'characters', file: 'Human_Mage_Female.glb', prompt: 'A human female wizard in purple robes holding a spellbook, dark fantasy' },
  { category: 'characters', file: 'Human_Rogue_Male.glb', prompt: 'A human male rogue in dark leather armor with twin daggers, hooded, fantasy' },
  { category: 'characters', file: 'Human_Rogue_Female.glb', prompt: 'A human female rogue in dark leather with a crossbow, hooded, fantasy' },
  { category: 'characters', file: 'Dwarf_Warrior.glb', prompt: 'A stout dwarf warrior with a great axe and heavy plate armor, long beard' },
  { category: 'characters', file: 'Dwarf_Female.glb', prompt: 'A dwarf female with braided hair and a warhammer, sturdy armor' },
  { category: 'characters', file: 'Elf_Ranger.glb', prompt: 'A tall slender elf male ranger with a longbow, green cloak, fantasy' },
  { category: 'characters', file: 'Elf_Mage_Female.glb', prompt: 'A graceful elf female mage in silver robes with a crystal staff' },
  { category: 'characters', file: 'Halfling_Male.glb', prompt: 'A small halfling male with a sling and cooking pot, cheerful, fantasy' },
  { category: 'characters', file: 'Halfling_Female.glb', prompt: 'A small halfling female with an apron and rolling pin, plump, cozy' },
  { category: 'characters', file: 'Noble_Male.glb', prompt: 'A wealthy medieval noble man in red velvet doublet with gold trim' },
  { category: 'characters', file: 'Noble_Female.glb', prompt: 'A medieval noble woman in an elegant dress with jewelry, aristocratic' },
  { category: 'characters', file: 'Merchant.glb', prompt: 'A fat medieval merchant with a coin purse and fine clothes' },
  { category: 'characters', file: 'Priest_Sigmar.glb', prompt: 'A Sigmarite priest in white robes with a warhammer and holy book' },
  { category: 'characters', file: 'Town_Guard.glb', prompt: 'A medieval town guard in half-plate with a halberd and shield' },
  { category: 'characters', file: 'Blacksmith.glb', prompt: 'A medieval blacksmith with a leather apron, muscular, holding tongs' },
  { category: 'characters', file: 'Innkeeper.glb', prompt: 'A medieval innkeeper, portly, holding a tankard and rag' },
  { category: 'characters', file: 'Necromancer.glb', prompt: 'A hooded necromancer in black tattered robes with a skull staff' },
  { category: 'characters', file: 'Peasant.glb', prompt: 'A medieval peasant farmer in simple clothes with a pitchfork' },
  { category: 'characters', file: 'Witch_Hunter.glb', prompt: 'A witch hunter in a wide-brimmed hat and long coat with pistol and rapier' },

  // ── FURNITURE ─────────────────────────────────────────────────────────
  { category: 'furniture', file: 'Table_Tavern.glb', prompt: 'A sturdy medieval wooden tavern table, rectangular, dark wood' },
  { category: 'furniture', file: 'Table_Round.glb', prompt: 'A round medieval wooden table with carved legs' },
  { category: 'furniture', file: 'Bench.glb', prompt: 'A simple medieval wooden bench, long, dark oak' },
  { category: 'furniture', file: 'Stool.glb', prompt: 'A three-legged wooden tavern stool, rustic' },
  { category: 'furniture', file: 'Bed.glb', prompt: 'A medieval straw-stuffed bed with a wooden frame and blanket' },
  { category: 'furniture', file: 'Bookshelf.glb', prompt: 'A large wooden bookshelf filled with old leather-bound books' },
  { category: 'furniture', file: 'Fireplace.glb', prompt: 'A medieval stone fireplace with burning logs and iron grate' },
  { category: 'furniture', file: 'Fireplace_Grand.glb', prompt: 'A grand medieval stone fireplace with ornate mantelpiece, castle-style' },
  { category: 'furniture', file: 'Wardrobe.glb', prompt: 'A medieval wooden wardrobe, dark oak, iron hinges' },
  { category: 'furniture', file: 'Writing_Desk.glb', prompt: 'A medieval writing desk with quill, inkwell and papers' },
  { category: 'furniture', file: 'Throne.glb', prompt: 'A medieval wooden throne with red cushion and gold accents' },
  { category: 'furniture', file: 'Chandelier.glb', prompt: 'A medieval iron chandelier with candles, hanging from chains' },
  { category: 'furniture', file: 'Tapestry.glb', prompt: 'A decorative medieval tapestry hanging on a wall, heraldic design' },
  { category: 'furniture', file: 'Weapon_Rack.glb', prompt: 'A medieval wooden weapon rack with swords and shields displayed' },
  { category: 'furniture', file: 'Pew.glb', prompt: 'A medieval pew, simple wooden church bench' },
  { category: 'furniture', file: 'Rug_Ornate.glb', prompt: 'A dark red ornate carpet rug with gold patterns, medieval fantasy' },

  // ── ITEMS ─────────────────────────────────────────────────────────────
  { category: 'items', file: 'Sword.glb', prompt: 'A medieval longsword with leather-wrapped hilt, steel blade' },
  { category: 'items', file: 'Axe.glb', prompt: 'A medieval battle axe with wooden handle and iron head' },
  { category: 'items', file: 'Bow_And_Quiver.glb', prompt: 'A wooden longbow with a leather quiver of arrows' },
  { category: 'items', file: 'Shield.glb', prompt: 'A medieval round wooden shield with iron boss and heraldic emblem' },
  { category: 'items', file: 'Crate.glb', prompt: 'A wooden medieval crate, nailed shut, travel-worn' },
  { category: 'items', file: 'Potion.glb', prompt: 'A glowing potion bottle, purple liquid, cork stopper, fantasy' },
  { category: 'items', file: 'Scroll.glb', prompt: 'An ancient rolled parchment scroll with wax seal, fantasy' },
  { category: 'items', file: 'Coin_Pile.glb', prompt: 'A pile of gold coins on the ground, treasure, fantasy' },
  { category: 'items', file: 'Gem.glb', prompt: 'A sparkling gemstone, blue crystal, cut and polished, fantasy' },
  { category: 'items', file: 'Backpack.glb', prompt: 'A leather adventurer backpack with buckles and pouches' },
  { category: 'items', file: 'Skull.glb', prompt: 'A human skull on the ground, cracked, dark fantasy' },
  { category: 'items', file: 'Key_Iron.glb', prompt: 'A medieval iron key, large and ornate, dungeon-style' },
  { category: 'items', file: 'Banner.glb', prompt: 'A medieval heraldic banner on a pole, red and gold, lion emblem' },
  { category: 'items', file: 'Ladder.glb', prompt: 'A medieval wooden ladder, simple construction, leaning' },
  { category: 'items', file: 'Lantern.glb', prompt: 'An iron lantern with candle inside, medieval hanging style' },
  { category: 'items', file: 'Satchel.glb', prompt: 'A medieval leather satchel bag, worn and travel-stained' },
  { category: 'items', file: 'Pistol.glb', prompt: 'A medieval flintlock pistol, ornate wooden grip, dark fantasy' },
  { category: 'items', file: 'Crossbow.glb', prompt: 'A medieval crossbow, wooden stock, iron mechanism' },
  { category: 'items', file: 'Warhammer.glb', prompt: 'A medieval warhammer, iron head on a long wooden shaft' },
  { category: 'items', file: 'Bone_Pile.glb', prompt: 'A pile of old bones and skulls on dungeon floor, dark fantasy' },

  // ── ARCHITECTURE ──────────────────────────────────────────────────────
  { category: 'architecture', file: 'Door_Dungeon.glb', prompt: 'A heavy medieval iron-reinforced wooden door, dungeon style' },
  { category: 'architecture', file: 'Door_Wooden.glb', prompt: 'A medieval wooden door with iron studs, tavern-style' },
  { category: 'architecture', file: 'Gate_Portcullis.glb', prompt: 'A large medieval castle iron portcullis gate' },
  { category: 'architecture', file: 'Pillar_Stone.glb', prompt: 'A stone dungeon pillar, rough-hewn, medieval dark fantasy' },
  { category: 'architecture', file: 'Column_Marble.glb', prompt: 'A tall marble column, classical style, temple architecture' },
  { category: 'architecture', file: 'Well.glb', prompt: 'A medieval stone well with wooden bucket and rope' },
  { category: 'architecture', file: 'Fountain.glb', prompt: 'A medieval town square stone fountain with water basin' },
  { category: 'architecture', file: 'Signpost.glb', prompt: 'A medieval wooden signpost with two directional signs at a crossroads' },
  { category: 'architecture', file: 'Market_Stall.glb', prompt: 'A wooden medieval market stall with canvas awning' },
  { category: 'architecture', file: 'Bridge_Stone.glb', prompt: 'A medieval stone bridge, arched, moss-covered' },
  { category: 'architecture', file: 'Barricade.glb', prompt: 'A medieval wooden barricade made of stakes and planks' },
  { category: 'architecture', file: 'Prison_Bars.glb', prompt: 'A medieval prison cell iron bars gate, dungeon' },
  { category: 'architecture', file: 'Staircase_Spiral.glb', prompt: 'A medieval stone staircase, spiral, going upward in a tower' },
  { category: 'architecture', file: 'Altar.glb', prompt: 'A stone religious altar with candles and offerings, medieval temple' },
  { category: 'architecture', file: 'Statue_Knight.glb', prompt: 'A medieval stone statue of a knight in armor, weathered' },
  { category: 'architecture', file: 'Statue_Saint.glb', prompt: 'A medieval stone statue of a robed saint with outstretched hands' },
  { category: 'architecture', file: 'Anvil.glb', prompt: 'A medieval blacksmith anvil on a tree stump, iron tools nearby' },
  { category: 'architecture', file: 'Dock.glb', prompt: 'A medieval wooden dock pier extending over water' },

  // ── BUILDINGS ──────────────────────────────────────────────────────────
  { category: 'buildings', file: 'Tavern.glb', prompt: 'A medieval half-timbered tavern with a hanging sign, two stories' },
  { category: 'buildings', file: 'Cottage.glb', prompt: 'A small medieval thatched-roof peasant cottage' },
  { category: 'buildings', file: 'Smithy.glb', prompt: 'A medieval blacksmith workshop with chimney and forge' },
  { category: 'buildings', file: 'Watchtower.glb', prompt: 'A medieval watchtower, stone base with wooden top' },
  { category: 'buildings', file: 'Ruined_Tower.glb', prompt: 'A ruined medieval stone tower, partially collapsed, overgrown' },
  { category: 'buildings', file: 'Shop.glb', prompt: 'A medieval market shop building with open storefront' },
  { category: 'buildings', file: 'Windmill.glb', prompt: 'A medieval windmill with cloth sails, wooden construction' },
  { category: 'buildings', file: 'Swamp_Hut.glb', prompt: 'A swamp witch hut on stilts, crooked, with hanging herbs' },
  { category: 'buildings', file: 'Castle_Gatehouse.glb', prompt: 'A medieval stone castle gatehouse with two towers and portcullis' },
  { category: 'buildings', file: 'Tent_Military.glb', prompt: 'A simple medieval canvas tent, military camp style' },
  { category: 'buildings', file: 'Tent_Camp.glb', prompt: 'A medieval adventurer tent with bedroll visible, campsite' },
  { category: 'buildings', file: 'Stable.glb', prompt: 'A medieval wooden stable with hay and horse trough' },

  // ── NATURE ────────────────────────────────────────────────────────────
  { category: 'nature', file: 'Oak_Tree_Dark.glb', prompt: 'A large twisted dark fantasy oak tree with thick trunk' },
  { category: 'nature', file: 'Dead_Tree.glb', prompt: 'A dead leafless tree with gnarled branches, spooky fantasy' },
  { category: 'nature', file: 'Pine_Tree.glb', prompt: 'A pine tree, tall and straight, temperate forest' },
  { category: 'nature', file: 'Fallen_Log.glb', prompt: 'A fallen tree log, mossy, lying on forest ground' },
  { category: 'nature', file: 'Tree_Stump.glb', prompt: 'A tree stump with axe marks, medieval woodcutting' },
  { category: 'nature', file: 'Bush.glb', prompt: 'A wild bush, thick green foliage, fantasy forest' },
  { category: 'nature', file: 'Mushrooms_Glowing.glb', prompt: 'A cluster of glowing fantasy mushrooms, bioluminescent, cave' },
  { category: 'nature', file: 'Mushrooms_Forest.glb', prompt: 'Regular brown forest mushroom cluster on the ground' },
  { category: 'nature', file: 'Boulder_Mossy.glb', prompt: 'A large moss-covered boulder, natural stone, forest' },
  { category: 'nature', file: 'Rocks_Small.glb', prompt: 'A small rock formation, grey stones stacked naturally' },
  { category: 'nature', file: 'Swamp_Reeds.glb', prompt: 'Tall swamp reeds and cattails growing from water' },
  { category: 'nature', file: 'Swamp_Tree.glb', prompt: 'A twisted swamp tree with hanging moss and exposed roots' },
  { category: 'nature', file: 'Hay_Bales.glb', prompt: 'A stack of hay bales, medieval farm, golden straw' },
  { category: 'nature', file: 'Garden_Patch.glb', prompt: 'A medieval vegetable garden patch with cabbages and carrots' },
  { category: 'nature', file: 'Firewood_Pile.glb', prompt: 'A pile of firewood logs, neatly stacked, medieval' },
  { category: 'nature', file: 'Crystal_Formation.glb', prompt: 'A crystal rock formation, purple amethyst crystals growing from stone' },

  // ── PROPS ─────────────────────────────────────────────────────────────
  { category: 'props', file: 'Campfire.glb', prompt: 'A medieval campfire with stones around it and burning logs' },
  { category: 'props', file: 'Torch_Wall.glb', prompt: 'A wall-mounted medieval torch with flame, iron bracket' },
  { category: 'props', file: 'Torch_Standing.glb', prompt: 'A standing medieval torch on a wooden pole, ground torch' },
  { category: 'props', file: 'Cart.glb', prompt: 'A medieval wooden horse-drawn cart with two wheels' },
  { category: 'props', file: 'Cart_Vendor.glb', prompt: 'A medieval vendor cart with goods and canvas cover' },
  { category: 'props', file: 'Ship_Helm.glb', prompt: 'A medieval ship helm steering wheel, wooden with iron' },
  { category: 'props', file: 'Ship_Mast.glb', prompt: 'A tall wooden ship mast with furled sails and rigging' },
  { category: 'props', file: 'Gallows.glb', prompt: 'A medieval gallows hangman noose, dark wood, ominous' },
  { category: 'props', file: 'Pillory.glb', prompt: 'A medieval stocks pillory for punishment, wooden, town square' },
  { category: 'props', file: 'Gravestone.glb', prompt: 'A medieval gravestone, weathered stone with cross, cemetery' },
  { category: 'props', file: 'Coffin.glb', prompt: 'A medieval wooden coffin, simple, dark wood with iron nails' },
  { category: 'props', file: 'Rowboat.glb', prompt: 'A medieval wooden rowboat, simple, beached on shore' },
  { category: 'props', file: 'Hanging_Cage.glb', prompt: 'A medieval iron cage, hanging, dungeon torture device' },
  { category: 'props', file: 'Cauldron_Fire.glb', prompt: 'A medieval cauldron on tripod over fire, witch brewing pot' },
].map(entry => (
  entry.category === 'characters'
    ? { ...entry, prompt: `${entry.prompt}${CHARACTER_BODY_SUFFIX}` }
    : entry
));

// ── Core pipeline ───────────────────────────────────────────────────────────

async function fileExistsInGCS(bucket, path) {
  try {
    const [exists] = await bucket.file(path).exists();
    return exists;
  } catch {
    return false;
  }
}

async function createTask(prompt) {
  const data = await meshyPost('/text-to-3d', {
    mode: 'preview',
    prompt: prompt + STYLE_SUFFIX,
    art_style: 'realistic',
    should_remesh: true,
    target_formats: TARGET_FORMATS,
  });
  return data.result;
}

async function createRefineTask(previewTaskId) {
  const data = await meshyPost('/text-to-3d', {
    mode: 'refine',
    preview_task_id: previewTaskId,
    target_formats: TARGET_FORMATS,
  });
  return data.result;
}

async function waitForTask(taskId) {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const data = await meshyGet(`/text-to-3d/${taskId}`);

    if (data.status === 'SUCCEEDED' && data.model_urls?.glb) {
      return data.model_urls.glb;
    }
    if (data.status === 'FAILED' || data.status === 'EXPIRED') {
      throw new Error(`Task ${taskId} ${data.status}: ${data.task_error?.message || 'unknown error'}`);
    }

    const pct = data.progress || 0;
    process.stdout.write(`\r    polling ${taskId.slice(0, 8)}… ${pct}%   `);
  }
  throw new Error(`Task ${taskId} timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

async function waitForPreview(previewTaskId) {
  await waitForTask(previewTaskId);
}

async function downloadGlb(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToGCS(bucket, gcsPath, buffer) {
  const file = bucket.file(gcsPath);
  await file.save(buffer, {
    contentType: 'model/gltf-binary',
    resumable: false,
    metadata: { cacheControl: 'public, max-age=604800' },
  });
  return `gs://${GCS_BUCKET_NAME}/${gcsPath}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function gcsPath(entry) {
  return `${GCS_PREFIX}/${entry.category}/${entry.file}`;
}

// ── Progress tracking ───────────────────────────────────────────────────────

const stats = { total: 0, skipped: 0, ok: 0, failed: 0, failedList: [] };

function logProgress(entry, status, extra = '') {
  const idx = `[${stats.skipped + stats.ok + stats.failed}/${stats.total}]`;
  const tag = { skip: '⏭️ ', ok: '✅', fail: '❌' }[status] || '  ';
  const name = `${entry.category}/${entry.file}`;
  console.log(`${idx} ${tag} ${name} ${extra}`);
}

// ── Worker: processes one model end-to-end ──────────────────────────────────

async function processEntry(bucket, entry) {
  const path = gcsPath(entry);

  const exists = FORCE ? false : await fileExistsInGCS(bucket, path);
  if (exists) {
    stats.skipped++;
    logProgress(entry, 'skip', '(already in GCS)');
    return;
  }

  if (DRY_RUN) {
    stats.skipped++;
    logProgress(entry, 'skip', `(dry-run) prompt: "${entry.prompt}"`);
    return;
  }

  try {
    const previewTaskId = await createTask(entry.prompt);
    console.log(`    → preview task ${previewTaskId} created for ${entry.category}/${entry.file}`);

    await waitForPreview(previewTaskId);
    process.stdout.write('\r' + ' '.repeat(60) + '\r');

    const refineTaskId = await createRefineTask(previewTaskId);
    console.log(`    → refine task ${refineTaskId} created for ${entry.category}/${entry.file}`);

    const glbUrl = await waitForTask(refineTaskId);
    process.stdout.write('\r' + ' '.repeat(60) + '\r');

    const buffer = await downloadGlb(glbUrl);
    const gsUri = await uploadToGCS(bucket, path, buffer);

    stats.ok++;
    logProgress(entry, 'ok', `(${(buffer.length / 1024).toFixed(0)} KB) → ${gsUri}`);
  } catch (err) {
    stats.failed++;
    stats.failedList.push({ entry, error: err.message });
    logProgress(entry, 'fail', err.message);
  }
}

// ── Concurrency pool ────────────────────────────────────────────────────────

async function runPool(bucket, entries) {
  const queue = [...entries];
  const workers = [];

  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const entry = queue.shift();
          await processEntry(bucket, entry);
        }
      })(),
    );
  }

  await Promise.all(workers);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!MESHY_API_KEY) {
    console.error('❌ MESHY_API_KEY is not set in .env');
    process.exit(1);
  }
  if (!GCS_BUCKET_NAME || !GCP_SERVICE_ACCOUNT_KEY) {
    console.error('❌ GCS_BUCKET_NAME / GCP_SERVICE_ACCOUNT_KEY not set in .env');
    process.exit(1);
  }

  let entries = PROMPTS;
  if (categoryFilter) {
    entries = entries.filter(e => e.category === categoryFilter);
    if (entries.length === 0) {
      const cats = [...new Set(PROMPTS.map(e => e.category))].join(', ');
      console.error(`❌ Unknown category "${categoryFilter}". Available: ${cats}`);
      process.exit(1);
    }
  }

  stats.total = entries.length;

  const catCounts = {};
  for (const e of entries) catCounts[e.category] = (catCounts[e.category] || 0) + 1;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Meshy Prefab Generator → GCP Cloud Storage    ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Bucket:      ${GCS_BUCKET_NAME.padEnd(35)}║`);
  console.log(`║  Prefix:      ${GCS_PREFIX.padEnd(35)}║`);
  console.log(`║  Models:      ${String(entries.length).padEnd(35)}║`);
  console.log(`║  Concurrency: ${String(CONCURRENCY).padEnd(35)}║`);
  console.log(`║  Dry run:     ${String(DRY_RUN).padEnd(35)}║`);
  console.log(`║  Force:       ${String(FORCE).padEnd(35)}║`);
  console.log('╠══════════════════════════════════════════════════╣');
  for (const [cat, count] of Object.entries(catCounts)) {
    console.log(`║  ${cat.padEnd(16)} ${String(count).padStart(3)} models${' '.repeat(22)}║`);
  }
  console.log('╚══════════════════════════════════════════════════╝');
  console.log();

  const bucket = createGcpStorage();

  const startTime = Date.now();
  await runPool(bucket, entries);
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log();
  console.log('══════════════════════════════════════════════════');
  console.log(`  Done in ${elapsed} min`);
  console.log(`  ✅ Generated: ${stats.ok}`);
  console.log(`  ⏭️  Skipped:   ${stats.skipped}`);
  console.log(`  ❌ Failed:    ${stats.failed}`);
  console.log('══════════════════════════════════════════════════');

  if (stats.failedList.length > 0) {
    console.log('\nFailed models:');
    for (const f of stats.failedList) {
      console.log(`  - ${f.entry.category}/${f.entry.file}: ${f.error}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
