export const uiHandlers = {
  SET_LOADING: (draft, action) => {
    draft.isLoading = action.payload;
  },

  SET_ERROR: (draft, action) => {
    draft.error = action.payload;
    draft.isLoading = false;
  },

  SET_GENERATING_SCENE: (draft, action) => {
    draft.isGeneratingScene = action.payload;
  },

  SET_GENERATING_IMAGE: (draft, action) => {
    draft.isGeneratingImage = action.payload;
  },

  SET_MOMENTUM: (draft, action) => {
    draft.momentumBonus = action.payload;
  },

  ADD_NARRATION_TIME: (draft, action) => {
    draft.narrationTime = (draft.narrationTime || 0) + (action.payload || 0);
  },

  SET_PLAY_TIME: (draft, action) => {
    draft.totalPlayTime = action.payload || 0;
  },

  SET_ACTIVE_CHARACTER: (draft, action) => {
    draft.activeCharacterId = action.payload;
  },

  UPDATE_ACHIEVEMENTS: (draft, action) => {
    if (!draft.achievements) draft.achievements = { unlocked: [], stats: {} };
    Object.assign(draft.achievements, action.payload);
  },

  ADD_AI_COST: (draft, action) => {
    const entry = action.payload;
    if (!draft.aiCosts) {
      draft.aiCosts = { total: 0, breakdown: { ai: 0, image: 0, tts: 0, sfx: 0, music: 0 }, history: [] };
    }
    const cost = entry.cost || 0;
    draft.aiCosts.total += cost;
    draft.aiCosts.breakdown[entry.type] = (draft.aiCosts.breakdown[entry.type] || 0) + cost;
    if (draft.aiCosts.history.length >= 200) {
      draft.aiCosts.history.shift();
    }
    draft.aiCosts.history.push(entry);
  },
};
