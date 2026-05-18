import { createContext, useContext, useState, useCallback, useRef } from 'react';
import useMagnifier from '../hooks/useMagnifier';

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
  const [gmModalOpen, setGmModalOpen] = useState(false);
  const [worldLocationGraphOpen, setWorldLocationGraphOpen] = useState(false);
  /** Increment on each open so `LocationGraphModal` world snapshot refetches. */
  const [worldLocationGraphRefreshKey, setWorldLocationGraphRefreshKey] = useState(0);
  // NPC sheet modal triggered from chat speaker labels. Stores the NPC name
  // so the latest world.npcs entry is always read fresh.
  const [npcSheetName, setNpcSheetName] = useState(null);

  const openCharacterSheet = useCallback(() => setCharacterSheetOpen(true), []);
  const closeCharacterSheet = useCallback(() => setCharacterSheetOpen(false), []);
  const openWorldLocationGraph = useCallback(() => {
    setWorldLocationGraphRefreshKey((k) => k + 1);
    setWorldLocationGraphOpen(true);
  }, []);
  const closeWorldLocationGraph = useCallback(() => setWorldLocationGraphOpen(false), []);
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

  const magnifier = useMagnifier();

  const playerActionHandlerRef = useRef(null);
  const setPlayerActionHandler = useCallback((fn) => {
    playerActionHandlerRef.current = fn || null;
  }, []);

  return (
    <ModalContext.Provider
      value={{
        characterSheetOpen,
        gmModalOpen,
        worldLocationGraphOpen,
        worldLocationGraphRefreshKey,
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
        openWorldLocationGraph,
        closeWorldLocationGraph,
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
        magnifier,
        playerActionHandlerRef,
        setPlayerActionHandler,
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
