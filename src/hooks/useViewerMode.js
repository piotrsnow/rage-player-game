import { useEffect, useRef } from 'react';

/**
 * Viewer-mode (shared campaign) sync:
 * 1. Force-enables narrator so playback controls work.
 * 2. Resolves scene index from `?scene=N` URL param.
 * 3. Aligns chat scroll to the selected scene's DM message.
 */
export function useViewerMode({
  readOnly,
  scenes,
  chatHistory,
  viewingSceneIndex,
  settings,
  updateSettings,
  location,
  navigate,
  setViewingSceneIndex,
  handleSceneNavigation,
  requestChatScrollToMessage,
}) {
  const viewerNarratorEnabledRef = useRef(false);
  const initialViewerChatAlignDoneRef = useRef(false);

  useEffect(() => {
    if (!readOnly) return;
    if (viewerNarratorEnabledRef.current) return;
    if (!settings.narratorEnabled) {
      viewerNarratorEnabledRef.current = true;
      updateSettings({ narratorEnabled: true });
    }
  }, [readOnly, settings.narratorEnabled, updateSettings]);

  useEffect(() => {
    if (!readOnly) return;
    if (!scenes || scenes.length === 0) return;

    const params = new URLSearchParams(location.search || '');
    const raw = params.get('scene');

    if (raw == null) {
      params.set('scene', '0');
      navigate(`${location.pathname}?${params.toString()}`, { replace: true });
      return;
    }

    let idx = 0;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) idx = parsed;

    const clamped = Math.max(0, Math.min(scenes.length - 1, idx));
    setViewingSceneIndex(clamped);
    handleSceneNavigation(clamped);
    initialViewerChatAlignDoneRef.current = false;
  }, [readOnly, scenes?.length, location.pathname, location.search, navigate, setViewingSceneIndex, handleSceneNavigation]);

  useEffect(() => {
    if (!readOnly) return;
    if (!scenes || scenes.length === 0) return;
    if (!chatHistory || chatHistory.length === 0) return;
    if (initialViewerChatAlignDoneRef.current) return;

    const safeIndex = Number.isInteger(viewingSceneIndex)
      ? Math.max(0, Math.min(scenes.length - 1, viewingSceneIndex))
      : 0;
    const scene = scenes[safeIndex];
    if (!scene) return;

    const targetMsg = scene.id ? chatHistory.find((m) => m.sceneId === scene.id) : null;
    const fallbackMsg = !targetMsg ? chatHistory.filter((m) => m.role === 'dm')[safeIndex] : null;
    const preferredMessageId = targetMsg?.id || fallbackMsg?.id;

    if (preferredMessageId) {
      requestChatScrollToMessage(preferredMessageId);
      initialViewerChatAlignDoneRef.current = true;
    }
  }, [readOnly, scenes, chatHistory, viewingSceneIndex, requestChatScrollToMessage]);
}
