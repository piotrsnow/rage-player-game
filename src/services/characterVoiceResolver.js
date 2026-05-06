import { hasNamedSpeaker } from './dialogueSegments';

// Guard rail: warn ONCE per gender key per session so we surface
// configuration problems ("no male/female voices tagged in DM settings")
// without spamming the console every scene.
const warnedEmptyPools = new Set();
function warnEmptyPool(gender, maleCount, femaleCount) {
  const key = gender || 'any';
  if (warnedEmptyPools.has(key)) return;
  warnedEmptyPools.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[voice] No voices available for gender="${gender || 'unknown'}" `
    + `(maleVoices=${maleCount}, femaleVoices=${femaleCount}). `
    + 'Tag at least one voice as male AND one as female in Settings → Audio.'
  );
}

/** When pools were empty we persisted narrator as the NPC voice; re-pick once real voices exist. */
export function shouldReplaceNarratorVoiceMapping(
  gender,
  persistedVoiceId,
  narratorVoiceId,
  { maleVoices = [], femaleVoices = [] } = {},
) {
  if (!narratorVoiceId || !persistedVoiceId || persistedVoiceId !== narratorVoiceId) return false;
  if (gender === 'female') return femaleVoices.length > 0;
  if (gender === 'male') return maleVoices.length > 0;
  return maleVoices.length > 0 || femaleVoices.length > 0;
}

/**
 * Resolves a voice for an NPC/character by name.
 *
 * - Existing mapping in `characterVoiceMap` wins unless it is the narrator
 *   fallback and a matching gender pool now has voices (then we re-pick).
 * - For a new NPC, picks a random unused voice from the matching gender pool.
 * - Unknown gender falls back to the full pool (male + female), then narrator.
 * - Persists the picked voice via `MAP_CHARACTER_VOICE` dispatch.
 */
export function resolveVoiceForCharacter(
  characterName,
  gender,
  characterVoiceMap = {},
  { maleVoices = [], femaleVoices = [], narratorVoiceId = null, ttsProvider = null } = {},
  dispatch = null
) {
  if (!characterName) return null;

  const allPoolIds = new Set([
    ...maleVoices.map((v) => v.voiceId),
    ...femaleVoices.map((v) => v.voiceId),
    ...(narratorVoiceId ? [narratorVoiceId] : []),
  ].filter(Boolean));

  const persisted = characterVoiceMap[characterName];
  if (
    persisted?.voiceId
    && allPoolIds.has(persisted.voiceId)
    && !shouldReplaceNarratorVoiceMapping(
      gender,
      persisted.voiceId,
      narratorVoiceId,
      { maleVoices, femaleVoices },
    )
  ) return persisted.voiceId;

  const pool = gender === 'female'
    ? femaleVoices
    : gender === 'male'
    ? maleVoices
    : [...maleVoices, ...femaleVoices];

  if (!pool.length) {
    warnEmptyPool(gender, maleVoices.length, femaleVoices.length);
    return narratorVoiceId || null;
  }

  const used = new Set(Object.values(characterVoiceMap).map((e) => e.voiceId).filter(Boolean));
  const unused = pool.filter((v) => !used.has(v.voiceId));
  const candidates = unused.length ? unused : pool;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  if (!chosen?.voiceId) return narratorVoiceId || null;

  dispatch?.({
    type: 'MAP_CHARACTER_VOICE',
    payload: { characterName, voiceId: chosen.voiceId, gender: gender || null, ttsProvider: ttsProvider || null },
  });

  return chosen.voiceId;
}

/** Pick a random voice from the matching gender pool without persisting. Used when no name is available. */
export function pickRandomVoiceForGender(gender, { maleVoices = [], femaleVoices = [] } = {}) {
  const pool = gender === 'female'
    ? femaleVoices
    : gender === 'male'
    ? maleVoices
    : [...maleVoices, ...femaleVoices];
  if (!pool.length) {
    warnEmptyPool(gender, maleVoices.length, femaleVoices.length);
    return null;
  }
  return pool[Math.floor(Math.random() * pool.length)]?.voiceId || null;
}

export const isVoiceNotFoundError = (err) => /voice not found/i.test(err?.message || '');

/**
 * Re-assigns a voice after a "Voice not found" TTS error.
 * Picks a new voice from the gender-appropriate pool (excluding the invalid ID),
 * persists via MAP_CHARACTER_VOICE with byProvider tracking, and returns the new voiceId.
 * Returns null if no replacement is available.
 */
export function reassignVoiceOnError(
  characterName,
  invalidVoiceId,
  gender,
  characterVoiceMap = {},
  { maleVoices = [], femaleVoices = [], narratorVoiceId = null, ttsProvider = null } = {},
  dispatch = null
) {
  const pool = gender === 'female'
    ? femaleVoices
    : gender === 'male'
    ? maleVoices
    : [...maleVoices, ...femaleVoices];

  const validPool = pool.filter((v) => v.voiceId && v.voiceId !== invalidVoiceId);
  if (!validPool.length) {
    return narratorVoiceId && narratorVoiceId !== invalidVoiceId ? narratorVoiceId : null;
  }

  const used = new Set(
    Object.values(characterVoiceMap).map((e) => e.voiceId).filter((id) => id && id !== invalidVoiceId)
  );
  const unused = validPool.filter((v) => !used.has(v.voiceId));
  const candidates = unused.length ? unused : validPool;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  if (!chosen?.voiceId) return null;

  if (characterName && dispatch) {
    dispatch({
      type: 'MAP_CHARACTER_VOICE',
      payload: { characterName, voiceId: chosen.voiceId, gender: gender || null, ttsProvider: ttsProvider || null },
    });
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[voice] Reassigned voice for "${characterName}": ${invalidVoiceId} → ${chosen.voiceId} (provider=${ttsProvider})`
  );

  return chosen.voiceId;
}

