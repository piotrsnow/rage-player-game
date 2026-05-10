import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DiceRoller from '../../effects/DiceRoller';
import { DICE_OVERLAY_INTRO_MS, DICE_OVERLAY_THROW_DELAY_MS } from '../../effects/diceOverlayIntro.js';
import { translateSkill, translateAttribute } from '../../utils/rpgTranslate';
import { normalizeDiceRoll } from '../../utils/normalizeDiceRoll.js';

const RESULT_HOLD_MS = 4200;
const FADE_OUT_MS = 600;

function getOutcomeLabel(dr, t) {
  if (dr.criticalSuccess) return t('common.criticalSuccess');
  if (dr.criticalFailure) return t('common.criticalFailure');
  return dr.success ? t('common.success') : t('common.failure');
}

function getOutcomeColor(dr) {
  if (dr.criticalSuccess) return 'text-pink-300';
  if (dr.criticalFailure) return 'text-rose-500';
  return dr.success ? 'text-sky-300' : 'text-rose-400';
}

function getOutcomeGlow(dr) {
  if (dr.criticalSuccess) return 'rgba(249, 168, 212, 0.35)';
  if (dr.criticalFailure) return 'rgba(190, 24, 93, 0.3)';
  return dr.success ? 'rgba(56, 189, 248, 0.25)' : 'rgba(190, 24, 93, 0.25)';
}

function getOutcomeBorder(dr) {
  if (dr.criticalSuccess) return 'border-pink-300/50';
  if (dr.criticalFailure) return 'border-pink-700/50';
  return dr.success ? 'border-sky-400/40' : 'border-pink-600/40';
}

export default function DiceRollAnimationOverlay({ diceRoll, onDismiss, holdOpen = false, mode = 'fullscreen' }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState('rolling');
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const diceRollRef = useRef(diceRoll);
  const wasHeldRef = useRef(false);
  const rollerCompletedWhileStreamingRef = useRef(false);

  useEffect(() => {
    const wasStreaming = diceRollRef.current?._streaming === true;
    diceRollRef.current = diceRoll;
    // Streaming placeholder upgraded to full server roll: if the DiceRoller
    // already finished spinning while we were waiting, jump to result now.
    if (wasStreaming && diceRoll && !diceRoll._streaming && rollerCompletedWhileStreamingRef.current) {
      rollerCompletedWhileStreamingRef.current = false;
      setPhase('result');
    }
  }, [diceRoll]);

  const handleRollComplete = useCallback(() => {
    // Don't reveal the result card while we still have a placeholder roll —
    // wait for the server-reconciled values to arrive via setEarlyDiceRoll.
    if (diceRollRef.current?._streaming) {
      rollerCompletedWhileStreamingRef.current = true;
      return;
    }
    setPhase('result');
  }, []);

  useEffect(() => {
    if (phase === 'result') {
      if (holdOpen) {
        wasHeldRef.current = true;
        return undefined;
      }
      const delay = wasHeldRef.current ? 0 : RESULT_HOLD_MS;
      const timer = setTimeout(() => setPhase('fading'), delay);
      return () => clearTimeout(timer);
    }
    if (phase === 'fading') {
      const timer = setTimeout(() => {
        onDismissRef.current?.();
      }, FADE_OUT_MS);
      return () => clearTimeout(timer);
    }
  }, [phase, holdOpen]);

  const dr = diceRollRef.current;
  if (!dr) return null;

  const nd = normalizeDiceRoll(dr);
  const isStreaming = dr._streaming === true;
  const target = nd.threshold;
  const skillLabel = nd.skill
    ? translateSkill(nd.skill, t)
    : nd.attributeKey
      ? translateAttribute(nd.attributeKey, t)
      : '';

  const modTags = [];
  if (nd.attributeKey && nd.attributeValue != null) {
    modTags.push({ label: translateAttribute(nd.attributeKey, t), value: nd.attributeValue, cls: 'text-purple-300/80' });
  }
  if (nd.skillLevel > 0) {
    modTags.push({ label: translateSkill(nd.skill, t), value: nd.skillLevel, cls: 'text-emerald-300/80' });
  }
  if (nd.creativityBonus > 0) {
    modTags.push({ label: t('gameplay.creativityBonus', { bonus: '' }).trim(), value: nd.creativityBonus, cls: 'text-amber-300/80' });
  }

  const isImage = mode === 'image';

  return (
    <div
      className={`${isImage ? 'absolute' : 'fixed'} inset-0 ${isImage ? 'z-[12]' : 'z-[80]'} pointer-events-none flex flex-col items-center justify-center transition-opacity duration-500 ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ paddingTop: isImage ? '270px' : '430px' }}
    >
      {/* 3D Dice roller area — fades out once roll completes, slightly before result card appears */}
      <div
        className={`relative w-[260px] h-[200px] -mt-16 animate-dice-fly-in transition-all ease-out ${
          phase === 'rolling'
            ? 'opacity-100 scale-100 duration-0'
            : 'opacity-0 scale-90 -translate-y-3 duration-[400ms]'
        }`}
        style={{ animationDuration: `${DICE_OVERLAY_INTRO_MS}ms` }}
      >
        <DiceRoller
          diceRoll={dr}
          onComplete={handleRollComplete}
          showOverlayResult={false}
          sizeMultiplier={2}
          durationMultiplier={1.25}
          variant="overlay"
          preRollRevealMs={DICE_OVERLAY_THROW_DELAY_MS}
          isVisible
        />
      </div>

      {/* Streaming placeholder: skill known but values not yet reconciled. */}
      {isStreaming && skillLabel && (
        <div className="mt-2 animate-fade-in">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-on-surface-variant text-center">
            {t('gameplay.diceCheck', { skill: skillLabel })}
          </p>
        </div>
      )}

      {/* Result card - appears after roll animation finishes, slightly after dice fade */}
      <div
        className={`mt-2 transition-all ease-out ${
          phase === 'rolling' || isStreaming
            ? 'opacity-0 translate-y-4 scale-90 duration-0 pointer-events-none'
            : 'opacity-100 translate-y-0 scale-100 duration-500 delay-150'
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
                {nd.roll}
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
            {(dr.margin ?? dr.sl) != null && <div className="w-px h-10 bg-outline-variant/20" />}

            {/* Margin */}
            {(dr.margin ?? dr.sl) != null && (
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70">
                  {t('gameplay.margin', 'Margines')}
                </span>
                <span className={`font-mono text-3xl font-black leading-none ${
                  (dr.margin ?? dr.sl) >= 0 ? 'text-sky-300' : 'text-rose-400'
                }`}>
                  {(dr.margin ?? dr.sl) > 0 ? '+' : ''}{dr.margin ?? dr.sl}
                </span>
              </div>
            )}
          </div>

          {/* Modifier breakdown */}
          {modTags.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              {modTags.map((tag, i) => (
                <span key={i} className={`text-[10px] font-bold ${tag.cls}`}>
                  {tag.label} +{tag.value}
                </span>
              ))}
            </div>
          )}

          {/* Situational modifier chips */}
          {nd.thresholdBreakdown?.modifiers?.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
              {nd.thresholdBreakdown.modifiers.map((mod, i) => (
                <span
                  key={i}
                  className="text-[9px] font-bold text-orange-300/80 bg-orange-400/10 border border-orange-400/20 rounded-full px-2 py-0.5"
                >
                  {mod.value >= 0 ? '+' : '−'}{Math.abs(mod.value)} {mod.reason}
                </span>
              ))}
            </div>
          )}

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
