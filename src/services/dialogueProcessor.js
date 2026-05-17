import { hasNamedSpeaker } from './dialogueSegments.js';
import { resolveVoiceForCharacter, pickRandomVoiceForGender } from './characterVoiceResolver.js';

export {
  demoteAnonymousDialogueSegments,
  normalizeIncomingDialogueSegments,
  mergeNpcHintsFromDialogue,
  introduceUnknownSpeakers,
} from '../../shared/domain/dialogueProcessor.js';

export function enrichDialogueSpeakers({
  segments,
  stateChanges,
  worldNpcs = [],
  characterVoiceMap = {},
  voicePools = {},
  playerNames = [],
  currentLocation = '',
  dispatch,
}) {
  const { maleVoices = [], femaleVoices = [], narratorVoiceId = null, ttsProvider = null } = voicePools;
  const knownVoiceIds = new Set([
    ...(maleVoices || []).map((v) => v.voiceId),
    ...(femaleVoices || []).map((v) => v.voiceId),
    ...(narratorVoiceId ? [narratorVoiceId] : []),
  ].filter(Boolean));
  const isKnownVoice = (id) => knownVoiceIds.has(id);
  const source = Array.isArray(segments) ? segments : [];
  if (source.length === 0) {
    return { segments: source, stateChanges: stateChanges || {} };
  }

  const nextStateChanges = { ...(stateChanges || {}) };
  const npcChanges = Array.isArray(nextStateChanges.npcs) ? [...nextStateChanges.npcs] : [];
  const existingNpcChangeNames = new Set(
    npcChanges
      .map((npc) => (typeof npc?.name === 'string' ? npc.name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  const validGender = (g) => (g === 'male' || g === 'female' ? g : null);
  const worldNpcGenderByName = new Map();
  for (const npc of Array.isArray(worldNpcs) ? worldNpcs : []) {
    if (typeof npc?.name !== 'string') continue;
    const key = npc.name.trim().toLowerCase();
    if (!key) continue;
    const g = validGender(npc.gender);
    if (g) worldNpcGenderByName.set(key, g);
  }
  const stateChangeGenderByName = new Map();
  for (const npc of npcChanges) {
    if (typeof npc?.name !== 'string') continue;
    const key = npc.name.trim().toLowerCase();
    if (!key) continue;
    const g = validGender(npc.gender);
    if (g) stateChangeGenderByName.set(key, g);
  }
  const knownNpcNames = new Set(
    (Array.isArray(worldNpcs) ? worldNpcs : [])
      .map((npc) => (typeof npc?.name === 'string' ? npc.name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  const playerNameSet = new Set(
    (Array.isArray(playerNames) ? playerNames : [])
      .map((name) => (typeof name === 'string' ? name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  const localVoiceMap = { ...(characterVoiceMap || {}) };
  const nextSegments = source.map((segment) => {
    if (!segment || segment.type !== 'dialogue') return segment;
    if (!hasNamedSpeaker(segment.character)) return segment;

    const speakerName = String(segment.character || '').trim();
    if (!speakerName) return segment;
    const speakerKey = speakerName.toLowerCase();
    if (playerNameSet.has(speakerKey)) return segment;

    const trustedGender =
      worldNpcGenderByName.get(speakerKey) ||
      stateChangeGenderByName.get(speakerKey) ||
      validGender(segment.gender);
    const speakerGender = trustedGender;
    const hasKnownNpc = knownNpcNames.has(speakerKey) || existingNpcChangeNames.has(speakerKey);

    const existingVoice = localVoiceMap[speakerName]?.voiceId;
    let voiceId = (existingVoice && isKnownVoice(existingVoice)) ? existingVoice : null;
    if (!voiceId) {
      if (hasKnownNpc) {
        voiceId = resolveVoiceForCharacter(
          speakerName,
          speakerGender,
          localVoiceMap,
          { maleVoices, femaleVoices, narratorVoiceId, ttsProvider },
          dispatch
        ) || voiceId;
      } else {
        voiceId = pickRandomVoiceForGender(speakerGender, { maleVoices, femaleVoices }) || voiceId;
        if (voiceId) {
          dispatch?.({
            type: 'MAP_CHARACTER_VOICE',
            payload: { characterName: speakerName, voiceId, gender: speakerGender, ttsProvider },
          });
        }
      }
      if (voiceId) {
        localVoiceMap[speakerName] = { voiceId, gender: speakerGender || null };
      }
    }

    if (!voiceId) {
      console.warn('[voice] Failed to assign voice for speaker', {
        speaker: speakerName,
        gender: speakerGender || 'unknown',
        knownNpc: hasKnownNpc,
        maleVoices: maleVoices.length,
        femaleVoices: femaleVoices.length,
      });
      return segment;
    }
    return {
      ...segment,
      voiceId,
      ...(speakerGender ? { gender: speakerGender } : {}),
    };
  });

  if (npcChanges.length > 0) {
    nextStateChanges.npcs = npcChanges;
  }

  return {
    segments: nextSegments,
    stateChanges: nextStateChanges,
  };
}
