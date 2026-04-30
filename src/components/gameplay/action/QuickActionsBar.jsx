import { useTranslation } from 'react-i18next';
import QuickActionButton from './QuickActionButton';
import ForceRollButton from './ForceRollButton';
import { getSkillLevel } from '../../../data/rpgSystem.js';
import { useGameSlice } from '../../../stores/gameSelectors';

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

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {forceRollState && (
        <ForceRollButton
          state={forceRollState}
          onLeftClick={onForceRollLeft}
          onDoubleClick={onForceRollDouble}
          onRightClick={onForceRollRight}
          disabled={disabled || hasPendingAction}
        />
      )}
      <QuickActionButton
        icon="skip_next"
        label={t('gameplay.continueButton')}
        description={lastChosenAction === '[CONTINUE]'
          ? t('gameplay.continueDisabledTooltip')
          : t('gameplay.continueChatMessage')}
        onClick={() => onSuggestedAction('[CONTINUE]')}
        disabled={disabled || hasPendingAction || lastChosenAction === '[CONTINUE]'}
        tone="primary"
      />
      <QuickActionButton
        icon="hourglass_empty"
        label={t('gameplay.waitButton')}
        description={t('gameplay.waitSystemMessage')}
        onClick={() => onSuggestedAction('[WAIT]')}
        disabled={disabled || hasPendingAction}
        tone="neutral"
      />
      <QuickActionButton
        icon="assignment"
        label={t('gameplay.searchForQuests')}
        description={t('gameplay.searchForQuestsAction')}
        onClick={() => onSuggestedAction(t('gameplay.searchForQuestsAction'))}
        disabled={disabled || hasPendingAction}
        tone="tertiary"
      />
      <QuickActionButton
        icon="swords"
        label={t('gameplay.initiateCombat')}
        description={t('gameplay.generalCombat')}
        onClick={onToggleCombatPicker}
        disabled={disabled || hasPendingAction}
        tone="danger"
      />
      {npcs.length > 0 && dispatch && !tradeActive && (
        <QuickActionButton
          icon="storefront"
          label={t('trade.tradeWith')}
          description={t('trade.tradeWith')}
          onClick={onToggleTradePicker}
          disabled={disabled || hasPendingAction}
          tone="tertiary"
        />
      )}
      {hasTrainer && dispatch && onToggleTrainerPicker && (
        <QuickActionButton
          icon="school"
          label={t('training.trainButton', 'Trening')}
          description={t('training.trainWith', 'Trenuj z...')}
          onClick={onToggleTrainerPicker}
          disabled={disabled || hasPendingAction}
          tone="primary"
        />
      )}
      {dispatch && !craftingActive && getSkillLevel(character?.skills, 'Rzemioslo') > 0 && (
        <QuickActionButton
          icon="construction"
          label={t('crafting.title')}
          description={t('crafting.recipes')}
          onClick={() => dispatch({ type: 'START_CRAFTING' })}
          disabled={disabled || hasPendingAction}
          tone="primary"
        />
      )}
      {dispatch && !alchemyActive && getSkillLevel(character?.skills, 'Alchemia') > 0 && (
        <QuickActionButton
          icon="science"
          label={t('alchemy.title')}
          description={t('alchemy.recipes')}
          onClick={() => dispatch({ type: 'START_ALCHEMY' })}
          disabled={disabled || hasPendingAction}
          tone="primary"
        />
      )}
      {needsSystemEnabled && (
        <QuickActionButton
          icon="bedtime"
          label={t('gameplay.restButton')}
          description={t('gameplay.restAction')}
          onClick={() => onSuggestedAction(t('gameplay.restAction'))}
          disabled={disabled || hasPendingAction}
          tone="indigo"
        />
      )}
    </div>
  );
}
