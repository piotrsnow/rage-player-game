import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false);
  const [worldStateOpen, setWorldStateOpen] = useState(false);
  const [tasksInfoOpen, setTasksInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);

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

  return (
    <ModalContext.Provider
      value={{
        characterSheetOpen,
        worldStateOpen,
        tasksInfoOpen,
        settingsOpen,
        keysOpen,
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
