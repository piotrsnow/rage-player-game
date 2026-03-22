import { aiService } from './ai';

const FULL_SCENE_COUNT = 3;
const MEDIUM_SCENE_COUNT = 5;
const MEDIUM_SUMMARY_LENGTH = 500;
const COMPRESSION_THRESHOLD = 15;

export const contextManager = {
  buildEnhancedContext(gameState) {
    const { scenes, world } = gameState;
    const total = scenes.length;

    const fullScenes = scenes.slice(-FULL_SCENE_COUNT).map((s, i) => ({
      index: total - FULL_SCENE_COUNT + i + 1,
      narrative: s.narrative,
      action: s.chosenAction || null,
    }));

    const mediumStart = Math.max(0, total - FULL_SCENE_COUNT - MEDIUM_SCENE_COUNT);
    const mediumEnd = Math.max(0, total - FULL_SCENE_COUNT);
    const mediumScenes = scenes.slice(mediumStart, mediumEnd).map((s, i) => ({
      index: mediumStart + i + 1,
      summary: (s.narrative || '').substring(0, MEDIUM_SUMMARY_LENGTH),
      action: s.chosenAction || null,
    }));

    return {
      compressedHistory: world?.compressedHistory || '',
      mediumScenes,
      fullScenes,
    };
  },

  formatSceneHistory(context) {
    const parts = [];

    if (context.compressedHistory) {
      parts.push(`ARCHIVED HISTORY (AI summary of earliest scenes):\n${context.compressedHistory}`);
    }

    if (context.mediumScenes.length > 0) {
      const medium = context.mediumScenes
        .map((s) => `Scene ${s.index}${s.action ? ` [Player: ${s.action}]` : ''}: ${s.summary}...`)
        .join('\n');
      parts.push(`EARLIER SCENES (summaries):\n${medium}`);
    }

    if (context.fullScenes.length > 0) {
      const full = context.fullScenes
        .map((s) => `Scene ${s.index}${s.action ? ` [Player: ${s.action}]` : ''}:\n${s.narrative}`)
        .join('\n\n');
      parts.push(`RECENT SCENES (full):\n${full}`);
    }

    return parts.join('\n\n') || 'No scenes yet - this is the beginning of the story.';
  },

  needsCompression(gameState) {
    return gameState.scenes.length > COMPRESSION_THRESHOLD && !gameState.world?.compressedHistory;
  },

  async compressOldScenes(gameState, provider, apiKey, language = 'en') {
    const { scenes } = gameState;
    const scenesToCompress = scenes.slice(0, -FULL_SCENE_COUNT - MEDIUM_SCENE_COUNT);
    if (scenesToCompress.length === 0) return null;

    const scenesText = scenesToCompress
      .map((s, i) => `Scene ${i + 1}${s.chosenAction ? ` [Player: ${s.chosenAction}]` : ''}: ${s.narrative}`)
      .join('\n\n');

    try {
      const { result, usage } = await aiService.compressScenes(scenesText, provider, apiKey, language);
      return { summary: result?.summary || null, usage };
    } catch (err) {
      console.warn('[contextManager] Scene compression failed:', err.message);
      return null;
    }
  },
};
