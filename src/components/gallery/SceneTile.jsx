import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { excerpt } from './galleryHelpers';

export default function SceneTile({ scene, onOpenLightbox, resolveImage }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const imgSrc = scene.imageUrl ? resolveImage(scene.imageUrl) : null;
  if (!imgSrc || errored) return null;

  return (
    <div
      className="break-inside-avoid mb-4 group relative cursor-pointer rounded-sm overflow-hidden"
      onClick={() => onOpenLightbox(scene)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenLightbox(scene); } }}
    >
      {!loaded && (
        <div className="w-full aspect-[4/3] bg-surface-container animate-pulse rounded-sm" />
      )}
      <img
        src={imgSrc}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={`w-full rounded-sm transition-transform duration-500 group-hover:scale-105 ${loaded ? 'block' : 'hidden'}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
        <p className="text-white text-[11px] font-bold truncate">{scene.campaignName}</p>
        <p className="text-white/70 text-[10px] mt-0.5">
          {t('common.scene')} {scene.sceneIndex + 1}
          {scene.characterName ? ` · ${scene.characterName}` : ''}
        </p>
        <p className="text-white/60 text-[10px] mt-1 line-clamp-2 leading-relaxed">
          {excerpt(scene.narrative, 120)}
        </p>
        <div className="flex items-center gap-1 mt-1.5 text-rose-400 text-[10px]">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
            favorite
          </span>
          {scene.likeCount || 0}
        </div>
      </div>
    </div>
  );
}
