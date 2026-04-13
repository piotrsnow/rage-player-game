import Tooltip from '../../ui/Tooltip';

const QUICK_BUTTON_STYLES = {
  primary: 'text-primary/90 hover:text-primary bg-primary/8 hover:bg-primary/14 border-primary/20 hover:border-primary/40',
  neutral: 'text-on-surface-variant/90 hover:text-on-surface bg-surface-container-high/45 hover:bg-surface-container-high border-outline-variant/20 hover:border-outline-variant/35',
  tertiary: 'text-tertiary/85 hover:text-tertiary bg-tertiary/8 hover:bg-tertiary/14 border-tertiary/20 hover:border-tertiary/35',
  danger: 'text-error/85 hover:text-error bg-error/8 hover:bg-error/14 border-error/20 hover:border-error/35',
  indigo: 'text-indigo-300/90 hover:text-indigo-200 bg-indigo-500/8 hover:bg-indigo-500/14 border-indigo-400/20 hover:border-indigo-300/35',
};

export default function QuickActionButton({
  icon,
  label,
  description,
  onClick,
  disabled = false,
  tone = 'neutral',
}) {
  return (
    <Tooltip
      className="inline-flex"
      tooltipClassName="border-primary/30 bg-[linear-gradient(150deg,rgba(24,22,36,0.97),rgba(40,30,58,0.93))] shadow-[0_20px_50px_rgba(8,8,14,0.5)]"
      content={
        <div className="space-y-1.5">
          <div className="text-[11px] font-label uppercase tracking-[0.14em] text-primary/80">{label}</div>
          {description ? (
            <div className="text-xs leading-relaxed text-on-surface/90 max-w-[240px]">
              {description}
            </div>
          ) : null}
        </div>
      }
    >
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={`shrink-0 inline-flex items-center justify-center w-9 h-9 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${QUICK_BUTTON_STYLES[tone] || QUICK_BUTTON_STYLES.neutral}`}
      >
        <span className="material-symbols-outlined text-[18px] leading-none">{icon}</span>
      </button>
    </Tooltip>
  );
}
