import { applyBoardMutations } from '../../../shared/domain/explorationBoard.js';

export const worldHandlers = {
  UPDATE_WORLD: (draft, action) => {
    Object.assign(draft.world, action.payload);
  },

  SET_BOARD_POSITION: (draft, action) => {
    const { x, y } = action.payload;
    if (!draft.world) draft.world = {};
    draft.world.boardPosition = { x, y };
  },

  SET_LOCATION_BOARD: (draft, action) => {
    if (!draft.world) draft.world = {};
    draft.world.locationBoard = action.payload;
  },

  APPLY_BOARD_MUTATIONS: (draft, action) => {
    const { mutations } = action.payload;
    if (draft.world?.locationBoard && Array.isArray(mutations)) {
      applyBoardMutations(draft.world.locationBoard, mutations);
    }
  },

  CLEAR_BOARD_FOG: (draft, action) => {
    const { cells } = action.payload;
    if (!draft.world) draft.world = {};
    if (!draft.world.boardVisited) draft.world.boardVisited = {};
    for (const key of cells) {
      draft.world.boardVisited[key] = true;
    }
  },
};
