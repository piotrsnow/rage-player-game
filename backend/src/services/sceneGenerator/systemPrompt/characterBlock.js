/**
 * PC character sheet line — attributes, skills with attribute lookup, mana,
 * spells, inventory, money, statuses. Skills render as
 * `skill:level→ATTR:value` so the premium model can total roll bases without
 * having to reference a separate skill→attribute table.
 */

import { SKILL_BY_NAME, SKILL_NAMES } from '../../diceResolver.js';
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

  const unownedSkills = SKILL_NAMES.filter((name) => {
    const v = character.skills?.[name];
    const level = v == null ? 0 : (typeof v === 'object' ? v.level : v);
    return level === 0;
  });
  if (unownedSkills.length) {
    lines.push(`Unlearned skills (level 0 — valid for skillsUsed when the action fits): ${unownedSkills.join(', ')}`);
  }

  lines.push(
    `Attributes: SIL:${a.sila || 0} INT:${a.inteligencja || 0} CHA:${a.charyzma || 0} ZRC:${a.zrecznosc || 0} WYT:${a.wytrzymalosc || 0} SZC:${a.szczescie || 0}`,
  );

  if (character.spells?.known?.length) {
    lines.push(`Known spells: ${character.spells.known.map((ref) => {
      if (ref.includes('_')) return `${ref}`;
      return ref;
    }).join(', ')}`);
  }
  if (Array.isArray(character.customSpells) && character.customSpells.length > 0) {
    const customLines = character.customSpells.map((cs) => {
      const parts = [cs.name];
      if (cs.school) parts.push(`[${cs.school}]`);
      parts.push(`${cs.manaCost} mana`);
      if (cs.description) parts.push(`— ${cs.description}`);
      return parts.join(' ');
    });
    lines.push(`Custom spells: ${customLines.join(', ')}`);
  }
  if (character.inventory?.length) {
    const isUniqueItem = (i) => {
      if (typeof i === 'string') return false;
      if (i.source === 'quest' || i.fromNpcId) return true;
      const uniqueTypes = new Set(['key', 'letter', 'artifact', 'scroll', 'relic', 'macguffin']);
      return uniqueTypes.has(i.type);
    };
    lines.push(`Inventory: ${character.inventory.map((i) => {
      if (typeof i === 'string') return i;
      const idTag = i.id ? ` [id: ${i.id}]` : '';
      const base = `${i.name} (${i.type})${idTag}`;
      return isUniqueItem(i) && i.description ? `${base} — ${i.description}` : base;
    }).join(', ')}`);
  }
  lines.push(`Money: ${formatMoney(character.money)}`);
  if (character.activeEffects?.length) {
    const fxLines = character.activeEffects.map((fx) => {
      const parts = [fx.name];
      if (fx.category) parts.push(`[${fx.category}]`);
      const dur = fx.duration;
      if (dur) {
        if (dur.type === 'rounds' && dur.remaining != null) parts.push(`${dur.remaining} rnd`);
        else if (dur.type === 'scenes' && dur.remaining != null) parts.push(`${dur.remaining} scenes`);
        else if (dur.type === 'permanent') parts.push('permanent');
        else if (dur.type === 'until_rest') parts.push('until rest');
        else if (dur.type === 'manual') parts.push('manual removal');
      }
      const m = fx.mechanics || {};
      const mechParts = [];
      if (m.attributeMods && Object.keys(m.attributeMods).length) {
        mechParts.push(Object.entries(m.attributeMods).map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`).join(','));
      }
      if (m.dotDamage) mechParts.push(`${m.dotDamage} dmg/tick`);
      if (m.dotHeal) mechParts.push(`+${m.dotHeal} heal/tick`);
      if (m.restrictions?.length) mechParts.push(m.restrictions.join(','));
      if (mechParts.length) parts.push(`(${mechParts.join('; ')})`);
      return parts.join(' ');
    });
    lines.push(`Active effects: ${fxLines.join(' | ')}`);
  } else if (character.statuses?.length) {
    lines.push(`Statuses: ${character.statuses.join(', ')}`);
  }

  if (Array.isArray(character.skillBadges) && character.skillBadges.length > 0) {
    const active = character.skillBadges.filter((b) => !b.redeemed).map((b) => b.name);
    const redeemed = character.skillBadges.filter((b) => b.redeemed).map((b) => b.name);
    if (active.length) lines.push(`Skill badges (earned, not yet redeemed): ${active.join(', ')}`);
    if (redeemed.length) lines.push(`Skill badges (redeemed): ${redeemed.join(', ')}`);
    lines.push('(When awarding a non-standard skill in skillsUsed, briefly praise the player\'s creative approach.)');
  }

  return lines.join('\n');
}
