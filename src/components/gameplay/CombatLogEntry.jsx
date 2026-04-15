import { memo, useEffect, useMemo, useState } from 'react';
import Tooltip from '../ui/Tooltip';

const LOG_COLORS = {
  hit: { border: '#ff6e84', bg: 'rgba(255,110,132,0.06)' },
  critical: { border: '#ffefd5', bg: 'rgba(255,239,213,0.06)' },
  miss: { border: '#48474a', bg: 'rgba(72,71,74,0.06)' },
  fled: { border: '#c59aff', bg: 'rgba(197,154,255,0.06)' },
  defeat: { border: '#ff6e84', bg: 'rgba(255,110,132,0.08)' },
  info: { border: '#74c0fc', bg: 'rgba(116,192,252,0.08)' },
  round: { border: '#48474a', bg: 'transparent' },
};

const LOG_ICONS = {
  hit: 'swords',
  critical: 'local_fire_department',
  miss: 'close',
  fled: 'exit_to_app',
  defeat: 'skull',
  info: 'shield',
};

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function formatSignedNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

export function buildCombatLogDetails(result, t) {
  if (!result) return [];

  const details = [];

  if (result.customDescription) {
    details.push(`${t('combat.logDescription', 'Opis')}: ${result.customDescription}`);
  }

  if (result.effectDescription) {
    details.push(`${t('combat.logEffect', 'Efekt')}: ${result.effectDescription}`);
  }

  if (result.attackBreakdown && result.rolls?.[0]) {
    const attackRoll = result.rolls.find((roll) => roll.side === 'attacker') || result.rolls[0];
    details.push(
      `${t('combat.logAttack', 'Atak')}: ${t('combat.logRoll', 'rzut')} ${attackRoll.roll} ${t('common.vs', 'vs')} ${result.attackBreakdown.target}` +
      ` | ${t('combat.logBase', 'bazowe')} ${result.attackBreakdown.baseTarget}` +
      ` | ${t('combat.logCreativity', 'kreatywność')} ${formatSignedNumber(result.attackBreakdown.creativityBonus || 0)}` +
      ` | ${t('combat.logMargin', 'margines')} ${formatSignedNumber(attackRoll.margin ?? attackRoll.sl ?? 0)}`
    );
  }

  if (result.defenseBreakdown && result.rolls?.length) {
    const defenseRoll = result.rolls.find((roll) => roll.side === 'defender');
    if (defenseRoll) {
      details.push(
        `${t('combat.logDefense', 'Obrona')}: ${t('combat.logRoll', 'rzut')} ${defenseRoll.roll} ${t('common.vs', 'vs')} ${result.defenseBreakdown.target}` +
        ` | ${t('combat.logBase', 'bazowe')} ${result.defenseBreakdown.baseTarget}` +
        ` | ${t('combat.logDefendBonus', 'obrona')} ${formatSignedNumber(result.defenseBreakdown.defendBonus || 0)}` +
        ` | ${t('combat.logMargin', 'margines')} ${formatSignedNumber(defenseRoll.margin ?? defenseRoll.sl ?? 0)}`
      );
    }
  }

  if (result.castBreakdown && result.rolls?.length) {
    const castRoll = result.rolls.find((roll) => roll.side === 'caster') || result.rolls[0];
    details.push(
      `${t('combat.logCast', 'Magia')}: ${t('combat.logRoll', 'rzut')} ${castRoll.roll} ${t('common.vs', 'vs')} ${result.castBreakdown.target}` +
      ` | ${t('combat.logBase', 'bazowe')} ${result.castBreakdown.baseTarget}` +
      ` | ${t('combat.logMargin', 'margines')} ${formatSignedNumber(castRoll.margin ?? castRoll.sl ?? 0)}`
    );
  }

  if (result.checkBreakdown && result.rolls?.length) {
    const checkRoll = result.rolls[0];
    details.push(
      `${t('combat.logFlee', 'Ucieczka')}: ${t('combat.logRoll', 'rzut')} ${checkRoll.roll} ${t('common.vs', 'vs')} ${result.checkBreakdown.target}` +
      ` | ${t('combat.logBase', 'bazowe')} ${result.checkBreakdown.baseTarget}` +
      ` | ${t('combat.logMargin', 'margines')} ${formatSignedNumber(checkRoll.margin ?? checkRoll.sl ?? 0)}`
    );
  }

  if (result.damageBreakdown) {
    const db = result.damageBreakdown;
    const parts = [`${t('combat.logWeaponDmg', 'broń')} ${db.weaponDmg ?? 0}`];
    if (db.marginBonus) parts.push(`${t('combat.logMarginBonus', 'margines')} ${formatSignedNumber(db.marginBonus)}`);
    if (db.blocked) parts.push(t('combat.logBlocked', 'blok'));
    if (db.dr) parts.push(`${t('combat.logDR', 'DR')} -${db.dr}`);
    parts.push(`= ${db.totalDamage ?? 0}`);
    details.push(`${t('combat.logDamage', 'Obrażenia')}: ${parts.join(' | ')}`);
  }

  return details;
}

