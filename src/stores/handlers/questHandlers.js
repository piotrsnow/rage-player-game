import { ensureMapContainsLocationDraft } from './_shared';

export const questHandlers = {
  ADD_QUEST: (draft, action) => {
    const quest = { ...action.payload, createdAt: action.payload?.createdAt ?? Date.now() };
    draft.quests.active.push(quest);
    if (quest?.locationId) {
      ensureMapContainsLocationDraft(draft.world, quest.locationId);
    }
  },
};
