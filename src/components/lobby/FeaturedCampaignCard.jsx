import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CampaignCardCover from './CampaignCardCover';

const genreBorderColors = {
  Fantasy: 'border-primary/30',
  'Sci-Fi': 'border-blue-400/30',
  Horror: 'border-error/30',
};

const genreGlowColors = {
  Fantasy: 'hover:shadow-[0_8px_40px_rgba(149,71,247,0.18)]',
  'Sci-Fi': 'hover:shadow-[0_8px_40px_rgba(96,165,250,0.18)]',
  Horror: 'hover:shadow-[0_8px_40px_rgba(255,110,132,0.18)]',
};

const genreGradients = {
  Fantasy: 'from-primary/5 to-transparent',
  'Sci-Fi': 'from-blue-400/5 to-transparent',
  Horror: 'from-error/5 to-transparent',
};

export default function FeaturedCampaignCard({ campaign, onLoad, onDelete, loading, disabled }) {
  const { t, i18n } = useTranslation();
  const [deleteState, setDeleteState] = useState('idle');

  const lastPlayed = new Date(campaign.lastSaved).toLocaleDateString(
    i18n.language === 'pl' ? 'pl-PL' : undefined,
    { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
  );

  const handleConfirmDelete = async (e) => {
    e.stopPropagation();
    setDeleteState('deleting');
    try {
      await onDelete();
    } finally {
      setDeleteState('idle');
    }
  };

  const genre = campaign.genre || 'Fantasy';
  const borderColor = genreBorderColors[genre] || genreBorderColors.Fantasy;
  const glowColor = genreGlowColors[genre] || genreGlowColors.Fantasy;
  const gradient = genreGradients[genre] || genreGradients.Fantasy;

  const charInfo = campaign.characterName || '?';
  const charDetail = campaign.characterCareer || campaign.characterSpecies || '?';
  const charLevel = campaign.characterTier || campaign.characterLevel || 1;

  return (
    <div className="animate-fade-in" data-testid="featured-campaign-card">
      <div
        onClick={disabled ? undefined : onLoad}
        className={`relative overflow-hidden bg-surface-container transition-all duration-300 group border ${borderColor} rounded-sm bg-gradient-to-b ${gradient} ${
          disabled
            ? 'opacity-60 cursor-default'
            : `hover:bg-surface-container-high cursor-pointer hover:translate-y-[-2px] ${glowColor}`
        } ${loading ? '!opacity-100 border-primary/40' : ''}`}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-container/80 backdrop-blur-[2px] rounded-sm">
            <span className="material-symbols-outlined text-3xl text-primary animate-spin mb-2">progress_activity</span>
            <p className="text-sm text-primary font-headline">{t('lobby.loadingWorld', 'Loading world...')}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">{t('lobby.loadingWorldHint', 'Preparing your adventure, please wait')}</p>
          </div>
        )}

        <CampaignCardCover
          images={campaign.sceneCovers || []}
          genre={genre}
          campaignName={campaign.name}
          className="w-full h-44"
        />

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-on-surface text-lg font-headline group-hover:text-tertiary transition-colors truncate">
                {campaign.name || 'Untitled'}
              </p>
              <p className="text-on-surface-variant text-sm mt-1.5">
                {charInfo} · {charDetail} · {t('common.tier')} {charLevel}
              </p>
              <p className="text-on-surface-variant/70 text-xs mt-1">
                {campaign.sceneCount || 0} {t('common.scenes')} · {lastPlayed}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`material-symbols-outlined text-sm ${campaign.source === 'local' ? 'text-tertiary-dim' : 'text-primary'}`}
                >
                  {campaign.source === 'local' ? 'save' : 'cloud_done'}
                </span>
                <span className={`text-xs font-bold ${campaign.source === 'local' ? 'text-tertiary-dim' : 'text-primary'}`}>
                  {campaign.source === 'local' ? t('lobby.localOnly', 'Local') : t('lobby.synced', 'Synced')}
                </span>
              </div>

              {!loading && (
                <div className={`flex items-center gap-1 transition-all duration-300 ${
                  deleteState === 'idle'
                    ? 'opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0'
                    : 'opacity-100 translate-x-0'
                }`}>
                  {deleteState === 'idle' && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (!disabled) setDeleteState('confirming'); }}
                      aria-label={t('common.delete', 'Delete')}
                      className="p-1 rounded-sm text-outline hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  )}
                  {deleteState === 'confirming' && (
                    <>
                      <button
                        type="button"
                        onClick={handleConfirmDelete}
                        aria-label={t('common.confirm', 'Confirm')}
                        className="p-1 rounded-sm text-error hover:bg-error/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">check</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteState('idle'); }}
                        aria-label={t('common.cancel', 'Cancel')}
                        className="p-1 rounded-sm text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </>
                  )}
                  {deleteState === 'deleting' && (
                    <span className="material-symbols-outlined text-sm text-error animate-spin p-1">progress_activity</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <span className="px-2.5 py-0.5 bg-surface-bright text-primary text-[11px] font-bold border border-primary/15 rounded-full">
              {genre}
            </span>
            {campaign.tone && (
              <span className="px-2.5 py-0.5 bg-surface-bright text-tertiary-dim text-[11px] font-bold border border-tertiary/15 rounded-full">
                {campaign.tone}
              </span>
            )}
            {(campaign.totalCost || 0) > 0 && (
              <span className="px-2.5 py-0.5 bg-surface-bright text-on-surface-variant text-[11px] font-bold border border-outline-variant/15 rounded-full">
                ${campaign.totalCost.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
