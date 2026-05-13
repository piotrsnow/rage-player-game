import { useEffect, lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { useUltrawideBonus } from '../../hooks/useUltrawideBonus';
import { MusicProvider } from '../../contexts/MusicContext';
import { ModalProvider, useModals } from '../../contexts/ModalContext';
import { DictationProvider } from '../../contexts/DictationContext';
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
import DevEventLogPanel from '../admin/DevEventLogPanel';
import FloatingDiceOverlay from '../ui/FloatingDiceOverlay';
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
const GMModal = lazy(() => import('../gameplay/gm/GMModal'));

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
    worldLocationGraphOpen,
    worldLocationGraphRefreshKey,
    closeWorldLocationGraph,
    gmModalOpen,
    closeGmModal,
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
  const { settings, voicePools, backendUser } = useSettings();
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
          campaignId={campaign?.backendId}
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
      {worldLocationGraphOpen && backendUser?.isAdmin && (
        <Suspense fallback={null}>
          <LocationGraphModal
            key="world-graph"
            worldMode
            openGeneration={worldLocationGraphRefreshKey}
            onClose={closeWorldLocationGraph}
          />
        </Suspense>
      )}
      {gmModalOpen && (
        <Suspense fallback={null}>
          <GMModal onClose={closeGmModal} />
        </Suspense>
      )}
    </>
  );
}

export default function Layout() {
  const location = useLocation();
  const isPlaying = location.pathname.startsWith('/play');
  const uwBonus = useUltrawideBonus();

  useEffect(() => {
    if (!isPlaying) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehaviorY,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehaviorY,
    };
    // Avoid html/body height:100% — it breaks the normal flow chain and can leave the
    // layout visually offset (“stuck scrolled down”). Overflow-only lock is enough.
    html.style.overflow = 'hidden';
    html.style.overscrollBehaviorY = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehaviorY = 'none';
    window.scrollTo(0, 0);
    html.scrollTop = 0;
    body.scrollTop = 0;
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehaviorY = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehaviorY = prev.bodyOverscroll;
    };
  }, [isPlaying, location.pathname]);

  return (
    <MusicProvider>
      <DictationProvider>
      <ModalProvider>
        <div className={`min-h-screen bg-surface-dim ${isPlaying ? 'overflow-x-hidden overflow-y-hidden overscroll-y-none' : ''}`}>
          <Header />
          <Sidebar />
          <main
            className={`pt-16 pb-24 lg:pb-0 min-h-screen ${isPlaying
              ? 'overflow-x-hidden overflow-y-hidden overscroll-y-none lg:pl-[320px]'
              : ''}`}
            style={isPlaying && uwBonus.sidebar > 0 ? { paddingLeft: 320 + uwBonus.sidebar } : undefined}
          >
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
          <MobileNav />
          <ModalLayer />
          <DevEventLogPanel />
          {/* <FloatingDiceOverlay /> */}
          <div className="fixed inset-0 pointer-events-none z-[100] opacity-[0.03] mix-blend-overlay">
            <div className="absolute inset-0 noise-overlay" />
          </div>
        </div>
      </ModalProvider>
      </DictationProvider>
    </MusicProvider>
  );
}
