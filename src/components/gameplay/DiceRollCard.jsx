import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeDiceRoll } from '../../utils/normalizeDiceRoll.js';
import { translateSkill, translateAttribute } from '../../utils/rpgTranslate';

// ── Outcome style helpers ──

function getOutcomeStyles(dr) {
  if (dr.criticalSuccess) return {
    accent: 'text-pink-300',
    glow: 'from-pink-300/12 via-transparent to-pink-300/12',
    border: 'border-pink-300/45',
    badge: 'bg-pink-300/15 text-pink-200 border-pink-300/25',
    glowColor: 'rgba(249,168,212,0.12)',
  };
  if (dr.criticalFailure) return {
    accent: 'text-rose-500',
    glow: 'from-pink-800/12 via-transparent to-pink-800/12',
    border: 'border-pink-700/45',
    badge: 'bg-pink-800/12 text-rose-400 border-pink-700/22',
    glowColor: 'rgba(190,24,93,0.12)',
  };
  if (dr.success) return {
    accent: 'text-pink-400',
    glow: 'from-pink-500/10 via-transparent to-pink-500/10',
    border: 'border-pink-400/35',
    badge: 'bg-pink-500/15 text-pink-300 border-pink-400/25',
    glowColor: 'rgba(236,72,153,0.09)',
  };
  return {
    accent: 'text-rose-400',
    glow: 'from-pink-700/10 via-transparent to-pink-700/10',
    border: 'border-pink-600/35',
    badge: 'bg-pink-700/15 text-rose-300 border-pink-600/25',
    glowColor: 'rgba(190,24,93,0.09)',
  };
}

function getOutcomeLabel(dr, t) {
  if (dr.criticalSuccess) return t('common.criticalSuccess');
  if (dr.criticalFailure) return t('common.criticalFailure');
  return dr.success ? t('common.success') : t('common.failure');
}

// ── Modifier line builder ──

