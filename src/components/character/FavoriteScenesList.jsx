import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import ScenePreviewModal from './ScenePreviewModal';

function FavoritePreviewHeader({ favorite, t }) {
  const date = new Date(favorite.createdAt);
  const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5">
        <span className="material-symbols-outlined text-base text-rose-400" style={{ fontVariationSettings: '"FILL" 1' }}>
          favorite
        </span>
        {favorite.campaignName && (
          <span className="text-sm text-on-surface/80 font-bold">
            {favorite.campaignName}
          </span>
        )}
        {favorite.sceneIndex != null && (
          <span className="text-xs text-outline/60 tabular-nums">
            {t('advancement.scene', 'Scena')} #{favorite.sceneIndex + 1}
          </span>
        )}
      </div>
      <span className="text-xs text-outline/60 tabular-nums shrink-0">{dateStr}</span>
    </div>
  );
}

export default function FavoriteScenesList({ characterId }) {
  const { t } = useTranslation();
  const [favorites, setFavorites] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    setLoading(true);
    apiClient.get(`/v1/characters/${characterId}/favorite-scenes?limit=100`)
      .then((res) => { if (!cancelled) setFavorites(res?.favorites || []); })
      .catch(() => { if (!cancelled) setFavorites([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [characterId]);

  const closeModal = useCallback(() => setSelected(null), []);

  if (loading) {
    return (
      <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
        <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">favorite</span>
          {t('character.favoriteScenes', 'Ulubione sceny')}
        </h3>
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
          {t('common.loading', 'Ładowanie...')}
        </div>
      </div>
    );
  }

  if (!favorites || favorites.length === 0) {
    return (
      <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
        <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">favorite</span>
          {t('character.favoriteScenes', 'Ulubione sceny')}
        </h3>
        <p className="text-outline italic text-sm">
          {t('character.favoriteScenesEmpty', 'Brak ulubionych scen. Oznacz scenę serduszkiem podczas gry.')}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
        <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">favorite</span>
          {t('character.favoriteScenes', 'Ulubione sceny')}
          <span className="text-xs text-outline/60 tabular-nums font-normal">
            ({favorites.length})
          </span>
        </h3>
        <div className="max-h-[40rem] overflow-y-auto custom-scrollbar px-1 py-1 space-y-2.5">
          {favorites.map((f) => {
            const date = new Date(f.createdAt);
            const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            const clickable = f.campaignId && f.sceneIndex != null;
            return (
              <div
                key={f.id}
                onClick={clickable ? () => setSelected(f) : undefined}
                className={`flex gap-3 p-3 rounded-sm border bg-surface-container-high/30 border-outline-variant/10 transition-colors ${
                  clickable ? 'cursor-pointer hover:bg-white/5' : ''
                }`}
              >
                {f.imageUrl ? (
                  <img
                    src={apiClient.resolveMediaUrl(f.imageUrl)}
                    alt=""
                    className="w-24 h-16 object-cover rounded-sm shrink-0 bg-black/40"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-24 h-16 flex items-center justify-center rounded-sm shrink-0 bg-black/30 border border-outline-variant/10">
                    <span className="material-symbols-outlined text-outline/40 text-xl">image</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {f.campaignName && (
                        <span className="text-xs font-bold text-on-surface/90 truncate">
                          {f.campaignName}
                        </span>
                      )}
                      {f.sceneIndex != null && (
                        <span className="text-[10px] text-outline/60 tabular-nums shrink-0">
                          #{f.sceneIndex + 1}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-outline/50 tabular-nums shrink-0">{dateStr}</span>
                  </div>
                  {f.chosenAction && (
                    <p className="text-xs text-on-surface-variant/80 line-clamp-1">
                      <span className="text-primary/70 font-bold">{t('advancement.action', 'Akcja')}:</span>{' '}
                      {f.chosenAction}
                    </p>
                  )}
                  {f.narrative && (
                    <p className="text-xs text-on-surface-variant/60 line-clamp-2 italic mt-0.5">
                      {f.narrative}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <ScenePreviewModal
          campaignId={selected.campaignId}
          sceneIndex={selected.sceneIndex}
          header={<FavoritePreviewHeader favorite={selected} t={t} />}
          onClose={closeModal}
        />
      )}
    </>
  );
}
