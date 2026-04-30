/**
 * F4 — character storage helpers.
 *
 * Bridges the canonical Postgres shape (Character row + child tables for
 * skills / inventory / materials) and the FE-facing snapshot shape that
 * scene generation, the FE store, and the multiplayer wire format all
 * still expect: `{skills: {name: {level, xp, cap}}, inventory: [...],
 * equipped: {mainHand, offHand, armour}, materialBag: [...]}`.
 *
 * Persistence is replace-strategy (deleteMany + createMany per relation)
 * inside a $transaction. Atomic UPDATE per skill/material is reserved for
 * F6 if a hot-path profile demands it.
 */

import { prisma } from '../lib/prisma.js';
import { slugifyItemName } from '../../../shared/domain/itemKeys.js';
import { toCanonicalStoragePath } from './urlCanonical.js';

const CHARACTER_INCLUDE = {
  characterSkills: true,
  inventoryItems: { orderBy: { addedAt: 'asc' } },
  materials: true,
};

const SCALAR_FIELDS = [
  'name', 'age', 'gender', 'species',
  'wounds', 'maxWounds', 'movement',
  'characterLevel', 'characterXp', 'attributePoints',
  'backstory', 'portraitUrl', 'voiceId', 'voiceName',
  'campaignCount', 'fame', 'infamy', 'status',
  'lockedCampaignId', 'lockedCampaignName', 'lockedLocation',
  'equippedMainHand', 'equippedOffHand', 'equippedArmour',
];

const JSON_FIELDS = [
  'attributes', 'mana', 'spells', 'money', 'statuses', 'needs',
  'customAttackPresets', 'knownTitles', 'activeDungeonState',
];

// ── Shape conversion ──

/**
 * Map a Character row (with characterSkills/inventoryItems/materials
 * relations) into the FE snapshot shape callers throughout the codebase
 * still consume. Equipped slot text columns become a single object,
 * inventory item rows expose `id = itemKey` so existing UI lookups like
 * `inventory.find(i => i.id === slot)` keep working without edits.
 */
export function reconstructCharacterSnapshot(row) {
  if (!row) return null;
  const snapshot = { ...row };

  // Legacy records may hold host-prefixed / token-suffixed URLs; hand the
  // FE canonical paths so `apiClient.resolveMediaUrl` can freshly hydrate.
  if (snapshot.portraitUrl) {
    snapshot.portraitUrl = toCanonicalStoragePath(snapshot.portraitUrl);
  }

  snapshot.skills = {};
  for (const s of row.characterSkills || []) {
    snapshot.skills[s.skillName] = { level: s.level, xp: s.xp, cap: s.cap };
  }

  snapshot.inventory = (row.inventoryItems || []).map((item) => {
    const props = item.props && typeof item.props === 'object' ? item.props : {};
    return {
      ...props,
      id: item.itemKey,
      name: item.displayName,
      baseType: item.baseType ?? undefined,
      quantity: item.quantity,
      props,
      imageUrl: item.imageUrl ? toCanonicalStoragePath(item.imageUrl) : undefined,
      addedAt: item.addedAt,
    };
  });

  snapshot.materialBag = (row.materials || []).map((m) => ({
    name: m.displayName,
    quantity: m.quantity,
  }));

  snapshot.equipped = {
    mainHand: row.equippedMainHand ?? null,
    offHand: row.equippedOffHand ?? null,
    armour: row.equippedArmour ?? null,
  };

  delete snapshot.characterSkills;
  delete snapshot.inventoryItems;
  delete snapshot.materials;
  delete snapshot.equippedMainHand;
  delete snapshot.equippedOffHand;
  delete snapshot.equippedArmour;

  return snapshot;
}

/**
 * Inverse of reconstructCharacterSnapshot for the relation rows: turn an
 * FE-shape character snapshot into a `{scalars, skillRows, inventoryRows,
 * materialRows}` bundle ready for createMany.
 *
 * `props` on inventory items absorbs everything that isn't a known column
 * so AI/UI can attach arbitrary metadata (imageUrl is promoted out for
 * faster reads; everything else lands in props JSONB).
 */
