// Shared state validation helpers — single source of truth for frontend + backend stateValidators

import { prefixedId } from './ids.js';

// ── State change limits ──

export const STATE_CHANGE_LIMITS = {
  maxXpPerScene: 500,
  maxItemsPerScene: 3,
  maxWoundsDelta: 20,
  needsDeltaMin: -30,
  needsDeltaMax: 100,
  maxMoneyGainCopper: 500, // 5 ZK equivalent
  maxDispositionDelta: 10,
  maxCodexPerScene: 3,
  maxCodexFragmentLength: 1000,
};

// ── Utilities ──

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function moneyToCopper(m) {
  return (m.gold || 0) * 100 + (m.silver || 0) * 10 + (m.copper || 0);
}

export function createItemId() {
  return prefixedId('item', 4);
}

// ── NPC Name Sanitization ──

const GENERIC_NPC_NAME_TOKENS = new Set([
  'npc', 'npcs', 'unknown', 'unknown npc', 'someone', 'somebody',
  'person', 'character', 'speaker', 'narrator', 'voice',
  'głos', 'glos', 'gm', 'dm', 'ai', 'bot',
  'none', 'null', 'undefined', '?', '-', '_', '...', '???', 'tbd',
  'name', 'npc name',
]);

const PLACEHOLDER_NPC_PATTERN = /^(?:npc|character|speaker|unknown)\s*\d*$/i;
const ANONYMOUS_SPEAKER_WORD_PATTERN = /\b(?:głos|glos|voice|whisper|szept|shout|krzyk)\b/i;
const SPEAKER_SOURCE_PATTERN = /\b(?:zza|spod|znad|spoza|from|behind|inside|outside|beyond)\b/i;

export function normalizeNpcNameToken(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[.:;!?()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSuspiciousNpcName(name) {
  const normalized = normalizeNpcNameToken(name);
  if (!normalized) return true;
  if (GENERIC_NPC_NAME_TOKENS.has(normalized)) return true;
  if (PLACEHOLDER_NPC_PATTERN.test(normalized)) return true;
  if (normalized.length < 2) return true;
  if (ANONYMOUS_SPEAKER_WORD_PATTERN.test(normalized) && SPEAKER_SOURCE_PATTERN.test(normalized)) {
    return true;
  }
  if (/^(?:głos|glos|voice)\s+/.test(normalized)) return true;
  return false;
}

export function sanitizeNpcChanges(npcs, corrections, prefix = '') {
  if (!Array.isArray(npcs)) return npcs;
  const filtered = [];
  for (const npc of npcs) {
    const rawName = typeof npc?.name === 'string' ? npc.name.trim() : '';
    if (isSuspiciousNpcName(rawName)) {
      const display = rawName || '(empty)';
      corrections.push(`${prefix}Suspicious NPC name removed: "${display}"`);
      continue;
    }
    filtered.push(npc);
  }
  return filtered;
}

// ── Item Normalization ──

export function isAllowedItemImageUrl(value) {
  if (typeof value !== 'string') return false;
  return value.startsWith('/media/') || value.startsWith('http://') || value.startsWith('https://');
}

export function normalizeItemType(value) {
  if (typeof value !== 'string' || !value.trim()) return 'misc';
  return value.trim().toLowerCase();
}

export function normalizeItemRarity(value) {
  if (typeof value !== 'string' || !value.trim()) return 'common';
  return value.trim().toLowerCase();
}

export function normalizeItemEntry(rawItem, index = 0) {
  if (typeof rawItem === 'string') {
    const name = rawItem.trim();
    if (!name) return null;
    return {
      id: createItemId(),
      name,
      type: 'misc',
      rarity: 'common',
    };
  }
  if (!rawItem || typeof rawItem !== 'object') return null;

  const name = String(
    rawItem.name
    || rawItem.itemName
    || rawItem.title
    || rawItem.label
    || ''
  ).trim();
  if (!name) return null;

  const itemIdCandidate = String(rawItem.id || rawItem.itemId || '').trim();
  const quantity = Number(rawItem.quantity);
  const hasQuantity = Number.isFinite(quantity) && quantity > 0;

  return {
    ...rawItem,
    id: itemIdCandidate || createItemId(),
    name,
    type: normalizeItemType(rawItem.type),
    rarity: normalizeItemRarity(rawItem.rarity),
    ...(hasQuantity ? { quantity: Math.max(1, Math.floor(quantity)) } : {}),
    _idx: index,
  };
}

export function normalizeItemList(rawItems, corrections, prefix = '') {
  if (!Array.isArray(rawItems)) return [];
  const normalized = [];
  for (let idx = 0; idx < rawItems.length; idx += 1) {
    const item = normalizeItemEntry(rawItems[idx], idx);
    if (!item) {
      corrections.push(`${prefix}Removed invalid item entry at index ${idx}`);
      continue;
    }
    const { _idx, ...finalItem } = item;
    normalized.push(finalItem);
  }
  return normalized;
}

export function coerceItemAliases(validated) {
  const addAliases = [
    'itemsAdded', 'itemsGained', 'inventoryAdded',
    'inventoryAdd', 'acquiredItems', 'gainedItems',
  ];
  const removeAliases = [
    'itemsRemoved', 'removedItems', 'inventoryRemoved',
    'inventoryRemove', 'lostItems',
  ];

  if (!Array.isArray(validated.newItems)) {
    for (const key of addAliases) {
      if (Array.isArray(validated[key])) {
        validated.newItems = validated[key];
        break;
      }
    }
  }
  if (!Array.isArray(validated.removeItems)) {
    for (const key of removeAliases) {
      if (Array.isArray(validated[key])) {
        validated.removeItems = validated[key];
        break;
      }
    }
  }
}

export function sanitizeInventoryItems(items, corrections, prefix = '') {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    if (typeof item.imageUrl !== 'string') return item;

    const imageUrl = item.imageUrl.trim();
    if (!imageUrl) {
      const { imageUrl: _removed, ...rest } = item;
      return rest;
    }
    if (imageUrl.startsWith('data:')) {
      corrections.push(`${prefix}Removed base64 imageUrl from item "${item.name || item.id || 'unknown'}"`);
      const { imageUrl: _removed, ...rest } = item;
      return rest;
    }
    if (!isAllowedItemImageUrl(imageUrl)) {
      corrections.push(`${prefix}Removed unsupported imageUrl from item "${item.name || item.id || 'unknown'}"`);
      const { imageUrl: _removed, ...rest } = item;
      return rest;
    }
    if (imageUrl === item.imageUrl) return item;
    return { ...item, imageUrl };
  });
}

