import { createContext, useContext, useReducer, useRef, useCallback } from 'react';
import { initialState, mpReducer } from './multiplayer/mpReducer';
import { useMpWsSubscription } from './multiplayer/useMpWsSubscription';
import { useMpActions } from './multiplayer/useMpActions';

const MultiplayerContext = (import.meta.hot?.data?.MultiplayerContext) || createContext(null);
if (import.meta.hot) import.meta.hot.data.MultiplayerContext = MultiplayerContext;

export function MultiplayerProvider({ children }) {
  const [state, dispatch] = useReducer(mpReducer, initialState);
  const sceneCallbackRef = useRef(null);
  const pendingQuestVerifyRef = useRef(new Map());

  useMpWsSubscription({ dispatch, sceneCallbackRef, pendingQuestVerifyRef });

  const actions = useMpActions({ dispatch, pendingQuestVerifyRef });

  const onSceneUpdate = useCallback((cb) => {
    sceneCallbackRef.current = cb;
  }, []);

  const value = {
    state,
    dispatch,
    ...actions,
    onSceneUpdate,
  };

  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayer() {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) throw new Error('useMultiplayer must be used within MultiplayerProvider');
  return ctx;
}
