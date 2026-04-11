export const combatHandlers = {
  START_COMBAT: (draft, action) => {
    draft.combat = action.payload;
  },

  UPDATE_COMBAT: (draft, action) => {
    if (!draft.combat) return;
    Object.assign(draft.combat, action.payload);
  },

  END_COMBAT: (draft) => {
    draft.combat = null;
  },
};
