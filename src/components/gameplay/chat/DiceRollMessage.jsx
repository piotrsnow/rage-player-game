import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateSkill } from '../../../utils/rpgTranslate';
import Tooltip from '../../ui/Tooltip';
import { SystemMessage } from './ChatMessages';

function ModifierIconTag({ icon, value, label, toneClass, tooltipClassName, tooltipAccentClassName }) {
  return (
    <Tooltip
      className="inline-flex"
      tooltipClassName={tooltipClassName}
      content={
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-base leading-none ${tooltipAccentClassName}`}>
              {icon}
            </span>
            <span className={`text-xs font-bold tracking-wide ${tooltipAccentClassName}`}>
              {value}
            </span>
          </div>
          <div className="text-sm font-semibold leading-snug text-white/95">
            {label}
          </div>
        </div>
      }
    >
      <span
        aria-label={label}
        className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.22)] ${toneClass}`}
      >
        <span className="material-symbols-outlined text-[13px] leading-none">{icon}</span>
        <span>{value}</span>
      </span>
    </Tooltip>
  );
}

function BonusTags({ d, t, className = '' }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`.trim()}>
      {d.characteristic && d.characteristicValue != null && (
        <ModifierIconTag
          icon="person"
          value={d.characteristicValue}
          label={`${t(`stats.${d.characteristic}Long`)} ${d.characteristicValue}`}
          toneClass="bg-purple-400/15 text-purple-300 border-purple-400/30"
          tooltipClassName="border-purple-400/45 bg-[linear-gradient(135deg,rgba(168,85,247,0.26),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(168,85,247,0.22)]"
          tooltipAccentClassName="text-purple-200"
        />
      )}
      {d.skillAdvances > 0 && (
        <ModifierIconTag
          icon="school"
          value={`+${d.skillAdvances}`}
          label={`${translateSkill(d.skill, t)} +${d.skillAdvances}`}
          toneClass="bg-emerald-400/15 text-emerald-300 border-emerald-400/30"
          tooltipClassName="border-emerald-400/45 bg-[linear-gradient(135deg,rgba(52,211,153,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(52,211,153,0.18)]"
          tooltipAccentClassName="text-emerald-200"
        />
      )}
      {d.creativityBonus > 0 && (
        <ModifierIconTag
          icon="emoji_objects"
          value={`+${d.creativityBonus}`}
          label={t('gameplay.creativityBonus', { bonus: d.creativityBonus })}
          toneClass="bg-amber-400/15 text-amber-300 border-amber-400/30"
          tooltipClassName="border-amber-400/45 bg-[linear-gradient(135deg,rgba(251,191,36,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(251,191,36,0.18)]"
          tooltipAccentClassName="text-amber-200"
        />
      )}
      {d.difficultyModifier != null && d.difficultyModifier !== 0 && (
        <ModifierIconTag
          icon={d.difficultyModifier > 0 ? 'target' : 'warning'}
          value={`${d.difficultyModifier > 0 ? '+' : ''}${d.difficultyModifier}`}
          label={t('gameplay.difficultyModifier', { bonus: (d.difficultyModifier > 0 ? '+' : '') + d.difficultyModifier })}
          toneClass={d.difficultyModifier > 0
            ? 'bg-teal-400/15 text-teal-300 border-teal-400/30'
            : 'bg-rose-400/15 text-rose-300 border-rose-400/30'}
          tooltipClassName={d.difficultyModifier > 0
            ? 'border-teal-400/45 bg-[linear-gradient(135deg,rgba(45,212,191,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(45,212,191,0.18)]'
            : 'border-rose-400/45 bg-[linear-gradient(135deg,rgba(251,113,133,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(251,113,133,0.18)]'}
          tooltipAccentClassName={d.difficultyModifier > 0 ? 'text-teal-200' : 'text-rose-200'}
        />
      )}
      {d.momentumBonus != null && d.momentumBonus !== 0 && (
        <ModifierIconTag
          icon={d.momentumBonus > 0 ? 'bolt' : 'trending_down'}
          value={`${d.momentumBonus > 0 ? '+' : ''}${d.momentumBonus}`}
          label={t('gameplay.momentumBonus', { bonus: (d.momentumBonus > 0 ? '+' : '') + d.momentumBonus })}
          toneClass={d.momentumBonus > 0
            ? 'bg-blue-400/15 text-blue-300 border-blue-400/30'
            : 'bg-red-400/15 text-red-300 border-red-400/30'}
          tooltipClassName={d.momentumBonus > 0
            ? 'border-blue-400/45 bg-[linear-gradient(135deg,rgba(96,165,250,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(96,165,250,0.18)]'
            : 'border-red-400/45 bg-[linear-gradient(135deg,rgba(248,113,113,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(248,113,113,0.18)]'}
          tooltipAccentClassName={d.momentumBonus > 0 ? 'text-blue-200' : 'text-red-200'}
        />
      )}
      {d.dispositionBonus != null && d.dispositionBonus !== 0 && (
        <ModifierIconTag
          icon={d.dispositionBonus > 0 ? 'mood' : 'sentiment_dissatisfied'}
          value={`${d.dispositionBonus > 0 ? '+' : ''}${d.dispositionBonus}`}
          label={t('gameplay.dispositionBonus', { bonus: (d.dispositionBonus > 0 ? '+' : '') + d.dispositionBonus })}
          toneClass={d.dispositionBonus > 0
            ? 'bg-pink-400/15 text-pink-300 border-pink-400/30'
            : 'bg-orange-400/15 text-orange-300 border-orange-400/30'}
          tooltipClassName={d.dispositionBonus > 0
            ? 'border-pink-400/45 bg-[linear-gradient(135deg,rgba(244,114,182,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(244,114,182,0.18)]'
            : 'border-orange-400/45 bg-[linear-gradient(135deg,rgba(251,146,60,0.24),rgba(18,18,24,0.96))] shadow-[0_18px_48px_rgba(251,146,60,0.18)]'}
          tooltipAccentClassName={d.dispositionBonus > 0 ? 'text-pink-200' : 'text-orange-200'}
        />
      )}
    </div>
  );
}

function RollEdgeBadge({ value, t, className = '' }) {
  const numericValue = value ?? 0;
  const toneClass = numericValue > 0
    ? 'text-emerald-300 bg-emerald-500/12 border-emerald-500/25'
    : numericValue < 0
      ? 'text-rose-300 bg-rose-500/12 border-rose-500/25'
      : 'text-on-surface-variant bg-surface-container-high/40 border-outline-variant/20';

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${toneClass} ${className}`.trim()}>
      <span className="material-symbols-outlined text-[14px] leading-none">fitness_center</span>
      <span className="text-xs font-bold">
        {t('gameplay.rollEdge', { value: `${numericValue > 0 ? '+' : ''}${numericValue}` })}
      </span>
    </div>
  );
}

