import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../../services/apiClient';

const SLOT_COUNT = 5;

export default function PlaygroundHistoryGrid({
  items,
  page,
  totalPages,
  loading,
  onSelect,
  onDelete,
  onPrev,
  onNext,
}) {
  const { t } = useTranslation();
  const slots = new Array(SLOT_COUNT).fill(null).map((_, i) => items[i] || null);

  return (
    <div className="mt-6 pt-5 border-t border-outline-variant/15">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
          {t('imageConfig.playground.history.title')}
        </h3>
        {loading && (
          <span className="material-symbols-outlined text-[14px] text-primary-dim animate-spin">
            progress_activity
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {slots.map((entry, idx) => {
          if (!entry) {
            return (
              <div
                key={`empty-${idx}`}
                className="aspect-square rounded-sm border border-dashed border-outline-variant/20 flex items-center justify-center text-on-surface-variant/40"
              >
                <span className="material-symbols-outlined text-[18px]">image</span>
              </div>
            );
          }
          return (
            <div key={entry.id} className="relative group">
              <button
                type="button"
                onClick={() => onSelect?.(entry)}
                title={entry.prompt}
                className="w-full aspect-square rounded-sm overflow-hidden border border-outline-variant/20 hover:border-primary/60 transition-colors bg-surface-container-high/40"
              >
                {entry.imageUrl ? (
                  <img
                    src={apiClient.resolveMediaUrl(entry.imageUrl)}
                    alt={entry.keywords || entry.prompt?.slice(0, 40) || 'generation'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant/40">
                    broken_image
                  </span>
                )}
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(entry);
                  }}
                  aria-label={t('imageConfig.playground.history.delete')}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error/80 text-on-error flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-error transition-opacity"
                >
                  <span className="material-symbols-outlined text-[12px]">close</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {items.length === 0 && !loading && (
        <p className="mt-3 text-[11px] text-on-surface-variant/60 text-center">
          {t('imageConfig.playground.history.empty')}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1 || loading}
          className="px-2 py-1 rounded-sm border border-outline-variant/20 text-on-surface-variant hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-[11px]"
        >
          <span className="material-symbols-outlined text-[14px]">chevron_left</span>
          {t('imageConfig.playground.history.prev')}
        </button>
        <span className="text-[10px] text-on-surface-variant/70 font-label">
          {t('imageConfig.playground.history.page', {
            defaultValue: 'Page {{current}} of {{total}}',
            current: page,
            total: totalPages,
          })}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages || loading}
          className="px-2 py-1 rounded-sm border border-outline-variant/20 text-on-surface-variant hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-[11px]"
        >
          {t('imageConfig.playground.history.next')}
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        </button>
      </div>
    </div>
  );
}
