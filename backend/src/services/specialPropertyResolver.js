import { prisma } from '../lib/prisma.js';

const ALLOWED_COLORS = new Set([
  'fire', 'frost', 'lightning', 'poison', 'arcane', 'shadow',
  'holy', 'nature', 'blood', 'physical', 'neutral',
]);

function normalizeColor(raw) {
  if (typeof raw === 'string' && ALLOWED_COLORS.has(raw.toLowerCase())) return raw.toLowerCase();
  return 'neutral';
}

const STANDALONE_REPLACEMENTS = { 'ł': 'l', 'Ł': 'l' };

function slugify(value) {
  let s = String(value || '');
  for (const [from, to] of Object.entries(STANDALONE_REPLACEMENTS)) {
    s = s.split(from).join(to);
  }
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    || 'unnamed';
}

/**
 * Hybrid match-or-create resolver.
 *
 * Takes raw LLM output `[{ name, description }, ...]` and returns
 * `[{ id }, ...]` referencing the global `SpecialProperty` table.
 *
 * 1. Slugify each name.
 * 2. Batch-fetch existing rows by slug.
 * 3. For each missing slug: if description is non-empty, create a new row.
 * 4. Return only successfully resolved entries.
 */
export async function resolveSpecialProperties(rawList) {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  const entries = rawList
    .filter((e) => e && typeof e.name === 'string' && e.name.trim())
    .slice(0, 8)
    .map((e) => ({
      slug: slugify(e.name),
      name: e.name.trim(),
      description: typeof e.description === 'string' ? e.description.trim() : '',
      color: normalizeColor(e.color),
    }));

  if (entries.length === 0) return [];

  const slugs = [...new Set(entries.map((e) => e.slug))];
  const existing = await prisma.specialProperty.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const bySlug = new Map(existing.map((r) => [r.slug, r.id]));

  const results = [];
  const seen = new Set();

  for (const entry of entries) {
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);

    if (bySlug.has(entry.slug)) {
      results.push({ id: bySlug.get(entry.slug) });
      continue;
    }

    if (!entry.description) continue;

    try {
      const row = await prisma.specialProperty.create({
        data: { slug: entry.slug, name: entry.name, description: entry.description, color: entry.color },
        select: { id: true },
      });
      results.push({ id: row.id });
      bySlug.set(entry.slug, row.id);
    } catch (err) {
      if (err?.code === 'P2002') {
        const fallback = await prisma.specialProperty.findUnique({
          where: { slug: entry.slug },
          select: { id: true },
        });
        if (fallback) results.push({ id: fallback.id });
      }
    }
  }

  return results;
}
