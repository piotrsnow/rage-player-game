import { apiClient } from './apiClient';
import { aiCallLog } from '../stores/aiCallLogStore';

// FE wrapper around POST /v1/ai/npc-portrait-prompt. Returns the LLM-built
// English subject for the NPC's portrait, or '' if the call fails. Image
// generation never blocks on this call — callers fall back to the deterministic
// speciesGuess + buildPortraitPrompt template if `english` is empty.
//
// Cache: in-memory LRU keyed by stable NPC fields. force=true bypasses the
// cache (regenerate-portrait button) so each refresh produces a different
// concept, not just a different SD seed.

const CACHE_CAP = 200;
const cache = new Map();

function npcCacheKey(npc) {
  return [
    npc?.id || '',
    npc?.race || '',
    npc?.creatureKind || '',
    npc?.gender || '',
    npc?.role || '',
    npc?.personality || '',
    npc?.age ?? '',
    npc?.level ?? '',
  ].join('|');
}

function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  if (cache.size > CACHE_CAP) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function buildPayloadNpc(npc) {
  return {
    id: typeof npc?.id === 'string' ? npc.id : undefined,
    name: typeof npc?.name === 'string' ? npc.name : '',
    gender: typeof npc?.gender === 'string' ? npc.gender : null,
    race: typeof npc?.race === 'string' ? npc.race : null,
    creatureKind: typeof npc?.creatureKind === 'string' ? npc.creatureKind : null,
    role: typeof npc?.role === 'string' ? npc.role : null,
    personality: typeof npc?.personality === 'string' ? npc.personality : null,
    age: typeof npc?.age === 'number' || typeof npc?.age === 'string' ? npc.age : null,
    level: typeof npc?.level === 'number' ? npc.level : null,
  };
}

export async function buildNpcPortraitSubject(npc, { force = false } = {}) {
  if (!npc || typeof npc !== 'object' || typeof npc.name !== 'string' || !npc.name.trim()) {
    return '';
  }

  const key = npcCacheKey(npc);
  if (!force) {
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
  }

  const payloadNpc = buildPayloadNpc(npc);
  const logId = aiCallLog.start({
    type: 'npc-portrait-prompt',
    label: `NPC portrait prompt: ${payloadNpc.name.slice(0, 60)}`,
    provider: null,
    model: null,
  });
  try {
    const { english } = await apiClient.post('/ai/npc-portrait-prompt', {
      npc: payloadNpc,
      force,
    });
    const out = typeof english === 'string' && english.trim() ? english.trim() : '';
    if (out) cacheSet(key, out);
    aiCallLog.finish(logId, { npcName: payloadNpc.name, english: out });
    return out;
  } catch (e) {
    aiCallLog.fail(logId, e);
    return '';
  }
}
