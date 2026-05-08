/**
 * When the action field ends with `@` mention syntax (@ alone or @prefix) and exactly
 * one spell in character.spells.known matches, replace the tail with that spell name.
 * Covers the common case: only one custom spell known after invent-spell, user typed `@`
 * but did not pick from the chip list (Enter trapped / incomplete mention).
 */
export function resolveTrailingSpellAtMention(text, character) {
  const known = (character?.spells?.known || []).filter((n) => typeof n === 'string' && n.trim());
  if (known.length === 0) return text;

  const raw = String(text ?? '');
  const atPos = raw.lastIndexOf('@');
  if (atPos < 0) return text;

  const before = raw.slice(0, atPos);
  const afterAt = raw.slice(atPos + 1);

  if (before.length > 0 && !/\s$/.test(before)) return text;

  const q = afterAt.trim().toLowerCase();

  let candidates = known;
  if (q) {
    candidates = known.filter((n) => {
      const nl = n.toLowerCase();
      return nl.startsWith(q) || nl.includes(q);
    });
  }

  if (candidates.length !== 1) return text;

  const spell = candidates[0];
  const base = before.replace(/\s+$/, '');
  return base ? `${base} ${spell}` : spell;
}
