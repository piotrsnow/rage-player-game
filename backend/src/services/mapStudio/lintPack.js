// lintPack — static ontology checks over a TilesetPack.
//
// Returns a list of issues shaped as:
//   { level: 'warn'|'error', code, message, context? }
//
// Current checks:
//   trait_fuzzy_dup    — two values in the same trait key that only differ
//                        by case/whitespace (e.g. "grass" vs "Grass").
//   wall_without_edge  — tile has atom `wall` but no `edge_*` atom; the
//                        wall tool won't be able to place it.
//   group_missing_role — an AutotileGroup has layout that expects at least
//                        4 role-tagged tiles (edge_*, corner, fill) but the
//                        tiles inside its origin block carry none.
//   rule_missing_group — ConnectionRule via=autotile_group but viaRef.groupId
//                        doesn't point at an existing AutotileGroup in the
//                        pack (or via=wall_bitmask but viaRef.bitmask missing).
//   rule_group_underfilled — rule targets a group, but that group has no
//                        tiles with autotileRole matching the layout demands.

import { prisma } from '../../lib/prisma.js';

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normaliseTraitValue(v) {
  return String(v || '').trim().toLowerCase();
}

// Layouts that need at least N role-tagged tiles to be useful.
const LAYOUT_MIN_ROLES = {
  rpgmaker_a1: 4,
  rpgmaker_a2: 4,
  wang_2edge: 8,
  blob_47: 16,
  custom: 1,
};

export async function lintPack({ packId, userId }) {
  const pack = await prisma.tilesetPack.findFirst({
    where: { id: packId, userId },
  });
  if (!pack) return { found: false, issues: [] };

  const tilesets = await prisma.tileset.findMany({ where: { packId } });
  const tilesetIds = tilesets.map((t) => t.id);
  const tiles = tilesetIds.length
    ? await prisma.tile.findMany({ where: { tilesetId: { in: tilesetIds } } })
    : [];
  const groups = tilesetIds.length
    ? await prisma.autotileGroup.findMany({ where: { tilesetId: { in: tilesetIds } } })
    : [];
  const rules = await prisma.connectionRule.findMany({ where: { packId } });

  const issues = [];

  // ── 1. Trait fuzzy dup ─────────────────────────────────────────────
  const vocab = parseJson(pack.traitVocab, {});
  for (const key of Object.keys(vocab)) {
    const values = vocab[key] || [];
    const byNorm = new Map();
    for (const v of values) {
      const norm = normaliseTraitValue(v);
      if (!norm) continue;
      if (!byNorm.has(norm)) byNorm.set(norm, []);
      byNorm.get(norm).push(v);
    }
    for (const [norm, list] of byNorm) {
      if (list.length > 1) {
        issues.push({
          level: 'warn',
          code: 'trait_fuzzy_dup',
          message: `trait "${key}" has near-duplicate values: ${list.join(', ')}`,
          context: { key, values: list, canonical: norm },
        });
      }
    }
  }

  // Also scan the tiles themselves for values that differ by case/whitespace
  // from the vocab entries.
  for (const tile of tiles) {
    const traits = parseJson(tile.traits, {});
    for (const [key, value] of Object.entries(traits)) {
      const norm = normaliseTraitValue(value);
      const vocabSet = (vocab[key] || []).map(normaliseTraitValue);
      if (!vocabSet.includes(norm) && vocabSet.length) {
        issues.push({
          level: 'warn',
          code: 'trait_outside_vocab',
          message: `tile ${tile.tilesetId}/#${tile.localId} uses ${key}:${value} not present in pack vocab`,
          context: { tilesetId: tile.tilesetId, localId: tile.localId, key, value },
        });
      }
    }
  }

  // ── 2. wall atom without edge_* ────────────────────────────────────
  for (const tile of tiles) {
    const atoms = parseJson(tile.atoms, []);
    if (!atoms.includes('wall')) continue;
    if (!atoms.some((a) => a.startsWith('edge_'))) {
      issues.push({
        level: 'warn',
        code: 'wall_without_edge',
        message: `tile #${tile.localId} has "wall" but no edge_* atom`,
        context: { tilesetId: tile.tilesetId, localId: tile.localId },
      });
    }
  }

  // ── 3. AutotileGroup missing roles ─────────────────────────────────
  // Count how many tiles in the group's tileset carry autotileGroupId === g.id
  // and have a non-null autotileRole.
  const roleCountByGroup = new Map();
  for (const t of tiles) {
    if (!t.autotileGroupId || !t.autotileRole) continue;
    roleCountByGroup.set(
      t.autotileGroupId,
      (roleCountByGroup.get(t.autotileGroupId) || 0) + 1
    );
  }
  for (const g of groups) {
    const min = LAYOUT_MIN_ROLES[g.layout] ?? 1;
    const have = roleCountByGroup.get(g.id) || 0;
    if (have < min) {
      issues.push({
        level: 'warn',
        code: 'group_missing_role',
        message: `autotile group "${g.name}" (${g.layout}) has ${have}/${min} role-tagged tiles`,
        context: { groupId: g.id, have, required: min, layout: g.layout },
      });
    }
  }

  // ── 4. Rule references a missing group / bitmask ───────────────────
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  for (const rule of rules) {
    const viaRef = parseJson(rule.viaRef, {});
    if (rule.via === 'autotile_group') {
      if (!viaRef.groupId) {
        issues.push({
          level: 'error',
          code: 'rule_missing_group',
          message: `rule "${rule.name || rule.id}" targets autotile_group but has no viaRef.groupId`,
          context: { ruleId: rule.id },
        });
        continue;
      }
      const g = groupsById.get(viaRef.groupId);
      if (!g) {
        issues.push({
          level: 'error',
          code: 'rule_missing_group',
          message: `rule "${rule.name || rule.id}" → group ${viaRef.groupId} not found in this pack`,
          context: { ruleId: rule.id, groupId: viaRef.groupId },
        });
        continue;
      }
      const min = LAYOUT_MIN_ROLES[g.layout] ?? 1;
      const have = roleCountByGroup.get(g.id) || 0;
      if (have < min) {
        issues.push({
          level: 'error',
          code: 'rule_group_underfilled',
          message: `rule "${rule.name || rule.id}" points at group "${g.name}" which only has ${have}/${min} role-tagged tiles`,
          context: { ruleId: rule.id, groupId: g.id, have, required: min },
        });
      }
    } else if (rule.via === 'wall_bitmask') {
      if (viaRef.bitmask == null) {
        issues.push({
          level: 'error',
          code: 'rule_missing_bitmask',
          message: `rule "${rule.name || rule.id}" via=wall_bitmask but viaRef.bitmask missing`,
          context: { ruleId: rule.id },
        });
      }
    }
  }

  const summary = {
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warn').length,
    total: issues.length,
  };

  return { found: true, issues, summary };
}
