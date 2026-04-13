import { useTranslation } from 'react-i18next';

export default function StoryPromptSection({
  storyPrompt,
  onStoryPromptChange,
  isGuest,
  hasServerAi,
  isRandomizing,
  isGeneratingFromInput,
  onRandomize,
  onGenerateFromInput,
}) {
  const { t } = useTranslation();
  return (
    <section>
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
        {t('creator.storyPromptLabel')}
      </label>
      <div className="relative">
        <textarea
          data-testid="story-prompt"
          value={storyPrompt}
          onChange={(e) => onStoryPromptChange(e.target.value)}
          placeholder={isGuest ? t('multiplayer.waitingForHost', 'Waiting for host to set the story...') : t('creator.storyPlaceholder')}
          rows={4}
          readOnly={isGuest}
          className={`w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-3 px-1 resize-none placeholder:text-outline/40 custom-scrollbar font-body ${
            isGuest ? 'opacity-70 cursor-default' : ''
          }`}
        />
      </div>
      {!isGuest && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={onRandomize}
            disabled={!hasServerAi || isRandomizing || isGeneratingFromInput}
            className="flex items-center gap-2 px-3 py-2 text-xs font-label text-tertiary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
          >
            <span className={`material-symbols-outlined text-base ${isRandomizing ? 'animate-spin' : ''}`}>
              {isRandomizing ? 'progress_activity' : 'casino'}
            </span>
            {isRandomizing ? t('creator.randomizingPrompt') : t('creator.randomizePrompt')}
          </button>
          <button
            onClick={onGenerateFromInput}
            disabled={!hasServerAi || !storyPrompt.trim() || isGeneratingFromInput || isRandomizing}
            title={t('creator.generatePromptFromInput')}
            aria-label={t('creator.generatePromptFromInput')}
            className="flex items-center justify-center px-3 py-2 text-xs font-label text-tertiary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
          >
            <span className={`material-symbols-outlined text-base ${isGeneratingFromInput ? 'animate-spin' : ''}`}>
              {isGeneratingFromInput ? 'progress_activity' : 'auto_fix_high'}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
