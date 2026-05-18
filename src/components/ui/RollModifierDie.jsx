import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Roll a single d50.
 */
export function randomD50() {
  return Math.floor(Math.random() * 50) + 1;
}

/**
 * Clamp `raw + modifier` to [1, 50] — used for narrative dice modifiers
 * where ±10/20/30/40/50 nudges the player toward success/failure without
 * skipping the dice entirely.
 */
export function applyRollModifier(raw, modifier) {
  return Math.min(50, Math.max(1, raw + Number(modifier || 0)));
}

function formatModifier(m) {
  if (m === 0) return '0';
  return m > 0 ? `+${m}` : String(m);
}

/**
 * Reusable dice-with-modifier control. LMB = `-step`, RMB = `+step`.
 *
 * Used by InventSpellModal, UseItemModal (combine mode), EnchantItemModal —
 * a player can pre-load the roll with a swing favor before submitting.
 *
 * Props:
 *  - value: current modifier (signed integer)
 *  - onChange(next): receives the new value
 *  - disabled: when true, both clicks are no-ops
 *  - step: increment per click (default 10)
 *  - min/max: clamp bounds (defaults −50..+50)
 *  - className: extra classes appended to the button
 *  - tooltipKey/tooltipFallback: i18n override for the tooltip
 */
export default function RollModifierDie({
  value = 0,
  onChange,
  disabled = false,
  step = 10,
  min = -50,
  max = 50,
  className = '',
  tooltipKey = 'gameplay.inventSpellDiceTooltip',
  tooltipFallback = null,
}) {
  const { t } = useTranslation();

  const handleClick = useCallback(() => {
    if (disabled || !onChange) return;
    onChange(Math.max(min, value - step));
  }, [disabled, onChange, value, step, min]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    if (disabled || !onChange) return;
    onChange(Math.min(max, value + step));
  }, [disabled, onChange, value, step, max]);

  const formatted = formatModifier(value);
  const tooltip = tooltipFallback
    ? t(tooltipKey, tooltipFallback, { modifier: formatted })
    : t(tooltipKey, { modifier: formatted });

  return (
    <button
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      disabled={disabled}
      className={`shrink-0 flex items-center gap-1.5 h-10 px-2.5 rounded-sm border border-outline-variant/25 bg-surface-container-high/50 hover:bg-surface-container-high hover:border-primary/30 text-on-surface-variant hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed select-none ${className}`}
    >
      <span className="material-symbols-outlined text-xl">casino</span>
      <span className={`text-xs font-mono font-label tabular-nums ${value === 0 ? 'opacity-50' : ''}`}>
        {formatted}
      </span>
    </button>
  );
}
