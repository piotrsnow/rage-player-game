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
import { sanitizeMana } from '../../../shared/domain/mana.js';
import { toCanonicalStoragePath } from './urlCanonical.js';

// Mirror of cumulativeCharXpThreshold from src/data/rpgSystem.js — needed for
// the one-shot backfill below. Kept local to avoid pulling the FE rpgSystem
// module into the backend (see characterMutations.js for the same pattern).
function charLevelCostLocal(level) {
  if (level <= 1) return 0;
  return 5 * level * level;
}

function cumulativeCharXpThresholdLocal(level) {
  if (level <= 1) return 0;
  let sum = 0;
  for (let k = 2; k <= level; k++) sum += charLevelCostLocal(k);
  return sum;
}

const CHARACTER_INCLUDE = {
  characterSkills: true,
  // Hidden rows survive snapshot saves and back lineage chips on result items;
  // they must NOT appear in the FE-facing snapshot.
  inventoryItems: { where: { hidden: false }, orderBy: { addedAt: 'asc' } },
  materials: true,
};

const SCALAR_FIELDS = [
  'name', 'age', 'gender', 'species',
  'wounds', 'maxWounds', 'bonusMaxWounds', 'movement',
  'characterLevel', 'characterXp', 'attributePoints',
  'backstory', 'portraitUrl', 'spriteUrl', 'spriteSheetUrl', 'voiceId', 'voiceName',
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
  if (snapshot.spriteUrl) {
    snapshot.spriteUrl = toCanonicalStoragePath(snapshot.spriteUrl);
  }
  if (snapshot.spriteSheetUrl) {
    snapshot.spriteSheetUrl = toCanonicalStoragePath(snapshot.spriteSheetUrl);
  }

  // Lazy backfill: historically `characterXp` stored "XP since last level-up"
  // (consumed on level-up). The new contract is a monotonic lifetime total,
  // so pre-migration rows are below the cumulative threshold for their level
  // and need to be lifted once. Idempotent — after the first read the value
  // is already ≥ threshold, so the branch is skipped. The bumped value will
  // be persisted on the next `persistCharacterSnapshot`.
  const charLevel = snapshot.characterLevel || 1;
  if (charLevel > 1) {
    const cumulative = cumulativeCharXpThresholdLocal(charLevel);
    const currentXp = snapshot.characterXp || 0;
    if (currentXp < cumulative) {
      snapshot.characterXp = currentXp + cumulative;
    }
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
      // Lineage chips render from this — null/undefined safe on the FE side.
      ...(Array.isArray(item.composedFrom) && item.composedFrom.length > 0
        ? { composedFrom: item.composedFrom }
        : {}),
    };
  });

  snapshot.materialBag = (row.materials || []).map((m) => ({
    id: m.materialKey,
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

  snapshot.mana = sanitizeMana(snapshot.mana);

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
  if (typeof scalars.spriteUrl === 'string' && scalars.spriteUrl) {
    scalars.spriteUrl = toCanonicalStoragePath(scalars.spriteUrl);
  }
  if (typeof scalars.spriteSheetUrl === 'string' && scalars.spriteSheetUrl) {
    scalars.spriteSheetUrl = toCanonicalStoragePath(scalars.spriteSheetUrl);
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
 * Shallow merge: `overlay` keys only replace when the value is not `undefined`.
 * (Explicit `null` is kept — e.g. cleared status / lock fields.)
 */
function overlaySnapshotBaseline(base, overlay) {
  const out = { ...base };
  if (!overlay) return out;
  for (const [k, v] of Object.entries(overlay)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * `persistCharacterSnapshot` replaces child tables from the snapshot. If the
 * caller passes a partial object (multiplayer wire, or any path that dropped a
 * scalar like `wounds`), omitting a field would either wipe relations or omit
 * required Prisma update args — merge with the current DB row first.
 */
function snapshotNeedsDbBaseline(snapshot) {
  if (!snapshot) return true;
  for (const key of SCALAR_FIELDS) {
    if (snapshot[key] === undefined) return true;
  }
  for (const key of JSON_FIELDS) {
    if (snapshot[key] === undefined) return true;
  }
  if (snapshot.skills === undefined) return true;
  if (snapshot.inventory === undefined) return true;
  if (snapshot.materialBag === undefined) return true;
  if (snapshot.equipped === undefined) return true;
  return false;
}

/**
 * Per-instance inventory rows — each item gets its own row with a unique
 * itemKey (the item's UUID/ID from the FE snapshot). No name-merge.
 */
function stackInventoryRows(items) {
  const rows = [];
  const usedKeys = new Set();
  for (const item of items) {
    if (!item) continue;
    const displayName = item.name || item.displayName || '';
    let itemKey = item.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    while (usedKeys.has(itemKey)) {
      itemKey = `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    usedKeys.add(itemKey);
    const knownColumns = new Set([
      'id', 'name', 'displayName', 'baseType', 'quantity',
      'props', 'imageUrl', 'addedAt', 'composedFrom',
    ]);
    const inlineProps = {};
    for (const [k, v] of Object.entries(item)) {
      if (!knownColumns.has(k)) inlineProps[k] = v;
    }
    const props = { ...(item.props || {}), ...inlineProps };
    const normalizedImageUrl = item.imageUrl ? toCanonicalStoragePath(item.imageUrl) : null;
    const composedFrom = Array.isArray(item.composedFrom) && item.composedFrom.length > 0
      ? item.composedFrom
      : null;
    rows.push({
      itemKey,
      displayName,
      baseType: item.baseType ?? null,
      quantity: item.quantity || 1,
      props,
      imageUrl: normalizedImageUrl,
      composedFrom,
    });
  }
  return rows;
}

function stackMaterialRows(materials) {
  const rows = [];
  const usedKeys = new Set();
  for (const m of materials) {
    if (!m) continue;
    const displayName = m.name || m.displayName || '';
    let materialKey = m.id || `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    while (usedKeys.has(materialKey)) {
      materialKey = `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    usedKeys.add(materialKey);
    rows.push({
      materialKey,
      displayName,
      quantity: m.quantity || 1,
    });
  }
  return rows;
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

// ── Custom spell hydration ──

export async function hydrateCustomSpells(snapshot, client = prisma) {
  const ids = snapshot?.spells?.customKnown;
  if (!Array.isArray(ids) || ids.length === 0) {
    snapshot.customSpells = [];
    return;
  }
  const rows = await client.customSpell.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, school: true, description: true, longDescription: true, manaCost: true, icon: true, combatStats: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  snapshot.customSpells = ids.map((id) => byId.get(id)).filter(Boolean);
}

// ── DB ops ──

/**
 * Load a Character row with all child relations and return it pre-shaped
 * to FE snapshot form. Returns null if the where clause matches nothing.
 */
export async function loadCharacterSnapshot(where, client = prisma) {
  const row = await client.character.findFirst({ where, include: CHARACTER_INCLUDE });
  const snapshot = reconstructCharacterSnapshot(row);
  if (snapshot) await hydrateCustomSpells(snapshot, client);
  return snapshot;
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
  let merged = snapshot;
  if (snapshotNeedsDbBaseline(snapshot)) {
    const baseline = await loadCharacterSnapshot({ id: characterId }, client);
    if (baseline) merged = overlaySnapshotBaseline(baseline, snapshot);
  }
  clearStaleEquipped(merged);
  const { scalars, skillRows, inventoryRows, materialRows } = splitCharacterSnapshot(merged);

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
    // Only wipe visible rows — hidden rows (combine sources, enchant originals,
    // discarded items) carry lineage and must survive snapshot saves.
    await tx.characterInventoryItem.deleteMany({ where: { characterId, hidden: false } });
    if (inventoryRows.length > 0) {
      // Stale FE snapshots may still carry an item that the BE has since
      // hidden (e.g. user discarded item X, but a save tx queued before the
      // RECONCILE_CHARACTER_FROM_BACKEND landed). Without this guard the
      // createMany would PK-collide on (characterId, itemKey) with the
      // hidden row. Drop the stale entry rather than failing the whole tx.
      const hiddenKeyRows = await tx.characterInventoryItem.findMany({
        where: { characterId, hidden: true },
        select: { itemKey: true },
      });
      const hiddenKeys = new Set(hiddenKeyRows.map((r) => r.itemKey));
      const fresh = hiddenKeys.size > 0
        ? inventoryRows.filter((r) => !hiddenKeys.has(r.itemKey))
        : inventoryRows;
      if (fresh.length > 0) {
        await tx.characterInventoryItem.createMany({
          data: fresh.map((r) => ({ ...r, characterId })),
        });
      }
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
