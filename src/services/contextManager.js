import { aiService } from './ai';

const FULL_SCENE_COUNT = 3;
const MEDIUM_SCENE_COUNT = 5;
const MEDIUM_SUMMARY_LENGTH = 500;
const COMPRESSION_THRESHOLD = 15;
const INCREMENTAL_COMPRESSION_INTERVAL = 10;
const MAX_COMPRESSED_HISTORY_LENGTH = 5000;

function extractKeywords(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function scoreTags(entryTags, keywords) {
  if (!entryTags?.length || !keywords?.length) return 0;
  const lower = entryTags.map((t) => t.toLowerCase());
  return keywords.reduce((score, kw) => score + (lower.some((t) => t.includes(kw)) ? 1 : 0), 0);
}

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

  retrieveRelevantKnowledge(knowledgeBase, currentScene, playerAction, maxEntries = 8) {
    if (!knowledgeBase) return '';
    const searchText = `${currentScene || ''} ${playerAction || ''}`;
    const keywords = extractKeywords(searchText);
    if (keywords.length === 0) return '';

    const scored = [];

    for (const event of (knowledgeBase.events || [])) {
      const s = scoreTags(event.tags, keywords) + (event.importance === 'critical' ? 3 : event.importance === 'major' ? 1 : 0);
      if (s > 0) scored.push({ type: 'event', text: event.summary, score: s });
    }

    for (const decision of (knowledgeBase.decisions || [])) {
      const s = scoreTags(decision.tags, keywords);
      if (s > 0) scored.push({ type: 'decision', text: `Choice: ${decision.choice} → ${decision.consequence}`, score: s });
    }

    for (const thread of (knowledgeBase.plotThreads || [])) {
      if (thread.status === 'active') {
        const nameWords = extractKeywords(thread.name);
        const s = nameWords.reduce((sc, w) => sc + (keywords.some((kw) => w.includes(kw) || kw.includes(w)) ? 2 : 0), 0);
        if (s > 0) scored.push({ type: 'plotThread', text: `[${thread.status}] ${thread.name}`, score: s + 1 });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, maxEntries);
    if (top.length === 0) return '';

    return 'RELEVANT MEMORIES (from knowledge base — use for narrative consistency):\n' +
      top.map((e) => `- [${e.type}] ${e.text}`).join('\n');
  },

  retrieveRelevantCodex(codex, currentScene, playerAction, maxEntries = 6) {
    if (!codex || Object.keys(codex).length === 0) return '';
    const searchText = `${currentScene || ''} ${playerAction || ''}`;
    const keywords = extractKeywords(searchText);
    if (keywords.length === 0) return '';

    const scored = [];
    for (const entry of Object.values(codex)) {
      const nameWords = extractKeywords(entry.name);
      let score = scoreTags(entry.tags, keywords);
      score += nameWords.reduce((s, w) => s + (keywords.some((kw) => w.includes(kw) || kw.includes(w)) ? 2 : 0), 0);
      if (score > 0) scored.push({ entry, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, maxEntries);
    if (top.length === 0) return '';

    const lines = top.map(({ entry }) => {
      const frags = entry.fragments
        .map((f) => `  - [${f.aspect || 'info'}] ${f.content} (source: ${f.source})`)
        .join('\n');
      return `* ${entry.name} [${entry.category}]:\n${frags}`;
    });

    return 'PLAYER CODEX (knowledge the player has already discovered — do NOT repeat, reveal NEW information):\n' + lines.join('\n');
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
    const sceneCount = gameState.scenes?.length || 0;
    const scenesOutsideWindow = sceneCount - FULL_SCENE_COUNT - MEDIUM_SCENE_COUNT;
    if (scenesOutsideWindow <= 0) return false;

    if (!gameState.world?.compressedHistory) {
      return sceneCount > COMPRESSION_THRESHOLD;
    }

    return scenesOutsideWindow > 0 && scenesOutsideWindow % INCREMENTAL_COMPRESSION_INTERVAL === 0;
  },

  async compressOldScenes(gameState, provider, apiKey, language = 'en', modelTier = 'premium') {
    const { scenes } = gameState;
    const scenesToCompress = scenes.slice(0, -FULL_SCENE_COUNT - MEDIUM_SCENE_COUNT);
    if (scenesToCompress.length === 0) return null;

    const existingHistory = gameState.world?.compressedHistory || '';

    const newScenes = existingHistory
      ? scenesToCompress.slice(-INCREMENTAL_COMPRESSION_INTERVAL)
      : scenesToCompress;

    if (newScenes.length === 0) return null;

    const scenesText = newScenes
      .map((s, i) => `Scene ${i + 1}${s.chosenAction ? ` [Player: ${s.chosenAction}]` : ''}: ${s.narrative}`)
      .join('\n\n');

    const textToCompress = existingHistory
      ? `EXISTING SUMMARY:\n${existingHistory}\n\nNEW SCENES TO INCORPORATE:\n${scenesText}`
      : scenesText;

    try {
      const { result, usage } = await aiService.compressScenes(textToCompress, provider, apiKey, language, modelTier);
      let summary = result?.summary || null;
      if (summary && summary.length > MAX_COMPRESSED_HISTORY_LENGTH) {
        summary = summary.substring(0, MAX_COMPRESSED_HISTORY_LENGTH);
      }
      return { summary, usage };
    } catch (err) {
      console.warn('[contextManager] Scene compression failed:', err.message);
      return null;
    }
  },
};
