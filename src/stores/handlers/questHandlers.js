import { ensureMapContainsLocationDraft } from './_shared';

export const questHandlers = {
  ADD_QUEST: (draft, action) => {
    const quest = { ...action.payload, createdAt: action.payload?.createdAt ?? Date.now() };
    draft.quests.active.push(quest);
    if (quest?.locationId) {
      ensureMapContainsLocationDraft(draft.world, quest.locationId);
    }
  },

  RECONCILE_QUESTS_FROM_BACKEND: (draft, action) => {
    if (!action.payload) return;
    const { active = [], completed = [] } = action.payload;
    draft.quests.active = active;
    draft.quests.completed = completed;
  },
};
