import { z } from 'zod';

export const TAG_KINDS = ['spell', 'item', 'npc', 'location'];

export const ActionTagSchema = z.object({
  kind: z.enum(TAG_KINDS),
  id: z.string().max(200),
  name: z.string().max(200),
  meta: z.record(z.unknown()).optional(),
});

export const EntityTagsSchema = z.array(ActionTagSchema).max(5);

export const TAG_COLORS = {
  spell:    { bg: 'bg-tertiary/20',      text: 'text-tertiary',     border: 'border-tertiary/30' },
  item:     { bg: 'bg-amber-500/20',     text: 'text-amber-300',    border: 'border-amber-500/30' },
  npc:      { bg: 'bg-sky-500/20',       text: 'text-sky-300',      border: 'border-sky-500/30' },
  location: { bg: 'bg-emerald-500/20',   text: 'text-emerald-300',  border: 'border-emerald-500/30' },
};

export const TAG_ICONS = {
  spell: 'auto_awesome',
  item: 'inventory_2',
  npc: 'person',
  location: 'place',
};

export const MAX_ENTITY_TAGS = 5;

export function deduplicateTags(tags) {
  const seen = new Set();
  return tags.filter((t) => {
    const key = `${t.kind}:${t.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function serializeTags(tags) {
  if (!tags || tags.length === 0) return [];
  return tags.map(({ kind, id, name, meta }) => ({
    kind, id, name,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  }));
}

export function segmentsToText(segments) {
  return segments
    .map((s) => (s.type === 'tag' ? s.tag.name : s.value))
    .join('');
}

export function segmentsToTags(segments) {
  return deduplicateTags(
    segments.filter((s) => s.type === 'tag').map((s) => s.tag),
  );
}

export function formatTagForPrompt(tag) {
  const parts = [tag.name];
  if (tag.meta?.tree) parts.push(`drzewo: ${tag.meta.tree}`);
  if (tag.meta?.manaCost != null) parts.push(`koszt: ${tag.meta.manaCost} many`);
  if (tag.meta?.role) parts.push(tag.meta.role);
  if (tag.meta?.locationType) parts.push(tag.meta.locationType);
  return `- ${tag.kind}: ${parts.join(', ')}`;
}