export default function DiceRollMessage({ message }) {
  const { t } = useTranslation();
  const d = message.diceData;
  const [expanded, setExpanded] = useState(false);

  if (!d) {
    return <SystemMessage message={message} />;
  }

  const success = d.success;
  const isCritical = d.criticalSuccess || d.criticalFailure;
  const accentColor = d.criticalSuccess
    ? 'text-amber-400'
    : d.criticalFailure
      ? 'text-red-700'
      : success
        ? 'text-emerald-400'
        : 'text-rose-400';
  const bgGlow = d.criticalSuccess
    ? 'from-amber-400/10 via-transparent to-amber-400/10'
    : d.criticalFailure
      ? 'from-red-700/10 via-transparent to-red-700/10'
      : success
        ? 'from-emerald-500/10 via-transparent to-emerald-500/10'
        : 'from-rose-500/10 via-transparent to-rose-500/10';
  const borderColor = d.criticalSuccess
    ? 'border-amber-400/40'
    : d.criticalFailure
      ? 'border-red-700/40'
      : success
        ? 'border-emerald-500/35'
        : 'border-rose-500/35';
  const outcomeLabel = d.criticalSuccess
    ? t('common.criticalSuccess')
    : d.criticalFailure
      ? t('common.criticalFailure')
      : success
        ? t('common.success')
        : t('common.failure');
  const rollTarget = d.threshold ?? d.target ?? d.dc ?? '?';
  const rollMargin = d.margin ?? d.sl ?? 0;

  const rawRoll = Number(d.roll) || 0;
  const targetNum = Number.isFinite(Number(rollTarget)) ? Number(rollTarget) : null;
  const fallbackModsSum =
    (Number(d.characteristicValue) || 0)
    + (Number(d.skillAdvances) || 0)
    + (Number(d.creativityBonus) || 0)
    + (Number(d.difficultyModifier) || 0)
    + (Number(d.momentumBonus) || 0)
    + (Number(d.dispositionBonus) || 0);
  const totalValue = Number.isFinite(Number(d.total))
    ? Number(d.total)
    : rawRoll + fallbackModsSum;
  const modsSum = totalValue - rawRoll;
  const formulaCmp = targetNum == null
    ? null
    : totalValue > targetNum ? '>' : totalValue < targetNum ? '<' : '=';

  if (!expanded) {
    return (
      <div className="animate-fade-in my-1.5 flex justify-center">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={t('chat.expandDiceRoll', 'Expand dice roll details')}
          className={`w-[92px] h-[92px] rounded-xl border ${borderColor} bg-gradient-to-r ${bgGlow} flex flex-col items-center justify-center gap-1 transition-transform duration-200 hover:scale-[1.03]`}
          title={t('chat.expandDiceRoll', 'Expand dice roll details')}
        >
          <span className={`material-symbols-outlined text-lg ${accentColor}`}>casino</span>
          <span className="font-mono text-xs font-bold text-on-surface">
            {totalValue} {t('common.vs')} {rollTarget}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in my-2">
      <div className={`relative rounded-xl border ${borderColor} bg-gradient-to-r ${bgGlow} px-4 py-3 min-h-[152px] flex flex-col items-center text-center`}>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded
          aria-label={t('chat.collapseDiceRoll', 'Collapse dice roll details')}
          className="absolute top-2 right-2 w-6 h-6 rounded-md border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-colors"
          title={t('chat.collapseDiceRoll', 'Collapse dice roll details')}
        >
          <span className="material-symbols-outlined text-sm leading-none">unfold_less</span>
        </button>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em]">
          {t('gameplay.diceCheck', { skill: translateSkill(d.skill, t) })}
        </p>

        <div className="flex-1 flex flex-col items-center justify-center gap-1.5 py-2">
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg bg-surface-container-high/60 ${accentColor}`}>
            <span className="material-symbols-outlined text-xl">casino</span>
          </div>
          <div className="flex items-baseline justify-center gap-1.5 flex-wrap font-mono leading-none">
            <span className="text-2xl font-bold text-on-surface">
              {rawRoll}
            </span>
            {modsSum !== 0 && (
              <>
                <span className={`text-lg ${modsSum > 0 ? 'text-emerald-300/90' : 'text-rose-300/90'}`}>
                  {modsSum > 0 ? '+' : '−'}
                </span>
                <span className={`text-2xl font-bold ${modsSum > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {Math.abs(modsSum)}
                </span>
                <span className="text-lg text-on-surface-variant/80">=</span>
                <span className="text-2xl font-bold text-on-surface">
                  {totalValue}
                </span>
              </>
            )}
            {formulaCmp && (
              <>
                <span className={`text-lg ${accentColor}`}>{formulaCmp}</span>
                <span className="text-2xl font-bold text-on-surface">
                  {rollTarget}
                </span>
              </>
            )}
          </div>
          <RollEdgeBadge value={rollMargin} t={t} />
          <div className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${
            d.criticalSuccess
              ? 'bg-amber-400/15 text-amber-400 border-amber-400/20'
              : d.criticalFailure
                ? 'bg-red-700/10 text-red-700 border-red-700/20'
                : success
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                  : 'bg-rose-500/15 text-rose-300 border-rose-500/25'
          }`}>
            {outcomeLabel}
          </div>
          {isCritical ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
              {success ? t('common.success') : t('common.failure')}
            </p>
          ) : null}
        </div>

        <div className="mt-auto w-full flex justify-center">
          <BonusTags d={d} t={t} className="justify-center" />
        </div>
      </div>
    </div>
  );
}
