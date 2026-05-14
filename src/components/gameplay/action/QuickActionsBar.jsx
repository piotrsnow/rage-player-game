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
  orange: 'text-orange-300 hover:text-orange-200 bg-orange-500/12 hover:bg-orange-500/22 border-orange-400/30 hover:border-orange-300/55',
  amber:  'text-amber-300 hover:text-amber-200 bg-amber-500/12 hover:bg-amber-500/22 border-amber-400/30 hover:border-amber-300/55',
};

function GroupButton({
  icon,
  label,
  hint = null,
  tone = 'neutral',
  disabled,
  items,
  onSelect,
  onRightClick = null,
  activeItemId = null,
  buttonClassName = null,
  activeButtonClassName = null,
  iconClassName = 'text-[22px]',
  menuClassName = 'left-0 bottom-full mb-2',
}) {
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

  const handleItemRightClick = useCallback((e, item) => {
    if (!onRightClick) return;
    e.preventDefault();
    setOpen(false);
    onRightClick(item.action || item.id);
  }, [onRightClick]);

  const visibleItems = items.filter((i) => i.visible !== false);
  if (visibleItems.length === 0) return null;

  const activeItem = activeItemId ? visibleItems.find((i) => (i.action || i.id) === activeItemId) : null;
  const resolvedIcon = activeItem ? activeItem.icon : icon;
  const resolvedTone = activeItem?.tone || tone;

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
        className={`shrink-0 inline-flex items-center justify-center border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${buttonClassName || 'w-11 h-11'} ${TONE_STYLES[resolvedTone]} ${open ? 'ring-1 ring-primary/40' : ''} ${activeItem ? `ring-1 ring-current/50 ${activeButtonClassName || ''}` : ''}`}
      >
        <span className={`material-symbols-outlined ${iconClassName} leading-none`}>{resolvedIcon}</span>
      </button>

      {open && (
        <div className={`absolute ${menuClassName} w-56 max-h-72 overflow-y-auto custom-scrollbar rounded-sm border border-outline-variant/20 bg-surface-container-highest/95 backdrop-blur-xl shadow-2xl z-40 p-1.5`}>
          <div className="px-2 py-1.5 border-b border-outline-variant/10 mb-1">
            <span className="block text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70">
              {label}
            </span>
            {hint && (
              <span className="block text-[9px] text-on-surface-variant/50 mt-0.5">{hint}</span>
            )}
          </div>
          <div className="space-y-0.5">
            {visibleItems.map((item) => {
              const isActive = activeItemId === (item.action || item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  onContextMenu={(e) => handleItemRightClick(e, item)}
                  disabled={item.disabled}
                  className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-sm border transition-colors disabled:opacity-40 disabled:pointer-events-none ${isActive ? 'border-primary/30 bg-primary/12' : 'border-transparent hover:border-primary/20 hover:bg-primary/8'}`}
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
                  {isActive && (
                    <span className="material-symbols-outlined text-sm text-primary shrink-0">push_pin</span>
                  )}
                </button>
              );
            })}
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
  onToggleBeerDuelPicker,
  onToggleCardGamePicker,
  onToggleDiceGamePicker,
  isMultiplayer = false,
  onToggleTradePicker,
  onToggleTrainerPicker,
  onToggleRecruitPicker,
  onOpenIncident,
  onOpenSelfQuest,
  onOpenInventSpell,
  onOpenTravelMap,
  onOpenWorldModal,
  adjacentLocations = [],
  onTravelToLocation,
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

      <GroupButton
        icon="swords"
        label={t('gameplay.combatGroup', 'Potyczki')}
        tone="red"
        disabled={isDisabled}
        items={[
          {
            id: 'combat',
            icon: 'swords',
            label: t('gameplay.initiateCombat'),
            description: t('gameplay.combatDescription', 'Regularna walka'),
            onClick: onToggleCombatPicker,
            tone: 'red',
            visible: true,
          },
          {
            id: 'beer_duel',
            icon: 'sports_bar',
            label: t('gameplay.initiateBeerDuel'),
            description: t('gameplay.initiateBeerDuelDescription'),
            onClick: onToggleBeerDuelPicker,
            tone: 'yellow',
            visible: !isMultiplayer && !!onToggleBeerDuelPicker,
          },
          {
            id: 'card_game',
            icon: 'style',
            label: t('gameplay.initiateCardGame', 'Oczko'),
            description: t('gameplay.initiateCardGameDescription', 'Gra karciana — kto bliżej 21?'),
            onClick: onToggleCardGamePicker,
            tone: 'teal',
            visible: !isMultiplayer && !!onToggleCardGamePicker,
          },
          {
            id: 'dice_game',
            icon: 'casino',
            label: t('gameplay.initiateDiceGame', 'Gra w kości'),
            description: t('gameplay.initiateDiceGameDescription', 'Kto wyrzuci więcej?'),
            onClick: onToggleDiceGamePicker,
            tone: 'amber',
            visible: !isMultiplayer && !!onToggleDiceGamePicker,
          },
        ]}
      />

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

      <GroupButton
        icon="public"
        label={t('gameplay.worldGroup', 'Świat')}
        tone="yellow"
        disabled={isDisabled}
        items={[
          {
            id: 'worldState',
            icon: 'public',
            label: t('worldState.title', 'Stan Świata'),
            description: t('gameplay.worldGroupOpenWorld', 'BN-y, zadania, dziennik…'),
            onClick: onOpenWorldModal,
            tone: 'yellow',
            visible: !!onOpenWorldModal,
          },
          {
            id: 'travelMap',
            icon: 'map',
            label: t('gameplay.travelMapButton', 'Mapa podróży'),
            description: t('gameplay.travelMapButtonDescription', 'Otwórz mapę lokacji'),
            onClick: onOpenTravelMap,
            tone: 'yellow',
            visible: !!onOpenTravelMap,
          },
          ...adjacentLocations.map((loc) => ({
            id: `travel-${loc.id}`,
            icon: 'hiking',
            label: loc.name,
            description: t('gameplay.travelTo', { name: loc.name, defaultValue: `Podróżuj do ${loc.name}` }),
            onClick: () => onTravelToLocation?.(loc.name),
            tone: 'amber',
            visible: true,
          })),
        ]}
      />
    </div>
  );
}

const TONE_ITEMS = [
  { id: 'thoughtful',   icon: 'psychology',      action: 'thoughtful',   tone: 'blue' },
  { id: 'bold',         icon: 'local_fire_department', action: 'bold',   tone: 'red' },
  { id: 'stupid',       icon: 'sentiment_very_dissatisfied', action: 'stupid', tone: 'yellow' },
  { id: 'aggressive',   icon: 'flash_on',        action: 'aggressive',   tone: 'red' },
  { id: 'neutral',      icon: 'balance',         action: 'neutral',      tone: 'gray' },
  { id: 'conciliatory', icon: 'handshake',       action: 'conciliatory', tone: 'teal' },
  { id: 'sleazy',       icon: 'sentiment_excited', action: 'sleazy',     tone: 'pink' },
  { id: 'empathetic',   icon: 'favorite',        action: 'empathetic',   tone: 'purple' },
  { id: 'absurd',       icon: 'theater_comedy',  action: 'absurd',       tone: 'orange' },
  { id: 'zingers',      icon: 'chat_bubble',     action: 'zingers',      tone: 'amber' },
];

export function ActionStyleButton({ disabled, isRegeneratingActions, stickyTone, onRegenerateActions, onStickyTone }) {
  const { t } = useTranslation();
  const items = TONE_ITEMS.map((item) => ({ ...item, label: t(`gameplay.actionTones.${item.id}`) }));
  const handleRightClickTone = useCallback((tone) => {
    onStickyTone?.(tone);
    onRegenerateActions?.(tone);
  }, [onStickyTone, onRegenerateActions]);

  return (
    <GroupButton
      icon={isRegeneratingActions ? 'progress_activity' : 'psychology_alt'}
      label={t('gameplay.regenerateActions', 'Styl Gry')}
      hint={t('gameplay.stickyToneHint')}
      tone="yellow"
      disabled={disabled || isRegeneratingActions}
      items={items}
      onSelect={onRegenerateActions}
      onRightClick={handleRightClickTone}
      activeItemId={stickyTone}
      buttonClassName="h-full aspect-square"
      activeButtonClassName="animate-pulse"
      iconClassName="text-[32px]"
      menuClassName="right-full top-1/2 -translate-y-1/2 mr-2"
    />
  );
}
