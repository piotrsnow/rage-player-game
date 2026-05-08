import { useMemo } from 'react';
import { useGameSlice } from '../stores/gameSelectors';
import { resolveKnownSpellDisplay } from '../services/magicEngine';

/**
 * Collect all taggable entities from the current game state into a flat array
 * of { kind, id, name, meta? } for autocomplete filtering.
 */
export function useEntityPool() {
  const character = useGameSlice((s) => s.character);
  const world = useGameSlice((s) => s.world);
  const scenes = useGameSlice((s) => s.scenes);

  return useMemo(() => {
    const pool = [];

    // Spells (canonical from SPELL_TREES + AI-invented custom names in known[])
    const knownSpells = character?.spells?.known || [];
    for (const spellName of knownSpells) {
      if (!spellName) continue;
      const display = resolveKnownSpellDisplay(spellName, character);
      pool.push({
        kind: 'spell',
        id: display.treeId ? `${display.treeId}/${spellName}` : `custom/${spellName}`,
        name: spellName,
        meta: {
          tree: display.treeName || (display.isCustom ? 'Wymyślone' : null),
          manaCost: display.manaCost,
        },
      });
    }

    // Inventory items
    const items = character?.inventory || [];
    for (const item of items) {
      if (!item?.name) continue;
      pool.push({
        kind: 'item',
        id: item.slugKey || item.name,
        name: item.name,
      });
    }

    // NPCs from current scene + world state
    const seenNpcNames = new Set();
    const currentScene = scenes?.[scenes.length - 1];
    const sceneNpcs = currentScene?.stateChanges?.npcs || [];
    for (const npc of sceneNpcs) {
      if (!npc?.name || seenNpcNames.has(npc.name)) continue;
      seenNpcNames.add(npc.name);
      pool.push({
        kind: 'npc',
        id: npc.id || npc.name,
        name: npc.name,
        meta: npc.role ? { role: npc.role } : undefined,
      });
    }
    const worldNpcs = world?.npcs || [];
    for (const npc of worldNpcs) {
      if (!npc?.name || seenNpcNames.has(npc.name)) continue;
      if (npc.alive === false) continue;
      seenNpcNames.add(npc.name);
      pool.push({
        kind: 'npc',
        id: npc.id || npc.name,
        name: npc.name,
        meta: npc.role ? { role: npc.role } : undefined,
      });
    }

    // Locations
    const locations = world?.knownLocations || [];
    for (const loc of locations) {
      if (!loc?.name) continue;
      pool.push({
        kind: 'location',
        id: loc.id || loc.name,
        name: loc.name,
        meta: loc.type ? { locationType: loc.type } : undefined,
      });
    }

    return pool;
  }, [character, world, scenes]);
}
