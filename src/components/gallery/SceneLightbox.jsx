import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { excerpt } from './galleryHelpers';

export default function SceneLightbox({ scene, scenes, onClose, onNavigate, resolveImage }) {
  const { t } = useTranslation();
  const backdropRef = useRef(null);
  const currentIndex = scenes?.findIndex((s) => s.id === scene.id) ?? -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < (scenes?.length ?? 0) - 1;

  const goPrev = useCallback(() => {
    if (hasPrev && onNavigate) onNavigate(scenes[currentIndex - 1]);
  }, [hasPrev, onNavigate, scenes, currentIndex]);

  const goNext = useCallback(() => {
    if (hasNext && onNavigate) onNavigate(scenes[currentIndex + 1]);
  }, [hasNext, onNavigate, scenes, currentIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const imgSrc = scene.imageUrl ? resolveImage(scene.imageUrl) : null;

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={t('gallery.lightboxLabel', 'Scene viewer')}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white/60 hover:text-white transition-colors"
        aria-label={t('common.close')}
      >
        <span className="material-symbols-outlined text-3xl">close</span>
      </button>

      {hasPrev && (
        <button
          type="button"
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/40 hover:text-white transition-colors"
          aria-label={t('gallery.prev')}
        >
          <span className="material-symbols-outlined text-4xl">chevron_left</span>
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white/40 hover:text-white transition-colors"
          aria-label={t('gallery.next')}
        >
          <span className="material-symbols-outlined text-4xl">chevron_right</span>
        </button>
      )}

      <div className="max-w-5xl w-full mx-4 flex flex-col items-center gap-4">
        {imgSrc && (
          <img
            src={imgSrc}
            alt=""
            className="max-h-[70vh] w-auto rounded-sm shadow-2xl object-contain"
          />
        )}

        <div className="w-full max-w-2xl text-center space-y-2">
          <div className="flex items-center justify-center gap-3 text-white/60 text-xs">
            {scene.campaignName && (
              <span className="px-2 py-0.5 bg-white/10 rounded-full">{scene.campaignName}</span>
            )}
            <span>{t('common.scene')} {(scene.sceneIndex ?? 0) + 1}</span>
            {scene.likeCount > 0 && (
              <span className="flex items-center gap-1 text-rose-400">
                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                {scene.likeCount}
              </span>
            )}
          </div>
          {scene.narrative && (
            <p className="text-white/80 text-sm leading-relaxed">
              {excerpt(scene.narrative, 400)}
            </p>
          )}
          {scene.chosenAction && (
            <p className="text-primary/70 text-xs italic">
              &ldquo;{excerpt(scene.chosenAction, 200)}&rdquo;
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