export function splitCharacterSnapshot(snapshot) {
  if (!snapshot) return { scalars: {}, skillRows: [], inventoryRows: [], materialRows: [] };

  const scalars = {};
  for (const key of SCALAR_FIELDS) {
    if (snapshot[key] !== undefined) scalars[key] = snapshot[key];
  }
  for (const key of JSON_FIELDS) {
    if (snapshot[key] !== undefined) scalars[key] = snapshot[key];
  }
  // Never persist hydrated URLs (origin + `?token=<JWT>`); older FE clients
  // may still send these on save. Keep canonical `/v1/media/file/...` only.
  if (typeof scalars.portraitUrl === 'string' && scalars.portraitUrl) {
    scalars.portraitUrl = toCanonicalStoragePath(scalars.portraitUrl);
  }
  const equipped = snapshot.equipped || {};
  if (equipped.mainHand !== undefined) scalars.equippedMainHand = equipped.mainHand || null;
  if (equipped.offHand !== undefined) scalars.equippedOffHand = equipped.offHand || null;
  if (equipped.armour !== undefined) scalars.equippedArmour = equipped.armour || null;

  const skillRows = Object.entries(snapshot.skills || {}).map(([skillName, s]) => ({
    skillName,
    level: s?.level ?? 0,
    xp: s?.xp ?? s?.progress ?? 0,
    cap: s?.cap ?? 10,
  }));

  const inventoryRows = stackInventoryRows(snapshot.inventory || []);
  const materialRows = stackMaterialRows(snapshot.materialBag || []);

  return { scalars, skillRows, inventoryRows, materialRows };
}

/**
 * Stack inventory items by itemKey. Two items with the same slugified name
 * merge into one row; props of the latest entry win. This is the F4
 * "option A" decision — name-keyed stacking, no per-stack UUID.
 */
function stackInventoryRows(items) {
  const byKey = new Map();
  for (const item of items) {
    if (!item) continue;
    const displayName = item.name || item.displayName || '';
    const itemKey = slugifyItemName(displayName);
    const knownColumns = new Set([
      'id', 'name', 'displayName', 'baseType', 'quantity',
      'props', 'imageUrl', 'addedAt',
    ]);
    const inlineProps = {};
    for (const [k, v] of Object.entries(item)) {
      if (!knownColumns.has(k)) inlineProps[k] = v;
    }
    const props = { ...(item.props || {}), ...inlineProps };
    const existing = byKey.get(itemKey);
    const normalizedImageUrl = item.imageUrl ? toCanonicalStoragePath(item.imageUrl) : null;
    if (existing) {
      existing.quantity += item.quantity || 1;
      existing.props = { ...existing.props, ...props };
      if (normalizedImageUrl) existing.imageUrl = normalizedImageUrl;
      if (item.baseType) existing.baseType = item.baseType;
    } else {
      byKey.set(itemKey, {
        itemKey,
        displayName,
        baseType: item.baseType ?? null,
        quantity: item.quantity || 1,
        props,
        imageUrl: normalizedImageUrl,
      });
    }
  }
  return Array.from(byKey.values());
}

function stackMaterialRows(materials) {
  const byKey = new Map();
  for (const m of materials) {
    if (!m) continue;
    const displayName = m.name || m.displayName || '';
    const materialKey = slugifyItemName(displayName);
    const existing = byKey.get(materialKey);
    if (existing) {
      existing.quantity += m.quantity || 1;
    } else {
      byKey.set(materialKey, {
        materialKey,
        displayName,
        quantity: m.quantity || 1,
      });
    }
  }
  return Array.from(byKey.values());
}

/**
 * Null any equipped slot whose itemKey is not present in the inventory.
 * Called after every mutation so deletes/quantity-zeros never leave stale
 * FK-style references behind. Mutates input.
 */
