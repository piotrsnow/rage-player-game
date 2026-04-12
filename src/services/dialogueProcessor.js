import { hasNamedSpeaker } from './dialogueSegments.js';
import { resolveVoiceForCharacter, pickRandomVoiceForGender } from './characterVoiceResolver.js';

export function demoteAnonymousDialogueSegments(segments) {
  return (segments || []).map((seg) => {
    if (seg?.type !== 'dialogue') return seg;
    if (hasNamedSpeaker(seg?.character)) return seg;
    const text = String(seg?.text || '').trim();
    if (!text) return null;
    return {
      ...seg,
      type: 'dialogue',
      character: 'NPC',
      text,
    };
  }).filter((seg) => typeof seg?.text === 'string' && seg.text.trim());
}

export function normalizeIncomingDialogueSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map((segment) => {
    if (!segment || typeof segment !== 'object') return segment;
    if (segment.type !== 'dialogue') return segment;

    const character = typeof segment.character === 'string' ? segment.character.trim() : '';
    const speaker = typeof segment.speaker === 'string' ? segment.speaker.trim() : '';
    if (character) return segment;
    if (!speaker) return segment;

    return {
      ...segment,
      character: speaker,
    };
  });
}

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
  const { maleVoices = [], femaleVoices = [], narratorVoiceId = null } = voicePools;
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
  const nextSegments = source.map((segment) => {
    if (!segment || segment.type !== 'dialogue') return segment;
    if (!hasNamedSpeaker(segment.character)) return segment;

    const speakerName = String(segment.character || '').trim();
    if (!speakerName) return segment;
    const speakerKey = speakerName.toLowerCase();
    if (playerNameSet.has(speakerKey)) return segment;

    const speakerGender = segment.gender === 'male' || segment.gender === 'female'
      ? segment.gender
      : null;
    const hasKnownNpc = knownNpcNames.has(speakerKey) || existingNpcChangeNames.has(speakerKey);

    let voiceId = characterVoiceMap?.[speakerName]?.voiceId || null;
    if (hasKnownNpc) {
      voiceId = resolveVoiceForCharacter(
        speakerName,
        speakerGender,
        characterVoiceMap,
        { maleVoices, femaleVoices, narratorVoiceId },
        dispatch
      ) || voiceId;
    } else {
      voiceId = pickRandomVoiceForGender(speakerGender, { maleVoices, femaleVoices }) || voiceId;
      if (voiceId) {
        dispatch?.({
          type: 'MAP_CHARACTER_VOICE',
          payload: { characterName: speakerName, voiceId, gender: speakerGender },
        });
      }
      if (!existingNpcChangeNames.has(speakerKey)) {
        npcChanges.push({
          action: 'introduce',
          name: speakerName,
          ...(speakerGender ? { gender: speakerGender } : {}),
          ...(currentLocation ? { location: currentLocation } : {}),
        });
        existingNpcChangeNames.add(speakerKey);
      }
    }

    if (!voiceId) return segment;
    return {
      ...segment,
      voiceId,
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

export function mergeNpcHintsFromDialogue(stateChanges, dialogueSegments, worldNpcs, { currentLocation = '', playerName = '' } = {}) {
  const next = { ...(stateChanges || {}) };
  const existingNpcChanges = Array.isArray(next.npcs) ? [...next.npcs] : [];
  const existingNames = new Set(
    existingNpcChanges
      .map((npc) => (typeof npc?.name === 'string' ? npc.name.trim().toLowerCase() : ''))
      .filter(Boolean)
  );
  const knownWorldNpcs = new Map(
    (Array.isArray(worldNpcs) ? worldNpcs : [])
      .filter((npc) => typeof npc?.name === 'string' && npc.name.trim())
      .map((npc) => [npc.name.trim().toLowerCase(), npc])
  );

  const normalizedPlayer = typeof playerName === 'string' ? playerName.trim().toLowerCase() : '';

  for (const segment of Array.isArray(dialogueSegments) ? dialogueSegments : []) {
    if (segment?.type !== 'dialogue' || typeof segment?.character !== 'string') continue;
    const speakerName = segment.character.trim();
    const speakerKey = speakerName.toLowerCase();
    if (!speakerKey || speakerKey === normalizedPlayer || existingNames.has(speakerKey)) continue;

    const worldNpc = knownWorldNpcs.get(speakerKey);
    if (!worldNpc) continue;

    existingNpcChanges.push({
      action: 'update',
      name: worldNpc.name || speakerName,
      ...(currentLocation ? { location: currentLocation } : {}),
    });
    existingNames.add(speakerKey);
  }

  if (existingNpcChanges.length > 0) {
    next.npcs = existingNpcChanges;
  }

  return next;
}
