import { useCallback, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { storage } from '../services/storage';

/**
 * Non-scene-gen action handlers for the gameplay page. Covers refresh,
 * scene-grid write-back, field-map turn rollup, share-link creation,
 * advancement modal open/close, error dismiss, and the (currently gated)
 * idle-world-event trigger.
 *
 * `handleAction` (scene generation with overlay coordination) is deliberately
 * left in the page — it's tightly coupled to the overlay hook, the idle
 * timer ref, and local success-tracking refs that don't travel cleanly.
 */
export function useGameplayActions({
  dispatch,
  autoSave,
  navigate,
  mp,
  isMultiplayer,
  campaign,
  urlCampaignId,
  readOnly,
  onRefresh,
  sWorld,
  sCharacter,
  generateScene,
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (readOnly && onRefresh) {
        await onRefresh();
      } else if (isMultiplayer) {
        await mp.rejoinRoom();
      } else {
        const id = campaign?.backendId || urlCampaignId;
        if (id) {
          const data = await storage.loadCampaign(id);
          if (data) dispatch({ type: 'LOAD_CAMPAIGN', payload: data });
        }
      }
    } catch (err) {
      console.warn('[GameplayPage] Refresh failed:', err.message);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, readOnly, onRefresh, isMultiplayer, mp, campaign?.backendId, urlCampaignId, dispatch]);

  const handleSceneGridChange = useCallback((sceneId, nextSceneGrid) => {
    if (!sceneId || !nextSceneGrid) return;
    const payload = { sceneId, sceneGrid: nextSceneGrid };
    if (isMultiplayer) {
      mp.dispatch({ type: 'UPDATE_SCENE_GRID', payload });
      return;
    }
    dispatch({ type: 'UPDATE_SCENE_GRID', payload });
    // Debounce nudge — frequent grid edits shouldn't hammer save.
    setTimeout(() => autoSave(), 250);
  }, [isMultiplayer, mp, dispatch, autoSave]);

  const handleFieldTurnReady = useCallback(() => {
    if (!sWorld?.fieldMap) return;
    const fm = sWorld.fieldMap;
    const buf = fm.stepBuffer || [];
    const from = buf.length > 0 ? buf[0] : fm.playerPos;
    const to = fm.playerPos;
    const uniqueTiles = new Set(buf.map((s) => s.tile)).size;
    const idleSteps = buf.filter((s) => s.x === from.x && s.y === from.y).length;
    const discovered = fm.discoveredPoi.map((p) => `${p.tile}@(${p.x},${p.y})`).join(', ');
    const actionText = `[FIELD_MOVE] steps=${buf.length} from=(${from.x},${from.y}) to=(${to.x},${to.y}) uniqueTiles=${uniqueTiles} idleSteps=${idleSteps} biome=${fm.activeBiome}${discovered ? ` discovered=${discovered}` : ''}`;
    dispatch({ type: 'FIELD_MAP_RESET_STEPS' });
    generateScene(actionText, false, false).catch(() => {});
  }, [sWorld?.fieldMap, dispatch, generateScene]);

  const handleShare = useCallback(async () => {
    const backendId = campaign?.backendId;
    if (!backendId || !apiClient.isConnected()) return;
    setShareLoading(true);
    try {
      const { shareToken } = await apiClient.post(`/campaigns/${backendId}/share`);
      const url = `${window.location.origin}/view/${shareToken}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (err) {
      console.error('[Share] Failed:', err);
    } finally {
      setShareLoading(false);
    }
  }, [campaign?.backendId]);

  // Advancement modal open/close with MP-sync hooks. On open we mirror the
  // MP character to solo state (so modal reads from Zustand); on close we
  // push any solo edits back to MP so the room state reflects them.
  const [advancementOpen, setAdvancementOpen] = useState(false);
  const handleAdvancementOpen = useCallback((character) => {
    if (isMultiplayer && character) {
      dispatch({ type: 'UPDATE_CHARACTER', payload: character });
    }
    setAdvancementOpen(true);
  }, [isMultiplayer, dispatch]);
  const handleAdvancementClose = useCallback(() => {
    if (isMultiplayer && sCharacter) {
      mp.syncCharacter(sCharacter);
    }
    setAdvancementOpen(false);
  }, [isMultiplayer, sCharacter, mp]);

  const dismissError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
    if (isMultiplayer) {
      mp.dispatch({ type: 'SET_ERROR', payload: null });
    }
  }, [dispatch, isMultiplayer, mp]);

  return {
    // Refresh
    isRefreshing,
    handleRefresh,
    // Scene grid / field map
    handleSceneGridChange,
    handleFieldTurnReady,
    // Share
    handleShare,
    shareCopied,
    shareLoading,
    // Advancement modal
    advancementOpen,
    handleAdvancementOpen,
    handleAdvancementClose,
    // Error dismiss
    dismissError,
  };
}
