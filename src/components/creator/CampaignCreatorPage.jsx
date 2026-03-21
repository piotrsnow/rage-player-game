import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAI } from '../../hooks/useAI';
import { useGameState } from '../../hooks/useGameState';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import Button from '../ui/Button';
import LoadingSpinner from '../ui/LoadingSpinner';

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
  const { generateCampaign } = useAI();
  const { startNewCampaign } = useGameState();
  const { settings } = useSettings();
  const { state } = useGame();

  const [form, setForm] = useState({
    genre: 'Fantasy',
    tone: 'Epic',
    style: 'Hybrid',
    difficulty: 'Normal',
    length: 'Medium',
    storyPrompt: '',
  });

  const hasApiKey = settings.openaiApiKey || settings.anthropicApiKey;

  const handleSubmit = async () => {
    if (!form.storyPrompt.trim()) return;
    if (!hasApiKey) {
      navigate('/settings');
      return;
    }

    try {
      const result = await generateCampaign(form);
      startNewCampaign(result, form);
      navigate('/play');
    } catch {
      // Error is handled via context
    }
  };

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

      {state.isLoading ? (
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
          </section>

          {/* Error */}
          {state.error && (
            <div className="bg-error-container/20 border border-error/20 p-4 rounded-sm">
              <p className="text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {state.error}
              </p>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-4 pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!form.storyPrompt.trim() || !hasApiKey}
              size="lg"
            >
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              {t('creator.beginRitual')}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              {t('common.cancel')}
            </Button>
          </div>

          {!hasApiKey && (
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
