import { aiService } from './ai';
import { resolveContextDepthForProfile } from './promptGovernance';

const FULL_SCENE_COUNT = 3;
const MEDIUM_SCENE_COUNT = 5;
const MEDIUM_SUMMARY_LENGTH = 500;
const COMPRESSION_THRESHOLD = 15;
const INCREMENTAL_COMPRESSION_INTERVAL = 10;
const MAX_COMPRESSED_HISTORY_LENGTH = 5000;
const MIN_KEYWORD_LENGTH = 2;
const RECENTLY_RESOLVED_SCENE_WINDOW = 10;

function extractKeywords(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= MIN_KEYWORD_LENGTH);
}

function scoreTags(entryTags, keywords) {
  if (!entryTags?.length || !keywords?.length) return 0;
  const lower = entryTags.map((t) => t.toLowerCase());
  return keywords.reduce((score, kw) => score + (lower.some((t) => t.includes(kw) || kw.includes(t)) ? 1 : 0), 0);
}

function collectRelatedEntityNames(npcs, quests) {
  const npcsByName = {};
  for (const npc of (npcs || [])) {
    npcsByName[npc.name?.toLowerCase()] = npc;
  }
  return { npcsByName };
}

function expandKeywordsWithRelations(keywords, npcs, quests, factions) {
  const expanded = new Set(keywords);
  const npcsByName = {};
  for (const npc of (npcs || [])) {
    if (npc.name) npcsByName[npc.name.toLowerCase()] = npc;
  }

  for (const kw of keywords) {
    const npc = npcsByName[kw];
    if (npc) {
      if (npc.factionId) expanded.add(npc.factionId.toLowerCase());
      for (const rel of (npc.relationships || [])) {
        if (rel.npcName) {
          for (const part of rel.npcName.toLowerCase().split(/\s+/)) {
            if (part.length >= MIN_KEYWORD_LENGTH) expanded.add(part);
          }
        }
      }
      for (const qid of (npc.relatedQuestIds || [])) {
        const quest = (quests?.active || []).find((q) => q.id === qid) ||
                      (quests?.completed || []).find((q) => q.id === qid);
        if (quest?.name) {
          for (const part of extractKeywords(quest.name)) {
            expanded.add(part);
          }
        }
      }
    }
  }

  return [...expanded];
}

