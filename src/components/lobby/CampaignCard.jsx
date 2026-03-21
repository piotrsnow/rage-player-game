import { useTranslation } from 'react-i18next';
import { getCampaignSummary } from '../../services/gameState';

const genreIcons = {
  Fantasy: 'auto_fix_high',
  'Sci-Fi': 'rocket_launch',
  Horror: 'skull',
};

export default function CampaignCard({ campaign, onLoad, onDelete, onExportLog, onExportJson }) {
  const { t, i18n } = useTranslation();
  const summary = getCampaignSummary(campaign);
  const lastPlayed = new Date(summary.lastPlayed).toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      onClick={onLoad}
      className="p-5 bg-surface-container-low hover:bg-surface-container transition-colors cursor-pointer group flex items-start justify-between border-l-2 border-transparent hover:border-primary animate-fade-in"
    >
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-primary/10 shrink-0">
          <span className="material-symbols-outlined text-primary-dim">
            {genreIcons[summary.genre] || 'book_5'}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-on-surface font-headline group-hover:text-tertiary transition-colors truncate">
            {summary.name}
          </p>
          <p className="text-on-surface-variant text-xs mt-1">
            {summary.characterName} · {t('common.level')} {summary.characterLevel} · {summary.sceneCount} {t('common.scenes')}
          </p>
          <div className="flex gap-2 mt-2">
            <span className="px-2 py-0.5 bg-surface-bright text-primary text-[10px] font-bold border border-primary/10">
              {summary.genre}
            </span>
            <span className="px-2 py-0.5 bg-surface-bright text-tertiary-dim text-[10px] font-bold border border-tertiary/10">
              {summary.tone}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
        <span className="text-[10px] text-on-surface-variant">{lastPlayed}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExportLog();
            }}
            title={t('lobby.exportLog')}
            className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
          >
            description
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExportJson();
            }}
            title={t('lobby.exportJson')}
            className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
          >
            download
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="material-symbols-outlined text-sm text-outline hover:text-error transition-colors opacity-0 group-hover:opacity-100"
          >
            delete
          </button>
        </div>
      </div>
    </div>
  );
}
