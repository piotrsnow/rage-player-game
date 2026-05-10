import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ForceRollButton from './ForceRollButton';
import { getSkillLevel } from '../../../data/rpgSystem.js';
import { useGameSlice } from '../../../stores/gameSelectors';

const TONE_STYLES = {
  blue:   'text-sky-300 hover:text-sky-200 bg-sky-500/12 hover:bg-sky-500/22 border-sky-400/30 hover:border-sky-300/55',
  purple: 'text-violet-300 hover:text-violet-200 bg-violet-500/12 hover:bg-violet-500/22 border-violet-400/30 hover:border-violet-300/55',
  red:    'text-rose-300 hover:text-rose-200 bg-rose-500/12 hover:bg-rose-500/22 border-rose-400/30 hover:border-rose-300/55',
  pink:   'text-pink-300 hover:text-pink-200 bg-pink-500/12 hover:bg-pink-500/22 border-pink-400/30 hover:border-pink-300/55',
  teal:   'text-cyan-300 hover:text-cyan-200 bg-cyan-500/12 hover:bg-cyan-500/22 border-cyan-400/30 hover:border-cyan-300/55',
  gray:   'text-slate-300 hover:text-slate-200 bg-slate-500/12 hover:bg-slate-500/22 border-slate-400/30 hover:border-slate-300/55',
  yellow: 'text-yellow-300 hover:text-yellow-200 bg-yellow-500/12 hover:bg-yellow-500/22 border-yellow-400/30 hover:border-yellow-300/55',
};

