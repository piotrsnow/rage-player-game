import { create } from 'zustand';
import { initialState, gameReducer } from './gameReducer';
import { storage } from '../services/storage';

let saveTimer = null;

export const useGameStore = create((set, get) => ({
  state: initialState,

  dispatch: (action) => {
    set((prev) => ({ state: gameReducer(prev.state, action) }));
  },

  autoSave: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const current = get().state;
      if (!current.campaign) return;

      storage.saveCampaign(current).catch((err) => {
        console.error('[gameStore] Save error:', err);
      });

      if (current.character) {
        const charCopy = { ...current.character };
        storage.saveCharacter(charCopy).then(() => {
          if (!current.character.localId && charCopy.localId) {
            get().dispatch({ type: 'SET_CHARACTER_LOCAL_ID', payload: charCopy.localId });
          }
        });
      }
    }, 1500);
  },
}));

export function flushPendingSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const current = useGameStore.getState().state;
  if (current.campaign) {
    storage.saveCampaign(current).catch(() => {});
  }
}

export function getGameState() {
  return useGameStore.getState().state;
}

export function gameDispatch(action) {
  useGameStore.getState().dispatch(action);
}
