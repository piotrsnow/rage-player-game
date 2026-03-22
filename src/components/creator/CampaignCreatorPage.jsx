import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAI } from '../../hooks/useAI';
import { useGameState } from '../../hooks/useGameState';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';
import PlayerLobby from '../multiplayer/PlayerLobby';

const RANDOM_NAMES = {
  Fantasy: [
    'Aldric', 'Seraphina', 'Thorn', 'Isolde', 'Kael', 'Miriel', 'Fenris',
    'Lyra', 'Darian', 'Elowen', 'Grimwald', 'Astrid', 'Rowan', 'Zephyra',
    'Valen', 'Elara', 'Corvus', 'Nerissa', 'Theron', 'Brynn', 'Oberon',
    'Ravenna', 'Cedric', 'Fiora', 'Magnus', 'Selene', 'Gareth', 'Ysolde',
  ],
  'Sci-Fi': [
    'Vex', 'Nova', 'Kai-7', 'Orion', 'Lyris', 'Zane', 'Astra', 'Rex',
    'Ember', 'Cyrus', 'Nyx', 'Jett', 'Solara', 'Axel', 'Io', 'Sable',
    'Rho', 'Vesper', 'Talon', 'Celeste', 'Dex', 'Mira', 'Kova', 'Zero',
  ],
  Horror: [
    'Ezra', 'Morrigan', 'Silas', 'Lenore', 'Dorian', 'Raven', 'Cassius',
    'Lilith', 'Ambrose', 'Isolde', 'Damien', 'Vesper', 'Alaric', 'Salem',
    'Cain', 'Ophelia', 'Lucius', 'Nyx', 'Thane', 'Elspeth', 'Draven',
    'Carmilla', 'Malachi', 'Rowena', 'Viktor', 'Perdita', 'Alistair',
  ],
};

function pickRandomName(genre, currentName) {
  const pool = RANDOM_NAMES[genre] || RANDOM_NAMES.Fantasy;
  const filtered = pool.filter((n) => n !== currentName);
  return filtered[Math.floor(Math.random() * filtered.length)];
}

const genreIds = ['Fantasy', 'Sci-Fi', 'Horror'];
const genreIcons = { Fantasy: 'auto_fix_high', 'Sci-Fi': 'rocket_launch', Horror: 'skull' };
const toneIds = ['Dark', 'Epic', 'Humorous'];
const toneIcons = { Dark: 'dark_mode', Epic: 'whatshot', Humorous: 'sentiment_very_satisfied' };
const styleIds = ['Narrative', 'Hybrid', 'Mechanical'];
const difficultyIds = ['Easy', 'Normal', 'Hard', 'Expert'];
const lengthIds = ['Short', 'Medium', 'Long'];

