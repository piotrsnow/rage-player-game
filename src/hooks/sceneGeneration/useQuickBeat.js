import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { aiService } from '../../services/ai';
import { devLog } from '../../stores/devEventLogStore';

const QUICK_BEAT_LIMIT = 5;

/**
 * Quick beat ("mała akcja") hook. Calls the backend nano-path endpoint and
 * dispatches ADD_QUICK_BEAT on success. On escalation (`combat`, `travel`,
 * etc.) falls back to the provided `generateScene` so the player gets a full
 * scene without needing to re-click anything.
 *
 * Returns { submitQuickBeat, isQuickBeatLocked, quickBeatStreak, remaining }.
 */
export function useQuickBeat({ generateScene, onEscalate, onError } = {}) {
  const { t } = useTranslation();
  const { state, dispatch } = useGame();
  const { settings } = useSettings();

  const quickBeatStreak = state.quickBeatStreak || 0;
  const isQuickBeatLocked = quickBeatStreak >= QUICK_BEAT_LIMIT;
  const remaining = Math.max(0, QUICK_BEAT_LIMIT - quickBeatStreak);

  const submitQuickBeat = useCallback(async (playerAction, { entityTags = null } = {}) => {
    if (!playerAction || typeof playerAction !== 'string' || !playerAction.trim()) return;
    if (isQuickBeatLocked) {
      onError?.({ code: 'QUICK_BEAT_LOCKED', message: t('gameplay.quickBeatLocked', { defaultValue: 'Quick beat limit reached — submit a full action' }) });
      return;
    }

    const backendCampaignId = state.campaign?.backendId;
    if (!backendCampaignId) {
      onError?.({ code: 'NO_BACKEND_CAMPAIGN', message: 'Backend campaign not synced' });
      return;
    }

    devLog.emit({ category: 'pipeline', type: 'quick_beat_start', label: `Quick beat: ${playerAction.slice(0, 60)}`, data: { playerAction, streak: quickBeatStreak } });

    let outcome;
    try {
      outcome = await aiService.quickBeatViaBackendStream(backendCampaignId, playerAction.trim(), {
        provider: settings.aiProvider,
        language: settings.language,
        entityTags,
        characterId: state.character?.backendId || null,
        dmSettings: settings.dmSettings,
      });
    } catch (err) {
      devLog.emit({ category: 'system', type: 'quick_beat_error', label: `Error: ${err.message?.slice(0, 80)}`, severity: 'error', data: { message: err.message } });
      onError?.({ code: err.code || 'QUICK_BEAT_ERROR', message: err.message });
      return;
    }

    if (outcome.kind === 'escalate') {
      // BE detected combat/travel/trade/etc. — fall through to the full scene
      // flow so the player gets the proper pipeline (image gen, post-scene
      // work, memory compression, etc.). We pass the original action through
      // unchanged; intent classifier will pick it up.
      devLog.emit({ category: 'pipeline', type: 'quick_beat_escalate', label: `Escalated: ${outcome.reason}`, data: { reason: outcome.reason } });
      onEscalate?.(outcome.reason);
      if (typeof generateScene === 'function') {
        await generateScene(playerAction, false, true, false, { entityTags });
      }
      return;
    }

    if (outcome.kind === 'error') {
      onError?.({ code: outcome.code, message: outcome.message });
      return;
    }

    // outcome.kind === 'complete'
    const data = outcome.data;
    dispatch({
      type: 'ADD_QUICK_BEAT',
      payload: {
        id: data.id,
        playerAction: data.playerAction,
        narration: data.narration,
        npcSpeaker: data.npcSpeaker || null,
        npcSpeakerGender: data.npcSpeakerGender || null,
        npcReply: data.npcReply || null,
        timeAdvance: data.timeAdvance || 0,
        newItems: data.newItems || null,
        consecutiveCount: data.consecutiveCount || quickBeatStreak + 1,
        timestamp: Date.now(),
      },
    });
    devLog.emit({ category: 'pipeline', type: 'quick_beat_done', label: 'Quick beat complete', data: { hasNpcReply: !!data.npcReply, timeAdvance: data.timeAdvance } });
  }, [state.campaign?.backendId, state.character?.backendId, settings.aiProvider, settings.language, settings.dmSettings, isQuickBeatLocked, quickBeatStreak, dispatch, onError, onEscalate, generateScene, t]);

  return {
    submitQuickBeat,
    isQuickBeatLocked,
    quickBeatStreak,
    remaining,
    limit: QUICK_BEAT_LIMIT,
  };
}
