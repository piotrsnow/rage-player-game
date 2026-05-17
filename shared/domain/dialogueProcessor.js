import { hasNamedSpeaker } from './dialogueSpeaker.js';

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

/**
 * Introduce unknown dialogue speakers as NPCs into stateChanges.
 * Extracted from enrichDialogueSpeakers — this runs on BE so the persisted
 * scene includes the NPC introductions; FE voice assignment reads them.
 */
export function introduceUnknownSpeakers(segments, stateChanges, worldNpcs, { playerNames = [], currentLocation = '' } = {}) {
  const next = { ...(stateChanges || {}) };
  const npcChanges = Array.isArray(next.npcs) ? [...next.npcs] : [];
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

  const validGender = (g) => (g === 'male' || g === 'female' ? g : null);

  for (const segment of Array.isArray(segments) ? segments : []) {
    if (!segment || segment.type !== 'dialogue') continue;
    if (!hasNamedSpeaker(segment.character)) continue;
    const speakerName = String(segment.character || '').trim();
    const speakerKey = speakerName.toLowerCase();
    if (!speakerKey || playerNameSet.has(speakerKey)) continue;
    if (knownNpcNames.has(speakerKey) || existingNpcChangeNames.has(speakerKey)) continue;

    npcChanges.push({
      action: 'introduce',
      name: speakerName,
      ...(validGender(segment.gender) ? { gender: segment.gender } : {}),
      ...(currentLocation ? { location: currentLocation } : {}),
    });
    existingNpcChangeNames.add(speakerKey);
  }

  if (npcChanges.length > 0) {
    next.npcs = npcChanges;
  }

  return next;
}
