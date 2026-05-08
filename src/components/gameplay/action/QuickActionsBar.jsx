import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ForceRollButton from './ForceRollButton';
import { getSkillLevel } from '../../../data/rpgSystem.js';
import { useGameSlice } from '../../../stores/gameSelectors';

const TONE_STYLES = {
  primary: 'text-primary/90 hover:text-primary bg-primary/8 hover:bg-primary/14 border-primary/20 hover:border-primary/40',
  neutral: 'text-on-surface-variant/90 hover:text-on-surface bg-surface-container-high/45 hover:bg-surface-container-high border-outline-variant/20 hover:border-outline-variant/35',
  tertiary: 'text-tertiary/85 hover:text-tertiary bg-tertiary/8 hover:bg-tertiary/14 border-tertiary/20 hover:border-tertiary/35',
  danger: 'text-error/85 hover:text-error bg-error/8 hover:bg-error/14 border-error/20 hover:border-error/35',
  indigo: 'text-indigo-300/90 hover:text-indigo-200 bg-indigo-500/8 hover:bg-indigo-500/14 border-indigo-400/20 hover:border-indigo-300/35',
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
      tone: 'primary',
      visible: true,
    },
    {
      id: 'wait',
      icon: 'hourglass_empty',
      label: t('gameplay.waitButton'),
      description: t('gameplay.waitSystemMessage'),
      action: '[WAIT]',
      tone: 'neutral',
      visible: true,
    },
    {
      id: 'rest',
      icon: 'bedtime',
      label: t('gameplay.restButton'),
      description: t('gameplay.restAction'),
      action: t('gameplay.restAction'),
      tone: 'indigo',
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
      tone: 'tertiary',
      visible: true,
    },
    {
      id: 'selfQuest',
      icon: 'add_task',
      label: t('gameplay.selfQuestButton'),
      description: t('gameplay.selfQuestHint'),
      onClick: onOpenSelfQuest,
      tone: 'primary',
      visible: !!onOpenSelfQuest,
    },
    {
      id: 'trade',
      icon: 'storefront',
      label: t('trade.tradeWith'),
      description: t('trade.tradeWith'),
      onClick: onToggleTradePicker,
      tone: 'tertiary',
      visible: npcs.length > 0 && !!dispatch && !tradeActive,
    },
    {
      id: 'trainer',
      icon: 'school',
      label: t('training.trainButton', 'Trening'),
      description: t('training.trainWith', 'Trenuj z...'),
      onClick: onToggleTrainerPicker,
      tone: 'primary',
      visible: hasTrainer && !!dispatch && !!onToggleTrainerPicker,
    },
    {
      id: 'recruit',
      icon: 'group_add',
      label: t('party.recruit', 'Rekrutuj'),
      description: t('party.recruitDescription', 'Poproś NPC z ostatnich scen o dołączenie do drużyny'),
      onClick: onToggleRecruitPicker,
      tone: 'primary',
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
      tone: 'primary',
      visible: !!dispatch && !craftingActive && getSkillLevel(character?.skills, 'Rzemioslo') > 0,
    },
    {
      id: 'alchemy',
      icon: 'science',
      label: t('alchemy.title'),
      description: t('alchemy.recipes'),
      onClick: () => dispatch({ type: 'START_ALCHEMY' }),
      tone: 'primary',
      visible: !!dispatch && !alchemyActive && getSkillLevel(character?.skills, 'Alchemia') > 0,
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
        tone="primary"
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
        className={`shrink-0 inline-flex items-center justify-center w-11 h-11 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${TONE_STYLES.danger}`}
      >
        <span className="material-symbols-outlined text-[22px] leading-none">swords</span>
      </button>

      <GroupButton
        icon="people"
        label={t('gameplay.interactions', 'Interakcje')}
        tone="tertiary"
        disabled={isDisabled}
        items={interactionItems}
        onSelect={onSuggestedAction}
      />

      <GroupButton
        icon="build"
        label={t('gameplay.craftingGroup', 'Rzemiosło')}
        tone="primary"
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
          className={`shrink-0 inline-flex items-center justify-center w-11 h-11 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${TONE_STYLES.danger}`}
        >
          <span className="material-symbols-outlined text-[22px] leading-none">warning</span>
        </button>
      )}
    </div>
  );
}
