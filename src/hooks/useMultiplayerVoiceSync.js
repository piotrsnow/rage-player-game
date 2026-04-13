import { useEffect } from 'react';

/**
 * Dispatches MAP_CHARACTER_VOICE for each MP player with a voiceId that
 * isn't yet in the characterVoiceMap (or has diverged from the player's pick).
 */
export function useMultiplayerVoiceSync({ isMultiplayer, players, characterVoiceMap, dispatch }) {
  useEffect(() => {
    if (!isMultiplayer) return;
    for (const p of players || []) {
      if (p.voiceId && p.name) {
        const existing = characterVoiceMap?.[p.name];
        if (!existing || existing.voiceId !== p.voiceId) {
          dispatch({
            type: 'MAP_CHARACTER_VOICE',
            payload: { characterName: p.name, voiceId: p.voiceId, gender: p.gender || null },
          });
        }
      }
    }
  }, [isMultiplayer, players, characterVoiceMap, dispatch]);
}
