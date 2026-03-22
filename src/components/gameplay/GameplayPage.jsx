import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAI } from '../../hooks/useAI';
import { useNarrator } from '../../hooks/useNarrator';
import { useMusic } from '../../hooks/useMusic';
import { exportAsMarkdown } from '../../services/exportLog';
import ScenePanel from './ScenePanel';
import ActionPanel from './ActionPanel';
import ChatPanel from './ChatPanel';
import StatusBar from '../ui/StatusBar';
import LoadingSpinner from '../ui/LoadingSpinner';
export default function GameplayPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state, dispatch } = useGame();
  const { settings } = useSettings();
  const { generateScene, generateImageForScene } = useAI();
  const narrator = useNarrator();
  const music = useMusic(narrator.playbackState);
  const imageAttemptedRef = useRef(new Set());

  const { campaign, character, scenes, chatHistory, isGeneratingScene, isGeneratingImage, error } = state;
  const currentScene = scenes[scenes.length - 1] || null;

  useEffect(() => {
    if (!campaign) {
      navigate('/');
    }
  }, [campaign, navigate]);

  useEffect(() => {
    if (
      currentScene &&
      !currentScene.image &&
      !isGeneratingImage &&
      !isGeneratingScene &&
      !imageAttemptedRef.current.has(currentScene.id)
    ) {
      imageAttemptedRef.current.add(currentScene.id);
      generateImageForScene(currentScene.id, currentScene.narrative);
    }
  }, [currentScene, isGeneratingImage, isGeneratingScene, generateImageForScene]);

  const sceneMood = currentScene?.atmosphere?.mood;

  useEffect(() => {
    if (sceneMood && settings.musicEnabled && settings.sunoApiKey && !state.isGeneratingMusic) {
      music.ensureMusicForMood(
        sceneMood,
        campaign?.genre,
        campaign?.tone,
        currentScene?.musicPrompt
      );
    }
  }, [sceneMood, settings.musicEnabled, settings.sunoApiKey, state.isGeneratingMusic, music.ensureMusicForMood, campaign?.genre, campaign?.tone, currentScene?.musicPrompt]);

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
              {character && (
                <div className="hidden lg:flex items-center gap-4 text-[10px] text-on-surface-variant">
                  <span>{character.name}</span>
                  <span>{t('common.lvl')} {character.level}</span>
                </div>
              )}
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

        {/* Music Player */}
        {settings.musicEnabled && settings.sunoApiKey && (music.isGenerating || music.isPlaying || music.currentTrackTitle || music.error) && (
          <div className={`flex items-center gap-3 px-3 py-2 border rounded-sm mx-2 animate-fade-in ${
            music.error ? 'bg-error-container/20 border-error/20' : 'bg-surface-container/50 border-outline-variant/10'
          }`}>
            {music.error ? (
              <>
                <span className="material-symbols-outlined text-lg text-error">error</span>
                <p className="flex-1 text-[10px] font-label uppercase tracking-widest text-error truncate">
                  {music.error}
                </p>
              </>
            ) : (
              <>
                <button
                  onClick={music.togglePlayPause}
                  disabled={music.isGenerating && !music.isPlaying}
                  className="material-symbols-outlined text-lg text-primary hover:text-tertiary transition-colors disabled:opacity-30"
                >
                  {music.isPlaying ? 'pause' : 'play_arrow'}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant truncate">
                    {music.isGenerating
                      ? t('gameplay.generatingMusic')
                      : music.currentTrackTitle || t('gameplay.musicPlaying')}
                  </p>
                </div>
                {music.isGenerating && (
                  <span className="material-symbols-outlined text-sm text-primary animate-spin">progress_activity</span>
                )}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.musicVolume ?? 40}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    music.setVolume(v);
                  }}
                  className="w-16 h-1 accent-primary cursor-pointer"
                />
                <span className="material-symbols-outlined text-xs text-outline">
                  {(settings.musicVolume ?? 40) === 0 ? 'volume_off' : 'volume_up'}
                </span>
              </>
            )}
          </div>
        )}

        {/* Scene Panel */}
        <ScenePanel scene={currentScene} isGeneratingImage={isGeneratingImage} highlightInfo={narrator.highlightInfo} currentSentence={narrator.currentSentence} diceRoll={currentScene?.diceRoll && !isGeneratingScene ? currentScene.diceRoll : null} />

        {/* Character Quick Stats (mobile & in-game) */}
        {character && (
          <div className="lg:hidden grid grid-cols-2 gap-4 px-2">
            <StatusBar label={t('common.health')} current={character.hp} max={character.maxHp} color="error" />
            <StatusBar label={t('common.mana')} current={character.mana} max={character.maxMana} color="primary" />
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
        />
      </aside>
    </div>
  );
}
