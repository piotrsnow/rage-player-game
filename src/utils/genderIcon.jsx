/**
 * Unicode Mars/Venus glyph for NPC gender display.
 *
 * Used in the World State modal (BN-y list) and inline next to NPC names
 * in chat dialogue segments. Returns `null` when gender is unknown/missing
 * so callers can drop the slot silently instead of reserving whitespace.
 *
 * Kept deliberately tiny — no imports, no variants, no size props. If we
 * ever need bigger/coloured variants, extend via `className` at the callsite.
 */
export function GenderIcon({ gender, className = 'text-[11px] text-outline/70' }) {
  if (gender !== 'male' && gender !== 'female') return null;
  const glyph = gender === 'male' ? '\u2642' : '\u2640';
  const label = gender === 'male' ? 'male' : 'female';
  return (
    <span className={className} aria-label={label} title={label}>
      {glyph}
    </span>
  );
}
