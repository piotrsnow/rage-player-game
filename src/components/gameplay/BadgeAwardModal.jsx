import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import { apiClient } from '../../services/apiClient';

export default function BadgeAwardModal({ badge, onDismiss }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onDismiss);

  if (!badge) return null;

  const imageUrl = badge.imageUrl ? apiClient.resolveMediaUrl(badge.imageUrl) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={badge.name}
      onClick={onDismiss}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        ref={modalRef}
        className="relative w-full max-w-sm flex flex-col items-center text-center animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Medal image or fallback */}
        <div className="relative mb-6">
          <div className="absolute -inset-4 bg-amber-500/20 rounded-full blur-2xl animate-pulse" />
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={badge.name}
              className="relative w-40 h-40 rounded-full object-cover border-4 border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.3)]"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
            />
          ) : null}
          <div
            className={`${imageUrl ? 'hidden' : 'flex'} relative w-40 h-40 rounded-full items-center justify-center bg-surface-container-high border-4 border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.3)]`}
          >
            <span className="material-symbols-outlined text-7xl text-amber-400">military_tech</span>
          </div>
        </div>

        {/* Badge name */}
        <h2 className="font-headline text-2xl text-amber-400 drop-shadow-lg mb-2">
          {badge.name}
        </h2>

        {/* Description */}
        <p className="text-on-surface-variant text-sm leading-relaxed max-w-xs mb-4">
          {badge.description}
        </p>

        {/* XP value */}
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-amber-400">trending_up</span>
          <span className="font-headline text-3xl text-amber-300">
            +{badge.xpValue} XP
          </span>
        </div>

        {/* Level up celebration */}
        {badge.newLevel && (
          <div className="mt-1 mb-4 px-4 py-2 bg-primary/15 border border-primary/30 rounded-sm animate-fade-in">
            <span className="text-primary font-headline text-lg">
              {t('badge.levelUp', { level: badge.newLevel, defaultValue: `Awans na poziom ${badge.newLevel}!` })}
            </span>
          </div>
        )}

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="mt-4 px-8 py-2.5 bg-amber-500/15 border border-amber-500/40 text-amber-300 font-label text-sm uppercase tracking-wider rounded-sm hover:bg-amber-500/25 hover:border-amber-400 transition-all"
        >
          {t('common.close', { defaultValue: 'Zamknij' })}
        </button>
      </div>
    </div>
  );
}
