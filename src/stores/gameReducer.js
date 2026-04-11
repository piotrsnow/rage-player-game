import { produce } from 'immer';
import { reduceMultiplayerSlice } from '../contexts/slices/multiplayerSlice';
import {
  initialState,
  createDefaultAchievementState,
  createDefaultNeeds,
} from './handlers/_shared';
import { campaignHandlers } from './handlers/campaignHandlers';
import { sceneHandlers } from './handlers/sceneHandlers';
import { characterHandlers } from './handlers/characterHandlers';
import { inventoryHandlers } from './handlers/inventoryHandlers';
import { questHandlers } from './handlers/questHandlers';
import { worldHandlers } from './handlers/worldHandlers';
import { uiHandlers } from './handlers/uiHandlers';
import { combatHandlers } from './handlers/combatHandlers';
import { tradeCraftAlchemyHandlers } from './handlers/tradeCraftAlchemyHandlers';
import { partyHandlers } from './handlers/partyHandlers';
import { fieldMapHandlers } from './handlers/fieldMapHandlers';
import { applyStateChangesHandler } from './handlers/applyStateChangesHandler';

/**
 * Merged lookup map: action.type → handler function (draft, action) => void | newState.
 * Each handler file groups one domain; duplicates across files would silently overwrite
 * so keep action names unique (they are — enforced by convention).
 */
const HANDLERS = {
  ...campaignHandlers,
  ...sceneHandlers,
  ...characterHandlers,
  ...inventoryHandlers,
  ...questHandlers,
  ...worldHandlers,
  ...uiHandlers,
  ...combatHandlers,
  ...tradeCraftAlchemyHandlers,
  ...partyHandlers,
  ...fieldMapHandlers,
  APPLY_STATE_CHANGES: applyStateChangesHandler,
};

export function gameReducer(state, action) {
  // Multiplayer slice actions have their own reducer.
  if (action.type === 'LOAD_MULTIPLAYER_STATE' || action.type.startsWith('MP_')) {
    return reduceMultiplayerSlice(state, action);
  }

  const handler = HANDLERS[action.type];
  if (!handler) return state;

  return produce(state, (draft) => {
    // Handlers may either mutate the draft in-place (Immer style) or return a
    // fresh state value to replace it wholesale (used by START_CAMPAIGN/LOAD_CAMPAIGN/RESET,
    // which are full-state transitions rather than incremental mutations).
    const result = handler(draft, action);
    if (result !== undefined) return result;
  });
}

export { initialState, createDefaultAchievementState, createDefaultNeeds };
