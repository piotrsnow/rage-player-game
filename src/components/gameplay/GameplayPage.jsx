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
import MultiplayerPanel from '../multiplayer/MultiplayerPanel';
import CostBadge from '../ui/CostBadge';
import AdvancementPanel from '../character/AdvancementPanel';
import { useModals } from '../../contexts/ModalContext';
import { translateCareer } from '../../utils/wfrpTranslate';

export default function GameplayPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state, dispatch } = useGame();
  const { settings } = useSettings();
  const { openSettings } = useModals();
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
  const [mpPanelOpen, setMpPanelOpen] = useState(false);
  const [advancementOpen, setAdvancementOpen] = useState(false);

  const campaign = isMultiplayer ? mpGameState?.campaign : state.campaign;
  const character = isMultiplayer
    ? mpGameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mpGameState?.characters?.[0]
    : state.character;
  const availableXp = character ? (character.xp || 0) - (character.xpSpent || 0) : 0;
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

  useEffect(() => {
    if (!isMultiplayer) return;
    const players = mp.state.players || [];
    for (const p of players) {
      if (p.voiceId && p.name) {
        const existing = state.characterVoiceMap?.[p.name];
        if (!existing || existing.voiceId !== p.voiceId) {
          dispatch({
            type: 'MAP_CHARACTER_VOICE',
            payload: { characterName: p.name, voiceId: p.voiceId, gender: p.gender || null },
          });
        }
      }
    }
  }, [isMultiplayer, mp.state.players, state.characterVoiceMap, dispatch]);

  const handleAction = async (action, isCustomAction = false) => {
    try {
      await generateScene(action, false, isCustomAction);
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
              {availableXp > 0 && (
                <button
                  onClick={() => setAdvancementOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-widest rounded-sm border border-primary/20 hover:bg-primary/25 transition-all animate-fade-in"
                >
                  <span className="material-symbols-outlined text-xs">upgrade</span>
                  {availableXp} {t('common.xp')}
                </button>
              )}
              {isMultiplayer && allCharacters.length > 0 ? (
                <div className="hidden lg:flex items-center gap-4 text-[10px] text-on-surface-variant">
                  {allCharacters.map((c) => (
                    <span key={c.name}>{c.name} W:{c.wounds}/{c.maxWounds}</span>
                  ))}
                </div>
              ) : character ? (
                <div className="hidden lg:flex items-center gap-4 text-[10px] text-on-surface-variant">
                  <span>{character.name}</span>
                  <span>{translateCareer(character.career?.name, t)}</span>
                </div>
              ) : null}
              <button
                onClick={() => setMpPanelOpen(true)}
                title={isMultiplayer ? t('multiplayer.invitePlayers') : t('multiplayer.openMultiplayer')}
                aria-label={isMultiplayer ? t('multiplayer.invitePlayers') : t('multiplayer.openMultiplayer')}
                className={`material-symbols-outlined text-sm transition-colors ${
                  isMultiplayer ? 'text-primary hover:text-tertiary' : 'text-outline hover:text-primary'
                }`}
              >
                {isMultiplayer ? 'group' : 'group_add'}
              </button>
              <button
                onClick={() => setWorldModalOpen(true)}
                title={t('worldState.title')}
                aria-label={t('worldState.title')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                public
              </button>
              <button
                onClick={() => {
                  if (isMultiplayer && mpGameState) {
                    exportAsMarkdown({
                      campaign: mpGameState.campaign,
                      character: character,
                      scenes: mpGameState.scenes,
                      chatHistory: mpGameState.chatHistory,
                      quests: mpGameState.quests,
                      world: mpGameState.world,
                    });
                  } else {
                    exportAsMarkdown(state);
                  }
                }}
                title={t('gameplay.exportLog')}
                aria-label={t('gameplay.exportLog')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                download
              </button>
            </div>
          </div>
        )}

        {/* Scene Panel */}
        <ScenePanel scene={currentScene} isGeneratingImage={isGeneratingImage} highlightInfo={narrator.highlightInfo} currentSentence={narrator.currentSentence} diceRoll={currentScene?.diceRoll && !isGeneratingScene ? currentScene.diceRoll : null} diceRolls={currentScene?.diceRolls?.length && !isGeneratingScene ? currentScene.diceRolls : null} />

        {/* Character Quick Stats (Wounds/Meta-currencies for mobile) */}
        {character && (
          <div className="lg:hidden space-y-3 px-2">
            <div className="grid grid-cols-2 gap-4">
              <StatusBar label={t('common.wounds')} current={character.wounds} max={character.maxWounds} color="error" />
              <div className="flex items-center justify-center gap-3 text-[10px] text-on-surface-variant uppercase tracking-widest">
                <span>{t('common.fortune')} {character.fortune}/{character.fate}</span>
                <span>{t('common.resolve')} {character.resolve}/{character.resilience}</span>
              </div>
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
              <button onClick={dismissError} aria-label={t('common.close')} className="text-error/60 hover:text-error transition-colors shrink-0">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            {error.includes('API key') && (
              <button
                onClick={openSettings}
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
          momentumBonus={state.momentumBonus || 0}
        />
      </aside>

      {worldModalOpen && (
        <WorldStateModal
          world={isMultiplayer ? mpGameState?.world : state.world}
          characterVoiceMap={state.characterVoiceMap}
          characterVoices={settings.characterVoices}
          dispatch={dispatch}
          onClose={() => setWorldModalOpen(false)}
        />
      )}

      {mpPanelOpen && (
        <MultiplayerPanel onClose={() => setMpPanelOpen(false)} />
      )}

      {advancementOpen && (
        <AdvancementPanel onClose={() => setAdvancementOpen(false)} />
      )}
    </div>
  );
}
