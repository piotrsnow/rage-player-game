import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = (import.meta.hot?.data?.ModalContext) || createContext(null);
if (import.meta.hot) import.meta.hot.data.ModalContext = ModalContext;

export function ModalProvider({ children }) {
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false);
  const [worldStateOpen, setWorldStateOpen] = useState(false);
  const [tasksInfoOpen, setTasksInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [imageConfigOpen, setImageConfigOpen] = useState(false);
  const [audioConfigOpen, setAudioConfigOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [adminUsersOpen, setAdminUsersOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // NPC sheet modal triggered from chat speaker labels. Stores the NPC name
  // rather than a reference so the latest world.npcs entry is always read
  // fresh (disposition / stats can change between open and close).
  const [locationGraphOpen, setLocationGraphOpen] = useState(false);
  const [gmModalOpen, setGmModalOpen] = useState(false);
  const [npcSheetName, setNpcSheetName] = useState(null);

  const openCharacterSheet = useCallback(() => setCharacterSheetOpen(true), []);
  const closeCharacterSheet = useCallback(() => setCharacterSheetOpen(false), []);
  const openLocationGraph = useCallback(() => setLocationGraphOpen(true), []);
  const closeLocationGraph = useCallback(() => setLocationGraphOpen(false), []);
  const openGmModal = useCallback(() => setGmModalOpen(true), []);
  const closeGmModal = useCallback(() => setGmModalOpen(false), []);
  const openWorldState = useCallback(() => setWorldStateOpen(true), []);
  const closeWorldState = useCallback(() => setWorldStateOpen(false), []);
  const openTasksInfo = useCallback(() => setTasksInfoOpen(true), []);
  const closeTasksInfo = useCallback(() => setTasksInfoOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openKeys = useCallback(() => setKeysOpen(true), []);
  const closeKeys = useCallback(() => setKeysOpen(false), []);
  const openImageConfig = useCallback(() => setImageConfigOpen(true), []);
  const closeImageConfig = useCallback(() => setImageConfigOpen(false), []);
  const openAudioConfig = useCallback(() => setAudioConfigOpen(true), []);
  const closeAudioConfig = useCallback(() => setAudioConfigOpen(false), []);
  const openProfile = useCallback(() => setProfileOpen(true), []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const openAdminUsers = useCallback(() => setAdminUsersOpen(true), []);
  const closeAdminUsers = useCallback(() => setAdminUsersOpen(false), []);
  const openPrivacy = useCallback(() => setPrivacyOpen(true), []);
  const closePrivacy = useCallback(() => setPrivacyOpen(false), []);
  const openNpcSheet = useCallback((name) => setNpcSheetName(name || null), []);
  const closeNpcSheet = useCallback(() => setNpcSheetName(null), []);

  return (
    <ModalContext.Provider
      value={{
        characterSheetOpen,
        locationGraphOpen,
        gmModalOpen,
        worldStateOpen,
        tasksInfoOpen,
        settingsOpen,
        keysOpen,
        imageConfigOpen,
        audioConfigOpen,
        profileOpen,
        adminUsersOpen,
        privacyOpen,
        npcSheetName,
        openCharacterSheet,
        closeCharacterSheet,
        openLocationGraph,
        closeLocationGraph,
        openGmModal,
        closeGmModal,
        openWorldState,
        closeWorldState,
        openTasksInfo,
        closeTasksInfo,
        openSettings,
        closeSettings,
        openKeys,
        closeKeys,
        openImageConfig,
        closeImageConfig,
        openAudioConfig,
        closeAudioConfig,
        openProfile,
        closeProfile,
        openAdminUsers,
        closeAdminUsers,
        openPrivacy,
        closePrivacy,
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