export function clearStaleEquipped(snapshot) {
  if (!snapshot) return snapshot;
  const equipped = snapshot.equipped || { mainHand: null, offHand: null, armour: null };
  const inv = snapshot.inventory || [];
  const live = new Set(inv.map((i) => i?.id).filter(Boolean));
  const next = { ...equipped };
  for (const slot of ['mainHand', 'offHand', 'armour']) {
    if (next[slot] && !live.has(next[slot])) next[slot] = null;
  }
  snapshot.equipped = next;
  return snapshot;
}

// ── DB ops ──

/**
 * Load a Character row with all child relations and return it pre-shaped
 * to FE snapshot form. Returns null if the where clause matches nothing.
 */
export async function loadCharacterSnapshot(where, client = prisma) {
  const row = await client.character.findFirst({ where, include: CHARACTER_INCLUDE });
  return reconstructCharacterSnapshot(row);
}

export async function loadCharacterSnapshotById(id, client = prisma) {
  return loadCharacterSnapshot({ id }, client);
}

/**
 * Persist the FE-shape snapshot back to Postgres. Replace-strategy:
 * delete child rows + recreate from snapshot. Equipped refs are
 * scrubbed first so we never persist a slot pointing at a deleted
 * inventory item. Wraps in $transaction; safe to call from inside an
 * outer tx by passing `client` in.
 */
export async function persistCharacterSnapshot(characterId, snapshot, client = prisma) {
  if (!characterId || !snapshot) return null;
  clearStaleEquipped(snapshot);
  const { scalars, skillRows, inventoryRows, materialRows } = splitCharacterSnapshot(snapshot);

  const ops = async (tx) => {
    if (Object.keys(scalars).length > 0) {
      await tx.character.update({ where: { id: characterId }, data: scalars });
    }
    await tx.characterSkill.deleteMany({ where: { characterId } });
    if (skillRows.length > 0) {
      await tx.characterSkill.createMany({
        data: skillRows.map((r) => ({ ...r, characterId })),
      });
    }
    await tx.characterInventoryItem.deleteMany({ where: { characterId } });
    if (inventoryRows.length > 0) {
      await tx.characterInventoryItem.createMany({
        data: inventoryRows.map((r) => ({ ...r, characterId })),
      });
    }
    await tx.characterMaterial.deleteMany({ where: { characterId } });
    if (materialRows.length > 0) {
      await tx.characterMaterial.createMany({
        data: materialRows.map((r) => ({ ...r, characterId })),
      });
    }
  };

  if (typeof client.$transaction === 'function') {
    await client.$transaction(ops);
  } else {
    await ops(client);
  }

  return loadCharacterSnapshotById(characterId, prisma);
}

/**
 * Create a brand-new Character with skills/inventory/materials in one tx.
 * `payload` is the FE-shape body (POST /characters). Returns the loaded
 * snapshot.
 */
export async function createCharacterWithRelations(userId, payload, client = prisma) {
  const snapshot = { ...payload, userId };
  const { scalars, skillRows, inventoryRows, materialRows } = splitCharacterSnapshot(snapshot);

  const created = await client.$transaction(async (tx) => {
    const character = await tx.character.create({
      data: { ...scalars, userId },
    });
    if (skillRows.length > 0) {
      await tx.characterSkill.createMany({
        data: skillRows.map((r) => ({ ...r, characterId: character.id })),
      });
    }
    if (inventoryRows.length > 0) {
      await tx.characterInventoryItem.createMany({
        data: inventoryRows.map((r) => ({ ...r, characterId: character.id })),
      });
    }
    if (materialRows.length > 0) {
      await tx.characterMaterial.createMany({
        data: materialRows.map((r) => ({ ...r, characterId: character.id })),
      });
    }
    return character;
  });

  return loadCharacterSnapshotById(created.id);
}
