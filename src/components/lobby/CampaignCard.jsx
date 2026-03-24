import { useTranslation } from 'react-i18next';
import { getCampaignSummary } from '../../services/gameState';

const genreIcons = {
  Fantasy: 'auto_fix_high',
  'Sci-Fi': 'rocket_launch',
  Horror: 'skull',
};

const genreBorderColors = {
  Fantasy: 'border-l-primary-dim',
  'Sci-Fi': 'border-l-blue-400',
  Horror: 'border-l-error',
};

const genreGlowColors = {
  Fantasy: 'hover:shadow-[0_4px_24px_rgba(149,71,247,0.12)]',
  'Sci-Fi': 'hover:shadow-[0_4px_24px_rgba(96,165,250,0.12)]',
  Horror: 'hover:shadow-[0_4px_24px_rgba(255,110,132,0.12)]',
};

export default function CampaignCard({ campaign, onLoad, onDelete, onExportLog, onExportJson }) {
  const { t, i18n } = useTranslation();
  const isSynced = !!campaign.campaign?.backendId;
  const summary = getCampaignSummary(campaign);
  const lastPlayed = new Date(summary.lastPlayed).toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const borderColor = genreBorderColors[summary.genre] || 'border-l-primary-dim';
  const glowColor = genreGlowColors[summary.genre] || genreGlowColors.Fantasy;

  return (
    <div
      onClick={onLoad}
      className={`p-5 bg-surface-container-low hover:bg-surface-container transition-all duration-300 cursor-pointer group flex items-start justify-between border-l-2 ${borderColor} rounded-sm animate-fade-in hover:translate-y-[-1px] ${glowColor}`}
    >
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-primary/10 shrink-0 group-hover:border-primary/25 transition-colors">
          <span className="material-symbols-outlined text-primary-dim group-hover:text-primary transition-colors">
            {genreIcons[summary.genre] || 'book_5'}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-on-surface font-headline group-hover:text-tertiary transition-colors truncate">
            {summary.name}
          </p>
          <p className="text-on-surface-variant text-xs mt-1">
            {summary.characterName} · {summary.characterCareer} ({t('common.tier')} {summary.characterTier}) · {summary.sceneCount} {t('common.scenes')}
          </p>
          <div className="flex gap-2 mt-2">
            <span className="px-2.5 py-0.5 bg-surface-bright text-primary text-[10px] font-bold border border-primary/10 rounded-full">
              {summary.genre}
            </span>
            <span className="px-2.5 py-0.5 bg-surface-bright text-tertiary-dim text-[10px] font-bold border border-tertiary/10 rounded-full">
              {summary.tone}
            </span>
            {summary.totalCost > 0 && (
              <span className="px-2.5 py-0.5 bg-surface-bright text-on-surface-variant text-[10px] font-bold border border-outline-variant/10 rounded-full">
                ${summary.totalCost.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
        <div className="flex items-center gap-1.5">
          <span
            className={`material-symbols-outlined text-xs ${isSynced ? 'text-primary-dim' : 'text-outline/40'}`}
            title={isSynced ? t('lobby.synced', 'Synced') : t('lobby.localOnly', 'Local only')}
          >
            {isSynced ? 'cloud_done' : 'cloud_off'}
          </span>
          <span className="text-[10px] text-on-surface-variant">{lastPlayed}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExportLog();
            }}
            title={t('lobby.exportLog')}
            className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors p-1 rounded-sm hover:bg-surface-container-high/50"
          >
            description
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExportJson();
            }}
            title={t('lobby.exportJson')}
            className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors p-1 rounded-sm hover:bg-surface-container-high/50"
          >
            download
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="material-symbols-outlined text-sm text-outline hover:text-error transition-colors p-1 rounded-sm hover:bg-error/10"
          >
            delete
          </button>
        </div>
      </div>
    </div>
  );
}
