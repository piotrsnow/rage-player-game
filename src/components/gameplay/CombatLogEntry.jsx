import { memo, useEffect, useMemo, useState } from 'react';
import Tooltip from '../ui/Tooltip';
import LoadingSpinner from '../ui/LoadingSpinner';
import { translateAttribute, translateSkill } from '../../utils/rpgTranslate';

const LOG_COLORS = {
  hit: { border: '#ff6e84', bg: 'rgba(255,110,132,0.06)' },
  critical: { border: '#ffefd5', bg: 'rgba(255,239,213,0.06)' },
  miss: { border: '#48474a', bg: 'rgba(72,71,74,0.06)' },
  fled: { border: '#c59aff', bg: 'rgba(197,154,255,0.06)' },
  defeat: { border: '#ff6e84', bg: 'rgba(255,110,132,0.08)' },
  info: { border: '#74c0fc', bg: 'rgba(116,192,252,0.08)' },
  effect: { border: '#f0abfc', bg: 'rgba(240,171,252,0.08)' },
  ai_pending: { border: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  ai_action: { border: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  round: { border: '#48474a', bg: 'transparent' },
};

const LOG_ICONS = {
  hit: 'swords',
  critical: 'local_fire_department',
  miss: 'close',
  fled: 'exit_to_app',
  defeat: 'skull',
  info: 'shield',
  effect: 'blur_on',
  ai_pending: 'help',
  ai_action: 'auto_awesome',
};

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const TYPING_SFX_COUNT = 3;
const COMBAT_LOG_TYPING_VOLUME = 0.2;

function pickRandomTypingSfx() {
  const idx = Math.floor(Math.random() * TYPING_SFX_COUNT) + 1;
  return `/battle_sfx/typing_on_keyboard_${idx}.mp3`;
}

function fadeOutAudio(audio) {
  let vol = audio.volume;
  const fade = window.setInterval(() => {
    vol = Math.max(0, vol - 0.05);
    audio.volume = vol;
    if (vol <= 0) {
      window.clearInterval(fade);
      audio.pause();
      audio.currentTime = 0;
    }
  }, 30);
}

function formatSignedNumber(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

function buildRollItem(label, breakdown, roll, modifiers) {
  if (!breakdown || !roll) return null;
  return {
    kind: 'roll',
    label,
    roll: roll.roll,
    total: roll.total,
    threshold: breakdown.target,
    baseTarget: breakdown.baseTarget,
    margin: roll.margin ?? roll.sl ?? 0,
    success: Boolean(roll.success),
    criticalSuccess: Boolean(roll.criticalSuccess),
    criticalFailure: Boolean(roll.criticalFailure),
    modifiers,
  };
}

export function buildCombatLogDetails(result, t) {
  if (!result) return [];

  const items = [];

  if (result.customDescription) {
    items.push({ kind: 'description', text: result.customDescription });
  }

  if (result.effectDescription) {
    items.push({ kind: 'effect', text: result.effectDescription });
  }

  if (result.attackBreakdown) {
    const attackRoll = result.rolls?.find((r) => r.side === 'attacker') || result.rolls?.[0];
    const ab = result.attackBreakdown;
    const mods = [];
    if (ab.attribute) {
      mods.push({
        label: translateAttribute(ab.attributeKey, t),
        value: formatSignedNumber(ab.attribute),
        color: 'text-purple-300',
      });
    }
    if (ab.skillLevel) {
      mods.push({
        label: translateSkill(ab.skillName, t),
        value: formatSignedNumber(ab.skillLevel),
        color: 'text-emerald-300',
      });
    }
    if (ab.effectBonus) {
      mods.push({
        label: t('combat.logEffect', 'Efekt'),
        value: formatSignedNumber(ab.effectBonus),
        color: ab.effectBonus > 0 ? 'text-blue-300' : 'text-red-300',
      });
    }
    if (ab.creativityBonus) {
      mods.push({
        label: t('combat.logCreativity', 'kreatywność'),
        value: formatSignedNumber(ab.creativityBonus),
        color: 'text-amber-300',
      });
    }
    const item = buildRollItem(t('combat.logAttack', 'Atak'), ab, attackRoll, mods);
    if (item) {
      const db = result.defenseBreakdown;
      if (db) {
        const thresholdMods = [];
        if (db.attribute) {
          thresholdMods.push({
            label: translateAttribute(db.attributeKey || 'zrecznosc', t),
            value: db.attribute,
          });
        }
        if (db.defendBonus) {
          thresholdMods.push({
            label: t('combat.logDefendBonus', 'premia obrony'),
            value: db.defendBonus,
          });
        }
        if (db.skillLevel) {
          thresholdMods.push({
            label: translateSkill(db.skillName || 'Uniki', t),
            value: db.skillLevel,
          });
        }
        if (thresholdMods.length) {
          item.thresholdBreakdown = {
            base: db.baseTarget,
            modifiers: thresholdMods,
            final: db.target,
          };
        }
      }
      items.push(item);
    }
  }

  if (result.castBreakdown) {
    const castRoll = result.rolls?.find((r) => r.side === 'caster') || result.rolls?.[0];
    const cb = result.castBreakdown;
    const castMods = [];
    if (cb.attribute) {
      castMods.push({
        label: translateAttribute(cb.attributeKey || 'inteligencja', t),
        value: formatSignedNumber(cb.attribute),
        color: 'text-purple-300',
      });
    }
    if (cb.effectBonus) {
      castMods.push({
        label: t('combat.logEffect', 'Efekt'),
        value: formatSignedNumber(cb.effectBonus),
        color: cb.effectBonus > 0 ? 'text-blue-300' : 'text-red-300',
      });
    }
    const castLabel = cb.spellName
      ? `${t('combat.logCast', 'Magia')} — ${cb.spellName}`
      : t('combat.logCast', 'Magia');
    const item = buildRollItem(castLabel, cb, castRoll, castMods);
    if (item) items.push(item);
  }

  if (result.checkBreakdown) {
    const checkRoll = result.rolls?.[0];
    const item = buildRollItem(t('combat.logFlee', 'Ucieczka'), result.checkBreakdown, checkRoll, []);
    if (item) items.push(item);
  }

  if (result.damageBreakdown) {
    const db = result.damageBreakdown;
    items.push({
      kind: 'damage',
      weaponDmg: db.weaponDmg ?? 0,
      marginBonus: db.marginBonus || 0,
      blocked: Boolean(db.blocked),
      dr: db.dr || 0,
      totalDamage: db.totalDamage ?? 0,
      isMagic: Boolean(db.isMagic),
    });
  }

  return items;
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
    if (entry.text && !entry.actor) {
      return [{ key: 'text', text: entry.text, startIndex: 0, className: 'text-on-surface', style: undefined }];
    }

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

    const sfx = new Audio(pickRandomTypingSfx());
    sfx.loop = true;
    sfx.volume = COMBAT_LOG_TYPING_VOLUME;
    sfx.play().catch(() => {});

    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      if (count >= totalChars) {
        count = totalChars;
        window.clearInterval(timer);
        fadeOutAudio(sfx);
      }
      setVisibleCount(count);
    }, 18);

    return () => {
      window.clearInterval(timer);
      sfx.pause();
      sfx.currentTime = 0;
    };
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
        <span className="inline-flex items-center ml-1 px-1 py-px rounded-sm bg-amber-400/15 text-amber-300 font-bold text-[9px] uppercase tracking-wide animate-fade-in">
          {entry.criticalLabel || 'Critical Hit'}
        </span>
      )}
      {entry.damage != null && textRevealComplete && (
        <span className="inline-flex items-center ml-1 px-1.5 py-0.5 rounded-sm bg-error/20 text-error font-black text-xs uppercase tracking-wider tabular-nums animate-fade-in">
          -{entry.damage}
        </span>
      )}
      {entry.highlightText && textRevealComplete && (
        <span className={`inline-flex items-center ml-1 px-1.5 py-0.5 rounded-sm font-black text-xs uppercase tracking-wider animate-fade-in ${
          entry.highlightTone === 'miss'
            ? 'bg-surface-container-high text-on-surface'
            : entry.highlightTone === 'debuff'
              ? 'bg-red-500/15 text-red-300'
              : entry.highlightTone === 'buff'
                ? 'bg-sky-500/15 text-sky-300'
                : 'bg-primary/15 text-primary'
        }`}>
          {entry.highlightText}
        </span>
      )}
      {entry.location && textRevealComplete && (
        <span className="ml-1 text-[9px] text-on-surface-variant px-1 py-px bg-surface-container rounded-sm animate-fade-in">
          {entry.location}
        </span>
      )}
      {entry.critName && textRevealComplete && (
        <div className="mt-0.5 text-[9px] text-tertiary font-bold animate-fade-in">
          ⚡ {entry.critName}
        </div>
      )}
    </>
  );
}

