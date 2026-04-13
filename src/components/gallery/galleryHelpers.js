import { createCampaignId, createSceneId, getCampaignSummary } from '../../services/gameState';

export const PAGE_SIZE = 9;

export const GENRES = ['Fantasy', 'Sci-Fi', 'Horror'];
export const TONES = ['Dark', 'Epic', 'Humorous'];
export const SORT_OPTIONS = [
  { value: 'newest', key: 'gallery.sortNewest' },
  { value: 'rating', key: 'gallery.sortRating' },
  { value: 'plays', key: 'gallery.sortPlays' },
];

export const genreIcons = {
  Fantasy: 'auto_fix_high',
  'Sci-Fi': 'rocket_launch',
  Horror: 'skull',
};

export const genreBorderColors = {
  Fantasy: 'border-l-primary-dim',
  'Sci-Fi': 'border-l-blue-400',
  Horror: 'border-l-error',
};

export const iconFill = { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" };
export const iconOutline = { fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" };

export function excerpt(text, max = 200) {
  if (!text || typeof text !== 'string') return '';
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

export function normalizePublicListResponse(json) {
  if (Array.isArray(json)) {
    return { list: json, total: json.length };
  }
  const list = json?.campaigns ?? json?.items ?? json?.data ?? [];
  const total = json?.total ?? list.length;
  return {
    list,
    total,
    page: json?.page,
    pageSize: json?.pageSize,
  };
}

/** Build a display + optional full gameState from one API row. */
export function rowToGalleryEntry(row) {
  const parsedData =
    row.data && typeof row.data === 'string'
      ? (() => {
          try {
            return JSON.parse(row.data);
          } catch {
            return null;
          }
        })()
      : row.data;

  if (parsedData && typeof parsedData === 'object' && parsedData.campaign) {
    const gs = parsedData;
    const summary = getCampaignSummary(gs);
    return {
      id: row.id || gs.campaign?.id,
      name: row.name || summary.name,
      genre: row.genre || summary.genre,
      tone: row.tone || summary.tone,
      sceneCount: summary.sceneCount,
      createdAt: row.createdAt || gs.lastSaved || Date.now(),
      description: excerpt(gs.campaign?.worldDescription || gs.campaign?.hook || ''),
      rating: Number(row.rating ?? row.avgRating ?? 0) || 0,
      playCount: Number(row.playCount ?? row.plays ?? 0) || 0,
      gameState: gs,
    };
  }

  return {
    id: row.id,
    name: row.name || 'Untitled',
    genre: row.genre || 'Fantasy',
    tone: row.tone || 'Dark',
    sceneCount: Number(row.sceneCount ?? row.scenesCount ?? 0) || 0,
    createdAt: row.createdAt || row.created_at || Date.now(),
    description: excerpt(row.description || row.worldSummary || row.summary || ''),
    rating: Number(row.rating ?? row.avgRating ?? 0) || 0,
    playCount: Number(row.playCount ?? row.plays ?? 0) || 0,
    gameState: row.gameState || row.snapshot || null,
  };
}

export function forkPlayFromStart(sourceState) {
  const newCampaignId = createCampaignId();
  const first = sourceState.scenes?.[0];
  const newScenes = first
    ? [
        {
          ...first,
          id: createSceneId(),
          timestamp: Date.now(),
          chosenAction: null,
        },
      ]
    : [];

  const newChat =
    first && (first.narrative || (first.dialogueSegments && first.dialogueSegments.length))
      ? [
          {
            id: `msg_${Date.now()}_dm`,
            role: 'dm',
            sceneId: newScenes[0]?.id,
            content: first.narrative || '',
            dialogueSegments: first.dialogueSegments || [],
            soundEffect: first.soundEffect ?? null,
            timestamp: Date.now(),
          },
        ]
      : [];

  return {
    ...sourceState,
    campaign: {
      ...sourceState.campaign,
      id: newCampaignId,
      backendId: undefined,
    },
    scenes: newScenes,
    chatHistory: newChat,
    quests: { active: [], completed: [] },
    lastSaved: Date.now(),
    aiCosts: {
      total: 0,
      breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 },
      history: [],
    },
  };
}
