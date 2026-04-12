import { useCallback, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { useSettings } from '../contexts/SettingsContext';
import { imageService } from '../services/imageGen';
import { calculateCost } from '../services/costTracker';
import { shortId } from '../utils/ids';

const ITEM_IMAGE_RETRY_COOLDOWN_MS = 60000;

export function useImageGeneration() {
  const { state, dispatch, autoSave } = useGame();
  const { settings, hasApiKey } = useSettings();

  const itemImageGenerationLocksRef = useRef(new Set());
  const itemImageFailureTimestampsRef = useRef(new Map());

  const { sceneVisualization, imageProvider, stabilityApiKey, openaiApiKey, geminiApiKey } = settings;
  const imageStyle = settings.dmSettings?.imageStyle || 'painting';
  const darkPalette = settings.dmSettings?.darkPalette || false;
  const imageSeriousness = settings.dmSettings?.narratorSeriousness ?? null;
  const imageGenEnabled = sceneVisualization === 'image';
  const imgKeyProvider = imageProvider === 'stability' ? 'stability' : imageProvider === 'gemini' ? 'gemini' : 'openai';
  const imageApiKey = imageProvider === 'stability' ? stabilityApiKey : imageProvider === 'gemini' ? geminiApiKey : openaiApiKey;

  const generateItemImageForInventoryItem = useCallback(
    async (item, options = {}) => {
      if (!item || typeof item !== 'object') return null;
      const itemId = typeof item.id === 'string' ? item.id : '';
      if (!itemId || item.imageUrl) return item.imageUrl || null;

      const activeLocks = itemImageGenerationLocksRef.current;
      const failedAt = itemImageFailureTimestampsRef.current.get(itemId);
      if (failedAt && (Date.now() - failedAt) < ITEM_IMAGE_RETRY_COOLDOWN_MS) {
        return null;
      }
      if (activeLocks.has(itemId)) return null;
      activeLocks.add(itemId);

      try {
        const imageUrl = await imageService.generateItemImage(item, {
          genre: options.genre ?? state.campaign?.genre,
          tone: options.tone ?? state.campaign?.tone,
          provider: imageProvider,
          imageStyle,
          darkPalette,
          seriousness: imageSeriousness,
          campaignId: state.campaign?.backendId,
        });
        if (!imageUrl) return null;

        dispatch({
          type: 'UPDATE_INVENTORY_ITEM_IMAGE',
          payload: { itemId, imageUrl },
        });
        itemImageFailureTimestampsRef.current.delete(itemId);
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
        if (!options.skipAutoSave) {
          setTimeout(() => autoSave(), 300);
        }
        return imageUrl;
      } catch (err) {
        const message = err?.message || 'Item image generation failed';
        itemImageFailureTimestampsRef.current.set(itemId, Date.now());
        console.warn('Item image generation failed:', message);
        if (options.emitWarning !== false) {
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            payload: {
              id: `msg_${Date.now()}_item_image_warn_${shortId(4)}`,
              role: 'system',
              subtype: 'validation_warning',
              content: `⚠ ${message}`,
              timestamp: Date.now(),
            },
          });
        }
        return null;
      } finally {
        activeLocks.delete(itemId);
      }
    },
    [state.campaign?.genre, state.campaign?.tone, state.campaign?.backendId, imageProvider, imageStyle, darkPalette, imageSeriousness, dispatch, autoSave]
  );

  const ensureMissingInventoryImages = useCallback(
    async (items = [], options = {}) => {
      const candidates = (Array.isArray(items) ? items : []).filter((item) =>
        item
        && typeof item === 'object'
        && typeof item.id === 'string'
        && !item.imageUrl
      );
      if (candidates.length === 0) {
        return { generated: 0, failed: 0 };
      }

      let generated = 0;
      let failed = 0;
      for (const item of candidates) {
        const imageUrl = await generateItemImageForInventoryItem(item, {
          ...options,
          skipAutoSave: true,
        });
        if (imageUrl) generated += 1;
        else failed += 1;
      }

      if (!options.skipAutoSave && generated > 0) {
        setTimeout(() => autoSave(), 300);
      }
      return { generated, failed };
    },
    [generateItemImageForInventoryItem, autoSave]
  );

  const generateImageForScene = useCallback(
    async (sceneId, narrative, imagePrompt, campaignOverride, options = {}) => {
      const hasImgKey = imageApiKey || hasApiKey(imgKeyProvider);
      if (!imageGenEnabled || !hasImgKey || !narrative) return null;
      dispatch({ type: 'SET_GENERATING_IMAGE', payload: true });
      try {
        const sceneImagePrompt = imagePrompt || state.scenes?.find((s) => s.id === sceneId)?.imagePrompt;
        const genre = campaignOverride?.genre ?? state.campaign?.genre;
        const tone = campaignOverride?.tone ?? state.campaign?.tone;
        const imageUrl = await imageService.generateSceneImage(
          narrative,
          genre,
          tone,
          imageApiKey,
          imageProvider,
          sceneImagePrompt,
          state.campaign?.backendId,
          imageStyle,
          darkPalette,
          state.character?.age,
          state.character?.gender,
          { forceNew: Boolean(options.forceNew) },
          imageSeriousness,
          state.character?.portraitUrl || null
        );
        dispatch({ type: 'ADD_AI_COST', payload: calculateCost('image', { provider: imageProvider }) });
        dispatch({
          type: 'UPDATE_SCENE_IMAGE',
          payload: { sceneId, image: imageUrl },
        });
        if (!options.skipAutoSave) {
          setTimeout(() => autoSave(), 300);
        }
        return imageUrl;
      } catch (imgErr) {
        console.warn('Image generation failed:', imgErr.message);
        return null;
      } finally {
        dispatch({ type: 'SET_GENERATING_IMAGE', payload: false });
      }
    },
    [state.scenes, state.campaign?.genre, state.campaign?.tone, state.campaign?.backendId, state.character?.age, state.character?.gender, state.character?.portraitUrl, imageGenEnabled, imageApiKey, imageProvider, imageStyle, darkPalette, imageSeriousness, hasApiKey, imgKeyProvider, dispatch, autoSave]
  );

  return {
    generateImageForScene,
    generateItemImageForInventoryItem,
    ensureMissingInventoryImages,
    imageGenEnabled,
    imageApiKey,
    imageProvider,
    imageStyle,
    darkPalette,
    imageSeriousness,
    imgKeyProvider,
  };
}
