export const VOICE_SETTINGS_KEYS = ['elevenlabsVoiceId', 'elevenlabsVoiceName', 'characterVoices'];
export const MAX_VOICE_SETTINGS_SIZE = 16 * 1024;

export function sanitizeVoiceSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const narratorVoiceId = typeof source.elevenlabsVoiceId === 'string' ? source.elevenlabsVoiceId.trim() : '';
  const narratorVoiceName = typeof source.elevenlabsVoiceName === 'string' ? source.elevenlabsVoiceName.trim() : '';
  const characterVoices = Array.isArray(source.characterVoices)
    ? source.characterVoices
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        .map((entry) => ({
          voiceId: typeof entry.voiceId === 'string' ? entry.voiceId.trim() : '',
          voiceName: typeof entry.voiceName === 'string' ? entry.voiceName.trim() : '',
          gender: entry.gender === 'female' ? 'female' : 'male',
        }))
        .filter((entry) => entry.voiceId && entry.voiceName)
    : [];

  const dedupedCharacterVoices = [];
  const seenVoiceIds = new Set();
  for (const voice of characterVoices) {
    if (seenVoiceIds.has(voice.voiceId)) continue;
    seenVoiceIds.add(voice.voiceId);
    dedupedCharacterVoices.push(voice);
  }

  return {
    elevenlabsVoiceId: narratorVoiceId,
    elevenlabsVoiceName: narratorVoiceName,
    characterVoices: dedupedCharacterVoices,
  };
}

export function extractVoiceSettings(settings) {
  const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const subset = {};
  for (const key of VOICE_SETTINGS_KEYS) {
    if (source[key] !== undefined) {
      subset[key] = source[key];
    }
  }
  return sanitizeVoiceSettings(subset);
}

export function parseVoiceSettings(raw) {
  if (!raw) return sanitizeVoiceSettings({});
  try {
    return sanitizeVoiceSettings(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return sanitizeVoiceSettings({});
  }
}