function ChipGroup({ options, value, onChange, showIcons = false, icons = {}, labels = {}, descriptions = {} }) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((id) => {
        const isActive = value === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-4 py-3 rounded-sm font-label text-sm transition-all duration-300 border ${
              isActive
                ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
                : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {showIcons && icons[id] && (
                <span className="material-symbols-outlined text-lg">{icons[id]}</span>
              )}
              <div className="text-left">
                <div className="font-bold">{labels[id] || id}</div>
                {descriptions[id] && <div className="text-[10px] opacity-70 mt-0.5">{descriptions[id]}</div>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function CampaignCreatorPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { generateCampaign, generateStoryPrompt } = useAI();
  const { startNewCampaign } = useGameState();
  const { settings } = useSettings();
  const { state } = useGame();
  const mp = useMultiplayer();

  const [mode, setMode] = useState(mp.state.isMultiplayer ? 'multiplayer' : 'solo');
  const isMultiplayer = mode === 'multiplayer';
  const inMpRoom = mp.state.isMultiplayer && mp.state.roomCode;

  const [form, setForm] = useState({
    genre: 'Fantasy',
    tone: 'Epic',
    style: 'Hybrid',
    difficulty: 'Normal',
    length: 'Medium',
    characterName: storage.getLastCharacterName(),
    storyPrompt: '',
  });

  const [isRandomizing, setIsRandomizing] = useState(false);
  const hasApiKey = settings.openaiApiKey || settings.anthropicApiKey;
  const isBackendConnected = apiClient.isConnected();

  const handleRandomize = async () => {
    if (!hasApiKey || isRandomizing) return;
    setIsRandomizing(true);
    try {
      const prompt = await generateStoryPrompt({
        genre: form.genre,
        tone: form.tone,
        style: form.style,
      });
      setForm((p) => ({ ...p, storyPrompt: prompt }));
    } catch {
      // Error handled via context
    } finally {
      setIsRandomizing(false);
    }
  };

  const handleCreateRoom = () => {
    mp.connect();
    setTimeout(() => mp.createRoom(), 300);
  };

  const handleStartMultiplayerGame = () => {
    if (!form.storyPrompt.trim()) return;
    mp.updateSettings({
      genre: form.genre,
      tone: form.tone,
      style: form.style,
      difficulty: form.difficulty,
      length: form.length,
      storyPrompt: form.storyPrompt,
    });
    setTimeout(() => mp.startGame(settings.language || 'en'), 200);
  };

  const handleSubmit = async () => {
    if (!form.storyPrompt.trim()) return;
    if (!hasApiKey) {
      navigate('/settings');
      return;
    }

    try {
      storage.saveLastCharacterName(form.characterName.trim());
      const result = await generateCampaign(form);
      startNewCampaign(result, form);
      navigate('/play');
    } catch {
      // Error is handled via context
    }
  };

  if (mp.state.phase === 'playing' && mp.state.gameState) {
    navigate('/play');
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-12 animate-fade-in">
        <h1 className="font-headline text-4xl md:text-5xl text-tertiary mb-2 tracking-tight">
          {t('creator.title')}
        </h1>
        <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
          {t('creator.subtitle')}
        </p>
      </div>

      {/* Solo / Multiplayer Toggle */}
      <div className="flex gap-3 mb-10 animate-fade-in">
        <button
          onClick={() => setMode('solo')}
          className={`px-5 py-3 rounded-sm font-label text-sm border transition-all duration-300 ${
            mode === 'solo'
              ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
              : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">person</span>
            <span className="font-bold">{t('multiplayer.solo')}</span>
          </div>
        </button>
        <button
          onClick={() => setMode('multiplayer')}
          disabled={!isBackendConnected}
          className={`px-5 py-3 rounded-sm font-label text-sm border transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === 'multiplayer'
              ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
              : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">group</span>
            <span className="font-bold">{t('multiplayer.multiplayer')}</span>
          </div>
        </button>
        {!isBackendConnected && (
          <span className="self-center text-[10px] text-on-surface-variant">
            {t('multiplayer.backendRequired')}
          </span>
        )}
      </div>

      {(state.isLoading || mp.state.isGenerating) ? (
        <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
          <LoadingSpinner size="lg" text={t('creator.loadingTitle')} />
          <p className="text-on-surface-variant text-sm mt-6 text-center max-w-md">
            {t('creator.loadingDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-12 animate-fade-in">
          {/* Genre */}
          <section>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
              {t('creator.genreLabel')}
            </label>
            <ChipGroup
              options={genreIds}
              value={form.genre}
              onChange={(v) => setForm((p) => ({ ...p, genre: v }))}
              showIcons
              icons={genreIcons}
              labels={Object.fromEntries(genreIds.map((id) => [id, t(`creator.genres.${id}`)]))}
              descriptions={Object.fromEntries(genreIds.map((id) => [id, t(`creator.genreDesc.${id}`)]))}
            />
          </section>

          {/* Tone */}
          <section>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
              {t('creator.toneLabel')}
            </label>
            <ChipGroup
              options={toneIds}
              value={form.tone}
              onChange={(v) => setForm((p) => ({ ...p, tone: v }))}
              showIcons
              icons={toneIcons}
              labels={Object.fromEntries(toneIds.map((id) => [id, t(`creator.tones.${id}`)]))}
              descriptions={Object.fromEntries(toneIds.map((id) => [id, t(`creator.toneDesc.${id}`)]))}
            />
          </section>

          {/* Play Style */}
          <section>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
              {t('creator.playStyleLabel')}
            </label>
            <ChipGroup
              options={styleIds}
              value={form.style}
              onChange={(v) => setForm((p) => ({ ...p, style: v }))}
              labels={Object.fromEntries(styleIds.map((id) => [id, t(`creator.styles.${id}`)]))}
              descriptions={Object.fromEntries(styleIds.map((id) => [id, t(`creator.styleDesc.${id}`)]))}
            />
          </section>

          {/* Difficulty & Length */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <section>
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
                {t('creator.difficultyLabel')}
              </label>
              <ChipGroup
                options={difficultyIds}
                value={form.difficulty}
                onChange={(v) => setForm((p) => ({ ...p, difficulty: v }))}
                labels={Object.fromEntries(difficultyIds.map((id) => [id, t(`creator.difficulties.${id}`)]))}
              />
            </section>
            <section>
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
                {t('creator.campaignLengthLabel')}
              </label>
              <ChipGroup
                options={lengthIds}
                value={form.length}
                onChange={(v) => setForm((p) => ({ ...p, length: v }))}
                labels={Object.fromEntries(lengthIds.map((id) => [id, t(`creator.lengths.${id}`)]))}
              />
            </section>
          </div>

          {/* Story Prompt */}
          <section>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
              {t('creator.storyPromptLabel')}
            </label>
            <div className="relative">
              <textarea
                value={form.storyPrompt}
                onChange={(e) => setForm((p) => ({ ...p, storyPrompt: e.target.value }))}
                placeholder={t('creator.storyPlaceholder')}
                rows={4}
                className="w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-3 px-1 resize-none placeholder:text-outline/40 custom-scrollbar font-body"
              />
            </div>
            <button
              onClick={handleRandomize}
              disabled={!hasApiKey || isRandomizing}
              className="mt-3 flex items-center gap-2 px-3 py-2 text-xs font-label text-tertiary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
            >
              <span className={`material-symbols-outlined text-base ${isRandomizing ? 'animate-spin' : ''}`}>
                {isRandomizing ? 'progress_activity' : 'casino'}
              </span>
              {isRandomizing ? t('creator.randomizingPrompt') : t('creator.randomizePrompt')}
            </button>
          </section>

          {/* Multiplayer Lobby */}
          {isMultiplayer && (
            <section className="border border-outline-variant/15 rounded-sm p-6 bg-surface-container-high/20">
              {inMpRoom ? (
                <PlayerLobby />
              ) : (
                <div className="text-center space-y-4">
                  <p className="text-on-surface-variant text-sm">{t('multiplayer.createOrJoin')}</p>
                  <div className="flex gap-3 justify-center">
                    <Button onClick={handleCreateRoom}>
                      <span className="material-symbols-outlined text-sm">add</span>
                      {t('multiplayer.createRoom')}
                    </Button>
                    <Button variant="ghost" onClick={() => navigate('/join')}>
                      <span className="material-symbols-outlined text-sm">login</span>
                      {t('multiplayer.joinRoom')}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Character Name (solo only) */}
          {!isMultiplayer && (
            <section>
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
                {t('creator.characterNameLabel')}
              </label>
              <div className="flex items-end gap-2">
                <input
                  type="text"
                  value={form.characterName}
                  onChange={(e) => setForm((p) => ({ ...p, characterName: e.target.value }))}
                  placeholder={t('creator.characterNamePlaceholder')}
                  maxLength={40}
                  className="flex-1 bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-3 px-1 placeholder:text-outline/40 font-body"
                />
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, characterName: pickRandomName(p.genre, p.characterName) }))}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-tertiary hover:text-primary transition-colors duration-200 shrink-0"
                  title={t('creator.randomizeName')}
                >
                  <span className="material-symbols-outlined text-base">casino</span>
                  {t('creator.randomizeName')}
                </button>
              </div>
            </section>
          )}

          {/* Error */}
          {(state.error || mp.state.error) && (
            <div className="bg-error-container/20 border border-error/20 p-4 rounded-sm">
              <p className="text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {state.error || mp.state.error}
              </p>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-4 pt-4">
            {isMultiplayer && inMpRoom && mp.state.isHost ? (
              <Button
                onClick={handleStartMultiplayerGame}
                disabled={!form.storyPrompt.trim() || mp.state.players.length < 1}
                size="lg"
              >
                <span className="material-symbols-outlined text-sm">swords</span>
                {t('multiplayer.startGame')}
              </Button>
            ) : !isMultiplayer ? (
              <Button
                onClick={handleSubmit}
                disabled={!form.storyPrompt.trim() || !hasApiKey}
                size="lg"
              >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                {t('creator.beginRitual')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => navigate('/')}>
              {t('common.cancel')}
            </Button>
          </div>

          {!hasApiKey && !isMultiplayer && (
            <p className="text-tertiary-dim text-xs flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">info</span>
              {t('creator.noApiKeyHint')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
