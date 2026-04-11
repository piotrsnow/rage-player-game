import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps the chat viewport aligned with the newest scene/message.
 *
 * Handles two triggers that used to live inline in GameplayPage:
 *  1) When `scenes.length` grows, scroll to the newest scene's DM message.
 *  2) When `isGeneratingScene` flips false and new chat messages landed
 *     during generation, scroll to the preferred target (scene → DM → dice).
 *
 * Returns a ref-like `scrollTargetMessageId` (consumed by ChatPanel) and a
 * setter `setViewingSceneIndex` for external reset. The caller still owns
 * `viewingSceneIndex` state.
 */
export function useSceneScrollSync({
  scenes,
  chatHistory,
  isGeneratingScene,
  setViewingSceneIndex,
}) {
  const [scrollTargetMessageId, setScrollTargetMessageId] = useState(null);
  const prevScenesLenRef = useRef(0);
  const wasGeneratingRef = useRef(false);
  const prevChatLenRef = useRef(chatHistory.length);

  const requestChatScrollToMessage = useCallback((messageId) => {
    if (!messageId) return;
    setScrollTargetMessageId((prev) => (prev === messageId ? null : prev));
    requestAnimationFrame(() => {
      setScrollTargetMessageId(messageId);
    });
  }, []);

  // Trigger 1: new scene appended → scroll to its DM message.
  useEffect(() => {
    if (scenes.length > prevScenesLenRef.current) {
      if (setViewingSceneIndex) setViewingSceneIndex(null);

      const newestScene = scenes[scenes.length - 1];
      const newestSceneMessage = newestScene?.id
        ? chatHistory.find((msg) => msg?.sceneId === newestScene.id)
        : null;
      const newestDmMessage = [...chatHistory].reverse().find((msg) => msg?.role === 'dm');

      if (newestSceneMessage?.id) {
        requestChatScrollToMessage(newestSceneMessage.id);
      } else if (newestDmMessage?.id) {
        requestChatScrollToMessage(newestDmMessage.id);
      }
    }
    prevScenesLenRef.current = scenes.length;
  }, [scenes.length, scenes, chatHistory, requestChatScrollToMessage, setViewingSceneIndex]);

  // Trigger 2: generation just ended → scroll to whatever new messages landed.
  useEffect(() => {
    if (isGeneratingScene) {
      wasGeneratingRef.current = true;
      prevChatLenRef.current = chatHistory.length;
      return;
    }
    if (!wasGeneratingRef.current) {
      prevChatLenRef.current = chatHistory.length;
      return;
    }

    const hasNewMessages = chatHistory.length > prevChatLenRef.current;
    if (hasNewMessages) {
      const newestScene = scenes[scenes.length - 1];
      const latestSceneMessage = newestScene?.id
        ? chatHistory.find((msg) => msg?.sceneId === newestScene.id)
        : null;
      const latestDmMessage = [...chatHistory].reverse().find((msg) => msg?.role === 'dm');
      const latestDiceRollMessage = [...chatHistory].reverse().find((msg) => msg?.subtype === 'dice_roll');

      const preferredMessageId = latestSceneMessage?.id || latestDmMessage?.id || latestDiceRollMessage?.id;
      if (preferredMessageId) {
        requestChatScrollToMessage(preferredMessageId);
      }
    }

    wasGeneratingRef.current = false;
    prevChatLenRef.current = chatHistory.length;
  }, [isGeneratingScene, chatHistory, scenes, requestChatScrollToMessage]);

  const clearScrollTargetIfMatches = useCallback((handledId) => {
    setScrollTargetMessageId((current) => (current === handledId ? null : current));
  }, []);

  return {
    scrollTargetMessageId,
    requestChatScrollToMessage,
    clearScrollTargetIfMatches,
  };
}
