import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import { MusicProvider } from '../../contexts/MusicContext';
import { ModalProvider, useModals } from '../../contexts/ModalContext';
import { useGame } from '../../contexts/GameContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useSettings } from '../../contexts/SettingsContext';
import ErrorBoundary from '../ui/ErrorBoundary';
import VersionBadge from '../ui/VersionBadge';
import CharacterSheet from '../character/CharacterSheet';
import DMSettingsPage from '../settings/DMSettingsPage';
import KeysModal from '../settings/KeysModal';
import WorldStateModal from '../gameplay/WorldStateModal';
import TasksInfoModal from '../gameplay/TasksInfoModal';

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
  } = useModals();
  const { state, dispatch, autoSave } = useGame();
  const mp = useMultiplayer();
  const { settings } = useSettings();
  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';

  return (
    <>
      {characterSheetOpen && <CharacterSheet onClose={closeCharacterSheet} />}
      {worldStateOpen && (
        <WorldStateModal
          world={isMultiplayer ? mp.state.gameState?.world : state.world}
          quests={isMultiplayer ? mp.state.gameState?.quests : state.quests}
          characterVoiceMap={state.characterVoiceMap}
          maleVoices={settings.maleVoices}
          femaleVoices={settings.femaleVoices}
          dispatch={dispatch}
          autoSave={autoSave}
          onClose={closeWorldState}
        />
      )}
      {tasksInfoOpen && (
        <TasksInfoModal
          world={isMultiplayer ? mp.state.gameState?.world : state.world}
          quests={isMultiplayer ? mp.state.gameState?.quests : state.quests}
          onVerifyObjective={isMultiplayer
            ? (questId, objectiveId) => mp.verifyQuestObjective(questId, objectiveId, settings.language || 'en')
            : null}
          onClose={closeTasksInfo}
        />
      )}
      {settingsOpen && <DMSettingsPage onClose={closeSettings} />}
      {keysOpen && <KeysModal onClose={closeKeys} />}
    </>
  );
}

export default function Layout() {
  return (
    <MusicProvider>
      <ModalProvider>
        <div className="min-h-screen bg-surface-dim">
          <Header />
          <Sidebar />
          <main className="lg:pl-64 pt-16 pb-24 lg:pb-0 min-h-screen">
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
