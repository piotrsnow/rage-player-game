import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = (import.meta.hot?.data?.ModalContext) || createContext(null);
if (import.meta.hot) import.meta.hot.data.ModalContext = ModalContext;

export function ModalProvider({ children }) {
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false);
  const [worldStateOpen, setWorldStateOpen] = useState(false);
  const [tasksInfoOpen, setTasksInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  // NPC sheet modal triggered from chat speaker labels. Stores the NPC name
  // rather than a reference so the latest world.npcs entry is always read
  // fresh (disposition / stats can change between open and close).
  const [npcSheetName, setNpcSheetName] = useState(null);

  const openCharacterSheet = useCallback(() => setCharacterSheetOpen(true), []);
  const closeCharacterSheet = useCallback(() => setCharacterSheetOpen(false), []);
  const openWorldState = useCallback(() => setWorldStateOpen(true), []);
  const closeWorldState = useCallback(() => setWorldStateOpen(false), []);
  const openTasksInfo = useCallback(() => setTasksInfoOpen(true), []);
  const closeTasksInfo = useCallback(() => setTasksInfoOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openKeys = useCallback(() => setKeysOpen(true), []);
  const closeKeys = useCallback(() => setKeysOpen(false), []);
  const openNpcSheet = useCallback((name) => setNpcSheetName(name || null), []);
  const closeNpcSheet = useCallback(() => setNpcSheetName(null), []);

  return (
    <ModalContext.Provider
      value={{
        characterSheetOpen,
        worldStateOpen,
        tasksInfoOpen,
        settingsOpen,
        keysOpen,
        npcSheetName,
        openCharacterSheet,
        closeCharacterSheet,
        openWorldState,
        closeWorldState,
        openTasksInfo,
        closeTasksInfo,
        openSettings,
        closeSettings,
        openKeys,
        closeKeys,
        openNpcSheet,
        closeNpcSheet,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModals() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModals must be used within ModalProvider');
  return ctx;
}
