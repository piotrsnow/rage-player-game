const TYPE_PHRASES = {
  player: 'heroic adventurer',
  ally: 'friendly companion',
  enemy: 'hostile creature or enemy',
};

const MAX_DESCRIPTION_CHARS = 300;
const MAX_TOTAL_CHARS = 500;

function clamp(text, max) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '\u2026';
}

function extractWeaponName(combatant) {
  if (combatant.equipped?.mainHand) {
    const item = (combatant.inventory || []).find(i => i.id === combatant.equipped.mainHand);
    if (item) return item.name;
  }
  const weapons = combatant.weapons || [];
  return weapons.map(w => typeof w === 'string' ? w : w.name).find(Boolean) || null;
}

function extractArmourName(combatant) {
  if (combatant.equipped?.armour) {
    const item = (combatant.inventory || []).find(i => i.id === combatant.equipped.armour);
    if (item) return item.name;
  }
  return combatant.equippedArmour || null;
}

/**
 * Build a PixelLab description for a combat character sprite.
 */
export function buildCombatSpriteDescription(combatant) {
  const parts = ['pixel art RPG character sprite, side-facing'];

  const typePhrase = TYPE_PHRASES[combatant.type] || TYPE_PHRASES.enemy;
  parts.push(typePhrase);

  if (combatant.name) {
    parts.push(`named "${clamp(combatant.name, 40)}"`);
  }

  if (combatant.species || combatant.race) {
    parts.push(combatant.species || combatant.race);
  }

  if (combatant.gender) {
    parts.push(combatant.gender);
  }

  const weapon = extractWeaponName(combatant);
  if (weapon) {
    parts.push(`wielding ${clamp(weapon, 40)}`);
  }

  const armour = extractArmourName(combatant);
  if (armour) {
    parts.push(`wearing ${clamp(armour, 40)}`);
  }

  const traits = combatant.traits || [];
  if (traits.length > 0) {
    parts.push(clamp(traits.slice(0, 3).join(', '), 60));
  }

  if (combatant.description) {
    parts.push(clamp(combatant.description, MAX_DESCRIPTION_CHARS));
  }

  parts.push('. Transparent background, single color black outline, fantasy style');

  let result = parts.join(', ');
  if (result.length > MAX_TOTAL_CHARS) {
    result = result.slice(0, MAX_TOTAL_CHARS - 1) + '\u2026';
  }
  return result;
}

/**
 * Build a cache key for sprite lookup/storage.
 * Uses name + type + weapon + armour to fingerprint visual identity.
 */
export function buildSpriteCacheKey(combatant) {
  const parts = [
    combatant.name?.toLowerCase().trim() || 'unknown',
    combatant.type || 'enemy',
    extractWeaponName(combatant)?.toLowerCase().trim() || '',
    extractArmourName(combatant)?.toLowerCase().trim() || '',
  ];
  return `combat-sprite:${parts.join(':')}`;
}
