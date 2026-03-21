import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useAI } from '../../hooks/useAI';
import { useNarrator } from '../../hooks/useNarrator';
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
  const { generateScene } = useAI();
  const narrator = useNarrator();

  const { campaign, character, scenes, chatHistory, isGeneratingScene, isGeneratingImage, error } = state;
  const currentScene = scenes[scenes.length - 1] || null;

  useEffect(() => {
    if (!campaign) {
      navigate('/');
    }
  }, [campaign, navigate]);

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
            {character && (
              <div className="hidden lg:flex items-center gap-4 text-[10px] text-on-surface-variant">
                <span>{character.name}</span>
                <span>{t('common.lvl')} {character.level}</span>
              </div>
            )}
          </div>
        )}

        {/* Scene Panel */}
        <ScenePanel scene={currentScene} isGeneratingImage={isGeneratingImage} />

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

        {/* Dice Roll Display */}
        {currentScene?.diceRoll && !isGeneratingScene && (
          <div className="flex items-center justify-center py-4 animate-fade-in">
            <div className="bg-surface-container/50 border border-outline-variant/10 rounded-xl px-8 py-4 flex items-center gap-6 animate-pulse-glow">
              <div className="relative">
                <span className="material-symbols-outlined text-5xl text-tertiary drop-shadow-[0_0_15px_rgba(255,239,213,0.4)]">
                  casino
                </span>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-headline text-lg font-bold text-on-primary-fixed">
                    {currentScene.diceRoll.roll}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  {t('gameplay.diceCheck', { skill: currentScene.diceRoll.skill })}
                </p>
                <p className="text-sm font-headline text-tertiary">
                  {t('gameplay.diceResult', {
                    roll: currentScene.diceRoll.roll,
                    modifier: currentScene.diceRoll.modifier,
                    total: currentScene.diceRoll.total,
                  })}
                  <span className="text-on-surface-variant"> {t('common.vs')} {t('common.dc')} {currentScene.diceRoll.dc}</span>
                </p>
                <p
                  className={`text-xs font-bold ${
                    currentScene.diceRoll.success ? 'text-primary' : 'text-error'
                  }`}
                >
                  {currentScene.diceRoll.success ? t('common.success') : t('common.failure')}
                </p>
              </div>
            </div>
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