function AnimatedTextSegment({ text, startIndex, visibleCount, className = '', style }) {
  const revealedChars = Math.max(0, Math.min(text.length, visibleCount - startIndex));
  const visibleText = text.slice(0, revealedChars);

  if (!visibleText) return null;

  return (
    <span className={className} style={style}>
      {visibleText.split('').map((char, index) => (
        <span key={`${startIndex}_${index}`} className="combat-log-letter">
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}

function AnimatedCombatLogText({ entry }) {
  const textSegments = useMemo(() => {
    const segments = [
      {
        key: 'actor',
        text: entry.actor || '',
        className: 'font-bold',
        style: { color: entry.actorColor || '#fffbfe' },
      },
    ];

    if (entry.action) {
      segments.push({
        key: 'action',
        text: ` ${entry.action} `,
        className: 'text-on-surface-variant',
      });
    }

    if (entry.target) {
      segments.push({
        key: 'target',
        text: entry.target,
        className: 'font-bold',
        style: { color: entry.targetColor || '#fffbfe' },
      });
    }

    let cursor = 0;
    return segments.map((segment) => {
      const mapped = { ...segment, startIndex: cursor };
      cursor += segment.text.length;
      return mapped;
    });
  }, [entry]);

  const totalChars = textSegments.reduce((sum, segment) => sum + segment.text.length, 0);
  const [visibleCount, setVisibleCount] = useState(PREFERS_REDUCED_MOTION ? totalChars : 0);
  const textRevealComplete = visibleCount >= totalChars;

  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) {
      setVisibleCount(totalChars);
      return undefined;
    }

    setVisibleCount(0);
    if (!totalChars) return undefined;

    const timer = window.setInterval(() => {
      setVisibleCount((current) => {
        if (current >= totalChars) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 18);

    return () => window.clearInterval(timer);
  }, [entry.id, totalChars]);

  return (
    <>
      {textSegments.map((segment) => (
        <AnimatedTextSegment
          key={`${entry.id}_${segment.key}`}
          text={segment.text}
          startIndex={segment.startIndex}
          visibleCount={visibleCount}
          className={segment.className}
          style={segment.style}
        />
      ))}
      {entry.criticalHit && textRevealComplete && (
        <span className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded-sm bg-amber-400/15 text-amber-300 font-bold text-[11px] uppercase tracking-wide animate-fade-in">
          {entry.criticalLabel || 'Critical Hit'}
        </span>
      )}
      {entry.damage != null && textRevealComplete && (
        <span className="inline-flex items-center ml-1.5 px-2 py-1 rounded-sm bg-error/20 text-error font-black text-sm uppercase tracking-wider tabular-nums animate-fade-in">
          -{entry.damage}
        </span>
      )}
      {entry.highlightText && textRevealComplete && (
        <span className={`inline-flex items-center ml-1.5 px-2 py-1 rounded-sm font-black text-sm uppercase tracking-wider animate-fade-in ${
          entry.highlightTone === 'miss'
            ? 'bg-surface-container-high text-on-surface'
            : 'bg-primary/15 text-primary'
        }`}>
          {entry.highlightText}
        </span>
      )}
      {entry.location && textRevealComplete && (
        <span className="ml-1.5 text-[10px] text-on-surface-variant px-1.5 py-0.5 bg-surface-container rounded-sm animate-fade-in">
          {entry.location}
        </span>
      )}
      {entry.critName && textRevealComplete && (
        <div className="mt-0.5 text-[11px] text-tertiary font-bold animate-fade-in">
          ⚡ {entry.critName}
        </div>
      )}
    </>
  );
}

function renderDetailWithBoldValues(text, key) {
  const parts = text.split(/([-+]?\d+)/g);
  return parts.map((part, i) =>
    /^[-+]?\d+$/.test(part)
      ? <span key={`${key}_${i}`} className="font-bold text-on-surface">{part}</span>
      : part
  );
}

function buildCombatLogTooltipContent(entry, t) {
  if (!entry) return null;

  const detailLines = [...(entry.details || [])];

  if (entry.critEffect) {
    detailLines.push(`${t('combat.logCriticalEffect', 'Efekt krytyczny')}: ${entry.critEffect}`);
  }

  if (!detailLines.length) return null;

  return (
    <div className="space-y-1.5">
      {detailLines.map((detail, index) => (
        <div
          key={`${entry.id}_tooltip_${index}`}
          className="text-[11px] leading-snug break-words"
        >
          {renderDetailWithBoldValues(detail, `${entry.id}_tooltip_${index}`)}
        </div>
      ))}
    </div>
  );
}

function CombatLogEntry({ entry, t }) {
  if (!entry) return null;
  const style = LOG_COLORS[entry.type] || LOG_COLORS.miss;

  if (entry.type === 'round') {
    return (
      <div className="flex items-center gap-3 py-1.5" data-testid="combat-log-round">
        <div className="flex-1 h-px bg-outline-variant/20" />
        <span className="text-[11px] text-outline-variant font-label uppercase tracking-widest shrink-0">
          {entry.text}
        </span>
        <div className="flex-1 h-px bg-outline-variant/20" />
      </div>
    );
  }

  const tooltipContent = buildCombatLogTooltipContent(entry, t);

  const content = (
    <div
      data-testid="combat-log-entry"
      data-combat-log-type={entry.type}
      className={`flex items-start gap-2 px-3 py-2 rounded-sm animate-fade-in transition-colors ${
        tooltipContent ? 'hover:bg-surface-container/30' : ''
      }`}
      style={{ borderLeft: `3px solid ${style.border}`, background: style.bg }}
    >
      <span className="material-symbols-outlined text-sm mt-0.5 shrink-0" style={{ color: style.border }}>
        {LOG_ICONS[entry.type] || 'info'}
      </span>
      <div className="flex-1 min-w-0 text-[12px] leading-snug">
        <AnimatedCombatLogText entry={entry} />
      </div>
      {tooltipContent && (
        <span className="material-symbols-outlined text-[14px] text-outline-variant/70 mt-0.5 shrink-0">
          info
        </span>
      )}
    </div>
  );

  if (!tooltipContent) {
    return content;
  }

  return (
    <Tooltip content={tooltipContent} className="block w-full">
      {content}
    </Tooltip>
  );
}

export default memo(CombatLogEntry);