function getRollOutcomeStyles(item) {
  if (item.criticalSuccess) return {
    accent: 'text-pink-300',
    badge: 'bg-pink-300/15 text-pink-200 border-pink-300/25',
    border: 'border-pink-300/35',
  };
  if (item.criticalFailure) return {
    accent: 'text-rose-500',
    badge: 'bg-pink-800/12 text-rose-400 border-pink-700/22',
    border: 'border-pink-700/35',
  };
  if (item.success) return {
    accent: 'text-pink-400',
    badge: 'bg-pink-500/15 text-pink-300 border-pink-400/25',
    border: 'border-pink-400/30',
  };
  return {
    accent: 'text-rose-400',
    badge: 'bg-pink-700/15 text-rose-300 border-pink-600/25',
    border: 'border-pink-600/30',
  };
}

function getOutcomeLabel(item, t) {
  if (item.criticalSuccess) return t('common.criticalSuccess');
  if (item.criticalFailure) return t('common.criticalFailure');
  return item.success ? t('common.success') : t('common.failure');
}

function RollBox({ item, t }) {
  const styles = getRollOutcomeStyles(item);
  const margin = Number(item.margin) || 0;
  const total = item.total ?? item.roll;

  return (
    <div className={`rounded-lg border ${styles.border} bg-surface-container/40 px-3 py-2.5`}>
      <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-[0.2em] text-center mb-2">
        {item.label}
      </p>

      <div className="space-y-1 font-mono text-sm">
        <div className="flex justify-between items-baseline">
          <span className="text-on-surface-variant">k50</span>
          <span className={`font-bold ${styles.accent}`}>{item.roll}</span>
        </div>

        {item.modifiers?.map((mod, i) => (
          <div key={i} className="flex justify-between items-baseline">
            <span className={`text-[13px] ${mod.color}`}>{mod.label}</span>
            <span className={`font-bold ${mod.color}`}>{mod.value}</span>
          </div>
        ))}

        {total != null && total !== item.roll && (
          <>
            <div className="border-t border-outline-variant/20 my-1" />
            <div className="flex justify-between items-baseline">
              <span className="text-on-surface-variant">{t('gameplay.diceRollSum')}</span>
              <span className="font-bold text-on-surface">{total}</span>
            </div>
          </>
        )}

        {item.threshold != null && (
          <>
            <div className="flex justify-between items-baseline">
              <span className="text-on-surface-variant">
                {item.thresholdBreakdown ? t('gameplay.thresholdBase') : t('gameplay.diceRollVsThreshold')}
              </span>
              <span className="font-bold text-on-surface/80">
                {item.thresholdBreakdown ? item.thresholdBreakdown.base : item.threshold}
              </span>
            </div>
            {item.thresholdBreakdown?.modifiers?.map((mod, i) => (
              <div key={`tm_${i}`} className="flex justify-between items-baseline">
                <span className="text-xs text-orange-300/80">{mod.label}</span>
                <span className="font-bold text-orange-300">
                  {mod.value >= 0 ? `+${mod.value}` : `−${Math.abs(mod.value)}`}
                </span>
              </div>
            ))}
            {item.thresholdBreakdown && (
              <>
                <div className="border-t border-outline-variant/20 my-1" />
                <div className="flex justify-between items-baseline">
                  <span className="text-on-surface-variant font-semibold">{t('gameplay.diceRollVsThreshold')}</span>
                  <span className="font-bold text-on-surface">{item.thresholdBreakdown.final}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-2.5 flex-wrap">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-bold ${
          margin >= 0
            ? 'text-pink-300 bg-pink-400/12 border-pink-400/25'
            : 'text-rose-300 bg-pink-600/12 border-pink-600/25'
        }`}>
          <span className="material-symbols-outlined text-[14px] leading-none">fitness_center</span>
          {t('gameplay.rollEdge', { value: `${margin > 0 ? '+' : ''}${margin}` })}
        </span>
        <span className={`text-[12px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${styles.badge}`}>
          {getOutcomeLabel(item, t)}
        </span>
      </div>
    </div>
  );
}

function DamageBox({ item, t }) {
  const rows = [];
  const dmgLabel = item.isMagic
    ? t('combat.logSpellDmg', 'moc zaklęcia')
    : t('combat.logWeaponDmg', 'broń');
  rows.push({ label: dmgLabel, value: String(item.weaponDmg) });
  if (item.marginBonus) {
    rows.push({ label: t('combat.logMarginBonus', 'margines'), value: formatSignedNumber(item.marginBonus) });
  }
  if (item.blocked) {
    rows.push({ label: t('combat.logBlocked', 'blok'), value: '✓' });
  }
  if (item.dr) {
    rows.push({ label: t('combat.logDR', 'DR'), value: `−${item.dr}` });
  }

  return (
    <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2.5">
      <p className="text-[12px] font-bold text-on-surface-variant uppercase tracking-[0.2em] text-center mb-2">
        {t('combat.logDamage', 'Obrażenia')}
      </p>
      <div className="space-y-1 font-mono text-sm">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-between items-baseline">
            <span className="text-on-surface-variant">{row.label}</span>
            <span className="font-bold text-on-surface">{row.value}</span>
          </div>
        ))}
        <div className="border-t border-outline-variant/20 my-1" />
        <div className="flex justify-between items-baseline">
          <span className="text-on-surface-variant font-semibold">{t('gameplay.diceRollSum')}</span>
          <span className="font-bold text-error text-base">{item.totalDamage}</span>
        </div>
      </div>
    </div>
  );
}

function buildCombatLogTooltipContent(entry, t) {
  if (!entry) return null;
  const items = entry.details || [];
  const critEffect = entry.critEffect;
  if (!items.length && !critEffect) return null;

  return (
    <div className="space-y-2 w-[17rem]">
      {items.map((item, index) => {
        const key = `${entry.id}_tt_${index}`;
        if (item.kind === 'description') {
          return (
            <p key={key} className="text-sm italic text-on-surface-variant border-l-2 border-outline-variant/40 pl-2 leading-snug">
              {item.text}
            </p>
          );
        }
        if (item.kind === 'effect') {
          return (
            <p key={key} className="text-sm italic text-on-surface-variant border-l-2 border-amber-300/40 pl-2 leading-snug">
              {item.text}
            </p>
          );
        }
        if (item.kind === 'roll') return <RollBox key={key} item={item} t={t} />;
        if (item.kind === 'damage') return <DamageBox key={key} item={item} t={t} />;
        return null;
      })}
      {critEffect && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2.5">
          <p className="text-[12px] font-bold text-amber-300 uppercase tracking-[0.2em] mb-1">
            {t('combat.logCriticalEffect', 'Efekt krytyczny')}
          </p>
          <p className="text-sm text-on-surface leading-snug">{critEffect}</p>
        </div>
      )}
    </div>
  );
}

function CombatLogEntry({ entry, t, isNew = false }) {
  if (!entry) return null;
  const style = LOG_COLORS[entry.type] || LOG_COLORS.miss;
  const isAiAction = entry.type === 'ai_action';
  const isAiPending = entry.type === 'ai_pending';

  if (entry.type === 'round') {
    return (
      <div className={`flex items-center gap-2 py-1.5 ${isNew ? 'combat-log-entry-new' : ''}`} data-testid="combat-log-round">
        <div className="flex-1 h-px bg-outline-variant/30" />
        <span className="text-xs text-on-surface-variant/80 font-headline uppercase tracking-widest shrink-0">
          {entry.text}
        </span>
        <div className="flex-1 h-px bg-outline-variant/30" />
      </div>
    );
  }

  const tooltipContent = buildCombatLogTooltipContent(entry, t);
  const entryAnimClass = isNew ? 'combat-log-entry-new' : 'animate-fade-in';

  const content = (
    <div
      data-testid="combat-log-entry"
      data-combat-log-type={entry.type}
      className={`flex items-start gap-2 px-2.5 py-1.5 rounded-sm ${entryAnimClass} transition-colors ${
        isAiAction || isAiPending ? 'ring-1 ring-violet-400/20' : ''
      } ${
        tooltipContent ? 'hover:bg-surface-container/30' : ''
      }`}
      style={{ borderLeft: `${isAiPending ? 3 : 2}px solid ${style.border}`, background: style.bg }}
    >
      <span className="material-symbols-outlined text-[28px] self-center shrink-0" style={{ color: style.border }}>
        {LOG_ICONS[entry.type] || 'info'}
      </span>
      <div className={`flex-1 min-w-0 leading-snug break-keep tracking-wide ${isAiAction ? 'text-[15px]' : 'text-xs'}`}>
        {isAiPending && (
          <div className="flex items-center gap-2 py-0.5">
            <div className="shrink-0 scale-[0.72] origin-left">
              <LoadingSpinner size="sm" />
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/90">
              {t('combat.awaitingAiAction', 'Oczekiwanie...')}
            </div>
          </div>
        )}
   
        {!isAiPending && <AnimatedCombatLogText entry={entry} />}
      </div>
      {tooltipContent && (
        <span className="material-symbols-outlined text-xs text-outline-variant/70 mt-px shrink-0">
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
