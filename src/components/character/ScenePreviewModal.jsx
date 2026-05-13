import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

/**
 * Modal that fetches a single scene from the backend and renders a preview
 * (image + narrative + chosen action). The `header` slot lets the caller
 * inject context-specific badges (skill XP for SkillGainHistory, campaign +
 * timestamp for FavoriteScenesList).
 */
export default function ScenePreviewModal({ campaignId, sceneIndex, header, onClose }) {
  const { t } = useTranslation();
  const [scene, setScene] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!campaignId || sceneIndex == null) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiClient.get(`/v1/campaigns/${campaignId}/scenes/${sceneIndex}`)
      .then((res) => { if (!cancelled) setScene(res); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, sceneIndex]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col bg-surface-container-low border border-outline-variant/15 rounded-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-on-surface/70 hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
            {t('common.loading', 'Ładowanie...')}
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-on-surface-variant/60 italic">
            {t('advancement.sceneLoadError', 'Nie udało się załadować sceny.')}
          </div>
        )}

        {!loading && !error && scene && (
          <>
            {scene.imageUrl && (
              <img
                src={apiClient.resolveMediaUrl(scene.imageUrl)}
                alt=""
                className="w-full aspect-video object-cover shrink-0"
              />
            )}

            <div className={`flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3 ${scene.imageUrl ? '' : 'pt-12'}`}>
              {header}

              {scene.chosenAction && (
                <p className="text-sm text-on-surface-variant/80">
                  <span className="text-primary/70 font-bold">{t('advancement.action', 'Akcja')}:</span>{' '}
                  {scene.chosenAction}
                </p>
              )}

              <p className="text-sm text-on-surface/80 leading-relaxed whitespace-pre-line">
                {scene.narrative}
              </p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
