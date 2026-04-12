import { translateSkill } from '../../../utils/rpgTranslate';

function OverlayModifierList({ dr, t, outcomeTint = false }) {
  const RESERVED_MODIFIER_SLOTS = 4;
  const isSuccess = Boolean(dr.success || dr.criticalSuccess);
  const tintClass = outcomeTint
    ? isSuccess
      ? 'bg-emerald-400/12 text-emerald-200 border-emerald-400/25'
      : 'bg-rose-400/12 text-rose-200 border-rose-400/25'
    : null;
  const modifiers = [];

  if (dr.characteristic && dr.characteristicValue != null) {
    modifiers.push({
      key: 'characteristic',
      label: `${t(`stats.${dr.characteristic}Long`)} ${dr.characteristicValue}`,
      className: tintClass || 'bg-purple-400/15 text-purple-300 border-purple-400/30',
    });
  }
  if (dr.skillAdvances > 0) {
    modifiers.push({
      key: 'skill',
      label: `${translateSkill(dr.skill, t)} +${dr.skillAdvances}`,
      className: tintClass || 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
    });
  }
  if (dr.creativityBonus > 0) {
    modifiers.push({
      key: 'creativity',
      label: t('gameplay.creativityBonus', { bonus: dr.creativityBonus }),
      className: tintClass || 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    });
  }
  if (dr.difficultyModifier != null && dr.difficultyModifier !== 0) {
    modifiers.push({
      key: 'difficulty',
      label: t('gameplay.difficultyModifier', { bonus: (dr.difficultyModifier > 0 ? '+' : '') + dr.difficultyModifier }),
      className: tintClass || (dr.difficultyModifier > 0
        ? 'bg-teal-400/15 text-teal-300 border-teal-400/30'
        : 'bg-rose-400/15 text-rose-300 border-rose-400/30'),
    });
  }
  if (dr.momentumBonus != null && dr.momentumBonus !== 0) {
    modifiers.push({
      key: 'momentum',
      label: t('gameplay.momentumBonus', { bonus: (dr.momentumBonus > 0 ? '+' : '') + dr.momentumBonus }),
      className: tintClass || (dr.momentumBonus > 0
        ? 'bg-blue-400/15 text-blue-300 border-blue-400/30'
        : 'bg-red-400/15 text-red-300 border-red-400/30'),
    });
  }
  if (dr.dispositionBonus != null && dr.dispositionBonus !== 0) {
    modifiers.push({
      key: 'disposition',
      label: t('gameplay.dispositionBonus', { bonus: (dr.dispositionBonus > 0 ? '+' : '') + dr.dispositionBonus }),
      className: tintClass || (dr.dispositionBonus > 0
        ? 'bg-pink-400/15 text-pink-300 border-pink-400/30'
        : 'bg-orange-400/15 text-orange-300 border-orange-400/30'),
    });
  }

  const reservedModifiers = [
    ...modifiers,
    ...Array.from(
      { length: Math.max(0, RESERVED_MODIFIER_SLOTS - modifiers.length) },
      (_, idx) => ({
        key: `placeholder-${idx}`,
        label: '\u00A0',
        className: 'border-transparent bg-transparent text-transparent',
        isPlaceholder: true,
      })
    ),
  ];

  return (
    <div className="flex flex-col items-end gap-1">
      {reservedModifiers.map((modifier) => (
        <span
          key={modifier.key}
          aria-hidden={modifier.isPlaceholder ? 'true' : undefined}
          className={`w-[158px] text-right text-[10px] font-bold px-2 py-1 rounded-full border ${modifier.className}`}
        >
          {modifier.label}
        </span>
      ))}
    </div>
  );
}

