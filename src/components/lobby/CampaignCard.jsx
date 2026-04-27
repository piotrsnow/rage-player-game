import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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

export default function CampaignCard({ campaign, onLoad, onDelete, loading, disabled }) {
  const { t, i18n } = useTranslation();
  const lastPlayed = new Date(campaign.lastSaved).toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const genre = campaign.genre || 'Fantasy';
  const borderColor = genreBorderColors[genre] || 'border-l-primary-dim';
  const glowColor = genreGlowColors[genre] || genreGlowColors.Fantasy;

  return (
    <div className="animate-fade-in" data-testid="campaign-card">
      <div
        onClick={disabled ? undefined : onLoad}
        className={`relative p-5 bg-surface-container-low transition-all duration-300 group flex items-start justify-between border-l-2 ${borderColor} rounded-sm ${
          disabled
            ? 'opacity-60 cursor-default'
            : `hover:bg-surface-container cursor-pointer hover:translate-y-[-1px] ${glowColor}`
        } ${loading ? '!opacity-100 border-l-primary' : ''}`}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-container-low/80 backdrop-blur-[2px] rounded-sm">
            <span className="material-symbols-outlined text-2xl text-primary animate-spin mb-2">progress_activity</span>
            <p className="text-sm text-primary font-headline">{t('lobby.loadingWorld', 'Loading world...')}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">{t('lobby.loadingWorldHint', 'Preparing your adventure, please wait')}</p>
          </div>
        )}
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-primary/10 shrink-0 group-hover:border-primary/25 transition-colors">
            <span className="material-symbols-outlined text-primary-dim group-hover:text-primary transition-colors">
              {genreIcons[genre] || 'book_5'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-on-surface font-headline group-hover:text-tertiary transition-colors truncate">
              {campaign.name || 'Untitled'}
            </p>
            <p className="text-on-surface-variant text-xs mt-1">
              {campaign.characterName || '?'} · {campaign.characterCareer || '?'} ({t('common.tier')} {campaign.characterTier || 1}) · {campaign.sceneCount || 0} {t('common.scenes')}
            </p>
            <div className="flex gap-2 mt-2">
              <span className="px-2.5 py-0.5 bg-surface-bright text-primary text-[10px] font-bold border border-primary/10 rounded-full">
                {genre}
              </span>
              <span className="px-2.5 py-0.5 bg-surface-bright text-tertiary-dim text-[10px] font-bold border border-tertiary/10 rounded-full">
                {campaign.tone || '?'}
              </span>
              {(campaign.totalCost || 0) > 0 && (
                <span className="px-2.5 py-0.5 bg-surface-bright text-on-surface-variant text-[10px] font-bold border border-outline-variant/10 rounded-full">
                  ${campaign.totalCost.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
          <div className="flex items-center gap-1.5">
            <span
              className={`material-symbols-outlined text-xs ${campaign.source === 'local' ? 'text-tertiary-dim' : 'text-primary-dim'}`}
              title={campaign.source === 'local' ? t('lobby.localOnly', 'Local') : t('lobby.synced', 'Synced')}
            >
              {campaign.source === 'local' ? 'save' : 'cloud_done'}
            </span>
            <span className={`text-[10px] font-bold ${campaign.source === 'local' ? 'text-tertiary-dim' : 'text-primary-dim'}`}>
              {campaign.source === 'local' ? t('lobby.localOnly', 'Local') : t('lobby.synced', 'Synced')}
            </span>
            <span className="text-[10px] text-on-surface-variant">{lastPlayed}</span>
          </div>
          {!loading && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) onDelete();
                }}
                aria-label={t('common.delete', 'Delete')}
                className="p-1 rounded-sm text-outline hover:text-error hover:bg-error/10 transition-colors flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
