/**
 * PC character sheet line — attributes, skills with attribute lookup, mana,
 * spells, inventory, money, statuses. Skills render as
 * `skill:level→ATTR:value` so the premium model can total roll bases without
 * having to reference a separate skill→attribute table.
 */

import { SKILL_BY_NAME } from '../../diceResolver.js';
import { formatMoney } from '../labels.js';

const ATTR_SHORT = {
  sila: 'SIL',
  inteligencja: 'INT',
  charyzma: 'CHA',
  zrecznosc: 'ZRC',
  wytrzymalosc: 'WYT',
  szczescie: 'SZC',
};

export function buildCharacterBlock(character) {
  const a = character.attributes || {};
  const mana = character.mana || { current: 0, max: 0 };
  const lines = [
    `PC: ${character.name || 'Unknown'} (${character.species || 'Human'})`,
    `Wounds: ${character.wounds ?? 0}/${character.maxWounds ?? 0} | Mana: ${mana.current}/${mana.max}`,
    `Level: ${character.characterLevel || 1}`,
  ];

  if (character.skills && Object.keys(character.skills).length > 0) {
    const skillEntries = Object.entries(character.skills)
      .filter(([, v]) => (typeof v === 'object' ? v.level : v) > 0)
      .map(([name, v]) => {
        const level = typeof v === 'object' ? v.level : v;
        const skill = SKILL_BY_NAME[name];
        const attrKey = skill?.attribute;
        const attrVal = attrKey ? (a[attrKey] || 0) : '?';
        const short = ATTR_SHORT[attrKey] || '?';
        return `${name}:${level}→${short}:${attrVal}`;
      });
    if (skillEntries.length) lines.push(`Skills (skill:level→ATTR:value): ${skillEntries.join(', ')}`);
  }

  lines.push(
    `Attributes: SIL:${a.sila || 0} INT:${a.inteligencja || 0} CHA:${a.charyzma || 0} ZRC:${a.zrecznosc || 0} WYT:${a.wytrzymalosc || 0} SZC:${a.szczescie || 0}`,
  );

  if (character.spells?.known?.length) {
    lines.push(`Known spells: ${character.spells.known.join(', ')}`);
  }
  if (character.inventory?.length) {
    // Pełne opisy tylko dla quest/MacGuffin itemów (source='quest', fromNpcId,
    // lub unique typy). Seed equipment (weapon/armor/gear) renderujemy zwięźle —
    // model i tak prawie nigdy nie używa flavor description seed-itemów, a to
    // ~400-500 znaków per scena w typowej kampanii.
    const isUniqueItem = (i) => {
      if (typeof i === 'string') return false;
      if (i.source === 'quest' || i.fromNpcId) return true;
      // unique story types — MacGuffins, scrolls, keys, letters, artifacts
      const uniqueTypes = new Set(['key', 'letter', 'artifact', 'scroll', 'relic', 'macguffin']);
      return uniqueTypes.has(i.type);
    };
    lines.push(`Inventory: ${character.inventory.map((i) => {
      if (typeof i === 'string') return i;
      const base = `${i.name} (${i.type})`;
      return isUniqueItem(i) && i.description ? `${base} — ${i.description}` : base;
    }).join(', ')}`);
  }
  lines.push(`Money: ${formatMoney(character.money)}`);
  if (character.statuses?.length) lines.push(`Statuses: ${character.statuses.join(', ')}`);

  if (Array.isArray(character.skillBadges) && character.skillBadges.length > 0) {
    const active = character.skillBadges.filter((b) => !b.redeemed).map((b) => b.name);
    const redeemed = character.skillBadges.filter((b) => b.redeemed).map((b) => b.name);
    if (active.length) lines.push(`Skill badges (earned, not yet redeemed): ${active.join(', ')}`);
    if (redeemed.length) lines.push(`Skill badges (redeemed): ${redeemed.join(', ')}`);
    lines.push('(When awarding a non-standard skill in skillsUsed, briefly praise the player\'s creative approach.)');
  }

  return lines.join('\n');
}
