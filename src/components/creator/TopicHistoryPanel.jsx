import { useTranslation } from 'react-i18next';

export default function TopicHistoryPanel({
  items,
  isLoading,
  onSelect,
  onClose,
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 animate-fade-in">
        <span className="material-symbols-outlined text-2xl text-tertiary animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 animate-fade-in">
        <span className="material-symbols-outlined text-3xl text-outline/40">history</span>
        <p className="text-on-surface-variant text-sm text-center max-w-xs">
          {t('creator.topicHistoryEmpty')}
        </p>
        <button
          onClick={onClose}
          className="mt-2 text-xs text-tertiary hover:text-primary transition-colors"
        >
          {t('creator.topicHistoryClose')}
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="grid grid-cols-2 gap-4 flex-1 px-1">
          <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
            {t('creator.topicHistoryOriginal')}
          </span>
          <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
            {t('creator.topicHistoryGenerated')}
          </span>
        </div>
        <button
          onClick={onClose}
          title={t('creator.topicHistoryClose')}
          className="ml-2 p-1 text-outline/60 hover:text-primary transition-colors rounded-sm"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <ul className="space-y-1.5 max-h-[260px] overflow-y-auto custom-scrollbar pr-1">
        {items.map((item, idx) => (
          <li
            key={item.id}
            className="grid grid-cols-2 gap-3 rounded-sm border border-outline-variant/10 hover:border-tertiary/30 transition-all duration-200 opacity-0"
            style={{ animation: `fadeIn 0.3s ease-out ${idx * 60}ms forwards` }}
          >
            <button
              type="button"
              onClick={() => onSelect(item.seedText)}
              className="text-left px-3 py-2.5 text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/40 transition-colors duration-150 rounded-l-sm leading-relaxed line-clamp-3"
              title={item.seedText}
            >
              {item.seedText}
            </button>
            <button
              type="button"
              onClick={() => onSelect(item.generatedTopic)}
              className="text-left px-3 py-2.5 text-xs text-on-surface hover:text-tertiary hover:bg-tertiary/5 transition-colors duration-150 rounded-r-sm leading-relaxed line-clamp-3 border-l border-outline-variant/10"
              title={item.generatedTopic}
            >
              {item.generatedTopic}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
