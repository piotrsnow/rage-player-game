import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openCharacterSheet = useCallback(() => setCharacterSheetOpen(true), []);
  const closeCharacterSheet = useCallback(() => setCharacterSheetOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  return (
    <ModalContext.Provider
      value={{
        characterSheetOpen,
        settingsOpen,
        openCharacterSheet,
        closeCharacterSheet,
        openSettings,
        closeSettings,
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
