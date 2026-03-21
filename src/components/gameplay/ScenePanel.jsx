import { useTranslation } from 'react-i18next';
import LoadingSpinner from '../ui/LoadingSpinner';

export default function ScenePanel({ scene, isGeneratingImage }) {
  const { t } = useTranslation();

  if (!scene) {
    return (
      <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-outline/20 mb-2 block">auto_stories</span>
          <p className="text-on-surface-variant text-xs">{t('gameplay.adventureBegins')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-outline-variant/10 shadow-[0_0_40px_rgba(0,0,0,0.8)] animate-fade-in">
      {/* Scene Image */}
      {scene.image ? (
        <img
          src={scene.image}
          alt="Scene"
          className="w-full h-full object-cover transition-opacity duration-700"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-surface-container-high to-surface-container-lowest flex items-center justify-center">
          {isGeneratingImage ? (
            <LoadingSpinner size="md" text={t('gameplay.conjuringVision')} />
          ) : (
            <span className="material-symbols-outlined text-6xl text-outline/20">landscape</span>
          )}
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-surface-dim/90 via-surface-dim/20 to-transparent" />

      {/* Live indicator */}
      {isGeneratingImage && !scene.image && (
        <div className="absolute top-4 left-4 bg-surface-container-highest/60 backdrop-blur-md px-3 py-1.5 rounded-sm border border-primary/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(197,154,255,1)]" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-on-surface uppercase">
            {t('gameplay.generatingImage')}
          </span>
        </div>
      )}

      {/* Scene text overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-6 max-h-[70%] overflow-y-auto custom-scrollbar">
        <p className="text-sm text-on-surface/90 font-body leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {scene.narrative}
        </p>
      </div>
    </div>
  );
}
