export const tradeCraftAlchemyHandlers = {
  START_TRADE: (draft, action) => {
    draft.trade = action.payload;
  },

  UPDATE_TRADE: (draft, action) => {
    if (!draft.trade) return;
    Object.assign(draft.trade, action.payload);
  },

  END_TRADE: (draft) => {
    draft.trade = null;
  },

  START_CRAFTING: (draft, action) => {
    draft.crafting = { active: true, log: [], ...action.payload };
  },

  END_CRAFTING: (draft) => {
    draft.crafting = null;
  },

  START_ALCHEMY: (draft, action) => {
    draft.alchemy = { active: true, log: [], ...action.payload };
  },

  END_ALCHEMY: (draft) => {
    draft.alchemy = null;
  },
};