function formatSignedValue(n) {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function buildModifierLines(nd, t) {
  const lines = [];

  if (nd.attributeKey && nd.attributeValue != null) {
    lines.push({
      label: translateAttribute(nd.attributeKey, t),
      value: formatSignedValue(nd.attributeValue),
      color: 'text-purple-300',
    });
  }

  if (nd.skillLevel > 0) {
    lines.push({
      label: translateSkill(nd.skill, t),
      value: formatSignedValue(nd.skillLevel),
      color: 'text-emerald-300',
    });
  }

  if (nd.creativityBonus > 0) {
    lines.push({
      label: t('gameplay.creativityBonus', { bonus: '' }).trim(),
      value: formatSignedValue(nd.creativityBonus),
      color: 'text-amber-300',
    });
  }

  if (nd.momentumBonus != null && nd.momentumBonus !== 0) {
    lines.push({
      label: 'Momentum',
      value: formatSignedValue(nd.momentumBonus),
      color: nd.momentumBonus > 0 ? 'text-blue-300' : 'text-red-300',
    });
  }

  if (nd.dispositionBonus != null && nd.dispositionBonus !== 0) {
    lines.push({
      label: t('gameplay.dispositionBonus', { bonus: '' }).trim(),
      value: formatSignedValue(nd.dispositionBonus),
      color: nd.dispositionBonus > 0 ? 'text-pink-300' : 'text-orange-300',
    });
  }

  return lines;
}

function getDifficultyLabel(difficultyKey, t) {
  if (!difficultyKey) return null;
  return t(`gameplay.difficultyThresholds.${difficultyKey}`, { defaultValue: '' }) || null;
}

// ── Card content (shared inner) ──

function CardContent({ nd, styles, modifierLines, expanded, t, showCharacter }) {
  const roll = Number(nd.roll) || 0;
  const total = computeTotal(nd);
  const threshold = nd.threshold;
  const margin = nd.margin ?? (threshold != null ? total - threshold : null);
  const diffLabel = getDifficultyLabel(nd.difficulty, t);
  const outcomeLabel = getOutcomeLabel(nd, t);
  const isCritical = nd.criticalSuccess || nd.criticalFailure;

  if (!expanded) {
    return (
      <>
        <span className={`material-symbols-outlined text-lg ${styles.accent}`}>casino</span>
        <span className="font-mono text-xs font-bold text-on-surface">
          {total} {t('common.vs')} {threshold ?? '?'}
        </span>
      </>
    );
  }

  return (
    <div className="w-full">
      {showCharacter && nd.character && (
        <p className="text-[10px] font-bold text-on-surface uppercase tracking-[0.2em] truncate text-center">
          {nd.character}
        </p>
      )}
      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] text-center mb-3">
        {t('gameplay.diceRollTitle', { skill: translateSkill(nd.skill, t) })}
      </p>

      <div className="space-y-1 font-mono text-sm px-1">
        <div className="flex justify-between items-baseline">
          <span className="text-on-surface-variant">k50</span>
          <span className={`font-bold ${styles.accent}`}>{roll}</span>
        </div>

        {modifierLines.map((line, i) => (
          <div key={i} className="flex justify-between items-baseline">
            <span className={`text-xs ${line.color}`}>{line.label}</span>
            <span className={`font-bold ${line.color}`}>{line.value}</span>
          </div>
        ))}

        <div className="border-t border-outline-variant/20 my-1" />

        <div className="flex justify-between items-baseline">
          <span className="text-on-surface-variant font-semibold">{t('gameplay.diceRollSum')}</span>
          <span className="font-bold text-on-surface text-base">{total}</span>
        </div>

        {threshold != null && (
          <div className="flex justify-between items-baseline">
            <span className="text-on-surface-variant">
              {t('gameplay.diceRollVsThreshold')}
              {diffLabel ? ` (${diffLabel})` : ''}
            </span>
            <span className="font-bold text-on-surface/80">{threshold}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1.5 mt-3">
        {margin != null && (
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
            margin >= 0
              ? 'text-pink-300 bg-pink-400/12 border-pink-400/25'
              : 'text-rose-300 bg-pink-600/12 border-pink-600/25'
          }`}>
            <span className="material-symbols-outlined text-[14px] leading-none">fitness_center</span>
            <span className="text-xs font-bold">
              {t('gameplay.rollEdge', { value: `${margin > 0 ? '+' : ''}${margin}` })}
            </span>
          </div>
        )}

        <div className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${styles.badge}`}>
          {outcomeLabel}
        </div>

        {isCritical && (
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
            {nd.success ? t('common.success') : t('common.failure')}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function computeTotal(nd) {
  if (Number.isFinite(Number(nd.total))) return Number(nd.total);
  const roll = Number(nd.roll) || 0;
  return roll + (nd.attributeValue || 0) + (nd.skillLevel || 0)
    + (nd.creativityBonus || 0) + (nd.momentumBonus || 0) + (nd.dispositionBonus || 0);
}

// ── Main component ──

/**
 * Unified dice roll card for chat (collapsed by default) and scene overlay (expanded).
 *
 * @param {Object} props
 * @param {Object} props.diceData - raw dice roll data (any shape — normalized internally)
 * @param {boolean} [props.defaultExpanded=false]
 * @param {boolean} [props.showCharacter=false] - show character name (multiplayer)
 * @param {string} [props.className=''] - extra CSS classes for positioning
 */
export default function DiceRollCard({ diceData, defaultExpanded = false, showCharacter = false, className = '' }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [animating, setAnimating] = useState(false);

  const nd = normalizeDiceRoll(diceData);
  if (!nd) return null;

  const styles = getOutcomeStyles(nd);
  const modifierLines = buildModifierLines(nd, t);

  const toggle = () => {
    setAnimating(true);
    setExpanded((v) => !v);
    setTimeout(() => setAnimating(false), 300);
  };

  const isOverlay = defaultExpanded;

  return (
    <div className={`${isOverlay ? '' : expanded ? 'my-2' : 'my-1.5'} ${isOverlay ? '' : 'flex justify-center'} ${className}`.trim()}>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
        className={[
          'rounded-xl border cursor-pointer select-none',
          'transition-all duration-300 ease-out',
          styles.border,
          `bg-gradient-to-r ${styles.glow}`,
          expanded
            ? `px-4 py-3 ${isOverlay ? 'glass-panel-dice-roll-overlay w-max max-w-[min(92vw,20rem)]' : ''} flex flex-col items-center`
            : 'w-[92px] h-[92px] flex flex-col items-center justify-center gap-1 hover:scale-[1.03]',
          animating ? 'scale-[0.96] opacity-90' : 'scale-100 opacity-100',
        ].join(' ')}
      >
        <CardContent
          nd={nd}
          styles={styles}
          modifierLines={modifierLines}
          expanded={expanded}
          t={t}
          showCharacter={showCharacter}
        />
      </div>
    </div>
  );
}
