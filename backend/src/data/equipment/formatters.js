/**
 * RPGon equipment formatting for prompts and display.
 */

import { WEAPONS } from './weapons.js';
import { ARMOUR, SHIELDS } from './armour.js';
import { EQUIPMENT, EQUIPMENT_CATEGORIES } from './equipment.js';
import { formatCoinPrice } from './pricing.js';

/**
 * Compact listing of valid baseType IDs for AI context.
 * Grouped by category, includes combatKey where applicable.
 */
export function formatBaseTypeCatalog() {
  const exclude = new Set(['lodging', 'services', 'food_drink']);
  const groups = {};
  for (const [id, entry] of Object.entries(EQUIPMENT)) {
    if (exclude.has(entry.category)) continue;
    const cat = EQUIPMENT_CATEGORIES[entry.category] || entry.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(id);
  }
  const lines = ['VALID BASE TYPES (use in newItems.baseType):'];
  for (const [cat, ids] of Object.entries(groups)) {
    lines.push(`  ${cat}: ${ids.join(', ')}`);
  }
  return lines.join('\n');
}

export function formatWeaponCatalog(category = 'all') {
  const lines = [];
  if (category === 'all' || category === 'weapons') {
    lines.push('WEAPONS (use baseType IDs from equipment catalog):');
    for (const [name, w] of Object.entries(WEAPONS)) {
      const quals = w.qualities.length ? ` [${w.qualities.join(', ')}]` : '';
      const range = w.range ? `, range: ${w.range}` : '';
      const dmg = w.fixedDamage != null
        ? `fixed ${w.fixedDamage}`
        : `${w.damageType} +${w.bonus}`;
      lines.push(`  ${name}: ${dmg}, group=${w.group}${quals}${range}${w.twoHanded ? ', two-handed' : ''}, slots=${w.enchantSlots}`);
    }
  }
  if (category === 'all' || category === 'armor') {
    lines.push('');
    lines.push('ARMOUR:');
    for (const [name, a] of Object.entries(ARMOUR)) {
      lines.push(`  ${name}: DR=${a.damageReduction}, type=${a.type}, dodge penalty=${a.dodgePenalty}`);
    }
    lines.push('');
    lines.push('SHIELDS:');
    for (const [name, s] of Object.entries(SHIELDS)) {
      lines.push(`  ${name}: block=${s.blockChance}%, reduction=${Math.round(s.blockReduction * 100)}%, type=${s.type}, dodge penalty=${s.dodgePenalty}`);
    }
  }
  return lines.join('\n');
}

export function getEquipmentByCategory(category) {
  return Object.entries(EQUIPMENT)
    .filter(([, def]) => def.category === category)
    .map(([id, def]) => ({ id, ...def }));
}

/**
 * @param {string} category - key from EQUIPMENT_CATEGORIES
 * @returns {string} Compact lines for LLM / prompt injection
 */
export function formatEquipmentForPrompt(category) {
  const label = EQUIPMENT_CATEGORIES[category] ?? category;
  const rows = getEquipmentByCategory(category);
  if (!rows.length) return `${label}: (no entries)`;
  const lines = rows.map((e) => {
    const props = e.properties?.length ? ` [${e.properties.join('; ')}]` : '';
    return `- ${e.name} — ${formatCoinPrice(e.price)}; Enc ${e.weight}; ${e.availability}${props}. ${e.description}`;
  });
  return `${label}:\n${lines.join('\n')}`;
}
