/**
 * PixelLab prompt for small RPG map-token sprites (location graph orbits).
 * Separate from painted portraits (`portraitUrl`) and combat sprites cache keys.
 */

const MAX_TOTAL_CHARS = 520;

function clamp(text, max) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '\u2026';
}

/**
 * @param {object} entity — Character | CampaignNPC | WorldNPC row subset
 * @param {'character'|'campaign-npc'|'world-npc'} kind
 */
export function buildCharacterSpriteDescription(entity, kind) {
  const parts = ['pixel art RPG character sprite, front-facing or slight three-quarter view, suitable as a small map token'];

  if (kind === 'character') {
    parts.push('heroic adventurer player character');
  } else {
    parts.push(`NPC archetype: ${clamp(entity.category || 'commoner', 40)}`);
    if (entity.role) parts.push(`role ${clamp(entity.role, 50)}`);
  }

  if (entity.name) parts.push(`named "${clamp(entity.name, 48)}"`);

  const raceLine = entity.species || entity.race || entity.creatureKind;
  if (raceLine) parts.push(clamp(raceLine, 48));

  if (entity.gender && entity.gender !== 'unknown') {
    parts.push(clamp(entity.gender, 24));
  }

  parts.push('. Fantasy style, transparent background, single color black outline');

  let result = parts.join(', ');
  if (result.length > MAX_TOTAL_CHARS) {
    result = result.slice(0, MAX_TOTAL_CHARS - 1) + '\u2026';
  }
  return result;
}
