import { useEffect, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { MusicProvider } from '../../contexts/MusicContext';
import { ModalProvider, useModals } from '../../contexts/ModalContext';
import {
  useGameWorld,
  useGameQuests,
  useGameSlice,
  useGameDispatch,
  useGameAutoSave,
  useGameCampaign,
} from '../../stores/gameSelectors';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSettings } from '../../contexts/SettingsContext';
import ErrorBoundary from '../ui/ErrorBoundary';
import VersionBadge from '../ui/VersionBadge';
import CharacterSheet from '../character/CharacterSheet';
import DMSettingsPage from '../settings/DMSettingsPage';
import KeysModal from '../settings/KeysModal';
import ImageConfigModal from '../settings/ImageConfigModal';
import AudioConfigModal from '../settings/AudioConfigModal';
import UserProfileModal from '../settings/UserProfileModal';
import UserManagementModal from '../admin/UserManagementModal';
import PrivacyPolicyModal from '../settings/PrivacyPolicyModal';
import WorldStateModal from '../gameplay/WorldStateModal';
import TasksInfoModal from '../gameplay/TasksInfoModal';

const LocationGraphModal = lazy(() => import('../gameplay/locationGraph/LocationGraphModal'));

function ModalLayer() {
  const {
    characterSheetOpen,
    closeCharacterSheet,
    worldStateOpen,
    closeWorldState,
    tasksInfoOpen,
    closeTasksInfo,
    settingsOpen,
    closeSettings,
    keysOpen,
    closeKeys,
    imageConfigOpen,
    closeImageConfig,
    audioConfigOpen,
    closeAudioConfig,
    profileOpen,
    closeProfile,
    adminUsersOpen,
    closeAdminUsers,
    locationGraphOpen,
    closeLocationGraph,
    privacyOpen,
    closePrivacy,
  } = useModals();
  const campaign = useGameCampaign();
  const soloWorld = useGameWorld();
  const soloQuests = useGameQuests();
  const characterVoiceMap = useGameSlice((s) => s.characterVoiceMap);
  const dispatch = useGameDispatch();
  const autoSave = useGameAutoSave();
  const mp = useMultiplayer();
  const { settings, voicePools } = useSettings();
  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';

  return (
    <>
      {characterSheetOpen && <CharacterSheet onClose={closeCharacterSheet} />}
      {worldStateOpen && (
        <WorldStateModal
          world={isMultiplayer ? mp.state.gameState?.world : soloWorld}
          quests={isMultiplayer ? mp.state.gameState?.quests : soloQuests}
          characterVoiceMap={characterVoiceMap}
          maleVoices={voicePools.maleVoices}
          femaleVoices={voicePools.femaleVoices}
          ttsProvider={['elevenlabs', 'xtts'].includes(settings.sceneTtsTier) ? settings.sceneTtsTier : (settings.ttsProvider || 'elevenlabs')}
          dispatch={dispatch}
          autoSave={autoSave}
          onClose={closeWorldState}
        />
      )}
      {tasksInfoOpen && (
        <TasksInfoModal
          world={isMultiplayer ? mp.state.gameState?.world : soloWorld}
          quests={isMultiplayer ? mp.state.gameState?.quests : soloQuests}
          onVerifyObjective={isMultiplayer
            ? (questId, objectiveId) => mp.verifyQuestObjective(questId, objectiveId, settings.language || 'en')
            : null}
          onClose={closeTasksInfo}
        />
      )}
      {settingsOpen && <DMSettingsPage onClose={closeSettings} />}
      {keysOpen && <KeysModal onClose={closeKeys} />}
      {imageConfigOpen && <ImageConfigModal onClose={closeImageConfig} />}
      {audioConfigOpen && <AudioConfigModal onClose={closeAudioConfig} />}
      {profileOpen && <UserProfileModal onClose={closeProfile} />}
      {adminUsersOpen && <UserManagementModal onClose={closeAdminUsers} />}
      {privacyOpen && <PrivacyPolicyModal onClose={closePrivacy} />}
      {locationGraphOpen && campaign?.backendId && (
        <Suspense fallback={null}>
          <LocationGraphModal campaignId={campaign.backendId} onClose={closeLocationGraph} />
        </Suspense>
      )}
    </>
  );
}

export default function Layout() {
  const location = useLocation();
  const isPlaying = location.pathname.startsWith('/play');

  return (
    <MusicProvider>
      <ModalProvider>
        <div className="min-h-screen bg-surface-dim">
          <Header />
          <Sidebar />
          <main className={`pt-16 pb-24 lg:pb-0 min-h-screen ${isPlaying ? 'lg:pl-64' : ''}`}>
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
          <MobileNav />
          <ModalLayer />
          <VersionBadge />
          <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.03] mix-blend-overlay">
            <div className="absolute inset-0 noise-overlay" />
          </div>
        </div>
      </ModalProvider>
    </MusicProvider>
  );
}