/**
 * Resolves the voiceId for one TTS segment under the active provider, in order:
 *   1. seg.voiceId — if it belongs to the current provider's pool and isn't a
 *      narrator-fallback that should be replaced now that real voices exist.
 *   2. characterVoiceMap[name].byProvider[ttsProvider].voiceId — honors the
 *      user's previous choice for this provider (XTTS speaker stays after
 *      switching providers and back).
 *   3. characterVoiceMap[name].voiceId — legacy single-provider data, only if
 *      it's still in the pool.
 *   4. resolveVoiceForCharacter — picks new + persists via dispatch.
 *   5. defaultVoiceId — narrator fallback.
 *
 * Returns { voiceId, persistMapping } so callers (useNarrator) can mirror the
 * dispatch into a per-scene local map (write-through cache, prevents the same
 * NPC being routed to a different voice across consecutive lines while the
 * MAP_CHARACTER_VOICE reducer is async).
 */
export function resolveSegmentVoice(seg, {
  defaultVoiceId,
  narratorVoiceId,
  maleVoices = [],
  femaleVoices = [],
  characterVoiceMap = {},
  ttsProvider = null,
  viewerMode = false,
  dispatch = null,
} = {}) {
  if (!seg) return { voiceId: defaultVoiceId, persistMapping: null };

  const knownVoiceIds = new Set([
    ...maleVoices.map((v) => v.voiceId),
    ...femaleVoices.map((v) => v.voiceId),
    ...(narratorVoiceId ? [narratorVoiceId] : []),
  ].filter(Boolean));
  const isKnownVoice = (id) => !!id && knownVoiceIds.has(id);

  const persisted = characterVoiceMap[seg.character];
  const mappedGender = persisted?.gender ?? seg.gender ?? null;

  // 1. Segment already has a voiceId — trust it if valid for current pool.
  if (isKnownVoice(seg.voiceId)
    && !shouldReplaceNarratorVoiceMapping(mappedGender, seg.voiceId, narratorVoiceId, { maleVoices, femaleVoices })
  ) {
    return { voiceId: seg.voiceId, persistMapping: null };
  }

  if (seg.type === 'dialogue' && hasNamedSpeaker(seg.character)) {
    // 2. Per-provider mapping — survives switching providers and back.
    const byProviderId = persisted?.byProvider?.[ttsProvider]?.voiceId;
    if (isKnownVoice(byProviderId)
      && !shouldReplaceNarratorVoiceMapping(mappedGender, byProviderId, narratorVoiceId, { maleVoices, femaleVoices })
    ) {
      return { voiceId: byProviderId, persistMapping: null };
    }

    // 3. Legacy top-level voiceId (pre-byProvider data).
    if (isKnownVoice(persisted?.voiceId)
      && !shouldReplaceNarratorVoiceMapping(mappedGender, persisted.voiceId, narratorVoiceId, { maleVoices, femaleVoices })
    ) {
      return { voiceId: persisted.voiceId, persistMapping: null };
    }

    // 4. Pick a new voice (resolveVoiceForCharacter dispatches MAP_CHARACTER_VOICE).
    if (!viewerMode) {
      const mapped = resolveVoiceForCharacter(
        seg.character,
        mappedGender,
        characterVoiceMap,
        { maleVoices, femaleVoices, narratorVoiceId, ttsProvider },
        dispatch,
      );
      if (mapped) {
        return {
          voiceId: mapped,
          persistMapping: { characterName: seg.character, voiceId: mapped, gender: mappedGender || null },
        };
      }
    }
  }

  // 5. Narrator fallback.
  return { voiceId: defaultVoiceId, persistMapping: null };
}
