/**
 * Stable keys for inventory items and materials.
 * Used as composite-PK component on Postgres tables (F4) so the same
 * helper has to live in both FE and BE.
 *
 * Items/materials stack by lowercased + ASCII-slugged name. Two items
 * with the same name merge into one stack regardless of `props` —
 * intentional simplification (F4 decision: option A).
 */

// Polish letters that don't decompose via NFKD (most do; Ł/ł and a few others
// don't because they're standalone codepoints, not base+combining).
const STANDALONE_REPLACEMENTS = { 'ł': 'l', 'Ł': 'l' };

export function slugifyItemName(value) {
  let s = String(value || '');
  for (const [from, to] of Object.entries(STANDALONE_REPLACEMENTS)) {
    s = s.split(from).join(to);
  }
  const slug = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
  return slug || 'unnamed';
}
