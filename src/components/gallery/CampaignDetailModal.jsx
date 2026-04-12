import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button';
import StarRow from './StarRow';
import { getCampaignSummary } from '../../services/gameState';

export default function CampaignDetailModal({ entry, onClose, onPlayFromStart, resolveImage, onRepairSceneImage }) {
  const { t, i18n } = useTranslation();
  const gs = entry.gameState;
  const summary = gs ? getCampaignSummary(gs) : null;
  const scenes = gs?.scenes || [];
  const character = gs?.character ?? gs?.characters?.[0];
  const [failedSceneImages, setFailedSceneImages] = useState(() => new Set());
  const [repairingSceneImages, setRepairingSceneImages] = useState(() => new Set());

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const created = new Date(entry.createdAt).toLocaleString(i18n.language === 'pl' ? 'pl-PL' : undefined);

  const handleReplayImageError = useCallback(async (scene, sceneIndex) => {
    const key = scene?.id || `scene_${sceneIndex}`;
    setFailedSceneImages((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    if (!onRepairSceneImage) return;
    if (repairingSceneImages.has(key)) return;

    setRepairingSceneImages((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      const repaired = await onRepairSceneImage(scene, sceneIndex);
      if (repaired) {
        setFailedSceneImages((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    } finally {
      setRepairingSceneImages((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [onRepairSceneImage, repairingSceneImages]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gallery-modal-title"
      onClick={onClose}
    >
      <div
        className="glass-panel-elevated max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col rounded-sm border border-outline-variant/30 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-outline-variant/20 shrink-0">
          <div className="min-w-0">
            <h2 id="gallery-modal-title" className="font-headline text-xl text-on-surface truncate">
              {entry.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="px-2 py-0.5 bg-surface-container text-primary text-[10px] font-bold rounded-full border border-outline-variant/20">
                {entry.genre}
              </span>
              <span className="px-2 py-0.5 bg-surface-container text-tertiary-dim text-[10px] font-bold rounded-full border border-outline-variant/20">
                {entry.tone}
              </span>
              <StarRow rating={entry.rating} className="ml-1" />
              <span className="text-[10px] text-on-surface-variant">
                {entry.playCount} {t('gallery.plays', 'plays')}
              </span>
            </div>
            <p className="text-[10px] text-outline mt-1">{t('gallery.created', 'Created')}: {created}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="material-symbols-outlined text-on-surface-variant hover:text-on-surface p-1 rounded-sm hover:bg-surface-container-high/80"
            aria-label={t('common.close', 'Close')}
          >
            close
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          <section>
            <h3 className="font-headline text-sm text-primary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">public</span>
              {t('gallery.worldSummary', 'World summary')}
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
              {gs?.campaign?.worldDescription ||
                gs?.campaign?.hook ||
                entry.description ||
                t('gallery.noSummary', 'No summary available.')}
            </p>
          </section>

          {character && (
            <section>
              <h3 className="font-headline text-sm text-primary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-base">person</span>
                {t('gallery.featuredCharacter', 'Featured character')}
              </h3>
              <div className="bg-surface-container rounded-sm border border-outline-variant/20 p-4 text-sm text-on-surface-variant">
                <p className="font-headline text-on-surface">
                  {character.name}
                  <span className="text-on-surface-variant font-normal text-xs ml-2">
                    {character.species} · {character.career?.name || summary?.characterCareer}
                    {character.career?.tier != null && (
                      <>
                        {' '}
                        ({t('common.tier')} {character.career.tier})
                      </>
                    )}
                  </span>
                </p>
                {character.backstory ? (
                  <p className="mt-2 text-xs leading-relaxed line-clamp-6">{character.backstory}</p>
                ) : null}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-headline text-sm text-primary mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">history_edu</span>
              {t('gallery.sceneReplay', 'Scene replay')}
            </h3>
            {scenes.length === 0 ? (
              <p className="text-xs text-on-surface-variant italic">{t('gallery.noScenesReplay', 'No scenes to replay for this listing.')}</p>
            ) : (
              <div className="space-y-6 max-h-[320px] overflow-y-auto pr-1 border border-outline-variant/15 rounded-sm bg-surface-dim/50 p-4">
                {scenes.map((scene, idx) => {
                  const sceneKey = scene.id || `scene_${idx}`;
                  const imageFailed = failedSceneImages.has(sceneKey);
                  const imageRepairing = repairingSceneImages.has(sceneKey);
                  const img = scene.image ? resolveImage(scene.image) : null;
                  return (
                    <article key={scene.id || idx} className="border-b border-outline-variant/10 pb-6 last:border-0 last:pb-0">
                      <p className="text-[10px] text-outline uppercase tracking-wider mb-2">
                        {t('common.scene')} {idx + 1}
                      </p>
                      {img && !imageFailed ? (
                        <img
                          src={img}
                          alt=""
                          className="w-full max-h-48 object-cover rounded-sm border border-outline-variant/20 mb-3"
                          onError={() => handleReplayImageError(scene, idx)}
                        />
                      ) : null}
                      {imageFailed ? (
                        <div className="w-full rounded-sm border border-outline-variant/20 mb-3 p-3 bg-surface-container-low text-xs text-on-surface-variant flex items-center justify-between gap-3">
                          <span>
                            {imageRepairing
                              ? t('gallery.repairingImage', 'Repairing scene image...')
                              : t('gallery.imageUnavailable', 'Scene image unavailable.')}
                          </span>
                          {!imageRepairing && onRepairSceneImage ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="!px-2 !py-1 !text-[10px]"
                              onClick={() => handleReplayImageError(scene, idx)}
                            >
                              {t('gallery.retryImage', 'Retry')}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                        {scene.narrative ||
                          (scene.dialogueSegments || [])
                            .map((seg) => (seg.type === 'dialogue' ? `“${seg.text}” — ${seg.character}` : seg.text))
                            .join('\n\n')}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="p-5 border-t border-outline-variant/20 flex flex-wrap gap-3 justify-end shrink-0 bg-surface-container-low/40">
          <Button variant="ghost" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
          <Button
            disabled={!gs}
            onClick={() => gs && onPlayFromStart(gs)}
            title={!gs ? t('gallery.playDisabledHint', 'Full game data required') : undefined}
          >
            {t('gallery.playFromStart', 'Play from start')}
          </Button>
        </div>
      </div>
    </div>
  );
}
