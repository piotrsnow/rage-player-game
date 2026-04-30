import { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Tooltip from '../../ui/Tooltip';

// Single-click vs double-click on the same button: browsers fire both
// `click` and `dblclick`, so we debounce the single-click with a small
// timer (~220 ms). React's onDoubleClick latency is ~200-250 ms in
// practice; this keeps the two paths cleanly separate.
const DOUBLE_CLICK_DELAY_MS = 220;

const STATE_STYLES = {
  off: 'text-on-surface-variant/90 hover:text-on-surface bg-surface-container-high/45 hover:bg-surface-container-high border-outline-variant/20 hover:border-outline-variant/35',
  on: 'text-primary hover:text-primary bg-primary/18 hover:bg-primary/26 border-primary/45 hover:border-primary/60 shadow-[0_0_12px_rgba(197,154,255,0.25)]',
  bonus: 'text-emerald-300 hover:text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/22 border-emerald-400/45 hover:border-emerald-300/60 shadow-[0_0_12px_rgba(52,211,153,0.28)]',
  malus: 'text-error hover:text-error bg-error/15 hover:bg-error/22 border-error/45 hover:border-error/60 shadow-[0_0_12px_rgba(239,68,68,0.28)]',
};

function resolveStateKey({ enabled, modifier }) {
  if (!enabled) return 'off';
  if (modifier > 0) return 'bonus';
  if (modifier < 0) return 'malus';
  return 'on';
}

export default function ForceRollButton({
  state,
  onLeftClick,
  onDoubleClick,
  onRightClick,
  disabled = false,
}) {
  const { t } = useTranslation();
  const clickTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const handleClick = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onLeftClick?.();
    }, DOUBLE_CLICK_DELAY_MS);
  }, [onLeftClick]);

  const handleDoubleClick = useCallback(() => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onDoubleClick?.();
  }, [onDoubleClick]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onRightClick?.();
  }, [onRightClick]);

  const stateKey = resolveStateKey(state || { enabled: false, modifier: 0 });
  const descriptionKey = {
    off: 'gameplay.forceRoll.descriptionOff',
    on: 'gameplay.forceRoll.descriptionOn',
    bonus: 'gameplay.forceRoll.descriptionBonus',
    malus: 'gameplay.forceRoll.descriptionMalus',
  }[stateKey];
  const label = t('gameplay.forceRoll.button');
  const description = t(descriptionKey);

  return (
    <Tooltip
      className="inline-flex"
      tooltipClassName="border-primary/30 bg-[linear-gradient(150deg,rgba(24,22,36,0.97),rgba(40,30,58,0.93))] shadow-[0_20px_50px_rgba(8,8,14,0.5)]"
      content={
        <div className="space-y-1.5">
          <div className="text-[11px] font-label uppercase tracking-[0.14em] text-primary/80">
            {label}
            {stateKey === 'bonus' && <span className="ml-2 text-emerald-300">+30</span>}
            {stateKey === 'malus' && <span className="ml-2 text-error">−30</span>}
          </div>
          <div className="text-xs leading-relaxed text-on-surface/90 max-w-[260px]">
            {description}
          </div>
        </div>
      }
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={stateKey !== 'off'}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        disabled={disabled}
        className={`relative shrink-0 inline-flex items-center justify-center w-9 h-9 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${STATE_STYLES[stateKey]}`}
      >
        <span className="material-symbols-outlined text-[18px] leading-none">casino</span>
        {stateKey === 'bonus' && (
          <span className="absolute -top-1 -right-1 text-[9px] font-bold leading-none px-1 py-0.5 rounded-full bg-emerald-500/90 text-black">
            +
          </span>
        )}
        {stateKey === 'malus' && (
          <span className="absolute -top-1 -right-1 text-[9px] font-bold leading-none px-1 py-0.5 rounded-full bg-error text-on-error">
            −
          </span>
        )}
      </button>
    </Tooltip>
  );
}