function GroupButton({ icon, label, tone = 'neutral', disabled, items, onSelect }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const handleItemClick = useCallback((item) => {
    setOpen(false);
    item.onClick?.();
    if (item.action) onSelect?.(item.action);
  }, [onSelect]);

  const visibleItems = items.filter((i) => i.visible !== false);
  if (visibleItems.length === 0) return null;

  if (visibleItems.length === 1) {
    const solo = visibleItems[0];
    return (
      <button
        type="button"
        aria-label={solo.label}
        title={solo.label}
        onClick={() => handleItemClick(solo)}
        disabled={disabled || solo.disabled}
        className={`shrink-0 inline-flex items-center justify-center w-11 h-11 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${TONE_STYLES[solo.tone || tone]}`}
      >
        <span className="material-symbols-outlined text-[22px] leading-none">{solo.icon || icon}</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`shrink-0 inline-flex items-center justify-center w-11 h-11 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${TONE_STYLES[tone]} ${open ? 'ring-1 ring-primary/40' : ''}`}
      >
        <span className="material-symbols-outlined text-[22px] leading-none">{icon}</span>
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 w-56 max-h-72 overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/20 bg-surface-container-highest/95 backdrop-blur-xl shadow-2xl z-40 p-1.5">
          <div className="flex items-center px-2 py-1.5 border-b border-outline-variant/10 mb-1">
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70">
              {label}
            </span>
          </div>
          <div className="space-y-0.5">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-sm border border-transparent hover:border-primary/20 hover:bg-primary/8 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <span className={`material-symbols-outlined text-lg shrink-0 ${TONE_STYLES[item.tone || tone]?.split(' ')[0] || 'text-on-surface-variant'}`}>
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-on-surface truncate">{item.label}</span>
                  {item.description && (
                    <span className="block text-[10px] text-on-surface-variant/75 leading-tight line-clamp-1">
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuickActionsBar({
  disabled,
  hasPendingAction,
  lastChosenAction,
  npcs,
  dispatch,
  character,
  needsSystemEnabled,
  onSuggestedAction,
  onToggleCombatPicker,
  onToggleTradePicker,
  onToggleTrainerPicker,
  onToggleRecruitPicker,
  onOpenIncident,
  onOpenSelfQuest,
  onOpenInventSpell,
  onOpenTravelMap,
  recruitableCount = 0,
  partyHasSlot = true,
  forceRollState = null,
  onForceRollLeft,
  onForceRollDouble,
  onForceRollRight,
}) {
  const { t } = useTranslation();
  const tradeActive = useGameSlice((s) => s.trade?.active);
  const craftingActive = useGameSlice((s) => s.crafting?.active);
  const alchemyActive = useGameSlice((s) => s.alchemy?.active);
  const hasTrainer = npcs.some((n) => Array.isArray(n.canTrain) && n.canTrain.length > 0);
  const isDisabled = disabled || hasPendingAction;

  const narrativeItems = [
    {
      id: 'continue',
      icon: 'skip_next',
      label: t('gameplay.continueButton'),
      description: lastChosenAction === '[CONTINUE]' ? t('gameplay.continueDisabledTooltip') : t('gameplay.continueChatMessage'),
      action: '[CONTINUE]',
      disabled: lastChosenAction === '[CONTINUE]',
      tone: 'blue',
      visible: true,
    },
    {
      id: 'wait',
      icon: 'hourglass_empty',
      label: t('gameplay.waitButton'),
      description: t('gameplay.waitSystemMessage'),
      action: '[WAIT]',
      tone: 'gray',
      visible: true,
    },
    {
      id: 'rest',
      icon: 'bedtime',
      label: t('gameplay.restButton'),
      description: t('gameplay.restAction'),
      action: t('gameplay.restAction'),
      tone: 'purple',
      visible: !!needsSystemEnabled,
    },
  ];

  const interactionItems = [
    {
      id: 'searchQuests',
      icon: 'assignment',
      label: t('gameplay.searchForQuests'),
      description: t('gameplay.searchForQuestsAction'),
      action: t('gameplay.searchForQuestsAction'),
      tone: 'teal',
      visible: true,
    },
    {
      id: 'selfQuest',
      icon: 'add_task',
      label: t('gameplay.selfQuestButton'),
      description: t('gameplay.selfQuestHint'),
      onClick: onOpenSelfQuest,
      tone: 'blue',
      visible: !!onOpenSelfQuest,
    },
    {
      id: 'trade',
      icon: 'storefront',
      label: t('trade.tradeWith'),
      description: t('trade.tradeWith'),
      onClick: onToggleTradePicker,
      tone: 'teal',
      visible: npcs.length > 0 && !!dispatch && !tradeActive,
    },
    {
      id: 'trainer',
      icon: 'school',
      label: t('training.trainButton', 'Trening'),
      description: t('training.trainWith', 'Trenuj z...'),
      onClick: onToggleTrainerPicker,
      tone: 'blue',
      visible: hasTrainer && !!dispatch && !!onToggleTrainerPicker,
    },
    {
      id: 'recruit',
      icon: 'group_add',
      label: t('party.recruit', 'Rekrutuj'),
      description: t('party.recruitDescription', 'Poproś NPC z ostatnich scen o dołączenie do drużyny'),
      onClick: onToggleRecruitPicker,
      tone: 'pink',
      visible: recruitableCount > 0 && partyHasSlot && !!dispatch && !!onToggleRecruitPicker,
    },
  ];

  const craftItems = [
    {
      id: 'crafting',
      icon: 'construction',
      label: t('crafting.title'),
      description: t('crafting.recipes'),
      onClick: () => dispatch({ type: 'START_CRAFTING' }),
      tone: 'purple',
      visible: !!dispatch && !craftingActive && getSkillLevel(character?.skills, 'Rzemioslo') > 0,
    },
    {
      id: 'alchemy',
      icon: 'science',
      label: t('alchemy.title'),
      description: t('alchemy.recipes'),
      onClick: () => dispatch({ type: 'START_ALCHEMY' }),
      tone: 'teal',
      visible: !!dispatch && !alchemyActive && getSkillLevel(character?.skills, 'Alchemia') > 0,
    },
    {
      id: 'inventSpell',
      icon: 'auto_awesome',
      label: t('gameplay.inventSpellButton'),
      description: t('gameplay.inventSpellDescription'),
      onClick: onOpenInventSpell,
      tone: 'pink',
      visible: !!onOpenInventSpell,
    },
  ];

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {forceRollState && (
        <ForceRollButton
          state={forceRollState}
          onLeftClick={onForceRollLeft}
          onDoubleClick={onForceRollDouble}
          onRightClick={onForceRollRight}
          disabled={isDisabled}
        />
      )}

      <GroupButton
        icon="play_circle"
        label={t('gameplay.narrativeActions', 'Narracja')}
        tone="blue"
        disabled={isDisabled}
        items={narrativeItems}
        onSelect={onSuggestedAction}
      />

      <button
        type="button"
        aria-label={t('gameplay.initiateCombat')}
        title={t('gameplay.initiateCombat')}
        onClick={onToggleCombatPicker}
        disabled={isDisabled}
        className={`shrink-0 inline-flex items-center justify-center w-11 h-11 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${TONE_STYLES.red}`}
      >
        <span className="material-symbols-outlined text-[22px] leading-none">swords</span>
      </button>

      <GroupButton
        icon="people"
        label={t('gameplay.interactions', 'Interakcje')}
        tone="teal"
        disabled={isDisabled}
        items={interactionItems}
        onSelect={onSuggestedAction}
      />

      <GroupButton
        icon="gavel"
        label={t('gameplay.craftingGroup', 'Rzemiosło')}
        tone="purple"
        disabled={isDisabled}
        items={craftItems}
      />

      {onOpenIncident && (
        <button
          type="button"
          aria-label={t('gameplay.incidentButton')}
          title={t('gameplay.incidentDescription')}
          onClick={onOpenIncident}
          disabled={isDisabled}
          className={`shrink-0 inline-flex items-center justify-center w-11 h-11 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${TONE_STYLES.pink}`}
        >
          <span className="material-symbols-outlined text-[22px] leading-none">warning</span>
        </button>
      )}

      {onOpenTravelMap && (
        <button
          type="button"
          aria-label={t('gameplay.travelMapButton')}
          title={t('gameplay.travelMapButtonDescription')}
          onClick={onOpenTravelMap}
          disabled={isDisabled}
          className={`shrink-0 inline-flex items-center justify-center w-11 h-11 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${TONE_STYLES.yellow}`}
        >
          <span className="material-symbols-outlined text-[22px] leading-none">map</span>
        </button>
      )}
    </div>
  );
}
