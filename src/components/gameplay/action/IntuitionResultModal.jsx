import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const TIER_STYLES = {
  excellent: {
    border: 'border-emerald-400/50',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-300',
    glow: 'shadow-[0_0_20px_rgba(52,211,153,0.15)]',
  },
  good: {
    border: 'border-sky-400/50',
    bg: 'bg-sky-500/10',
    text: 'text-sky-300',
    glow: 'shadow-[0_0_20px_rgba(56,189,248,0.15)]',
  },
  mediocre: {
    border: 'border-orange-400/50',
    bg: 'bg-orange-500/10',
    text: 'text-orange-300',
    glow: 'shadow-[0_0_20px_rgba(251,146,60,0.15)]',
  },
  terrible: {
    border: 'border-red-400/50',
    bg: 'bg-red-500/10',
    text: 'text-red-300',
    glow: 'shadow-[0_0_20px_rgba(248,113,113,0.15)]',
  },
};

export default function IntuitionResultModal({ result, onDismiss }) {
  const { t } = useTranslation();
  const { icon, reactionMs, tier, visibleMs } = result;
  const style = TIER_STYLES[tier];

  useEffect(() => {
    const timer = setTimeout(onDismiss, 2500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      aria-live="polite"
    >
      <div
        onClick={onDismiss}
        className={`pointer-events-auto cursor-pointer rounded-lg px-6 py-5 backdrop-blur-xl ${style.bg} ${style.border} ${style.glow} border animate-fade-in max-w-xs text-center`}
      >
        <div className="flex items-center justify-center mb-3">
          <span className={`material-symbols-outlined text-[32px] ${style.text}`}>
            {icon.icon}
          </span>
        </div>

        <div className={`text-sm font-label uppercase tracking-widest mb-2 ${style.text}`}>
          {t(`intuition.tier_${tier}`)}
        </div>

        <div className="text-xs text-on-surface-variant/80 mb-1">
          {t('intuition.reactionTime', { ms: reactionMs })}
        </div>
        <div className="text-[10px] text-on-surface-variant/50">
          {t('intuition.windowDuration', { ms: visibleMs })}
        </div>

        <div className="mt-3 text-[11px] text-on-surface-variant/60 italic">
          {t(`intuition.flavor_${icon.key}_${tier}`)}
        </div>
      </div>
    </div>
  );
}
