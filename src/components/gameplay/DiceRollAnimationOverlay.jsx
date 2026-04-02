import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DiceRoller from '../../effects/DiceRoller';
import { translateSkill } from '../../utils/wfrpTranslate';

const RESULT_HOLD_MS = 2800;
const FADE_OUT_MS = 600;

function getOutcomeLabel(dr, t) {
  if (dr.criticalSuccess) return t('common.criticalSuccess');
  if (dr.criticalFailure) return t('common.criticalFailure');
  return dr.success ? t('common.success') : t('common.failure');
}

function getOutcomeColor(dr) {
  if (dr.criticalSuccess) return 'text-amber-300';
  if (dr.criticalFailure) return 'text-red-400';
  return dr.success ? 'text-emerald-300' : 'text-rose-400';
}

function getOutcomeGlow(dr) {
  if (dr.criticalSuccess) return 'rgba(251, 191, 36, 0.35)';
  if (dr.criticalFailure) return 'rgba(239, 68, 68, 0.3)';
  return dr.success ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
}

function getOutcomeBorder(dr) {
  if (dr.criticalSuccess) return 'border-amber-400/50';
  if (dr.criticalFailure) return 'border-red-500/50';
  return dr.success ? 'border-emerald-500/40' : 'border-rose-500/40';
}

export default function DiceRollAnimationOverlay({ diceRoll, onDismiss }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState('rolling');
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const diceRollRef = useRef(diceRoll);

  useEffect(() => {
    diceRollRef.current = diceRoll;
  }, [diceRoll]);

  const handleRollComplete = useCallback(() => {
    setPhase('result');
  }, []);

  useEffect(() => {
    if (phase === 'result') {
      const timer = setTimeout(() => setPhase('fading'), RESULT_HOLD_MS);
      return () => clearTimeout(timer);
    }
    if (phase === 'fading') {
      const timer = setTimeout(() => {
        onDismissRef.current?.();
      }, FADE_OUT_MS);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const dr = diceRollRef.current;
  if (!dr) return null;

  const target = dr.target || dr.dc;
  const skillLabel = dr.skill
    ? translateSkill(dr.skill, t)
    : dr.characteristic
      ? t(`stats.${dr.characteristic}Long`)
      : '';

  return (
    <div
      className={`fixed inset-0 z-[80] pointer-events-none flex flex-col items-center justify-center transition-opacity duration-500 ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* 3D Dice roller area */}
      <div className="relative w-[260px] h-[200px] -mt-16">
        <DiceRoller
          diceRoll={dr}
          onComplete={handleRollComplete}
          showOverlayResult={false}
          sizeMultiplier={3}
          durationMultiplier={1}
          variant="overlay"
          isVisible
        />
      </div>

      {/* Result card - appears after roll animation finishes */}
      <div
        className={`mt-2 transition-all duration-500 ease-out ${
          phase === 'rolling'
            ? 'opacity-0 translate-y-4 scale-90'
            : 'opacity-100 translate-y-0 scale-100'
        }`}
      >
        <div
          className={`relative rounded-xl border px-6 py-4 backdrop-blur-lg ${getOutcomeBorder(dr)}`}
          style={{
            background: 'linear-gradient(135deg, rgba(25, 20, 35, 0.92), rgba(15, 12, 22, 0.95))',
            boxShadow: `0 0 40px ${getOutcomeGlow(dr)}, 0 8px 32px rgba(0, 0, 0, 0.5)`,
          }}
        >
          {/* Skill label */}
          {skillLabel && (
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant text-center mb-2">
              {t('gameplay.diceCheck', { skill: skillLabel })}
            </p>
          )}

          {/* Roll / Target / SL row */}
          <div className="flex items-center justify-center gap-5">
            {/* Roll */}
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70">
                {t('gameplay.rollLabel', 'Rzut')}
              </span>
              <span
                className={`font-mono text-3xl font-black leading-none ${getOutcomeColor(dr)}`}
                style={{ textShadow: `0 0 12px ${getOutcomeGlow(dr)}` }}
              >
                {dr.roll}
              </span>
            </div>

            {/* Divider */}
            <div className="w-px h-10 bg-outline-variant/20" />

            {/* Target */}
            {target != null && (
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70">
                  {t('common.target', 'Cel')}
                </span>
                <span className="font-mono text-3xl font-black leading-none text-on-surface/80">
                  {target}
                </span>
              </div>
            )}

            {/* Divider */}
            {dr.sl != null && <div className="w-px h-10 bg-outline-variant/20" />}

            {/* SL */}
            {dr.sl != null && (
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70">
                  SL
                </span>
                <span className={`font-mono text-3xl font-black leading-none ${
                  dr.sl >= 0 ? 'text-emerald-300' : 'text-rose-400'
                }`}>
                  {dr.sl > 0 ? '+' : ''}{dr.sl}
                </span>
              </div>
            )}
          </div>

          {/* Outcome label */}
          <p
            className={`text-center text-sm font-black uppercase tracking-[0.25em] mt-3 ${getOutcomeColor(dr)}`}
            style={{ textShadow: `0 0 16px ${getOutcomeGlow(dr)}` }}
          >
            {getOutcomeLabel(dr, t)}
          </p>
        </div>
      </div>
    </div>
  );
}
