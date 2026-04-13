export const worldHandlers = {
  UPDATE_WORLD: (draft, action) => {
    Object.assign(draft.world, action.payload);
  },
};
