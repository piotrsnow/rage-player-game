import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useAI } from '../../hooks/useAI';
import { useNarrator } from '../../hooks/useNarrator';
import { useGlobalMusic } from '../../contexts/MusicContext';
import { exportAsMarkdown } from '../../services/exportLog';
import ScenePanel from './ScenePanel';
import ActionPanel from './ActionPanel';
import ChatPanel from './ChatPanel';
import StatusBar from '../ui/StatusBar';
import LoadingSpinner from '../ui/LoadingSpinner';
import WorldStateModal from './WorldStateModal';
import CostBadge from '../ui/CostBadge';

export default function GameplayPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state, dispatch } = useGame();
  const { settings } = useSettings();
  const mp = useMultiplayer();
  const { generateScene, generateImageForScene } = useAI();
  const narrator = useNarrator();
  const { setNarratorState } = useGlobalMusic();
  const imageAttemptedRef = useRef(new Set());

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const mpGameState = mp.state.gameState;

  useEffect(() => {
    setNarratorState(narrator.playbackState);
  }, [narrator.playbackState, setNarratorState]);
  const [worldModalOpen, setWorldModalOpen] = useState(false);

  const campaign = isMultiplayer ? mpGameState?.campaign : state.campaign;
  const character = isMultiplayer
    ? mpGameState?.characters?.find((c) => {
        const myPlayer = mp.state.players?.find((p) => p.odId === mp.state.myOdId);
        return c.playerName === myPlayer?.name || c.name === myPlayer?.name;
      }) || mpGameState?.characters?.[0]
    : state.character;
  const allCharacters = isMultiplayer ? (mpGameState?.characters || []) : (character ? [character] : []);
  const scenes = isMultiplayer ? (mpGameState?.scenes || []) : state.scenes;
  const chatHistory = isMultiplayer ? (mpGameState?.chatHistory || []) : state.chatHistory;
  const isGeneratingScene = isMultiplayer ? mp.state.isGenerating : state.isGeneratingScene;
  const isGeneratingImage = state.isGeneratingImage;
  const error = isMultiplayer ? mp.state.error : state.error;
  const aiCosts = state.aiCosts;
  const currentScene = scenes[scenes.length - 1] || null;

  useEffect(() => {
    if (!campaign && !isMultiplayer) {
      navigate('/');
    }
  }, [campaign, isMultiplayer, navigate]);

  useEffect(() => {
    if (
      currentScene &&
      !currentScene.image &&
      !isGeneratingImage &&
      !isGeneratingScene &&
      !imageAttemptedRef.current.has(currentScene.id)
    ) {
      if (isMultiplayer && !mp.state.isHost) return;
      imageAttemptedRef.current.add(currentScene.id);
      generateImageForScene(
        currentScene.id,
        currentScene.narrative,
        currentScene.imagePrompt,
        isMultiplayer ? { genre: campaign?.genre, tone: campaign?.tone } : undefined
      ).then((imageUrl) => {
        if (isMultiplayer && imageUrl) {
          mp.updateSceneImage(currentScene.id, imageUrl);
        }
      });
    }
  }, [currentScene, isGeneratingImage, isGeneratingScene, generateImageForScene, isMultiplayer, mp, campaign]);

  const handleAction = async (action) => {
    try {
      await generateScene(action, false);
    } catch {
      // Error displayed in UI via context
    }
  };

  const dismissError = () => {
    dispatch({ type: 'SET_ERROR', payload: null });
  };

  if (!campaign) return null;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden">
      {/* Main Game Area */}
      <div className="flex-1 flex flex-col p-4 md:p-6 gap-6 overflow-y-auto custom-scrollbar">
        {/* Scene Counter */}
        {scenes.length > 0 && (
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                {campaign.name}
              </span>
              <span className="w-1 h-1 bg-primary/50 rounded-full" />
              <span className="text-[10px] text-outline">{t('common.scene')} {scenes.length}</span>
            </div>
            <div className="flex items-center gap-4">
              {aiCosts?.total > 0 && (
                <CostBadge costs={aiCosts} />
              )}
              {isMultiplayer && allCharacters.length > 0 ? (
                <div className="hidden lg:flex items-center gap-4 text-[10px] text-on-surface-variant">
                  {allCharacters.map((c) => (
                    <span key={c.name}>{c.name} HP:{c.hp}/{c.maxHp}</span>
                  ))}
                </div>
              ) : character ? (
                <div className="hidden lg:flex items-center gap-4 text-[10px] text-on-surface-variant">
                  <span>{character.name}</span>
                  <span>{t('common.lvl')} {character.level}</span>
                </div>
              ) : null}
              <button
                onClick={() => setWorldModalOpen(true)}
                title={t('worldState.title')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                public
              </button>
              <button
                onClick={() => exportAsMarkdown(state)}
                title={t('gameplay.exportLog')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                download
              </button>
            </div>
          </div>
        )}

        {/* Scene Panel */}
        <ScenePanel scene={currentScene} isGeneratingImage={isGeneratingImage} highlightInfo={narrator.highlightInfo} currentSentence={narrator.currentSentence} diceRoll={currentScene?.diceRoll && !isGeneratingScene ? currentScene.diceRoll : null} />

        {/* Character Quick Stats (HP/Mana inline for mobile) */}
        {character && (
          <div className="lg:hidden space-y-3 px-2">
            <div className="grid grid-cols-2 gap-4">
              <StatusBar label={t('common.health')} current={character.hp} max={character.maxHp} color="error" />
              <StatusBar label={t('common.mana')} current={character.mana} max={character.maxMana} color="primary" />
            </div>
          </div>
        )}

        {/* Loading State */}
        {isGeneratingScene && (
          <div className="flex items-center justify-center py-8 animate-fade-in">
            <LoadingSpinner text={t('gameplay.dmWeavesFate')} />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-error-container/20 border border-error/20 p-4 rounded-sm mx-2 animate-fade-in">
            <div className="flex items-start justify-between gap-3">
              <p className="text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {error}
              </p>
              <button onClick={dismissError} className="text-error/60 hover:text-error transition-colors shrink-0">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            {error.includes('API key') && (
              <button
                onClick={() => navigate('/settings')}
                className="mt-2 text-xs text-primary hover:text-tertiary transition-colors underline"
              >
                {t('gameplay.goToSettings')}
              </button>
            )}
          </div>
        )}

        {/* Action Panel */}
        {currentScene && !isGeneratingScene && (
          <div className="px-2 animate-fade-in">
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-3">
              {t('gameplay.chooseAction')}
            </label>
            <ActionPanel
              actions={currentScene.actions}
              onAction={handleAction}
              disabled={isGeneratingScene}
            />
          </div>
        )}

      </div>

      {/* Right Sidebar: Chat Panel */}
      <aside className="w-full lg:w-96 bg-surface-container-low/50 backdrop-blur-md border-l border-outline-variant/15 flex flex-col h-[400px] lg:h-full shrink-0">
        <ChatPanel
          messages={chatHistory}
          narrator={settings.narratorEnabled ? narrator : null}
          autoPlay={settings.narratorEnabled && settings.narratorAutoPlay}
          myOdId={isMultiplayer ? mp.state.myOdId : null}
        />
      </aside>

      {worldModalOpen && (
        <WorldStateModal
          world={state.world}
          characterVoiceMap={state.characterVoiceMap}
          characterVoices={settings.characterVoices}
          dispatch={dispatch}
          onClose={() => setWorldModalOpen(false)}
        />
      )}
    </div>
  );
}