// ── Codex Normalization ──

export function toSafeCodexId(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return '';
}

export function buildCodexIdFromName(name) {
  const safeName = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!safeName) return '';
  const slug = safeName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug ? `codex_${slug}` : '';
}

export function normalizeCodexUpdates(codexUpdates, corrections, prefix = '') {
  if (!Array.isArray(codexUpdates)) return [];

  const normalized = [];
  for (const raw of codexUpdates) {
    if (!raw || typeof raw !== 'object') {
      corrections.push(`${prefix}Invalid codex update removed (not an object)`);
      continue;
    }

    const fragmentContent = typeof raw.fragment?.content === 'string'
      ? raw.fragment.content.trim()
      : '';
    if (!fragmentContent) {
      corrections.push(`${prefix}Invalid codex update removed (missing fragment.content)`);
      continue;
    }

    const normalizedName = typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : (typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().replace(/^codex[_-]?/i, '') : 'Unknown entry');
    const normalizedId = toSafeCodexId(raw.id) || buildCodexIdFromName(normalizedName) || prefixedId('codex', 5);

    const normalizedSource = typeof raw.fragment?.source === 'string' && raw.fragment.source.trim()
      ? raw.fragment.source.trim()
      : 'Narrator';
    if (!raw.fragment?.source || !String(raw.fragment.source).trim()) {
      corrections.push(`${prefix}Codex update "${normalizedName}" missing fragment.source - defaulted to "Narrator"`);
    }

    normalized.push({
      ...raw,
      id: normalizedId,
      name: normalizedName,
      category: raw.category || 'concept',
      fragment: {
        ...raw.fragment,
        content: fragmentContent,
        source: normalizedSource,
        aspect: raw.fragment?.aspect || 'description',
      },
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      relatedEntries: Array.isArray(raw.relatedEntries) ? raw.relatedEntries : [],
    });
  }

  return normalized;
}
