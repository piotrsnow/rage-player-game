import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excerpt } from './galleryHelpers';

const sizeClasses = {
  normal: '',
  wide: 'col-span-2',
  tall: 'row-span-2',
};

export default function SceneTile({ scene, size = 'normal', onOpenLightbox, resolveImage }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const imgSrc = scene.imageUrl ? resolveImage(scene.imageUrl) : null;
  if (!imgSrc || errored) return null;

  const isFeatured = size !== 'normal';
  const spanClass = sizeClasses[size] || '';

  return (
    <div
      className={`group relative cursor-pointer rounded-sm overflow-hidden ${spanClass}`}
      onClick={() => onOpenLightbox(scene)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenLightbox(scene); } }}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-surface-container animate-pulse rounded-sm" />
      )}
      <img
        src={imgSrc}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={`w-full h-full object-cover rounded-sm transition-all duration-700 group-hover:scale-110 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Permanent subtle vignette for depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 pointer-events-none" />

      {/* Hover overlay with info */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent transition-opacity duration-300 flex flex-col justify-end ${
        isFeatured ? 'p-4 sm:p-5' : 'p-3'
      } ${loaded ? 'opacity-0 group-hover:opacity-100' : 'opacity-0'}`}>
        <p className={`text-white font-bold truncate ${isFeatured ? 'text-sm sm:text-base' : 'text-[11px]'}`}>
          {scene.campaignName}
        </p>
        <p className={`text-white/70 mt-0.5 ${isFeatured ? 'text-xs' : 'text-[10px]'}`}>
          {t('common.scene')} {scene.sceneIndex + 1}
          {scene.characterName ? ` · ${scene.characterName}` : ''}
        </p>
        <p className={`text-white/60 mt-1 leading-relaxed ${isFeatured ? 'text-xs line-clamp-3' : 'text-[10px] line-clamp-2'}`}>
          {excerpt(scene.narrative, isFeatured ? 200 : 120)}
        </p>
        <div className={`flex items-center gap-1 mt-1.5 text-rose-400 ${isFeatured ? 'text-xs' : 'text-[10px]'}`}>
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
            favorite
          </span>
          {scene.likeCount || 0}
        </div>
      </div>

      {/* Always-visible bottom info strip (fades out on hover since overlay takes over) */}
      {loaded && (
        <div className="absolute bottom-0 left-0 right-0 px-3 py-2 group-hover:opacity-0 transition-opacity duration-300">
          <p className={`text-white/90 font-headline truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${
            isFeatured ? 'text-sm' : 'text-[11px]'
          }`}>
            {scene.campaignName}
          </p>
        </div>
      )}

      {/* Featured badge glow */}
      {isFeatured && loaded && (
        <div className="absolute top-2 right-2 pointer-events-none">
          <span className="material-symbols-outlined text-primary/60 text-lg drop-shadow-[0_0_8px_rgba(149,71,247,0.5)]"
            style={{ fontVariationSettings: "'FILL' 1" }}>
            auto_awesome
          </span>
        </div>
      )}
    </div>
  );
}
