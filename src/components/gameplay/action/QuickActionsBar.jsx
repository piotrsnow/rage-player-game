import { useTranslation } from 'react-i18next';
import QuickActionButton from './QuickActionButton';
import { getSkillLevel } from '../../../data/rpgSystem.js';

export default function QuickActionsBar({
  disabled,
  hasPendingAction,
  lastChosenAction,
  npcs,
  dispatch,
  gameState,
  character,
  needsSystemEnabled,
  onSuggestedAction,
  onToggleCombatPicker,
  onToggleTradePicker,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5 shrink-0">
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
      {npcs.length > 0 && dispatch && !gameState?.trade?.active && (
        <QuickActionButton
          icon="storefront"
          label={t('trade.tradeWith')}
          description={t('trade.tradeWith')}
          onClick={onToggleTradePicker}
          disabled={disabled || hasPendingAction}
          tone="tertiary"
        />
      )}
      {dispatch && !gameState?.crafting?.active && getSkillLevel(character?.skills, 'Rzemioslo') > 0 && (
        <QuickActionButton
          icon="construction"
          label={t('crafting.title')}
          description={t('crafting.recipes')}
          onClick={() => dispatch({ type: 'START_CRAFTING' })}
          disabled={disabled || hasPendingAction}
          tone="primary"
        />
      )}
      {dispatch && !gameState?.alchemy?.active && getSkillLevel(character?.skills, 'Alchemia') > 0 && (
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