/** Subtle border + tint for dice overlay card only (not full scene). */
function getDiceOutcomeCardClasses(dr) {
  if (!dr) return '';
  if (dr.criticalSuccess) {
    return 'border-amber-400/40 bg-gradient-to-br from-amber-500/[0.16] via-transparent to-amber-600/[0.09] shadow-[0_0_20px_rgba(251,191,36,0.1)]';
  }
  if (dr.criticalFailure) {
    return 'border-red-600/40 bg-gradient-to-br from-red-600/[0.16] via-transparent to-red-700/[0.09] shadow-[0_0_20px_rgba(220,38,38,0.1)]';
  }
  const ok = Boolean(dr.success || dr.criticalSuccess);
  if (ok) {
    return 'border-emerald-500/35 bg-gradient-to-br from-emerald-500/[0.14] via-transparent to-emerald-600/[0.08] shadow-[0_0_18px_rgba(16,185,129,0.09)]';
  }
  return 'border-rose-500/35 bg-gradient-to-br from-rose-500/[0.14] via-transparent to-rose-600/[0.08] shadow-[0_0_18px_rgba(244,63,94,0.09)]';
}

function getOutcomeGlow(dr) {
  if (dr.criticalSuccess) return { color: 'rgba(251, 191, 36, 0.6)', text: 'text-amber-300', border: 'border-amber-400/50' };
  if (dr.criticalFailure) return { color: 'rgba(239, 68, 68, 0.5)', text: 'text-red-300', border: 'border-red-500/50' };
  if (dr.success) return { color: 'rgba(16, 185, 129, 0.45)', text: 'text-emerald-300', border: 'border-emerald-400/40' };
  return { color: 'rgba(244, 63, 94, 0.45)', text: 'text-rose-300', border: 'border-rose-400/40' };
}

export default function OverlayDiceCard({ dr, t, showCharacter = false, isVisible = true }) {
  const target = dr?.target || dr?.dc;
  const outcomeClasses = dr ? getDiceOutcomeCardClasses(dr) : '';
  const glow = dr ? getOutcomeGlow(dr) : null;

  const safeRoll = dr ? Math.max(1, Math.min(50, Number(dr.roll) || 0)) : 0;
  const tensLabel = String(Math.floor(safeRoll / 10) * 10).padStart(2, '0');
  const unitsLabel = String(safeRoll % 10);

  return (
    <div className={`glass-panel-dice-roll-overlay relative w-max max-w-[min(92vw,24rem)] overflow-hidden rounded-2xl border px-5 py-4 flex flex-col gap-3 transition-all duration-300 ${
      outcomeClasses || 'border-outline-variant/20'
    } ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'pointer-events-none opacity-0 translate-y-1 scale-95'}`}>
      {dr ? (
        <div className="relative z-10 w-full text-center">
          {showCharacter && dr.character ? (
            <p className="text-[10px] font-bold text-on-surface uppercase tracking-[0.2em] truncate">
              {dr.character}
            </p>
          ) : null}
          <p className={`font-bold text-on-surface-variant uppercase tracking-[0.22em] truncate ${showCharacter && dr.character ? 'mt-1 text-[11px]' : 'text-xs'}`}>
            {t('gameplay.diceCheck', { skill: translateSkill(dr.skill, t) })}
          </p>
        </div>
      ) : null}

      {target != null && (
        <span
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden rounded-2xl select-none font-mono text-[9rem] font-black leading-none text-white/[0.06] blur-[2px]"
          aria-hidden
        >
          {target}
        </span>
      )}

      <div className="relative z-10 flex items-center gap-4">
        {dr ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {[tensLabel, unitsLabel].map((val, i) => (
              <div
                key={i}
                className={`relative w-16 h-[4.5rem] rounded-xl ${glow.border} flex items-center justify-center overflow-hidden`}
                style={{
                  background: 'linear-gradient(160deg, rgba(30, 25, 42, 0.92), rgba(12, 10, 18, 0.96))',
                  boxShadow: `0 0 20px ${glow.color.replace(/[\d.]+\)$/, '0.15)')}, 0 4px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-[0.07] rounded-xl"
                  style={{ background: `radial-gradient(circle at 30% 30%, ${glow.color}, transparent 70%)` }}
                />
                <span className={`relative font-mono text-[2rem] font-black leading-none ${glow.text} drop-shadow-sm`}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {dr ? (
          <div className="flex min-w-0 flex-1 justify-end">
            <OverlayModifierList dr={dr} t={t} outcomeTint />
          </div>
        ) : null}
      </div>
    </div>
  );
}