export const contextManager = {
  resolveContextDepth(requestedDepth = 100, profileId = 'balanced', modelTier = 'premium') {
    return resolveContextDepthForProfile(requestedDepth, profileId, modelTier);
  },

  buildEnhancedContext(gameState, contextDepth = 100) {
    const { scenes, world } = gameState;
    const total = scenes.length;

    if (contextDepth <= 0) {
      return { compressedHistory: '', compressedEntityState: null, mediumScenes: [], fullScenes: [] };
    }

    const fullCount = contextDepth >= 50 ? FULL_SCENE_COUNT : contextDepth >= 25 ? 1 : 0;
    const fullScenes = scenes.slice(-fullCount).map((s, i) => ({
      index: total - fullCount + i + 1,
      narrative: s.narrative,
      action: s.chosenAction || null,
    }));

    let mediumScenes = [];
    if (contextDepth >= 50) {
      const mediumCount = contextDepth >= 75 ? MEDIUM_SCENE_COUNT : 2;
      const mediumStart = Math.max(0, total - fullCount - mediumCount);
      const mediumEnd = Math.max(0, total - fullCount);
      const summaryLen = contextDepth >= 75 ? MEDIUM_SUMMARY_LENGTH : 250;
      mediumScenes = scenes.slice(mediumStart, mediumEnd).map((s, i) => ({
        index: mediumStart + i + 1,
        summary: (s.narrative || '').substring(0, summaryLen),
        action: s.chosenAction || null,
      }));
    }

    return {
      compressedHistory: contextDepth >= 75 ? (world?.compressedHistory || '') : '',
      compressedEntityState: contextDepth >= 75 ? (world?.compressedEntityState || null) : null,
      mediumScenes,
      fullScenes,
    };
  },

  retrieveRelevantKnowledge(knowledgeBase, currentScene, playerAction, gameState = null, maxEntries = 10) {
    if (!knowledgeBase) return '';
    const searchText = `${currentScene || ''} ${playerAction || ''}`;
    const baseKeywords = extractKeywords(searchText);
    if (baseKeywords.length === 0) return '';

    const npcs = gameState?.world?.npcs || [];
    const quests = gameState?.quests;
    const factions = gameState?.world?.factions;
    const keywords = expandKeywordsWithRelations(baseKeywords, npcs, quests, factions);

    const scored = [];
    const currentSceneIdx = gameState?.scenes?.length || 0;

    for (const event of (knowledgeBase.events || [])) {
      let s = scoreTags(event.tags, keywords);
      if (event.importance === 'critical') s += 3;
      else if (event.importance === 'major') s += 1;
      if (s > 0) scored.push({ type: 'event', text: event.summary, score: s });
    }

    for (const decision of (knowledgeBase.decisions || [])) {
      let s = scoreTags(decision.tags, keywords);
      if (decision.importance === 'critical') s += 2;
      else if (decision.importance === 'major') s += 1;
      if (s > 0) scored.push({ type: 'decision', text: `Choice: ${decision.choice} → ${decision.consequence}`, score: s });
    }

    for (const thread of (knowledgeBase.plotThreads || [])) {
      const isActive = thread.status === 'active';
      const isRecentlyResolved = thread.status === 'resolved' &&
        (thread.relatedScenes || []).some((si) => currentSceneIdx - si < RECENTLY_RESOLVED_SCENE_WINDOW);
      if (!isActive && !isRecentlyResolved) continue;

      const nameWords = extractKeywords(thread.name);
      let s = nameWords.reduce((sc, w) => sc + (keywords.some((kw) => w.includes(kw) || kw.includes(w)) ? 2 : 0), 0);

      const threadNpcIds = thread.relatedNpcIds || [];
      for (const npcId of threadNpcIds) {
        const npc = npcs.find((n) => n.id === npcId || n.name?.toLowerCase() === npcId.toLowerCase());
        if (npc) {
          const npcParts = extractKeywords(npc.name);
          if (npcParts.some((p) => keywords.includes(p))) s += 2;
        }
      }

      if (s > 0) {
        const statusLabel = isActive ? 'active' : 'recently resolved';
        scored.push({ type: 'plotThread', text: `[${statusLabel}] ${thread.name}`, score: s + 1 });
      }
    }

    // --- knowledgeBase.characters ---
    for (const [, charData] of Object.entries(knowledgeBase.characters || {})) {
      const nameWords = extractKeywords(charData.name);
      const s = nameWords.reduce((sc, w) => sc + (keywords.some((kw) => w.includes(kw) || kw.includes(w)) ? 2 : 0), 0);
      if (s > 0) {
        const parts = [`${charData.name} (${charData.role || 'NPC'})`];
        if (charData.factionId) parts.push(`faction: ${charData.factionId}`);
        if (charData.disposition !== undefined) parts.push(`disposition: ${charData.disposition}`);
        if (!charData.alive) parts.push('DEAD');
        parts.push(`interactions: ${charData.interactionCount || 0}`);
        scored.push({ type: 'character', text: parts.join(', '), score: s });
      }
    }

    // --- knowledgeBase.locations ---
    for (const [, locData] of Object.entries(knowledgeBase.locations || {})) {
      const nameWords = extractKeywords(locData.name);
      const s = nameWords.reduce((sc, w) => sc + (keywords.some((kw) => w.includes(kw) || kw.includes(w)) ? 2 : 0), 0);
      if (s > 0) {
        const parts = [`${locData.name} (visited ${locData.visitCount || 0}x)`];
        if (locData.npcsEncountered?.length > 0) parts.push(`NPCs: ${locData.npcsEncountered.join(', ')}`);
        scored.push({ type: 'location', text: parts.join(' — '), score: s });
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

    if (context.compressedEntityState) {
      parts.push(`ARCHIVED ENTITY STATE (structured snapshot from compression):\n${JSON.stringify(context.compressedEntityState)}`);
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

  buildEntitySnapshot(gameState) {
    const npcs = (gameState.world?.npcs || []).map((n) => ({
      name: n.name,
      alive: n.alive,
      disposition: n.disposition || 0,
      lastLocation: n.lastLocation || '',
      factionId: n.factionId || null,
      role: n.role || '',
    }));
    const activeQuests = (gameState.quests?.active || []).map((q) => ({
      id: q.id,
      name: q.name,
      objectivesCompleted: (q.objectives || []).filter((o) => o.completed).length,
      objectivesTotal: (q.objectives || []).length,
      questGiverId: q.questGiverId || null,
    }));
    const completedQuestNames = (gameState.quests?.completed || []).map((q) => q.name);
    const factions = { ...(gameState.world?.factions || {}) };
    const currentLocation = gameState.world?.currentLocation || '';

    return { npcs, activeQuests, completedQuestNames, factions, currentLocation };
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

    const entitySnapshot = this.buildEntitySnapshot(gameState);
    const snapshotText = `\n\nENTITY STATE SNAPSHOT (preserve these relationships and states in your summary):\n` +
      `NPCs: ${entitySnapshot.npcs.map((n) => `${n.name}(${n.alive ? 'alive' : 'dead'}, disp:${n.disposition}, loc:"${n.lastLocation}"${n.factionId ? ', faction:' + n.factionId : ''})`).join('; ')}\n` +
      `Active Quests: ${entitySnapshot.activeQuests.map((q) => `${q.name}(${q.objectivesCompleted}/${q.objectivesTotal})`).join('; ')}\n` +
      `Completed Quests: ${entitySnapshot.completedQuestNames.join(', ') || 'none'}\n` +
      `Factions: ${Object.entries(entitySnapshot.factions).map(([k, v]) => `${k}:${v}`).join(', ') || 'none'}\n` +
      `Location: ${entitySnapshot.currentLocation}`;

    const textToCompress = existingHistory
      ? `EXISTING SUMMARY:\n${existingHistory}\n\nNEW SCENES TO INCORPORATE:\n${scenesText}${snapshotText}`
      : `${scenesText}${snapshotText}`;

    try {
      const { result, usage } = await aiService.compressScenes(textToCompress, provider, apiKey, language, modelTier);
      let summary = result?.summary || null;
      if (summary && summary.length > MAX_COMPRESSED_HISTORY_LENGTH) {
        summary = summary.substring(0, MAX_COMPRESSED_HISTORY_LENGTH);
      }
      return { summary, entitySnapshot, usage };
    } catch (err) {
      console.warn('[contextManager] Scene compression failed:', err.message);
      return null;
    }
  },
};
