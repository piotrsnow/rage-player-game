export const sceneHandlers = {
  ADD_SCENE: (draft, action) => {
    draft.scenes.push(action.payload);
  },

  UPDATE_SCENE_IMAGE: (draft, action) => {
    const scene = draft.scenes.find((s) => s.id === action.payload.sceneId);
    if (!scene) return;
    scene.image = action.payload.image;
    scene.fullImagePrompt = action.payload.fullImagePrompt ?? null;
  },

  UPDATE_SCENE_COMMAND: (draft, action) => {
    const scene = draft.scenes.find((s) => s.id === action.payload.sceneId);
    if (scene) scene.sceneCommand = action.payload.sceneCommand;
  },

  UPDATE_SCENE_GRID: (draft, action) => {
    const scene = draft.scenes.find((s) => s.id === action.payload.sceneId);
    if (scene) scene.sceneGrid = action.payload.sceneGrid || scene.sceneGrid || null;
  },

  ADD_CHAT_MESSAGE: (draft, action) => {
    draft.chatHistory.push(action.payload);
  },

  UPDATE_SCENE_QUEST_OFFER: (draft, action) => {
    const { sceneId, offerId, status } = action.payload;
    const scene = draft.scenes.find((s) => s.id === sceneId);
    if (!scene || !scene.questOffers) return;
    const offer = scene.questOffers.find((o) => o.id === offerId);
    if (offer) offer.status = status;
  },
};
