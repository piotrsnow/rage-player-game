import { useTranslation } from 'react-i18next';
import TopicHistoryPanel from './TopicHistoryPanel';

export default function StoryPromptSection({
  storyPrompt,
  onStoryPromptChange,
  isGuest,
  hasServerAi,
  isRandomizing,
  isGeneratingFromInput,
  onRandomize,
  onGenerateFromInput,
  showHistory,
  onToggleHistory,
  topicHistory,
  onSelectHistory,
  isLoadingHistory,
}) {
  const { t } = useTranslation();
  return (
    <section>
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
        {t('creator.storyPromptLabel')}
      </label>

      <div className="relative overflow-hidden">
        <div
          className="transition-all duration-300 ease-out"
          style={{
            opacity: showHistory ? 0 : 1,
            maxHeight: showHistory ? 0 : '500px',
            transform: showHistory ? 'translateY(-8px)' : 'translateY(0)',
            pointerEvents: showHistory ? 'none' : 'auto',
          }}
        >
          <textarea
            data-testid="story-prompt"
            value={storyPrompt}
            onChange={(e) => onStoryPromptChange(e.target.value)}
            placeholder={isGuest ? t('multiplayer.waitingForHost', 'Waiting for host to set the story...') : t('creator.storyPlaceholder')}
            rows={6}
            readOnly={isGuest}
            className={`w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-3 px-1 resize-none placeholder:text-on-surface-variant/60 custom-scrollbar font-body ${
              isGuest ? 'opacity-70 cursor-default' : ''
            }`}
          />
        </div>

        {showHistory && (
          <div
            className="transition-all duration-300 ease-out"
            style={{ animation: 'fadeIn 0.3s ease-out forwards' }}
          >
            <TopicHistoryPanel
              items={topicHistory}
              isLoading={isLoadingHistory}
              onSelect={onSelectHistory}
              onClose={onToggleHistory}
            />
          </div>
        )}
      </div>

      {!isGuest && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {hasServerAi && (
            <>
              <button
                onClick={onRandomize}
                disabled={isRandomizing || isGeneratingFromInput}
                className="flex items-center gap-2 px-3 py-2 text-xs font-label text-tertiary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <span className={`material-symbols-outlined text-base ${isRandomizing ? 'animate-spin' : ''}`}>
                  {isRandomizing ? 'progress_activity' : 'casino'}
                </span>
                {isRandomizing ? t('creator.randomizingPrompt') : t('creator.randomizePrompt')}
              </button>
              <button
                onClick={onGenerateFromInput}
                disabled={!storyPrompt.trim() || isGeneratingFromInput || isRandomizing}
                title={t('creator.generatePromptFromInput')}
                aria-label={t('creator.generatePromptFromInput')}
                className="flex items-center justify-center px-3 py-2 text-xs font-label text-tertiary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                <span className={`material-symbols-outlined text-base ${isGeneratingFromInput ? 'animate-spin' : ''}`}>
                  {isGeneratingFromInput ? 'progress_activity' : 'auto_fix_high'}
                </span>
              </button>
            </>
          )}
          <button
            onClick={onToggleHistory}
            disabled={isRandomizing || isGeneratingFromInput}
            title={t('creator.topicHistory')}
            aria-label={t('creator.topicHistory')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-label transition-colors duration-200 ${
              showHistory
                ? 'text-primary'
                : 'text-tertiary hover:text-primary'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="material-symbols-outlined text-base">history</span>
            {t('creator.topicHistory')}
          </button>
        </div>
      )}
    </section>
  );
}
